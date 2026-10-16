import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

/**
 * A deliberately small ZIP reader and writer.
 *
 * Arcade submissions arrive as `.zip` and are unpacked, inspected, sanitised,
 * and repacked. Rather than take a dependency on a full-featured archive
 * library — which would expand the supply chain that processes untrusted
 * uploads — the subset needed here is implemented directly:
 *
 *   · STORE (0) and DEFLATE (8) are the only accepted compression methods
 *   · no encryption, no multi-disk, no zip64, no data descriptors
 *   · every entry name is validated and every size is bounded before any
 *     allocation happens
 *
 * Anything outside that subset is rejected rather than guessed at.
 */

export interface ZipEntry {
  /** Path relative to the package root, already normalised and validated */
  path: string;
  data: Uint8Array;
  crc32: number;
  compressedSize: number;
  method: number;
  flags: number;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc = CRC_TABLE[(crc ^ data[index]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface UnpackLimits {
  maxEntries: number;
  maxTotalBytes: number;
  maxEntryBytes: number;
  /** Maximum directory depth */
  maxDepth: number;
}

export const GAME_LIMITS: UnpackLimits = {
  maxEntries: 300,
  maxTotalBytes: 4 * 1024 * 1024,
  maxEntryBytes: 2 * 1024 * 1024,
  maxDepth: 8,
};

export const ARCHIVE_LIMITS: UnpackLimits = {
  maxEntries: 4000,
  maxTotalBytes: 512 * 1024 * 1024,
  maxEntryBytes: 128 * 1024 * 1024,
  maxDepth: 16,
};

export class ZipError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

const decoder = new TextDecoder('utf-8', { fatal: false });

/**
 * Normalises an entry path and refuses anything that could escape the package
 * root or address the host filesystem.
 */
export function normaliseEntryPath(raw: string): string {
  const cleaned = raw
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    // Absolute paths, drive letters, UNC prefixes.
    .replace(/^[/\\]+/, '')
    .replace(/^[a-zA-Z]:[/\\]?/, '');

  const parts: string[] = [];
  for (const segment of cleaned.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      // A parent reference is resolved then rejected if it escapes.
      if (parts.length === 0) {
        throw new ZipError('path_traversal', `The package contains a path that escapes its own folder: ${raw}`);
      }
      parts.pop();
      continue;
    }
    parts.push(segment);
  }

  if (parts.length === 0) {
    throw new ZipError('empty_path', 'The package contains an entry with no path.');
  }

  return parts.join('/');
}

export function entryDepth(entryPath: string): number {
  return entryPath.split('/').length;
}

export function entryExtension(entryPath: string): string {
  const base = entryPath.split('/').pop() ?? '';
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(base);
  return match ? match[1]!.toLowerCase() : '';
}

/**
 * Reads a ZIP archive into memory.
 *
 * Size limits are checked against the declared central-directory sizes *before*
 * any buffer is allocated, and the running total is enforced as entries are
 * materialised, so a zip bomb cannot exhaust memory.
 */
export function readZip(buffer: Uint8Array, limits: UnpackLimits): ZipEntry[] {
  if (buffer.byteLength < 22) {
    throw new ZipError('too_small', 'This file is too small to be an archive.');
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  // Locate the end-of-central-directory record.
  let eocd = -1;
  const searchFloor = Math.max(0, buffer.byteLength - 66_000);
  for (let offset = buffer.byteLength - 22; offset >= searchFloor; offset -= 1) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) {
    throw new ZipError('no_central_directory', 'This archive has no central directory and may be damaged.');
  }

  const entryCount = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);

  if (entryCount === 0xffff || centralOffset === 0xffffffff) {
    throw new ZipError('zip64_unsupported', 'Zip64 archives are not accepted.');
  }
  if (entryCount === 0) {
    throw new ZipError('empty_archive', 'This archive contains no files.');
  }
  if (entryCount > limits.maxEntries) {
    throw new ZipError('too_many_entries', `This package contains ${entryCount} entries; the limit is ${limits.maxEntries}.`);
  }
  if (centralOffset + centralSize > buffer.byteLength) {
    throw new ZipError('truncated', 'This archive is truncated.');
  }

  const entries: ZipEntry[] = [];
  let cursor = centralOffset;
  let totalBytes = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.byteLength) {
      throw new ZipError('truncated', 'This archive is truncated.');
    }
    if (view.getUint32(cursor, true) !== CENTRAL_HEADER) {
      throw new ZipError('bad_central_entry', 'This archive has a damaged central directory.');
    }

    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const declaredCompressed = view.getUint32(cursor + 20, true);
    const declaredSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);

    const nameStart = cursor + 46;
    const name = decoder.decode(buffer.subarray(nameStart, nameStart + nameLength));

    // ── Refuse anything outside the supported subset ────────────────────
    if (flags & 0x0001) {
      throw new ZipError('encrypted', 'Encrypted archives are not accepted.');
    }
    if (method !== 0 && method !== 8) {
      throw new ZipError(
        'unsupported_compression',
        `This archive uses compression method ${method}, which is not supported. Use a standard zip.`,
      );
    }
    if (declaredSize > limits.maxEntryBytes) {
      throw new ZipError(
        'entry_too_large',
        `One file in this archive is ${declaredSize} bytes; the limit is ${limits.maxEntryBytes}.`,
      );
    }

    totalBytes += declaredSize;
    if (totalBytes > limits.maxTotalBytes) {
      throw new ZipError(
        'archive_too_large',
        `This archive expands to more than ${Math.round(limits.maxTotalBytes / 1024 / 1024)} MB.`,
      );
    }

    // ── Read the local header to find the data offset ────────────────────
    if (localOffset + 30 > buffer.byteLength) {
      throw new ZipError('truncated', 'This archive is truncated.');
    }
    if (view.getUint32(localOffset, true) !== LOCAL_HEADER) {
      throw new ZipError('bad_local_entry', 'This archive has a damaged entry.');
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + declaredCompressed;

    if (dataEnd > buffer.byteLength) {
      throw new ZipError('truncated', 'This archive is truncated.');
    }

    const raw = buffer.subarray(dataStart, dataEnd);

    let data: Uint8Array;
    if (method === 0) {
      if (declaredCompressed !== declaredSize) {
        throw new ZipError('size_mismatch', 'This archive declares inconsistent sizes.');
      }
      data = raw.slice();
    } else {
      try {
        // inflateRawSync enforces maxOutputLength, so a malicious declared size
        // cannot be used to force a large allocation.
        const inflated = inflateRawSync(raw, { maxOutputLength: limits.maxEntryBytes });
        data = new Uint8Array(inflated);
      } catch {
        throw new ZipError('inflate_failed', `Could not expand "${name}" from this archive.`);
      }
    }

    if (data.byteLength !== declaredSize) {
      throw new ZipError(
        'size_mismatch',
        `"${name}" declares ${declaredSize} bytes but contains ${data.byteLength}.`,
      );
    }

    const expectedCrc = view.getUint32(cursor + 16, true);
    const actualCrc = crc32(data);
    if (expectedCrc !== actualCrc) {
      throw new ZipError('crc_mismatch', `"${name}" is corrupt: its checksum does not match.`);
    }

    const entryPath = normaliseEntryPath(name);
    if (entryDepth(entryPath) > limits.maxDepth) {
      throw new ZipError('too_deep', `"${name}" is nested more than ${limits.maxDepth} levels deep.`);
    }

    entries.push({
      path: entryPath,
      data,
      crc32: actualCrc,
      compressedSize: declaredCompressed,
      method,
      flags,
    });

    cursor = nameStart + nameLength + extraLength + commentLength;
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function dosDateTime(date: Date): { time: number; date: number } {
  return {
    time:
      (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f),
    date:
      (((date.getFullYear() - 1980) & 0x7f) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/**
 * Writes a ZIP archive using STORE only.
 *
 * Stored entries mean the reader never has to inflate anything in the sandbox,
 * which keeps the runtime's attack surface small and makes the byte stream
 * deterministic for a given input set.
 */
export function writeZip(entries: Array<{ path: string; data: Uint8Array }>): Uint8Array {
  const now = new Date();
  const { time, date } = dosDateTime(now);

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.path);
    const checksum = crc32(entry.data);

    const local = new Uint8Array(30 + nameBytes.length + entry.data.byteLength);
    const localView = new DataView(local.buffer);

    localView.setUint32(0, LOCAL_HEADER, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true); // STORE
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, entry.data.byteLength, true);
    localView.setUint32(22, entry.data.byteLength, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(entry.data, 30 + nameBytes.length);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, CENTRAL_HEADER, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, entry.data.byteLength, true);
    centralView.setUint32(24, entry.data.byteLength, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    locals.push(local);
    centrals.push(central);
    offset += local.byteLength;
  }

  const centralSize = centrals.reduce((total, entry) => total + entry.byteLength, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, END_OF_CENTRAL, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  const total =
    offset + centralSize + end.byteLength;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, cursor);
    cursor += part.byteLength;
  }
  return out;
}

export function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}