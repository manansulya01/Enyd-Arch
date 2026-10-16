import 'server-only';
import {
  ARCHIVE_LIMITS,
  GAME_LIMITS,
  ZipError,
  entryExtension,
  readZip,
  sha256Hex,
  writeZip,
  type ZipEntry,
} from './zip';

/**
 * Game package sanitisation
 *
 * A submitted package is never served to a browser as received. It is unpacked
 * in the server, reduced to an allowlist of inert file types, checked against a
 * set of source rules, and repacked. What a player eventually runs is a package
 * this server produced.
 *
 * Defence in depth, in order:
 *   1. path normalisation — traversal and absolute paths are refused outright
 *   2. type allowlist — only html/css/js/json/svg/png/wav/ogg/txt/md/woff2
 *   3. byte budget — small enough to load entirely in memory, bounded by the
 *      unpacker before any allocation
 *   4. source scanning — network, storage, credential and obfuscation patterns
 *      are reported; the dangerous ones block publication
 *   5. repack — STORE only, deterministic bytes, pinned checksum
 *   6. runtime isolation — a separate origin with connect-src 'none'
 *
 * Note that source scanning is defence in depth, not a security boundary. The
 * boundary is the separate origin plus the absence of ambient credentials; a
 * determined author can obfuscate anything a scanner can pattern-match.
 */

/** Extensions permitted inside a game package. */
const ALLOWED_EXTENSIONS = new Set([
  'html', 'htm', 'css', 'js', 'mjs', 'json',
  'png', 'webp', 'gif', 'svg',
  'wav', 'ogg', 'mp3',
  'txt', 'md',
  'woff2', 'ttf',
]);

/** Files the runtime needs in order to bootstrap. */
const REQUIRED_ENTRY_CANDIDATES = ['index.html'];

const MAX_HTML_FILES = 4;
const MAX_JS_FILES = 24;

export interface ScanFinding {
  rule: string;
  detail: string;
  severity: 'info' | 'warning' | 'blocking';
  file?: string;
}

export interface ScanReport {
  findings: ScanFinding[];
  blocked: boolean;
  entries: number;
  totalBytes: number;
  entryFile: string | null;
  files: Array<{ path: string; bytes: number }>;
}

interface Rule {
  id: string;
  severity: 'info' | 'warning' | 'blocking';
  detail: string;
  pattern: RegExp;
  /** Findings in these files only */
  appliesTo?: (entryPath: string) => boolean;
}

const isSource = (entryPath: string) =>
  /\.(html?|css|js|mjs|json|svg)$/i.test(entryPath);

