import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://enyd:enyd_arch_dev_pw@127.0.0.1:5499/enyd_arch',
  },
  strict: true,
  verbose: true,
});