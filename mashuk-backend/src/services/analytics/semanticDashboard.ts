import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { answers, clubMatches, forumClubs, piggybank, questions } from '../../db/schema.js';
import { isPublishedStatus } from '../publishStatus.js';
import { inferReflectionDepth } from '../reflectionDepth.js';
import { reflectionKindFromQuestion } from '../reflectionTypeLabel.js';
import { semanticV2Enabled } from './refreshScheduler.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { loadCohortParticipants } from './cohort.js';
import { topReasonTokens } from './zoneDistribution.js';
import {
  compareTermSets,
  newTokensOnDay,
  templateDailyObservation,
  termsByDayMap,
} from './semanticHeuristics.js';
import { loadLatestSnapshot, saveSnapshot } from './snapshots.js';
import { listClubMatchesForDashboard } from './clubMatchService.js';

const REFLECTION_KINDS = new Set([
  'after_event',
  'evening_summary',
]);

function answerText(a: { answerData: unknown }): string {
  return typeof a.answerData === 'string' ? a.answerData : JSON.stringify(a.answerData ?? '');
}

function dayForAnswer(
  a: { questionId: number; createdAt: Date | null },
  qMap: Map<number, { dayNumber: number | null }>,
  fallback: number,
): number {
  const qDay = qMap.get(a.questionId)?.dayNumber;
  return qDay && qDay >= 1 ? qDay : fallback;
}