const RULES: Rule[] = [
  // ── Network egress ─────────────────────────────────────────────────────
  {
    id: 'network.fetch',
    severity: 'blocking',
    detail:
      'Games may not use fetch, XMLHttpRequest, WebSocket, EventSource or sendBeacon. The sandbox has no network access.',
    pattern: /\b(?:fetch\s*\(|XMLHttpRequest|WebSocket\s*\(|EventSource\s*\(|sendBeacon\s*\()/,
    appliesTo: isSource,
  },
  {
    id: 'network.import',
    severity: 'blocking',
    detail: 'Dynamic import() is not permitted in a submitted package.',
    pattern: /\bimport\s*\(/,
    appliesTo: isSource,
  },
  {
    id: 'network.external_url',
    severity: 'warning',
    detail: 'This package references an external URL. Nothing will load from it in the sandbox.',
    pattern: /https?:\/\/(?!localhost|127\.0\.0\.1)[^\s"'`)]+/i,
    appliesTo: (entryPath) => /\.(html?|css|js|mjs)$/i.test(entryPath),
  },
  {
    id: 'network.dns_prefetch',
    severity: 'warning',
    detail: 'Resource hints cannot be used because the sandbox has no network access.',
    pattern: /(?:dns-prefetch|preconnect|prefetch|preload)\b/i,
    appliesTo: isSource,
  },

  // ── Browser reach ──────────────────────────────────────────────────────
  {
    id: 'escape.top_navigation',
    severity: 'blocking',
    detail: 'A game may not navigate the top-level frame or open windows.',
    pattern: /\b(?:top\s*\.\s*location|parent\s*\.\s*location|window\s*\.\s*top|window\s*\.\s*parent)\b/,
    appliesTo: isSource,
  },
  {
    id: 'escape.postmessage',
    severity: 'warning',
    detail: 'postMessage is disabled. A game cannot talk to the page that embeds it.',
    pattern: /\bpostMessage\s*\(/,
    appliesTo: isSource,
  },
  {
    id: 'escape.cookie',
    severity: 'blocking',
    detail: 'Games may not read or write cookies.',
    pattern: /\bdocument\s*\.\s*cookie\b/,
    appliesTo: isSource,
  },
  {
    id: 'escape.service_worker',
    severity: 'blocking',
    detail: 'Service workers are not permitted in submitted packages.',
    pattern: /\bserviceWorker\b|navigator\s*\.\s*serviceWorker/,
    appliesTo: isSource,
  },
  {
    id: 'escape.shared_worker',
    severity: 'blocking',
    detail: 'Shared and dedicated workers are not permitted.',
    pattern: /\bnew\s+(?:Shared|Dedicated)Worker\b/,
    appliesTo: isSource,
  },

  // ── Storage & credentials ──────────────────────────────────────────────
  {
    id: 'storage.persistent',
    severity: 'warning',
    detail: 'Local storage is sandboxed per game and is discarded when the player leaves.',
    pattern: /\b(?:localStorage|sessionStorage|indexedDB|caches)\b/,
    appliesTo: isSource,
  },
  {
    id: 'credential.theft',
    severity: 'blocking',
    detail:
      'This references document.cookie or window.name access patterns used to lift credentials from an embedding page.',
    pattern: /\bwindow\s*\.\s*name\b|\bdocument\s*\.\s*cookie\b/,
    appliesTo: isSource,
  },
  {
    id: 'credential.clipboard',
    severity: 'warning',
    detail: 'Clipboard access requires a user gesture and is cleared when the game ends.',
    pattern: /\bclipboard\b/,
    appliesTo: isSource,
  },

  // ── Hostile presentation ───────────────────────────────────────────────
  {
    id: 'hostile.fullscreen_lock',
    severity: 'blocking',
    detail: 'Pointer lock and fullscreen capture are not permitted; a player must always be able to leave.',
    pattern: /requestPointerLock|requestFullscreen\s*\(|webkitRequestFullscreen/,
    appliesTo: isSource,
  },
  {
    id: 'hostile.download',
    severity: 'blocking',
    detail: 'A game may not download files onto the player\'s machine.',
    pattern: /\bdownload\s*=\s*['"]|\.click\(\)\s*;?\s*(?:\/\/)?.*createElement\(['"]a['"]\)/i,
    appliesTo: isSource,
  },
  {
    id: 'hostile.obfuscated_eval',
    severity: 'warning',
    detail:
      'Dynamically constructed code is hard to review. This does not block publication, but it makes the game harder for staff to vet.',
    pattern: /\b(?:eval|Function\s*\(\s*['"`])/,
    appliesTo: isSource,
  },
  {
    id: 'hostile.minified',
    severity: 'info',
    detail:
      'This file appears to be minified. Source that members can read is encouraged, and it is much easier for staff to review.',
    pattern: /^[^\n]{2000,}$/,
    appliesTo: (entryPath) => /\.js$/i.test(entryPath),
  },

  // ── Document hygiene ───────────────────────────────────────────────────
  {
    id: 'doc.remote_asset',
    severity: 'warning',
    detail: 'Assets loaded from another origin will not load in the sandbox.',
    pattern: /<(?:script|img|link|iframe|video|audio|source)[^>]+(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\//i,
    appliesTo: (entryPath) => /\.html?$/i.test(entryPath),
  },
  {
    id: 'doc.meta_refresh',
    severity: 'blocking',
    detail: 'Meta refresh redirects are not permitted.',
    pattern: /<meta[^>]+http-equiv\s*=\s*["']?refresh/i,
    appliesTo: (entryPath) => /\.html?$/i.test(entryPath),
  },
  {
    id: 'doc.inline_script',
    severity: 'info',
    detail: 'Scripts are inlined in this document rather than kept as separate files.',
    pattern: /<script(?![^>]*\bsrc\s*=)[^>]*>/i,
    appliesTo: (entryPath) => /\.html?$/i.test(entryPath),
  },
];

export interface ProcessResult {
  ok: boolean;
  report: ScanReport;
  /** Sanitised, repacked archive. Present only when `ok` is true. */
  packageBytes: Uint8Array | null;
  entryFile: string | null;
  checksum: string | null;
  message?: string;
}

export function processGamePackage(
  archiveBytes: Uint8Array,
): ProcessResult {
  const findings: ScanFinding[] = [];

  let entries: ZipEntry[];
  try {
    entries = readZip(archiveBytes, GAME_LIMITS);
  } catch (error) {
    const message =
      error instanceof ZipError ? error.message : 'This package could not be read.';
    return {
      ok: false,
      report: {
        findings: [
          { rule: 'package.unreadable', detail: message, severity: 'blocking' },
        ],
        blocked: true,
        entries: 0,
        totalBytes: 0,
        entryFile: null,
        files: [],
      },
      packageBytes: null,
      entryFile: null,
      checksum: null,
      message,
    };
  }

  // ── Filter to the allowlist, reporting everything else ─────────────────
  const kept: ZipEntry[] = [];
  const seenPaths = new Set<string>();
  let totalBytes = 0;
  let htmlCount = 0;
  let jsCount = 0;

  for (const entry of entries) {
    if (entry.path.endsWith('/')) continue; // directory marker

    const extension = entryExtension(entry.path);

    if (seenPaths.has(entry.path)) {
      findings.push({
        rule: 'package.duplicate_entry',
        detail: `"${entry.path}" appears more than once in this package.`,
        severity: 'blocking',
        file: entry.path,
      });
      continue;
    }
    seenPaths.add(entry.path);

    if (!ALLOWED_EXTENSIONS.has(extension)) {
      findings.push({
        rule: 'package.type_not_allowed',
        detail: `"${entry.path}" is not a file type games may contain. Games may contain: ${[...ALLOWED_EXTENSIONS].sort().join(', ')}.`,
        severity: 'warning',
        file: entry.path,
      });
      continue;
    }

    if (extension === 'html' || extension === 'htm') {
      htmlCount += 1;
      if (htmlCount > MAX_HTML_FILES) {
        findings.push({
          rule: 'package.too_many_documents',
          detail: `A package may contain at most ${MAX_HTML_FILES} HTML documents.`,
          severity: 'blocking',
          file: entry.path,
        });
        continue;
      }
    }

    if (extension === 'js' || extension === 'mjs') {
      jsCount += 1;
      if (jsCount > MAX_JS_FILES) {
        findings.push({
          rule: 'package.too_many_scripts',
          detail: `A package may contain at most ${MAX_JS_FILES} scripts.`,
          severity: 'blocking',
          file: entry.path,
        });
        continue;
      }
    }

    // An SVG is an active document format; refuse one that carries script.
    if (extension === 'svg') {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(entry.data);
      if (/<script[\s>]/i.test(text) || /\son\w+\s*=/i.test(text)) {
        findings.push({
          rule: 'package.active_svg',
          detail: `"${entry.path}" contains a script or event handler inside an SVG, which can run in the page context.`,
          severity: 'blocking',
          file: entry.path,
        });
        continue;
      }
    }

    kept.push(entry);
    totalBytes += entry.data.byteLength;
  }

  // ── Choose the entry document ──────────────────────────────────────────
  let entryFile: string | null = null;
  for (const candidate of REQUIRED_ENTRY_CANDIDATES) {
    const match = kept.find((entry) => entry.path.toLowerCase() === candidate);
    if (match) {
      entryFile = match.path;
      break;
    }
  }
  if (!entryFile) {
    const shallow = kept
      .filter((entry) => entryDepthIsOne(entry.path) && /\.(html?|js)$/i.test(entry.path))
      .sort((a, b) => a.path.length - b.path.length);
    if (shallow[0]) entryFile = shallow[0].path;
  }
  if (!entryFile) {
    findings.push({
      rule: 'package.no_entry',
      detail:
        'This package has no index.html. A game needs an index.html at the top level of the package.',
      severity: 'blocking',
    });
  }

  // ── Source scanning ────────────────────────────────────────────────────
  for (const entry of kept) {
    if (!/\.(html?|css|js|mjs|json)$/i.test(entry.path)) continue;
    const text = new TextDecoder('utf-8', { fatal: false }).decode(entry.data);

    for (const rule of RULES) {
      if (rule.appliesTo && !rule.appliesTo(entry.path)) continue;
      const match = rule.pattern.exec(text);
      if (!match) continue;

      const detail =
        match.length > 0 && match.length < 80 && /https?:/i.test(match[0])
          ? `${rule.detail} (${match[0]})`
          : rule.detail;

      findings.push({ rule: rule.id, detail, severity: rule.severity, file: entry.path });
      rule.pattern.lastIndex = 0;
    }
  }

  // ── Verdict ────────────────────────────────────────────────────────────
  const blocked = findings.some((finding) => finding.severity === 'blocking');

  const report: ScanReport = {
    findings,
    blocked,
    entries: kept.length,
    totalBytes,
    entryFile,
    files: kept
      .map((entry) => ({ path: entry.path, bytes: entry.data.byteLength }))
      .sort((a, b) => b.bytes - a.bytes),
  };

  if (blocked || !entryFile) {
    return {
      ok: false,
      report,
      packageBytes: null,
      entryFile,
      checksum: null,
      message: blocked
        ? 'This package was refused. See the review notes for what needs to change.'
        : 'This package needs an index.html at its top level.',
    };
  }

  // ── Repack deterministically ───────────────────────────────────────────
  const repacked = writeZip(
    kept.map((entry) => ({ path: entry.path, data: entry.data })),
  );

  return {
    ok: true,
    report,
    packageBytes: repacked,
    entryFile,
    checksum: sha256Hex(repacked),
  };
}

function entryDepthIsOne(entryPath: string): boolean {
  return !entryPath.includes('/');
}

/** Unpacks an ordinary uploaded archive for inspection. Never executes it. */
export function inspectArchive(archiveBytes: Uint8Array): {
  entries: number;
  totalBytes: number;
  files: Array<{ path: string; bytes: number }>;
} {
  const entries = readZip(archiveBytes, ARCHIVE_LIMITS);
  return {
    entries: entries.length,
    totalBytes: entries.reduce((total, entry) => total + entry.data.byteLength, 0),
    files: entries
      .map((entry) => ({ path: entry.path, bytes: entry.data.byteLength }))
      .sort((a, b) => b.bytes - a.bytes),
  };
}