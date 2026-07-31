import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createPool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Idempotent repair when 0042 was skipped (journal once jumped 0041 → 0043). */
async function ensureBacklogFeaturesSchema(pool: ReturnType<typeof createPool>): Promise<void> {
  const { rows } = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'medals' AND column_name = 'shift_id'
     LIMIT 1`,
  );
  if (rows.length > 0) return;

  const sqlPath = path.join(__dirname, '../../drizzle/0042_backlog_features.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.warn('Repair: applying 0042_backlog_features.sql (medals.shift_id missing)');
  await pool.query(sql);
}

export async function runMigrations(): Promise<void> {
  const pool = createPool(process.env.DATABASE_URL!);
  const db = drizzle(pool);
  console.log('Running migrations...');
  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('Migrations complete.');
  } finally {
    await ensureBacklogFeaturesSchema(pool);
    await pool.end();
  }
}

const isDirectRun = process.argv[1]?.endsWith('migrate.js') || process.argv[1]?.endsWith('migrate.ts');
if (isDirectRun) {
  runMigrations().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
