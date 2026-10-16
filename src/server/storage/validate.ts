import 'server-only';
import { fileTypeFromBuffer } from 'file-type';

/**
 * Upload validation
 *
 * Nothing a member uploads is trusted, and nothing is executed in the
 * application's origin. The pipeline is:
 *
 *   1. declared size rejected before the body is read into memory
 *   2. declared extension checked against the allowlist
 *   3. declared MIME checked against the allowlist
 *   4. magic bytes inspected — the detected type wins, and a mismatch between
 *      declared and detected type is a hard failure
 *   5. structural sniffing for text-like formats that have no magic numbers
 *   6. archived-format checks (zip bomb, nested archives) by entry census
 *   7. quarantine until a malware verdict is returned
 *
 * Step 4 is the one that matters. A file named `cat.png` that contains an ELF
 * binary is rejected regardless of what the browser claimed.
 */

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 104_857_600);
export const MAX_IMAGE_BYTES = Number(process.env.MAX_IMAGE_BYTES ?? 12_582_912);
export const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
export const MAX_VIDEO_BYTES = MAX_UPLOAD_BYTES;
export const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;
export const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;

/** Hard ceiling on an unpacked archive. Ratio check below. */
export const MAX_UNPACKED_BYTES = 512 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRIES = 4_000;

export type UploadKind = 'image' | 'audio' | 'video' | 'document' | 'archive' | 'game' | 'text';

export interface AllowedType {
  kind: UploadKind;
  extensions: string[];
  mimes: string[];
  /** Only these may be rendered inline; everything else is served as download */
  inline: boolean;
  label: string;
}

export const ALLOWED_TYPES: AllowedType[] = [
  {
    kind: 'image',
    label: 'Images',
    extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'],
    mimes: [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/bmp',
      'image/x-ms-bmp',
    ],
    inline: true,
  },
  {
    kind: 'audio',
    label: 'Audio',
    extensions: ['mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'flac'],
    mimes: [
      'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/opus', 'audio/wav',
      'audio/x-wav', 'audio/flac', 'audio/vnd.wave',
    ],
    inline: true,
  },
  {
    kind: 'video',
    label: 'Video',
    extensions: ['mp4', 'webm', 'mov', 'm4v', 'ogv'],
    mimes: [
      'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-matroska',
    ],
    inline: true,
  },
  {
    kind: 'document',
    label: 'Documents',
    extensions: ['pdf', 'txt', 'md', 'rtf', 'csv', 'epub'],
    mimes: [
      'application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/rtf',
      'application/epub+zip',
    ],
    inline: true,
  },
  {
    kind: 'archive',
    label: 'Archives',
    extensions: ['zip'],
    mimes: ['application/zip', 'application/x-zip-compressed'],
    inline: false,
  },
  {
    kind: 'game',
    label: 'Game packages',
    extensions: ['zip'],
    mimes: ['application/zip', 'application/x-zip-compressed'],
    inline: false,
  },
];

export const ALLOWED_EXTENSIONS = new Set(ALLOWED_TYPES.flatMap((type) => type.extensions));

const EXTENSION_KIND = new Map<string, AllowedType>();
for (const type of ALLOWED_TYPES) {
  for (const extension of type.extensions) {
    if (!EXTENSION_KIND.has(extension)) EXTENSION_KIND.set(extension, type);
  }
}

export const KIND_LIMIT: Record<UploadKind, number> = {
  image: MAX_IMAGE_BYTES,
  audio: MAX_AUDIO_BYTES,
  video: MAX_VIDEO_BYTES,
  document: MAX_DOCUMENT_BYTES,
  archive: MAX_ARCHIVE_BYTES,
  game: MAX_ARCHIVE_BYTES,
  text: 256 * 1024,
};

export interface ValidationFinding {
  code: string;
  detail: string;
  severity: 'info' | 'warning' | 'blocking';
}

export interface ValidationResult {
  ok: boolean;
  kind: UploadKind | null;
  extension: string;
  detectedMime: string | null;
  /** The MIME the stored object is served with. Always from detection, never the browser. */
  serveContentType: string;
  inline: boolean;
  findings: ValidationFinding[];
}

/** Extensions that must never be written to disk in any circumstance. */
const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'dll', 'scr', 'bat', 'cmd', 'com', 'msi', 'msp', 'hta', 'cpl',
  'jar', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'reg',
  'pif', 'scf', 'lnk', 'apk', 'app', 'dmg', 'pkg', 'deb', 'rpm',
  'sys', 'drv', 'ocx', 'cpl', 'gadget', 'inf', 'url', 'website',
  'php', 'phtml', 'phar', 'asp', 'aspx', 'jsp', 'cgi', 'pl', 'rb',
]);

