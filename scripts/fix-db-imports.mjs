/**
 * Rewrites the `~/db` import prefix to the `~db` alias.
 *
 * The application lives in `src/`, so `~/*` resolves there; the database layer
 * sits beside it at the repository root and is reached through `~db`. Run once
 * after adding the alias to tsconfig.json and next.config.ts.
 *
 *   node scripts/fix-db-imports.mjs [--write]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const write = process.argv.includes('--write');
const roots = ['src', 'db', 'scripts'];

function collect(directory, out = []) {
  let entries;
  try {
    entries = readdirSync(directory);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      collect(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

let changed = 0;
for (const root of roots) {
  for (const file of collect(root)) {
    const original = readFileSync(file, 'utf8');
    const updated = original
      .replace(/from '(~\/db)'/g, "from '~db'")
      .replace(/from '(~\/db\/schema)'/g, "from '~db/schema'");

    if (updated === original) continue;
    changed += 1;
    if (write) {
      writeFileSync(file, updated);
      console.log(`updated ${file}`);
    } else {
      console.log(`needs    ${file}`);
    }
  }
}

console.log(changed === 0 ? 'nothing to change' : `${changed} file(s) ${write ? 'updated' : 'need updating'}`);