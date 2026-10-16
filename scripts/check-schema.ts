/**
 * Schema linter.
 *
 * Guards the class of bug where an index or relation references a column that
 * does not exist — drizzle-kit surfaces this as an opaque TypeError deep inside
 * its bundled copy of drizzle-orm. Run with `pnpm db:lint`.
 */
import { entityKind } from 'drizzle-orm';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import * as schema from '../db/schema.js';

const kindOf = (value: unknown): string => {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<symbol, unknown>;
  if (record[entityKind]) return String(record[entityKind]);
  for (const symbol of Object.getOwnPropertySymbols(record)) {
    const description = symbol.description ?? '';
    if (description.startsWith('drizzle:')) {
      if (description.includes('IsDrizzleTable')) return 'PgTable';
      if (description.includes('PgInlineForeignKeys')) return 'PgTable';
      if (description.includes('relation') || description.includes('Relation')) return 'Relations';
    }
  }
  return '';
};

let tables = 0;
let indexes = 0;
let relations = 0;
let problems = 0;

const fail = (message: string) => {
  problems += 1;
  console.error(`  ✗ ${message}`);
};

for (const [exportName, value] of Object.entries(schema)) {
  const kind = kindOf(value);

  if (kind === 'PgTable') {
    tables += 1;
    let config;
    try {
      config = getTableConfig(value as PgTable);
    } catch (error) {
      fail(`${exportName}: getTableConfig threw — ${(error as Error).message}`);
      continue;
    }
    const columnNames = new Set<string>(config.columns.map((column) => column.name));
    for (const index of config.indexes) {
      indexes += 1;
      for (const column of index.config.columns) {
        if (column === undefined || column === null) {
          fail(`${exportName}.${index.config.name}: index references an undefined column`);
          continue;
        }
        const columnName = (column as { name?: string }).name;
        if (typeof columnName !== 'string') {
          fail(
            `${exportName}.${index.config.name}: expression indexes are not supported by the migrator — move it to db/bootstrap.ts`,
          );
          continue;
        }
        if (!columnNames.has(columnName)) {
          fail(`${exportName}.${index.config.name}: no column "${columnName}"`);
        }
      }
    }
    for (const foreignKey of config.foreignKeys) {
      const localColumns = (foreignKey as unknown as { columns: Array<{ name: string }> }).columns;
      for (const column of localColumns ?? []) {
        if (!columnNames.has(column.name)) {
          fail(`${exportName}: foreign key references missing column "${column.name}"`);
        }
      }
    }
  }

  if (kind === 'Relations') {
    relations += 1;
  }
}

console.log(`linted ${tables} tables · ${indexes} indexes · ${relations} relation objects`);
if (problems > 0) {
  console.error(`\n${problems} problem(s) found`);
  process.exit(1);
}
console.log('schema ok');