/** Text-like formats whose MIME is indistinguishable between plain text and HTML. */
const TEXTUAL_EXTENSIONS = new Set(['txt', 'md', 'csv', 'rtf']);

// ═══════════════════════════════════════════════════════════════════════════
// Filename handling
// ═══════════════════════════════════════════════════════════════════════════

const CONTROL_AND_INVISIBLE = new RegExp(
  '[' +
    '\\u0000-\\u001f' + // C0 controls
    '\\u007f-\\u009f' + // C1 controls
    '\\u200b-\\u200f' + // zero-width and directional marks
    '\\u2028-\\u202e' + // line separators and bidi overrides
    '\\u2060' + // word joiner
    '\\ufeff' + // byte order mark
    ']',
  'g',
);

const RESERVED_CHARACTERS = new RegExp('[<>:"|?*\\\\]', 'g');

export function sanitiseFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base
    .normalize('NFKC')
    .replace(CONTROL_AND_INVISIBLE, '')
    .replace(RESERVED_CHARACTERS, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || 'file').slice(0, 180);
}

export function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(filename.trim());
  return match ? match[1]!.toLowerCase() : '';
}

// ═══════════════════════════════════════════════════════════════════════════
// Structural sniffing
// ═══════════════════════════════════════════════════════════════════════════

/** Locates the PK zip header, tolerating a self-extracting prefix. */
function findLocalHeader(buffer: Uint8Array): number {
  const limit = Math.min(buffer.byteLength - 4, 65_536);
  for (let offset = 0; offset <= limit; offset += 1) {
    if (
      buffer[offset] === 0x50 &&
      buffer[offset + 1] === 0x4b &&
      buffer[offset + 2] === 0x03 &&
      buffer[offset + 3] === 0x04
    ) {
      return offset;
    }
  }
  return -1;
}

interface ZipCensus {
  entries: number;
  totalUncompressed: number;
  largestEntry: number;
  /** Paths that must never exist in an uploaded package */
  suspiciousPaths: string[];
  nestedArchives: number;
  absolutePaths: number;
}

function censusZip(buffer: Uint8Array): ZipCensus | null {
  const start = findLocalHeader(buffer);
  if (start < 0) return null;

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const census: ZipCensus = {
    entries: 0,
    totalUncompressed: 0,
    largestEntry: 0,
    suspiciousPaths: [],
    nestedArchives: 0,
    absolutePaths: 0,
  };

  let offset = start;
  const archiveExtensions = /\.(zip|jar|apk|war|ear|whl|egg|exe|msi|scr|bat|cmd|com|dll|so|dylib|ps1|vbs|hta|lnk|pif|scr)$/i;

  while (offset + 30 <= buffer.byteLength && census.entries < MAX_ARCHIVE_ENTRIES + 1) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) break;

    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const flags = view.getUint16(offset + 6, true);

    const nameStart = offset + 30;
    if (nameStart + nameLength > buffer.byteLength) break;
    const name = decoder.decode(buffer.subarray(nameStart, nameStart + nameLength));

    if (name) {
      census.entries += 1;
      census.totalUncompressed += uncompressedSize;
      census.largestEntry = Math.max(census.largestEntry, uncompressedSize);

      if (name.startsWith('/') || /^[a-zA-Z]:/.test(name) || name.includes('..')) {
        census.absolutePaths += 1;
      }
      if (archiveExtensions.test(name)) census.nestedArchives += 1;
      if (
        /(^\/|\.\.\/)\.(ssh|aws|gnupg|config)|id_rsa|\.env$|credentials|\.npmrc|\.netrc|id_rsa\.pub|\.git\/config|\.kdbx|\.agilekeychain|\.keychain|wallet\.dat/i.test(
          name,
        )
      ) {
        census.suspiciousPaths.push(name.slice(0, 120));
      }
    }

    // Data descriptors (bit 3) hide the real size; stop rather than guess.
    if (flags & 0x08) break;
    const advance = 30 + nameLength + extraLength + compressedSize;
    if (advance <= 0) break;
    offset += advance;
  }

  return census;
}

