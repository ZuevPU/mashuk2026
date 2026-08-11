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
  await pool.query(`
    UPDATE levels_config
    SET max_accruals = 24
    WHERE action_type IN ('state_check_morning', 'state_check_day', 'state_check_evening')
      AND (max_accruals IS NULL OR max_accruals < 24)
  `);
  await pool.query(`
    UPDATE levels_config
    SET max_accruals = 16
    WHERE action_type = 'evening_complete'
      AND (max_accruals IS NULL OR max_accruals < 16)
  `);
}

/** Allow multiple successful QR scans/day for repeatable tasks (0063). */
async function ensureQrRepeatableScansSchema(pool: ReturnType<typeof createPool>): Promise<void> {
  const { rows } = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'task_qr_scans_success_uniq'
     LIMIT 1`,
  );
  if (rows.length === 0) return;
  const sqlPath = path.join(__dirname, '../../drizzle/0063_qr_repeatable_scans.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.warn('Repair: applying 0063_qr_repeatable_scans.sql (drop success unique)');
  await pool.query(sql);
}

/** Apply exchange categories migration if table missing (0061). */
async function ensureExchangeCategoriesSchema(pool: ReturnType<typeof createPool>): Promise<void> {
  const { rows } = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'exchange_categories'
     LIMIT 1`,
  );
  if (rows.length === 0) {
    const sqlPath = path.join(__dirname, '../../drizzle/0061_exchange_categories.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.warn('Repair: applying 0061_exchange_categories.sql (exchange_categories missing)');
    await pool.query(sql);
  }

  const { rows: countRows } = await pool.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM exchange_categories`,
  );
  if (Number(countRows[0]?.c || 0) > 0) return;

  console.warn('Repair: reseeding exchange_categories (table empty)');
  await pool.query(`
    INSERT INTO exchange_categories (slug, title, emoji, hint, sort_order, is_active, is_system)
    VALUES
      ('start', 'Старт в профессии', '🚀', 'Первый урок или первая смена, волнение, вход в новый коллектив, поиск наставника, выбор пути в педагогику.', 1, true, false),
      ('team', 'Коллеги и границы', '🤝', 'Отношения в коллективе, конфликты со старшими коллегами, личные границы, работа с напарником, диалог с администрацией.', 2, true, false),
      ('motivation', 'Мотивация и вовлечение', '🔥', '«Дети ничего не хотят», клиповое мышление, удержание интереса, поощрения и рейтинги, работа через увлечения детей.', 3, true, false),
      ('hard_cases', 'Сложные ситуации', '⚡', 'Дисциплина, трудный подросток, конфликты с детьми, ЧП и нестандартные случаи, безопасность.', 4, true, false),
      ('methods', 'Методика и форматы', '🧩', 'Приёмы и структура занятия, смена деятельности, геймификация, интерактив, оценивание, импровизация.', 5, true, false),
      ('digital', 'Цифра, ИИ и медиа', '🤖', 'Нейросети на занятии, конкретные сервисы и инструменты, презентации, видео и соцсети, гаджеты.', 6, true, false),
      ('parents', 'Родители', '👨‍👩‍👧', 'Коммуникация с семьёй, тревожные и конфликтные родители, форматы вовлечения родителей.', 7, true, false),
      ('resource', 'Ресурс и выгорание', '🌱', 'Как восстанавливаться, баланс работы и жизни, хобби и спорт, признаки выгорания, что делать в моменте.', 8, true, false),
      ('growth', 'Рост и возможности', '📈', 'Куда расти, карьерные треки, конкурсы, форумы, смены, стажировки, повышение квалификации.', 9, true, false),
      ('picks', 'Подборки и вдохновение', '📚', 'Книги, фильмы, каналы, цитаты, педагоги-кумиры, смыслы профессии.', 10, true, false),
      ('smalltalk', 'Знакомство и общение', '👋', 'Представиться, рассказать о себе, ожидания от форума, эмоции и мемы. Отдельная лента, в основную не попадает.', 11, true, true),
      ('other', 'Другое', '❓', 'Не подошла ни одна рубрика — модератор подберёт её сам при проверке.', 12, true, true)
    ON CONFLICT (slug) DO NOTHING
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
    await ensureExchangeCategoriesSchema(pool);
    await ensureQrRepeatableScansSchema(pool);
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
