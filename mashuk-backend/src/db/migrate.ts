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

/** Widen push delivery status columns if still varchar(50)/(64). */
async function ensurePushDeliveryStatusLen(pool: ReturnType<typeof createPool>): Promise<void> {
  const { rows } = await pool.query<{ character_maximum_length: number | null }>(
    `SELECT character_maximum_length FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'push_log' AND column_name = 'delivery_status'
     LIMIT 1`,
  );
  const len = rows[0]?.character_maximum_length;
  if (len != null && len >= 255) return;

  const sqlPath = path.join(__dirname, '../../drizzle/0051_push_delivery_status_len.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.warn('Repair: applying 0051_push_delivery_status_len.sql');
  await pool.query(sql);
}

/** Add linked_event_ids to questions if missing (0052). */
async function ensureQuestionLinkedEventsSchema(pool: ReturnType<typeof createPool>): Promise<void> {
  const { rows } = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'linked_event_ids'
     LIMIT 1`,
  );
  if (rows.length > 0) return;

  const sqlPath = path.join(__dirname, '../../drizzle/0052_question_linked_events.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.warn('Repair: applying 0052_question_linked_events.sql');
  await pool.query(sql);
}

/** Add hide_from_home to events if missing (0053). */
async function ensureEventHideFromHomeSchema(pool: ReturnType<typeof createPool>): Promise<void> {
  const { rows } = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'hide_from_home'
     LIMIT 1`,
  );
  if (rows.length > 0) return;

  const sqlPath = path.join(__dirname, '../../drizzle/0053_event_hide_from_home.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.warn('Repair: applying 0053_event_hide_from_home.sql');
  await pool.query(sql);
}

/** Add practices_config to questions if missing (0054). */
async function ensurePracticesVoteSchema(pool: ReturnType<typeof createPool>): Promise<void> {
  const { rows } = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'practices_config'
     LIMIT 1`,
  );
  if (rows.length > 0) return;

  const sqlPath = path.join(__dirname, '../../drizzle/0054_practices_vote.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.warn('Repair: applying 0054_practices_vote.sql');
  await pool.query(sql);
}

/** Add points_log_id to piggybank if missing (0055). */
async function ensurePiggybankPointsLogSchema(pool: ReturnType<typeof createPool>): Promise<void> {
  const { rows } = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'piggybank' AND column_name = 'points_log_id'
     LIMIT 1`,
  );
  if (rows.length > 0) return;

  const sqlPath = path.join(__dirname, '../../drizzle/0055_piggybank_points_log.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.warn('Repair: applying 0055_piggybank_points_log.sql');
  await pool.query(sql);
}

/** Add points_log_id to answers if missing (0057) — without it submitAnswer 500s after award. */
async function ensureAnswersPointsLogSchema(pool: ReturnType<typeof createPool>): Promise<void> {
  const { rows } = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'answers' AND column_name = 'points_log_id'
     LIMIT 1`,
  );
  if (rows.length > 0) return;

  const sqlPath = path.join(__dirname, '../../drizzle/0057_answers_points_log_id.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.warn('Repair: applying 0057_answers_points_log_id.sql (answers.points_log_id missing)');
  await pool.query(sql);
}

/** Keep touchpoint awards from silently stopping when an old low max_accruals is in DB. */
async function ensureQuestionAnswerAccrualCap(pool: ReturnType<typeof createPool>): Promise<void> {
  await pool.query(`
    UPDATE levels_config
    SET max_accruals = 10000
    WHERE action_type = 'question_answer'
      AND (max_accruals IS NULL OR max_accruals < 10000)
  `);
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
    await ensurePushDeliveryStatusLen(pool);
    await ensureQuestionLinkedEventsSchema(pool);
    await ensureEventHideFromHomeSchema(pool);
    await ensurePracticesVoteSchema(pool);
    await ensurePiggybankPointsLogSchema(pool);
    await ensureAnswersPointsLogSchema(pool);
    await ensureQuestionAnswerAccrualCap(pool);
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
