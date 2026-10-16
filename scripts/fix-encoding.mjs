/**
 * Detects and repairs files that were round-tripped through PowerShell's ANSI
 * default encoding, which mangles every non-ASCII character.
 *
 * PowerShell 5.1 reads and writes with the system ANSI codepage. A UTF-8 file
 * opened without a BOM has every byte above 0x7F reinterpreted as a CP1252
 * character, then re-encoded as UTF-8 on write — compounding the damage. The
 * reversal is therefore: read UTF-8 → encode the resulting string back to
 * CP1252 → those bytes are the original UTF-8.
 *
 *   node scripts/fix-encoding.mjs [--write] <file...>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const CP1252_HIGH = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x008d, 0x017d, 0x008f, 0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

/** Unicode code point → CP1252 byte. */
const CP1252_TO_BYTE = new Map(CP1252_HIGH.map((code, offset) => [code, 0x80 + offset]));

/** Bytes 0x80–0x9F as the characters PowerShell would have produced. */
const BYTE_TO_UNICODE = new Map(CP1252_HIGH.map((code, offset) => [0x80 + offset, code]));

const MOJIBAKE = /[\u00c2\u00c3][\u0080-\u00bf]|\u00e2[\u0080-\u00bf][\u2020-\u2022\u20ac\u201a\u0192\u2122]|\u00e2[\u0080-\u00bf]{2}/;

const countBad = (text) => (text.match(new RegExp(MOJIBAKE, 'g')) ?? []).length;

function toOriginalBytes(originalBytes) {
  const mangledText = originalBytes.toString('utf8');
  const restored = [];
  for (const character of mangledText) {
    const code = character.codePointAt(0);
    const byte = CP1252_TO_BYTE.get(code) ?? code;
    if (byte > 0xff) return null; // cannot have come from a CP1252 read
    restored.push(byte);
  }
  return Buffer.from(restored);
}

const args = process.argv.slice(2);
const write = args.includes('--write');
const files = args.filter((arg) => !arg.startsWith('--'));

if (files.length === 0) {
  console.error('usage: node scripts/fix-encoding.mjs [--write] <file...>');
  process.exit(1);
}

let failures = 0;
for (const file of files) {
  const original = readFileSync(file);
  const before = countBad(original.toString('utf8'));

  if (before === 0) {
    console.log(`clean    ${file}`);
    continue;
  }

  const fixed = toOriginalBytes(original);
  if (!fixed) {
    failures += 1;
    console.error(`FAILED   ${file}: cannot reverse CP1252 round trip`);
    continue;
  }

  const after = countBad(fixed.toString('utf8'));
  if (after !== 0) {
    failures += 1;
    console.error(`FAILED   ${file}: ${before} bad sequences, ${after} after repair`);
    continue;
  }

  if (write) {
    writeFileSync(file, fixed);
    console.log(`repaired ${file}: ${before} bad sequences`);
  } else {
    console.log(`needs    ${file}: ${before} bad sequences`);
  }
}

void BYTE_TO_UNICODE;
process.exit(failures === 0 ? 0 : 1);