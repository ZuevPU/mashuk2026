/**
 * Add role_diagnostics_config to forum_settings.
 * npx tsx src/db/apply-0008.ts
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  const pool = createPool(url);
  const sqlPath = path.join(__dirname, '../../drizzle/0008_role_diagnostics_config.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  console.log('Applied 0008_role_diagnostics_config.sql');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
