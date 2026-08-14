import type { AdminRequest } from '../../middlewares/adminAuth.js';
import type { EveningField } from '../eveningQuestionnaireConfig.js';
import { collectForumFinalEveningFields } from '../eveningQuestionnaireConfig.js';
import {
  collectEveningExportRows,
  type EveningExportRow,
} from '../exports/eveningExportData.js';
import { getForumSettings } from '../helpers.js';
import { isOrganizerDirection } from '../leaderboardQuery.js';
import { getForumDayDateLabel } from '../timePhase.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { loadCohortParticipants } from './cohort.js';
import {
  buildDirectionDayRatings,
  deviation,
  mean,
  type DirectionDayRatings,
} from './dayResultsMetrics.js';
import {
  buildChoiceDist,
  buildForumNps,
  buildScaleBlock,
  buildTagCloud,
  classifyForumField,
  clusterSimilarTexts,
  collectQuotes,
  formalShareOfFields,
  round1,
  round2,
  rowHasForumFinalAnswer,
  scaleMean,
  textValue,
  yesSharePct,
  type ForumChoiceDist,
  type ForumFieldKind,
  type ForumNps,
  type ForumQuote,
  type ForumScaleBlock,
} from './forumResultsMetrics.js';

function dirOf(r: EveningExportRow): string {
  return (r.directionName || r.p.direction || '—').trim() || '—';
}

