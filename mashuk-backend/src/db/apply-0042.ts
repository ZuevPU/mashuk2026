/**
 * Repair prod DB when migration 0042 was skipped (medals.shift_id missing → admin 500).
 * npx tsx src/db/apply-0042.ts
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
  const sqlPath = path.join(__dirname, '../../drizzle/0042_backlog_features.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  console.log('Applied 0042_backlog_features.sql');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
