/**
 * One-off repair for files that were round-tripped through PowerShell's ANSI
 * default encoding, which mangled every non-ASCII character.
 *
 * Reverses the double-encoding: bytes -> CP1252 string -> original bytes -> UTF-8.
 *
 *   node scripts/repair-encoding.mjs <file...>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts/repair-encoding.mjs <file...>');
  process.exit(1);
}

// Latin-1 → Unicode gives a 1:1 mapping, which makes the reversal exact.
const latin1 = Buffer.from(
  files.flatMap((file) => [...readFileSync(file)]),
);

for (const file of files) {
  const original = readFileSync(file);
  const asLatin1 = original.toString('latin1');
  const repaired = Buffer.from(asLatin1, 'utf8');

  const before = countMojibake(original.toString('utf8'));
  const after = countMojibake(repaired.toString('utf8'));

  if (after < before) {
    writeFileSync(file, repaired);
    console.log(`repaired ${file}: mojibake ${before} -> ${after}`);
  } else {
    console.log(`unchanged ${file}: mojibake ${before}`);
  }
}
void latin1;

function countMojibake(text) {
  // A box-drawing or typographic char surviving means the file is fine.
  return /[\u2022\u00e2\u00c2][\u0080-\u00bf\u2022]/.test(text) ? 1 : 0;
}