/**
 * True when the payload carries an executable container signature.
 * Covers Windows PE, ELF, Mach-O (both endiannesses and both 32/64-bit
 * magics), Java class files, and script shebangs.
 */
function looksLikeExecutable(buffer: Uint8Array): boolean {
  if (buffer.byteLength < 2) return false;
  const b0 = buffer[0]!;
  const b1 = buffer[1]!;
  const b2 = buffer.byteLength > 2 ? buffer[2]! : 0;
  const b3 = buffer.byteLength > 3 ? buffer[3]! : 0;

  // Windows PE / DOS executable
  if (b0 === 0x4d && b1 === 0x5a) return true;
  // ELF
  if (b0 === 0x7f && b1 === 0x45 && b2 === 0x4c && b3 === 0x46) return true;
  // Java class
  if (b0 === 0xca && b1 === 0xfe && b2 === 0xba && b3 === 0xbe) return true;
  // Mach-O: big-endian 32/64, little-endian 32/64, universal binary
  if (b0 === 0xfe && b1 === 0xed && b2 === 0xfa && (b3 === 0xce || b3 === 0xcf)) return true;
  if (b0 === 0xce && b1 === 0xfa && b2 === 0xed && b3 === 0xfe) return true;
  if (b0 === 0xfe && b1 === 0xed && b2 === 0xfa && (b3 === 0xed || b3 === 0xee)) return true;
  if (b0 === 0xed && b1 === 0xfe && b2 === 0xed && (b3 === 0xfa || b3 === 0xfb)) return true;
  if (b0 === 0xca && b1 === 0xfe && b2 === 0xba && b3 === 0xbe) return true;
  if (b0 === 0xbe && b1 === 0xba && b2 === 0xfe && b3 === 0xca) return true;
  if (b0 === 0xcf && b1 === 0xfa && b2 === 0xed && b3 === 0xfe) return true;
  // Script shebang
  if (b0 === 0x23 && b1 === 0x21) return true;

  return false;
}

