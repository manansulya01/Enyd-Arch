import 'server-only';
import { createHmac } from 'node:crypto';
import { createConnection } from 'node:net';

/**
 * Malware scanning
 *
 * Uploads land in quarantined state and are not downloadable, linkable, or
 * previewable until a clean verdict comes back. Two providers are supported:
 *
 *   · ClamAV over TCP INSTREAM (the default when MALWARE_SCANNER_URL is set)
 *   · a local architectural fallback used in development
 *
 * The fallback is deliberately conservative. It is not a substitute for a real
 * engine, so in production a missing scanner configuration makes uploads
 * fail closed rather than silently pass. Development is the only environment
 * where the built-in signature set is trusted.
 */

export type ScanVerdict = 'clean' | 'infected' | 'error';

export interface ScanOutcome {
  verdict: ScanVerdict;
  provider: string;
  signature?: string;
  detail: string;
  /** True when the upload may be published */
  release: boolean;
}

const CLAMAV_CHUNK = 64 * 1024;
const SCAN_TIMEOUT_MS = 20_000;

/** EICAR-style test string, harmless, used to prove the pipeline is live. */
export const EICAR_MARKER = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

/**
 * Development signature set.
 *
 * These are structural signals — container types that have no business being
 * uploaded as user content, and known-dangerous naming patterns. They are not a
 * virus database, and they are never enabled in production.
 */
const DEVELOPMENT_SIGNATURES: Array<{ match: (bytes: Uint8Array) => boolean; signature: string; detail: string }> = [
  {
    match: (bytes) => bytes.byteLength > 4 && bytes[0] === 0x4d && bytes[1] === 0x5a,
    signature: 'Win.Test.EICAR_HDB-1',
    detail: 'Windows executable detected.',
  },
  {
    match: (bytes) => bytes.byteLength > 4 && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c,
    signature: 'Unix.Test.EICAR_HDB-1',
    detail: 'Linux executable detected.',
  },
  {
    match: (bytes) => bytes.byteLength > 4 && bytes[0] === 0xca && bytes[1] === 0xfe && bytes[2] === 0xba,
    signature: 'Java.Test.EICAR_HDB-1',
    detail: 'Java class file detected.',
  },
  {
    match: (bytes) => {
      const head = new TextDecoder('latin1').decode(bytes.subarray(0, 128));
      return head.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE');
    },
    signature: 'Win.Test.EICAR_HDB-1',
    detail: 'EICAR antivirus test file received.',
  },
  {
    match: (bytes) => {
      // Windows LNK: 4C 00 00 00 header followed by the EmbeddedCommand marker.
      const text = new TextDecoder('latin1').decode(bytes.subarray(0, 512));
      return text.includes('cmd.exe') && bytes[0] === 0x4c && bytes[1] === 0x00;
    },
    signature: 'Win.Trojan.Shortcut',
    detail: 'Windows shortcut that launches a command shell.',
  },
  {
    match: (bytes) => {
      const text = new TextDecoder('latin1').decode(bytes.subarray(0, 8192)).toLowerCase();
      return /<script[^>]*>\s*(?:eval\(|atob\(|fromcharcode\()/i.test(text);
    },
    signature: 'Js.Obfuscated.Payload',
    detail: 'Script with encoded or evading payload.',
  },
];

function scanDevelopment(data: Uint8Array): ScanOutcome {
  for (const rule of DEVELOPMENT_SIGNATURES) {
    if (rule.match(data)) {
      return {
        verdict: 'infected',
        provider: 'enyd-structural',
        signature: rule.signature,
        detail: rule.detail,
        release: false,
      };
    }
  }
  return {
    verdict: 'clean',
    provider: 'enyd-structural',
    detail: 'No executable container or known-bad structure found.',
    release: true,
  };
}

/** Streams the payload to a ClamAV instance and parses its verdict reply. */
function scanWithClamAv(data: Uint8Array, host: string, port: number): Promise<ScanOutcome> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const chunks: Buffer[] = [];
    let settled = false;
    let uploaded = 0;

    const finish = (outcome: ScanOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(outcome);
    };

    const timer = setTimeout(() => {
      finish({
        verdict: 'error',
        provider: 'clamav',
        detail: 'The scanner did not respond in time.',
        release: false,
      });
    }, SCAN_TIMEOUT_MS);

    socket.on('connect', () => {
      // ClamAV INSTREAM framing: 4-byte big-endian length, payload, repeat.
      let offset = 0;
      const pushChunk = (): void => {
        if (offset >= data.byteLength) {
          socket.write(Buffer.alloc(4));
          return;
        }
        const slice = data.subarray(offset, Math.min(offset + CLAMAV_CHUNK, data.byteLength));
        uploaded += slice.byteLength;
        const header = Buffer.alloc(4);
        header.writeUInt32BE(slice.byteLength, 0);
        socket.write(Buffer.concat([header, Buffer.from(slice)]));
        offset += slice.byteLength;
        if (offset < data.byteLength) pushChunk();
      };
      pushChunk();
    });

    socket.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    socket.on('error', () => {
      finish({
        verdict: 'error',
        provider: 'clamav',
        detail: 'The scanner could not be reached.',
        release: false,
      });
    });

    socket.on('end', () => {
      const reply = Buffer.concat(chunks).toString('utf8').trim();
      const matched = /^(.+?):\\s*(.+?)\\s+FOUND$/i.exec(reply);

      if (matched) {
        finish({
          verdict: 'infected',
          provider: 'clamav',
          signature: `${matched[1]}:${matched[2]}`.slice(0, 64),
          detail: `Malware detected: ${matched[2]}`,
          release: false,
        });
        return;
      }

      if (/ERROR|INSTREAM size limit/i.test(reply)) {
        finish({
          verdict: 'error',
          provider: 'clamav',
          detail: `Scanner reported: ${reply.slice(0, 180)}`,
          release: false,
        });
        return;
      }

      // Only ClamAV's explicit clean verdict is trusted. Empty, malformed, or
      // unexpected replies must never turn into a clean result.
      if (/^stream:\\s*OK$/i.test(reply)) {
        finish({
          verdict: 'clean',
          provider: 'clamav',
          detail: `No threat found (${(uploaded / 1024).toFixed(0)} KB scanned).`,
          release: true,
        });
        return;
      }

      finish({
        verdict: 'error',
        provider: 'clamav',
        detail: `Unrecognised scanner response: ${reply.slice(0, 180) || 'empty response'}`,
        release: false,
      });
    });
  });
}

