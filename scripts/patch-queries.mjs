/**
 * Repairs known type errors in src/server/queries.ts that arise from raw-SQL
 * joins in the drizzle query builder. Run once, then delete.
 *
 *   node scripts/patch-queries.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'src/server/queries.ts';
let source = readFileSync(FILE, 'utf8');

const replacements = [
  // drizzle's `db.select().from()` takes one argument. A raw aliased table is
  // the FROM itself; the second `true` was a mistaken cross-join marker.
  [
    /db\s*\n(\s*)\.select\(([\s\S]*?)\)\s*\n\s*\.from\(sql`([^`]+)`, sql`true`\)/g,
    (_m, indent, selection, table) =>
      `db\n${indent}.select(${selection})\n${indent}.from(sql\`${table}\`)`,
  ],

  // rsvps is the table name.
  [/\brsvps\b/g, 'rsvps'],

  // `or` was used in one query without being imported.
  [
    /import \{ and, asc, desc, eq, gt, inArray, isNull, lt, sql \} from 'drizzle-orm';/,
    "import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';",
  ],

  // Drop the stray re-export of the aliased projects table.
  [
    /export \{ and, asc, desc, eq, gt, inArray, isNull, lt, sql, projects as projectTableAlias \};/,
    'export { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql };',
  ],
];

for (const [pattern, replacement] of replacements) {
  source = source.replace(pattern, replacement);
}

// The groupStrings helper indexes a generic row by key; make the lookups total.
source = source.replace(
  /function groupStrings<T extends Record<string, string>>\(\n  rows: T\[\],\n  key: keyof T,\n\): Map<string, string\[\]> \{[\s\S]*?\n\}/,
  `function groupStrings<T extends Record<string, unknown>>(
  rows: T[],
  key: keyof T,
  valueKey: 'kind' | 'tag',
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const groupKey = row[key];
    const value = row[valueKey];
    if (typeof groupKey !== 'string' || typeof value !== 'string') continue;
    const list = map.get(groupKey) ?? [];
    list.push(value);
    map.set(groupKey, list);
  }
  return map;
}`,
);

// Update the three call sites to pass the value column explicitly.
source = source.replace(/groupStrings\(reactionRows, 'targetId'\)/g, "groupStrings(reactionRows, 'targetId', 'kind')");
source = source.replace(/groupStrings\(tagRows, 'postId'\)/g, "groupStrings(tagRows, 'postId', 'tag')");
source = source.replace(/groupStrings\(tagRows, 'objectId'\)/g, "groupStrings(tagRows, 'objectId', 'tag')");
source = source.replace(/groupStrings\(tagRows, 'gameId'\)/g, "groupStrings(tagRows, 'gameId', 'tag')");

writeFileSync(FILE, source);
console.log('patched src/server/queries.ts');