function buildHeat(
  blocks: ForumScaleBlock[],
  submitted: EveningExportRow[],
) {
  const dirMap = new Map<string, EveningExportRow[]>();
  for (const r of submitted) {
    const d = dirOf(r);
    if (!dirMap.has(d)) dirMap.set(d, []);
    dirMap.get(d)!.push(r);
  }
  const heat = [...dirMap.entries()]
    .map(([dir, rows]) => {
      const vals = blocks.map(b => {
        const scaleVals: number[] = [];
        for (const r of rows) {
          const raw = r.ratings[b.key];
          const n = typeof raw === 'number' ? raw : Number(raw);
          if (Number.isFinite(n) && n >= 1 && n <= 5) scaleVals.push(n);
        }
        const v = mean(scaleVals);
        if (v == null) return { v: null as number | null, dev: 0 };
        return { v, dev: deviation(v, b.mean) };
      });
      if (vals.every(c => c.v == null)) return null;
      const idxVals = vals.filter(c => c.v != null).map(c => c.v as number);
      return {
        dir,
        n: rows.length,
        vals,
        idx: mean(idxVals) ?? 0,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => a.idx - b.idx);

  const heatForum = blocks.length && submitted.length
    ? {
      dir: 'Весь форум',
      n: submitted.length,
      vals: blocks.map(b => ({ v: b.mean as number | null, dev: 0 })),
      idx: mean(blocks.map(b => b.mean)) ?? 0,
      isForum: true as const,
    }
    : null;

  return { heat, heatForum };
}

function followUpTexts(
  fields: EveningField[],
  parentKey: string,
  submitted: EveningExportRow[],
): Array<{ title: string; n: number; quotes: ForumQuote[] }> {
  const children = fields.filter(f =>
    (f.type === 'text' || f.type === 'experiment_text')
    && f.visibleWhen?.field === parentKey,
  );
  return children.map(f => {
    const quotes = collectQuotes(submitted.map(r => ({ ratings: r.ratings, direction: dirOf(r) })), f.key, {
      label: f.label,
    });
    return { title: f.label || f.key, n: quotes.length, quotes };
  }).filter(b => b.n > 0);
}

export type ForumCompactCard = {
  key: string;
  label: string;
  kind: ForumFieldKind;
  pct?: number;
  mean?: number;
  sub?: string;
  quotes: ForumQuote[];
};

export type ForumTextSection = {
  key: string;
  label: string;
  kind: ForumFieldKind;
  n: number;
  clusters: Array<{ name: string; n: number }>;
  quotes: ForumQuote[];
};

/**
 * Итоги форума — только вопросы вечерней анкеты с галочкой «Итоговый вопрос форума».
 * Итоговая анкета форума (wrap) сюда не подмешивается.
 */
export async function buildForumResultsDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  const settings = await getForumSettings(filters.shiftId);
  const currentDay = settings.currentDay ?? 1;
  const cohort = await loadCohortParticipants(filters, req);
  const cohortSize = cohort.filter(
    p => p.onboardingCompletedAt && !isOrganizerDirection(p.direction),
  ).length;

  const markedDaily = collectForumFinalEveningFields(settings as never);
  const evening = markedDaily.length
    ? await collectEveningExportRows({
      shiftId: filters.shiftId,
      day: null,
      direction: filters.direction ?? undefined,
      group: filters.group ?? undefined,
      ageCategory: filters.ageCategory ?? undefined,
      activityQ: filters.activity ?? undefined,
      includeDrafts: false,
    })
    : { rows: [] as EveningExportRow[] };

  const eveningSubmitted = evening.rows.filter(r =>
    r.status === 'сдано' && !isOrganizerDirection(r.directionName || r.p.direction),
  );

  const primaryFields = markedDaily;
  const primarySubmitted = eveningSubmitted.filter(r =>
    rowHasForumFinalAnswer(r.ratings, primaryFields),
  );

  const classified = primaryFields.map(f => ({ f, kind: classifyForumField(f) }));
  const markedScaleFields = primaryFields.filter(f => classifyForumField(f) === 'scale_block');
  const scaleFields = classified.filter(c => c.kind === 'scale_block').map(c => c.f);
  const scaleRows = primarySubmitted;
  const blocks: ForumScaleBlock[] = [];
  for (const f of scaleFields) {
    const block = buildScaleBlock(scaleRows, f);
    if (block) blocks.push(block);
  }
  blocks.sort((a, b) => b.low - a.low);

  const { heat, heatForum } = buildHeat(blocks, scaleRows);

  const seriesDays = [1, 2, 3, 4, 5, 6, 7];
  const dayLabels = seriesDays.map(day => ({
    day,
    label: getForumDayDateLabel(settings.startDate ?? null, day) || `День ${day}`,
  }));
  const dirNames = new Set<string>();
  for (const p of cohort) {
    if (!p.onboardingCompletedAt || isOrganizerDirection(p.direction)) continue;
    dirNames.add((p.direction || '—').trim() || '—');
  }
  for (const r of eveningSubmitted) {
    const d = dirOf(r);
    if (!isOrganizerDirection(d)) dirNames.add(d);
  }
  const directions = [...dirNames].sort((a, b) => a.localeCompare(b, 'ru'));
  const drilldownFields = markedScaleFields.length ? markedScaleFields : scaleFields;
  const blockDayRatings: DirectionDayRatings[] = drilldownFields.map(field =>
    buildDirectionDayRatings({
      days: dayLabels,
      directions,
      rows: eveningSubmitted.map(r => ({
        dayNumber: r.dayNumber,
        direction: dirOf(r),
        ratings: r.ratings,
      })),
      field: { key: field.key, label: field.label || field.key, type: field.type },
    }),
  );

  const npsField = classified.find(c => c.kind === 'nps')?.f;
  const nps: ForumNps | null = npsField ? buildForumNps(primarySubmitted, npsField) : null;

  const choices: ForumChoiceDist[] = [];
  for (const { f, kind } of classified) {
    if (kind === 'point_b' || kind === 'role' || kind === 'plan_when' || kind === 'choice' || kind === 'yesno') {
      const dist = buildChoiceDist(primarySubmitted, f, kind);
      if (dist.n) choices.push(dist);
    }
  }

  const pointB = choices.find(c => c.kind === 'point_b') ?? null;
  const pointBBranches = pointB
    ? followUpTexts(primaryFields, pointB.key, primarySubmitted)
    : [];

  const texts: ForumTextSection[] = [];
  for (const { f, kind } of classified) {
    if (kind !== 'improve' && kind !== 'selfway' && kind !== 'nextstep' && kind !== 'final') continue;
    const quotes = collectQuotes(
      primarySubmitted.map(r => ({ ratings: r.ratings, direction: dirOf(r) })),
      f.key,
      { label: f.label },
    );
    const rawTexts = primarySubmitted.map(r => textValue(r.ratings[f.key])).filter(Boolean);
    texts.push({
      key: f.key,
      label: f.label || f.key,
      kind,
      n: rawTexts.length,
      clusters: kind === 'improve' ? clusterSimilarTexts(rawTexts) : [],
      quotes,
    });
  }

  const compact: ForumCompactCard[] = [];
  for (const { f, kind } of classified) {
    if (kind !== 'psych' && kind !== 'rating_sys' && kind !== 'bot' && kind !== 'materials') continue;
    const yn = yesSharePct(primarySubmitted, f.key);
    const sm = scaleMean(primarySubmitted, f.key, f.type === 'scale_1_10' ? 10 : 5);
    const quotes = collectQuotes(
      primarySubmitted.map(r => ({ ratings: r.ratings, direction: dirOf(r) })),
      f.key,
      { minLen: 16, label: f.label },
    );
    if (!yn && !sm && !quotes.length) continue;
    compact.push({
      key: f.key,
      label: f.label || f.key,
      kind,
      pct: yn?.yesPct,
      mean: sm?.mean,
      sub: yn
        ? `${yn.yesPct}% · n=${yn.n}`
        : sm
          ? `${sm.mean} · n=${sm.n}`
          : undefined,
      quotes,
    });
  }

  const finalTexts = texts.filter(t => t.kind === 'final').flatMap(t => t.quotes.map(q => q.text));
  const tags = buildTagCloud(finalTexts);

  const textFields = classified.filter(c =>
    c.kind === 'improve' || c.kind === 'selfway' || c.kind === 'nextstep' || c.kind === 'final',
  ).map(c => c.f);
  const formalPct = formalShareOfFields(primarySubmitted, textFields);
  const scaleN = blocks.length ? Math.max(...blocks.map(b => b.n), 0) : (nps?.n ?? 0);
  const index = blocks.length
    ? round2(blocks.reduce((a, b) => a + b.mean, 0) / blocks.length)
    : (nps?.mean ?? null);
  const attentionBlocks = blocks.filter(b => b.low >= 10).length;
  const submittedN = new Set(primarySubmitted.map(r => r.participantId)).size;

  return {
    filters,
    currentForumDay: currentDay,
    meta: {
      day: currentDay,
      total: cohortSize,
      submitted: submittedN,
      drafts: 0,
      scaleN,
      index,
      fillRatePct: cohortSize ? round1((submittedN / cohortSize) * 100) : 0,
      attentionBlocks,
      formalPct,
      questionCount: primaryFields.length,
      source: 'evening_marked',
    },
    blocks,
    heat,
    heatForum,
    blockDayRatings,
    nps,
    choices,
    pointB,
    pointBBranches,
    texts,
    compact,
    tags,
    diagnostics: {
      notes: markedDaily.length
        ? []
        : ['На дашборде только вопросы с галочкой «Итоговый вопрос форума» в «Итоговая анкета вечера». Отметьте нужные — они появятся здесь. Остальные вопросы дня и итоговая анкета форума сюда не попадают.'],
    },
    exportPath: '/exports/forum-pack?mode=shift',
  };
}