export function scannerConfigured(): boolean {
  return Boolean(process.env.MALWARE_SCANNER_URL);
}

export async function scanBytes(data: Uint8Array): Promise<ScanOutcome> {
  const configured = process.env.MALWARE_SCANNER_URL;

  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      // Fail closed. An installation that cannot scan must not accept uploads.
      return {
        verdict: 'error',
        provider: 'none',
        detail:
          'No malware scanner is configured. Set MALWARE_SCANNER_URL before accepting uploads in production.',
        release: false,
      };
    }
    return scanDevelopment(data);
  }

  let hostname: string;
  let scanPort: number;
  try {
    const endpoint = new URL(configured);
    if (!['tcp:', 'http:', 'https:'].includes(endpoint.protocol)) {
      throw new Error('Unsupported scanner URL protocol.');
    }
    hostname = endpoint.hostname;
    scanPort = Number(endpoint.port) || 3310;
  } catch {
    return {
      verdict: 'error',
      provider: 'clamav',
      detail: 'MALWARE_SCANNER_URL is invalid.',
      release: false,
    };
  }

  const token = process.env.MALWARE_SCANNER_TOKEN;

  try {
    const outcome = await scanWithClamAv(data, hostname, scanPort);
    if (token) {
      const stamp = createHmac('sha256', token).update(outcome.detail).digest('hex').slice(0, 8);
      outcome.detail = `${outcome.detail} [${stamp}]`;
    }
    return outcome;
  } catch {
    return {
      verdict: 'error',
      provider: 'clamav',
      detail: 'The scanner request failed.',
      release: false,
    };
  }
}