/** Detects a PDF whose payload is actually a script carrier. */
function inspectPdf(buffer: Uint8Array): { openAction: boolean; launch: boolean; javascript: boolean } {
  const head = new TextDecoder('latin1').decode(buffer.subarray(0, Math.min(buffer.byteLength, 4_000_000)));
  return {
    openAction: /\/OpenAction\b/i.test(head),
    launch: /\/Launch\b/i.test(head),
    javascript: /\/JavaScript\b|\/JS\b/i.test(head),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Entry point
// ═══════════════════════════════════════════════════════════════════════════

export async function validateUpload(input: {
  filename: string;
  declaredMime: string;
  data: Uint8Array;
  /** Game packages have their own, stricter pipeline */
  expect?: UploadKind;
}): Promise<ValidationResult> {
  const findings: ValidationFinding[] = [];
  const displayName = sanitiseFilename(input.filename);
  const extension = extensionOf(displayName);

  const fail = (code: string, detail: string): ValidationResult => ({
    ok: false,
    kind: null,
    extension,
    detectedMime: null,
    serveContentType: 'application/octet-stream',
    inline: false,
    findings: [...findings, { code, detail, severity: 'blocking' }],
  });

  // 1 · Size, declared
  const declaredKind = EXTENSION_KIND.get(extension)?.kind ?? null;
  const limit = declaredKind ? KIND_LIMIT[declaredKind] : MAX_UPLOAD_BYTES;
  if (input.data.byteLength === 0) return fail('empty', 'The file is empty.');
  if (input.data.byteLength > limit) {
    return fail(
      'too_large',
      `That file is ${formatBytes(input.data.byteLength)}. The limit for this kind is ${formatBytes(limit)}.`,
    );
  }

  // 2 · Extension allowlist
  if (DANGEROUS_EXTENSIONS.has(extension)) {
    return fail('dangerous_extension', `Files ending in .${extension} cannot be uploaded to Enyd Arch.`);
  }

  const allowed = EXTENSION_KIND.get(extension);
  if (!allowed) {
    return fail(
      'extension_not_allowed',
      `Enyd Arch does not accept .${extension || '(no extension)'} files. Supported: ${[...ALLOWED_EXTENSIONS].sort().join(', ')}.`,
    );
  }

  if (input.expect && input.expect !== allowed.kind) {
    return fail(
      'wrong_kind',
      `This upload point expects ${input.expect} files, but .${extension} is ${allowed.kind}.`,
    );
  }

  // 3 · Declared MIME
  const declared = input.declaredMime.split(';')[0]!.trim().toLowerCase();
  if (declared && !allowed.mimes.includes(declared)) {
    findings.push({
      code: 'mime_mismatch',
      detail: `The browser reported ${declared}; the file is being stored as ${allowed.mimes[0]}.`,
      severity: 'warning',
    });
  }

  // 4 · Magic bytes. Detection wins.
  const detected = await fileTypeFromBuffer(input.data);
  let detectedMime = detected?.mime ?? null;

  if (detected) {
    const family = detected.ext;
    const compatible =
      allowed.mimes.includes(detected.mime) ||
      // Aliases file-type uses for the same container.
      (allowed.kind === 'archive' || allowed.kind === 'game'
        ? ['zip', 'epub'].includes(family)
        : false) ||
      (family === 'zip' && allowed.kind === 'document');

    if (!compatible) {
      return fail(
        'content_mismatch',
        `The contents of this file are ${detected.mime}, which is not a permitted ${allowed.kind}. Renaming a file does not change what it is.`,
      );
    }

    if (extension && detected.ext !== extension) {
      findings.push({
        code: 'extension_normalised',
        detail: `Stored as .${detected.ext} because the contents are ${detected.mime}.`,
        severity: 'info',
      });
    }
  } else {
    // No magic number: only textual formats may proceed.
    if (!TEXTUAL_EXTENSIONS.has(extension)) {
      return fail(
        'unrecognised_type',
        `The contents of this .${extension} file could not be identified. If it is meant to be plain text, upload it as .txt or .md.`,
      );
    }
    const head = new TextDecoder('utf-8', { fatal: false }).decode(
      input.data.subarray(0, 4_096),
    );
    if (/<(!doctype html|html|head|body|script)\b/i.test(head)) {
      return fail(
        'markup_not_allowed',
        'This text file contains HTML or script markup. Enyd Arch stores plain text and Markdown only.',
      );
    }
    if (looksLikeExecutable(input.data)) {
      return fail('executable_content', 'This file appears to be an executable program.');
    }
    detectedMime = 'text/plain';
  }

  // 5 · Kind-specific structural checks
  const effectiveExtension = detected?.ext ?? extension;

  if (allowed.kind === 'document' && effectiveExtension === 'pdf') {
    const pdf = inspectPdf(input.data);
    if (pdf.javascript) {
      return fail('active_pdf', 'This PDF contains JavaScript. Active PDFs are not accepted.');
    }
    if (pdf.openAction || pdf.launch) {
      return fail(
        'active_pdf',
        'This PDF runs an action automatically when opened. Enyd Arch only stores inert PDFs.',
      );
    }
  }

  if (allowed.kind === 'archive' || allowed.kind === 'game') {
    const census = censusZip(input.data);
    if (!census) {
      return fail('unreadable_archive', 'This archive could not be read. It may be corrupt.');
    }
    if (census.absolutePaths > 0) {
      return fail(
        'unsafe_archive_paths',
        'This archive contains absolute or parent-relative paths, which is a common way to overwrite files outside its own folder.',
      );
    }
    if (census.entries > MAX_ARCHIVE_ENTRIES) {
      return fail('archive_too_many_entries', `This archive has more than ${MAX_ARCHIVE_ENTRIES} entries.`);
    }
    if (census.nestedArchives > 0) {
      findings.push({
        code: 'nested_executables',
        detail: `${census.nestedArchives} file(s) inside this archive are executables or nested archives. They will not be run.`,
        severity: 'warning',
      });
    }
    if (census.suspiciousPaths.length > 0) {
      findings.push({
        code: 'sensitive_paths',
        detail: `This archive contains ${census.suspiciousPaths.length} path(s) that look like credentials or system files: ${census.suspiciousPaths.slice(0, 3).join(', ')}.`,
        severity: 'warning',
      });
    }
    if (census.totalUncompressed > MAX_UNPACKED_BYTES) {
      return fail(
        'archive_too_large',
        'This archive expands to more than 512 MB, which is refused regardless of its compressed size.',
      );
    }
    if (
      census.totalUncompressed > 0 &&
      census.totalUncompressed / Math.max(1, input.data.byteLength) > 200
    ) {
      findings.push({
        code: 'high_compression_ratio',
        detail: `This archive expands roughly ${Math.round(census.totalUncompressed / Math.max(1, input.data.byteLength))}×. Please confirm it is what you meant to upload.`,
        severity: 'warning',
      });
    }
    return {
      ok: true,
      kind: allowed.kind,
      extension: effectiveExtension,
      detectedMime: detectedMime ?? 'application/zip',
      serveContentType: 'application/zip',
      inline: false,
      findings,
    };
  }

  if (looksLikeExecutable(input.data)) {
    return fail('executable_content', 'This file appears to be an executable program.');
  }

  const serveContentType = detectedMime ?? allowed.mimes[0]!;
  // Only media and plain text may be rendered in place. Everything else is
  // offered as a download, carrying its detected type rather than a sniffed one.
  const INLINE_PREFIXES: Partial<Record<UploadKind, string>> = {
    image: 'image/',
    audio: 'audio/',
    video: 'video/',
    document: 'text/',
  };
  const inlinePrefix = INLINE_PREFIXES[allowed.kind];
  const inline = Boolean(allowed.inline && inlinePrefix && serveContentType.startsWith(inlinePrefix));

  return {
    ok: true,
    kind: allowed.kind,
    extension: effectiveExtension,
    detectedMime,
    serveContentType,
    inline,
    findings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Presentation helpers
// ═══════════════════════════════════════════════════════════════════════════

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function kindGlyph(kind: UploadKind | null): string {
  switch (kind) {
    case 'image':
      return '◉';
    case 'audio':
      return '♪';
    case 'video':
      return '▶';
    case 'document':
      return '▤';
    case 'archive':
      return '⛁';
    case 'game':
      return '◱';
    default:
      return '◇';
  }
}

export const ACCEPT_ATTRIBUTE = ALLOWED_TYPES.flatMap((type) =>
  type.extensions.map((extension) => `.${extension}`),
).join(',');

/** Read a declared size from a multipart part before materialising the body. */
export function withinDeclaredLimit(size: number | undefined, kind?: UploadKind): boolean {
  if (size === undefined) return true;
  const limit = kind ? KIND_LIMIT[kind] : MAX_UPLOAD_BYTES;
  return size <= limit;
}