export async function buildSemanticDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  if (!semanticV2Enabled()) {
    return {
      enabled: false,
      message: 'Смысловая аналитика (этап 2). Установите SEMANTIC_ANALYTICS_V2=true',
    };
  }

  const cohort = await loadCohortParticipants(filters, req);
  const ids = new Set(cohort.map(p => p.id));
  const idList = [...ids];
  const filtered = idList.length
    ? await db.select().from(answers).where(inArray(answers.participantId, idList))
    : [];
  const qRows = filters.shiftId != null
    ? await db.select().from(questions).where(eq(questions.shiftId, filters.shiftId))
    : await db.select().from(questions);
  const qList = qRows.filter(q => isPublishedStatus(q.status));
  const qMap = new Map(qList.map(q => [q.id, q]));

  const depths: Record<string, number> = {};
  const textsByDay = new Map<number, string[]>();
  const professionalTexts: string[] = [];
  const allOpenTexts: string[] = [];
  const deepSamples: { participantId: number; day: number; text: string; layer: string }[] = [];

  const focusDay = filters.day ?? 5;

  for (const a of filtered) {
    const q = qMap.get(a.questionId);
    const kind = q ? reflectionKindFromQuestion(q) : null;
    const text = answerText(a);
    if (text.length < 8) continue;

    const d = inferReflectionDepth(text) || '—';
    depths[d] = (depths[d] || 0) + 1;

    const day = dayForAnswer(a, qMap, focusDay);
    if (!textsByDay.has(day)) textsByDay.set(day, []);
    textsByDay.get(day)!.push(text);
    allOpenTexts.push(text);

    if (kind && REFLECTION_KINDS.has(kind)) {
      professionalTexts.push(text);
    }
    if (d === 'Перенос в практику' || d === 'Личный вывод') {
      deepSamples.push({ participantId: a.participantId, day, text: text.slice(0, 400), layer: d });
    }
  }

  const pigRows = idList.length
    ? await db.select().from(piggybank).where(inArray(piggybank.participantId, idList))
    : [];
  for (const e of pigRows) {
    if (!e.text?.trim()) continue;
    allOpenTexts.push(e.text);
    const day = e.forumDay ?? focusDay;
    if (!textsByDay.has(day)) textsByDay.set(day, []);
    textsByDay.get(day)!.push(e.text);
  }

  const earlyDays = [1, 2];
  const lateDays = [5, 6, 7];
  const earlyTexts: string[] = [];
  const lateTexts: string[] = [];
  for (const [day, texts] of textsByDay) {
    if (earlyDays.includes(day)) earlyTexts.push(...texts);
    if (lateDays.includes(day)) lateTexts.push(...texts);
  }
  const shiftCompare = compareTermSets(earlyTexts, lateTexts, 12);
  const languageByDay = termsByDayMap(textsByDay, 8);

  const roleSlices: { roleKey: string; topTerms: { token: string; count: number }[] }[] = [];
  const dirSlices: { direction: string; topTerms: { token: string; count: number }[] }[] = [];
  const byRole = new Map<string, string[]>();
  const byDir = new Map<string, string[]>();
  const pidMeta = new Map(cohort.map(p => [p.id, p]));
  for (const a of filtered) {
    const text = answerText(a);
    if (text.length < 20) continue;
    const p = pidMeta.get(a.participantId);
    const role = p?.pedagogicalRole || filters.roleKey || '—';
    const dir = p?.direction || '—';
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role)!.push(text);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir)!.push(text);
  }
  for (const [roleKey, texts] of byRole) {
    roleSlices.push({ roleKey, topTerms: topReasonTokens(texts, 10) });
  }
  for (const [direction, texts] of byDir) {
    dirSlices.push({ direction, topTerms: topReasonTokens(texts, 10) });
  }

  const depthByDay: { day: number; layers: Record<string, number> }[] = [];
  for (const a of filtered) {
    const text = answerText(a);
    const layer = inferReflectionDepth(text);
    if (!layer) continue;
    const day = dayForAnswer(a, qMap, focusDay);
    let row = depthByDay.find(r => r.day === day);
    if (!row) {
      row = { day, layers: {} };
      depthByDay.push(row);
    }
    row.layers[layer] = (row.layers[layer] || 0) + 1;
  }
  depthByDay.sort((a, b) => a.day - b.day);

  const snapshotKey = `semantic_daily_observation_d${focusDay}`;
  let dailyObservation = await loadLatestSnapshot(snapshotKey) as { text?: string } | null;
  const observationText = templateDailyObservation({
    day: filters.day,
    depthCounts: depths,
    topTerms: topReasonTokens(allOpenTexts, 10),
    corpusSize: allOpenTexts.length,
  });
  if (!dailyObservation?.text) {
    await saveSnapshot(snapshotKey, { text: observationText, generatedAt: new Date().toISOString() }, {
      dayNumber: filters.day ?? undefined,
      direction: filters.direction ?? undefined,
      groupName: filters.group ?? undefined,
      roleKey: filters.roleKey ?? undefined,
    });
    dailyObservation = { text: observationText };
  }

  return {
    enabled: true,
    heuristicsOnly: true,
    professionalShift: {
      summary: `Ранние дни (D1–2) vs поздние (D5–7): смещение тем от «${shiftCompare.earlyTop.slice(0, 3).map(t => t.token).join(', ') || '—'}» к «${shiftCompare.lateTop.slice(0, 3).map(t => t.token).join(', ') || '—'}».`,
      emergingThemes: shiftCompare.emerging,
      sourcesNote: 'Рефлексии направления, уроков, итоги дня (открытые ответы).',
      byDirection: dirSlices,
      byStartRole: roleSlices,
    },
    languageTracker: {
      byDay: languageByDay,
      topTerms: topReasonTokens(allOpenTexts, 30),
      byDirection: dirSlices,
      byRole: roleSlices,
    },
    semanticClusters: {
      themesOfDay: topReasonTokens(textsByDay.get(focusDay) ?? [], 15),
      newQuestions: newTokensOnDay(textsByDay, focusDay, 12),
      recurring: topReasonTokens(professionalTexts, 12),
    },
    depthLayers: {
      distribution: depths,
      byDay: depthByDay,
      qualitativeNote: 'Качественные слои, не числовая оценка участника.',
      topDeepReflections: deepSamples.sort((a, b) => b.text.length - a.text.length).slice(0, 15),
    },
    dailyObservation: dailyObservation?.text ?? observationText,
  };
}

export async function buildClubsDashboard(filters: AnalyticsFilters, _req?: AdminRequest) {
  if (!semanticV2Enabled()) {
    return { enabled: false, clubs: [], matches: [], message: 'Клубы v2 — включите SEMANTIC_ANALYTICS_V2' };
  }
  const clubs = await db.select().from(forumClubs).where(eq(forumClubs.isActive, true));
  const clubId = filters.clubId;
  const matches = await listClubMatchesForDashboard(clubId, filters.limit);
  return {
    enabled: true,
    clubs,
    matches: matches.map(m => ({
      id: m.id,
      participantId: m.participantId,
      answerId: m.answerId,
      clubId: m.clubId,
      similarity: m.similarity,
      verdict: m.verdict,
      sourceType: m.sourceType,
      snippet: m.snippet,
      createdAt: m.createdAt,
    })),
    filterClubId: clubId,
  };
}
