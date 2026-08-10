/**
 * Idempotent archive classifier for exchange_questions.
 * Skips rows with category_confirmed = true.
 *
 * Usage: npx tsx scripts/classify-exchange-archive.ts [--apply] [--report-only]
 */
import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { exchangeCategories, exchangeQuestions } from '../src/db/schema.js';

type Keywords = Record<string, string[]>;

const SMALLTALK_MARKERS = [
  'привет', 'меня зовут', 'я учитель', 'работаю', 'познакомиться',
  'рада', 'буду следить', 'спасибо', 'согласна', 'думаю да',
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreText(norm: string, keywords: Keywords): Array<{ slug: string; score: number }> {
  const words = norm.split(' ').filter(Boolean);
  const head = words.slice(0, 10).join(' ');
  const scores: Array<{ slug: string; score: number }> = [];
  for (const [slug, list] of Object.entries(keywords)) {
    let score = 0;
    for (const kw of list) {
      const k = kw.toLowerCase();
      if (!k) continue;
      if (norm.includes(k)) score += 1;
      if (head.includes(k)) score += 2;
    }
    if (score > 0) scores.push({ slug, score });
  }
  return scores.sort((a, b) => b.score - a.score);
}

function isSmalltalkCandidate(raw: string, norm: string): boolean {
  if (raw.includes('?')) return false;
  if (raw.trim().length >= 60) return false;
  return SMALLTALK_MARKERS.some(m => norm.includes(m));
}

async function main() {
  const apply = process.argv.includes('--apply');
  const reportOnly = process.argv.includes('--report-only') || !apply;

  const kwPath = path.join(process.cwd(), 'config', 'classifier-keywords.json');
  const keywords = JSON.parse(fs.readFileSync(kwPath, 'utf8')) as Keywords;

  const cats = await db.select().from(exchangeCategories);
  const bySlug = new Map(cats.map(c => [c.slug, c]));
  const other = bySlug.get('other');
  const smalltalk = bySlug.get('smalltalk');
  if (!other) throw new Error('seed category "other" missing — run migrations first');

  const rows = await db.select().from(exchangeQuestions);
  const report: Array<Record<string, string | number | boolean>> = [];
  let updated = 0;
  const smalltalkIds: number[] = [];

  console.log(`Archive COUNT: questions=${rows.length}`);
  const byStatus = new Map<string, number>();
  for (const r of rows) {
    const s = r.moderationStatus || 'pending';
    byStatus.set(s, (byStatus.get(s) || 0) + 1);
  }
  console.log('By moderation_status:', Object.fromEntries(byStatus));

  for (const row of rows) {
    if (row.categoryConfirmed) continue;

    const raw = row.text || '';
    const norm = normalize(raw);
    const scores = scoreText(norm, keywords);
    const top = scores[0];
    const runner = scores[1];
    let predicted = other.slug;
    let score = top?.score ?? 0;
    let lowConfidence = true;

    if (isSmalltalkCandidate(raw, norm) && smalltalk) {
      predicted = smalltalk.slug;
      score = Math.max(score, 3);
      lowConfidence = false;
      smalltalkIds.push(row.id);
    } else if (top && top.score >= 3) {
      predicted = top.slug;
      lowConfidence = !!(runner && top.score - runner.score <= 1);
    } else {
      predicted = other.slug;
      lowConfidence = true;
    }

    const predictedCat = bySlug.get(predicted) || other;
    report.push({
      id: row.id,
      text_preview: raw.slice(0, 120).replace(/\s+/g, ' '),
      predicted_category: predicted,
      score,
      runner_up_category: runner?.slug || '',
      runner_up_score: runner?.score ?? 0,
      low_confidence: lowConfidence,
    });

    if (apply) {
      await db.update(exchangeQuestions)
        .set({
          categoryId: predictedCat.id,
          classifiedBy: 'auto',
        })
        .where(eq(exchangeQuestions.id, row.id));
      updated += 1;
    }
  }

  const day = new Date().toISOString().slice(0, 10);
  const reportsDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const outPath = path.join(reportsDir, `classification-${day}.csv`);
  const header = 'id,text_preview,predicted_category,score,runner_up_category,runner_up_score,low_confidence';
  const lines = report.map(r =>
    [r.id, JSON.stringify(r.text_preview), r.predicted_category, r.score, r.runner_up_category, r.runner_up_score, r.low_confidence]
      .join(','));
  fs.writeFileSync(outPath, [header, ...lines].join('\n'), 'utf8');

  console.log(`Report: ${outPath} (${report.length} rows)`);
  console.log(`Smalltalk candidates: ${smalltalkIds.length}`, smalltalkIds.slice(0, 30));
  if (reportOnly) {
    console.log('Dry run — pass --apply to write category_id / classified_by=auto');
  } else {
    console.log(`Updated rows: ${updated}`);
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
