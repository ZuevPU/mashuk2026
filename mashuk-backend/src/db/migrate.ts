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

/** Schema had task_qr_scans before any SQL migration existed — create if missing. */
async function ensureTaskQrScansSchema(pool: ReturnType<typeof createPool>): Promise<void> {
  const { rows } = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'task_qr_scans'
     LIMIT 1`,
  );
  if (rows.length > 0) return;

  const sqlPath = path.join(__dirname, '../../drizzle/0048_task_qr_scans.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.warn('Repair: applying 0048_task_qr_scans.sql (task_qr_scans missing)');
  await pool.query(sql);
}

/** Idempotent repair if 0050 was skipped (title2/body2/hint2/title3…). */
async function ensureDayExperimentsTripleSchema(pool: ReturnType<typeof createPool>): Promise<void> {
  const { rows } = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'day_experiments' AND column_name = 'title2'
     LIMIT 1`,
  );
  if (rows.length > 0) return;

  const sqlPath = path.join(__dirname, '../../drizzle/0050_day_experiments_triple.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.warn('Repair: applying 0050_day_experiments_triple.sql (title2 missing)');
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
    await ensureTaskQrScansSchema(pool);
    await ensureDayExperimentsTripleSchema(pool);
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
