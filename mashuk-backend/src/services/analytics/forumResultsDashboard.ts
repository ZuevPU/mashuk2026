import type { AdminRequest } from '../../middlewares/adminAuth.js';
import type { EveningField, ForumFinalQuestion } from '../eveningQuestionnaireConfig.js';
import { collectForumFinalEveningFieldDays } from '../eveningQuestionnaireConfig.js';
import {
  collectEveningExportRows,
  type EveningExportRow,
} from '../exports/eveningExportData.js';
import { getForumSettings } from '../helpers.js';
import { hideOrganizerName } from '../leaderboardQuery.js';
import { getForumDayDateLabel } from '../timePhase.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { loadCohortParticipants, restrictToCohort } from './cohort.js';
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
import { buildPracticeRecommendNps } from './practiceRecommendNps.js';
import { buildForumResultsPeople, type ForumPeopleColumn } from './forumResultsPeople.js';

function dirOf(r: EveningExportRow): string {
  return (r.directionName || r.p.direction || '—').trim() || '—';
}

function rowsForQuestion(
  rows: EveningExportRow[],
  q: Pick<ForumFinalQuestion, 'days'>,
): EveningExportRow[] {
  if (!q.days.length) return rows;
  return rows.filter(r => q.days.includes(r.dayNumber));
}

function ratingKeyOf(block: ForumScaleBlock): string {
  return block.ratingKey || block.key;
}

