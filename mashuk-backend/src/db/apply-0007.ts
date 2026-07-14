import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const pool = createPool(process.env.DATABASE_URL!);
  const sqlPath = path.join(__dirname, '../../drizzle/0007_p0_p2.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  console.log('Applied 0007_p0_p2.sql');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