function buildHeat(
  blocks: ForumScaleBlock[],
  submitted: EveningExportRow[],
  questionsById: Map<string, ForumFinalQuestion>,
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
        const q = questionsById.get(b.key);
        const scaleVals: number[] = [];
        for (const r of (q ? rowsForQuestion(rows, q) : rows)) {
          const raw = r.ratings[ratingKeyOf(b)];
          const n = typeof raw === 'number' ? raw : Number(raw);
          if (Number.isFinite(n) && n >= 1 && n <= 10) scaleVals.push(n);
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
      vals: blocks.map(b => ({ v: b.n > 0 ? (b.mean as number | null) : null, dev: 0 })),
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
  const totalDays = Math.max(1, Number(settings.totalDays) || 8);
  const dayList = Array.from({ length: totalDays }, (_, i) => i + 1);
  const cohort = await loadCohortParticipants(filters, req);
  const cohortSize = cohort.filter(
    p => p.onboardingCompletedAt && !hideOrganizerName(filters.organizers, p.direction),
  ).length;

  const marked = collectForumFinalEveningFieldDays(settings as never, dayList);
  const questions = marked.questions;
  const daysByKey = marked.daysByKey;
  const questionsById = new Map(questions.map(q => [q.id, q]));
  const evening = questions.length
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

  const allowed = new Set(cohort.map(p => p.id));
  const eveningSubmitted = restrictToCohort(evening.rows, allowed, r => r.participantId).filter(r =>
    r.status === 'сдано' && !hideOrganizerName(filters.organizers, r.directionName || r.p.direction),
  );

  const primaryFields = questions.map(q => q.field);
  const primarySubmitted = eveningSubmitted.filter(r =>
    rowHasForumFinalAnswer(r.ratings, primaryFields, {
      dayNumber: r.dayNumber,
      daysByKey,
    }),
  );

  const classified = questions.map(q => ({ q, f: q.field, kind: classifyForumField(q.field) }));
  const scaleQuestions = classified.filter(c => c.kind === 'scale_block');
  const blocks: ForumScaleBlock[] = [];
  for (const { q, f } of scaleQuestions) {
    const block = buildScaleBlock(rowsForQuestion(primarySubmitted, q), f);
    if (block) blocks.push({ ...block, key: q.id, ratingKey: f.key, label: f.label || f.key });
    else {
      blocks.push({
        key: q.id,
        ratingKey: f.key,
        label: f.label || f.key,
        n: 0,
        mean: 0,
        dist: [0, 0, 0, 0, 0],
        low: 0,
      });
    }
  }
  blocks.sort((a, b) => b.low - a.low || a.label.localeCompare(b.label, 'ru'));

  const { heat, heatForum } = buildHeat(blocks, primarySubmitted, questionsById);

  const dayLabels = dayList.map(day => ({
    day,
    label: getForumDayDateLabel(settings.startDate ?? null, day) || `День ${day}`,
  }));
  const dirNames = new Set<string>();
  for (const p of cohort) {
    if (!p.onboardingCompletedAt || hideOrganizerName(filters.organizers, p.direction)) continue;
    dirNames.add((p.direction || '—').trim() || '—');
  }
  for (const r of eveningSubmitted) {
    const d = dirOf(r);
    if (!hideOrganizerName(filters.organizers, d)) dirNames.add(d);
  }
  const directions = [...dirNames].sort((a, b) => a.localeCompare(b, 'ru'));
  const blockDayRatings: DirectionDayRatings[] = scaleQuestions.map(({ q, f }) => {
    const built = buildDirectionDayRatings({
      days: dayLabels.filter(d => q.days.includes(d.day)),
      directions,
      rows: rowsForQuestion(eveningSubmitted, q).map(r => ({
        dayNumber: r.dayNumber,
        direction: dirOf(r),
        ratings: r.ratings,
      })),
      field: { key: f.key, label: f.label || f.key, type: f.type },
    });
    return { ...built, fieldKey: q.id, fieldLabel: f.label || f.key };
  }).filter(block => block.days.length > 0);

  const npsQ = classified.find(c => c.kind === 'nps');
  const nps: ForumNps | null = npsQ
    ? buildForumNps(rowsForQuestion(primarySubmitted, npsQ.q), npsQ.f)
    : null;

  const choices: ForumChoiceDist[] = [];
  for (const { q, f, kind } of classified) {
    if (kind === 'point_b' || kind === 'role' || kind === 'plan_when' || kind === 'choice' || kind === 'yesno') {
      const dist = buildChoiceDist(rowsForQuestion(primarySubmitted, q), f, kind);
      choices.push({ ...dist, key: q.id });
    }
  }

  const pointB = choices.find(c => c.kind === 'point_b') ?? null;
  const choiceFollowUps: Record<string, Array<{ title: string; n: number; quotes: ForumQuote[] }>> = {};
  for (const ch of choices) {
    const q = questionsById.get(ch.key);
    const ratingKey = q?.field.key || ch.key;
    const branches = followUpTexts(
      primaryFields,
      ratingKey,
      q ? rowsForQuestion(primarySubmitted, q) : primarySubmitted,
    );
    if (branches.length) choiceFollowUps[ch.key] = branches;
  }
  const pointBBranches = pointB ? (choiceFollowUps[pointB.key] ?? []) : [];

  const texts: ForumTextSection[] = [];
  for (const { q, f, kind } of classified) {
    if (kind !== 'improve' && kind !== 'selfway' && kind !== 'nextstep' && kind !== 'final') continue;
    const fieldRows = rowsForQuestion(primarySubmitted, q);
    const quotes = collectQuotes(
      fieldRows.map(r => ({ ratings: r.ratings, direction: dirOf(r) })),
      f.key,
      { label: f.label },
    );
    const rawTexts = fieldRows.map(r => textValue(r.ratings[f.key])).filter(Boolean);
    texts.push({
      key: q.id,
      label: f.label || f.key,
      kind,
      n: rawTexts.length,
      clusters: kind === 'improve' ? clusterSimilarTexts(rawTexts) : [],
      quotes,
    });
  }

  const compact: ForumCompactCard[] = [];
  for (const { q, f, kind } of classified) {
    if (kind !== 'psych' && kind !== 'rating_sys' && kind !== 'bot' && kind !== 'materials') continue;
    const fieldRows = rowsForQuestion(primarySubmitted, q);
    const yn = yesSharePct(fieldRows, f.key);
    const sm = scaleMean(fieldRows, f.key, f.type === 'scale_1_10' ? 10 : 5);
    const quotes = collectQuotes(
      fieldRows.map(r => ({ ratings: r.ratings, direction: dirOf(r) })),
      f.key,
      { minLen: 16, label: f.label },
    );
    compact.push({
      key: q.id,
      label: f.label || f.key,
      kind,
      pct: yn?.yesPct,
      mean: sm?.mean,
      sub: yn
        ? `${yn.yesPct}% · n=${yn.n}`
        : sm
          ? `${sm.mean} · n=${sm.n}`
          : `${fieldRows.length} ответов`,
      quotes,
    });
  }

  const programQuestions = classified.filter(c => c.kind === 'program_event');
  const programKeys = [...new Set(programQuestions.map(c => c.f.key))];
  const practiceRows = programQuestions.length
    ? primarySubmitted.filter(r => programQuestions.some(c => c.q.days.includes(r.dayNumber)))
    : [];
  const practiceRecommendNps = programKeys.length
    ? buildPracticeRecommendNps(practiceRows.map(r => r.ratings), programKeys)
    : { available: false, note: '', byPractice: [] };

  const finalTexts = texts.filter(t => t.kind === 'final').flatMap(t => t.quotes.map(q => q.text));
  const tags = buildTagCloud(finalTexts);

  const textFields = classified.filter(c =>
    c.kind === 'improve' || c.kind === 'selfway' || c.kind === 'nextstep' || c.kind === 'final',
  ).map(c => c.f);
  const formalPct = formalShareOfFields(primarySubmitted, textFields);
  const filledBlocks = blocks.filter(b => b.n > 0);
  const scaleN = filledBlocks.length ? Math.max(...filledBlocks.map(b => b.n), 0) : (nps?.n ?? 0);
  const index = filledBlocks.length
    ? round2(filledBlocks.reduce((a, b) => a + b.mean, 0) / filledBlocks.length)
    : (nps?.mean ?? null);
  const attentionBlocks = filledBlocks.filter(b => b.low >= 10).length;
  const submittedForms = primarySubmitted.length;
  const submittedPeople = new Set(primarySubmitted.map(r => r.participantId)).size;

  const peopleColumns: ForumPeopleColumn[] = [
    ...blocks.map(b => {
      const q = questionsById.get(b.key);
      return {
        key: b.key,
        ratingKey: ratingKeyOf(b),
        label: b.label,
        max: (q?.field.type === 'scale_1_10' ? 10 : 5) as 5 | 10,
        days: q?.days ?? [],
      };
    }),
    ...(nps && npsQ
      ? [{
        key: npsQ.q.id,
        ratingKey: npsQ.f.key,
        label: npsQ.f.label || npsQ.f.key,
        max: 10 as const,
        days: npsQ.q.days,
      }]
      : []),
  ];
  const people = buildForumResultsPeople(
    primarySubmitted.map(r => ({
      participantId: r.participantId,
      dayNumber: r.dayNumber,
      ratings: r.ratings,
      filledAt: r.filledAt,
      direction: dirOf(r),
      group: r.p.groupName || '—',
      firstName: r.p.firstName,
      lastName: r.p.lastName,
    })),
    peopleColumns,
  );

  return {
    filters,
    currentForumDay: currentDay,
    meta: {
      day: currentDay,
      total: cohortSize,
      submitted: submittedForms,
      submittedPeople,
      drafts: 0,
      scaleN,
      index,
      fillRatePct: cohortSize ? round1((submittedPeople / cohortSize) * 100) : 0,
      attentionBlocks,
      formalPct,
      questionCount: questions.length,
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
    choiceFollowUps,
    texts,
    compact,
    tags,
    practiceRecommendNps,
    people,
    diagnostics: {
      notes: questions.length
        ? []
        : ['На дашборде только вопросы с галочкой «Итоговый вопрос форума» в «Итоговая анкета вечера». Отметьте нужные — они появятся здесь. Остальные вопросы дня и итоговая анкета форума сюда не попадают.'],
    },
    exportPath: '/exports/forum-pack?mode=shift',
  };
}
