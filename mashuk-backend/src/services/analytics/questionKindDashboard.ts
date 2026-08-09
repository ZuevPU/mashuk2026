import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { db } from '../../db/index.js';
import { answers, participants, questions } from '../../db/schema.js';
import { fullName, formatTs } from '../exports/exportCommon.js';
import { isPublishedStatus } from '../publishStatus.js';
import { reflectionKindFromQuestion } from '../reflectionTypeLabel.js';
import {
  accumulateZoneFromAnswer,
  emptyZoneDistribution,
  parseCheckinPayload,
  topReasonTokens,
  zonesToPercent,
  EMOTION_ZONE_LABELS,
} from './zoneDistribution.js';
import {
  buildEmotionDistribution,
  emotionIdToLabel,
  emotionIdToZone,
  emotionZoneToLabel,
} from '../emotionZones.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { resolveDayRange } from './analyticsQuery.js';
import { loadCohortParticipants } from './cohort.js';
import { getForumSettings } from '../helpers.js';
import { stateCheckPhaseForAnswer } from './touchpointMetrics.js';
import { buildKindDaySeries, forumSeriesDays } from './dayComparison.js';

export type KindDashboardMode = 'after_blocks' | 'state_check';

export type KindAnswerRow = {
  answerId: number;
  participantId: number;
  name: string;
  direction: string;
  group: string;
  day: number;
  questionId: number;
  questionTitle: string;
  answer: string;
  eventTitle: string | null;
  eventId: number | null;
  parentEventTitle: string | null;
  parentEventId: number | null;
  emotion: string | null;
  emotionZone: string | null;
  energy: number | null;
  timePoint: string | null;
  filledAt: string | null;
  /** For phase fallback when timePoint is empty */
  createdAt: Date | null;
};

export type KindQuestionAnswer = Omit<KindAnswerRow, 'createdAt'>;

export type KindQuestionStat = {
  key: string;
  label: string;
  day: number | null;
  answered: number;
  uniqueParticipants: number;
  distribution: { label: string; count: number; pct: number }[];
  answers: KindQuestionAnswer[];
};

function resolveStatePhase(r: KindAnswerRow): 'morning' | 'day' | 'evening' {
  const tp = (r.timePoint || '').toLowerCase();
  if (tp.includes('вечер')) return 'evening';
  if (tp.includes('день')) return 'day';
  if (tp.includes('утро')) return 'morning';
  return stateCheckPhaseForAnswer(r.createdAt);
}

function publicAnswer(r: KindAnswerRow): KindQuestionAnswer {
  const { createdAt: _createdAt, ...rest } = r;
  return rest;
}

function isAfterBlocksQuestion(q: typeof questions.$inferSelect): boolean {
  if (q.questionKind === 'after_blocks') return true;
  const linked = Array.isArray(q.linkedEventIds) ? q.linkedEventIds : [];
  if (linked.length > 0 && q.type !== 'checkin') return true;
  const block = (q.block || '').toLowerCase();
  if (block.includes('точки осмысления') || block.includes('точек осмысления')) return true;
  return false;
}

function isStateCheckQuestion(q: typeof questions.$inferSelect): boolean {
  if (q.questionKind === 'state_check' || q.reflectionKind === 'state_check') return true;
  if (q.type === 'checkin') return true;
  if (reflectionKindFromQuestion(q) === 'state_check') return true;
  const block = (q.block || '').toLowerCase();
  return block.includes('проверк');
}

export function matchesKind(q: typeof questions.$inferSelect, mode: KindDashboardMode): boolean {
  if (mode === 'after_blocks') return isAfterBlocksQuestion(q) && !isStateCheckQuestion(q);
  return isStateCheckQuestion(q);
}

function extractAnswerText(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return extractAnswerText(parsed);
    } catch {
      return data.trim();
    }
  }
  if (typeof data !== 'object' || Array.isArray(data)) return String(data);
  const o = data as Record<string, unknown>;
  if (typeof o.text === 'string' && o.text.trim()) return o.text.trim();
  if (typeof o.reason === 'string' && o.reason.trim()) return o.reason.trim();
  if (typeof o.mainThesis === 'string' && o.mainThesis.trim()) return o.mainThesis.trim();
  return '';
}

type ParsedAfterBlocks = {
  text: string;
  eventTitle: string | null;
  eventId: number | null;
  parentEventTitle: string | null;
  parentEventId: number | null;
  pathLabel: string | null;
};

function parseAfterBlocksItems(data: unknown): ParsedAfterBlocks[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    const text = extractAnswerText(data);
    return text
      ? [{
        text,
        eventTitle: null,
        eventId: null,
        parentEventTitle: null,
        parentEventId: null,
        pathLabel: null,
      }]
      : [];
  }
  const o = data as Record<string, unknown>;
  const parentEventTitle = typeof o.parentEventTitle === 'string' ? o.parentEventTitle : null;
  const parentEventId = typeof o.parentEventId === 'number'
    ? o.parentEventId
    : (o.parentEventId != null ? Number(o.parentEventId) : null);
  const parentId = parentEventId != null && Number.isFinite(parentEventId) ? parentEventId : null;

  const toItem = (eventTitle: string | null, eventIdRaw: unknown, text: string): ParsedAfterBlocks => {
    const eventId = typeof eventIdRaw === 'number'
      ? eventIdRaw
      : (eventIdRaw != null ? Number(eventIdRaw) : null);
    const pathLabel = parentEventTitle && eventTitle && parentEventTitle !== eventTitle
      ? `${parentEventTitle} → ${eventTitle}`
      : (eventTitle || parentEventTitle);
    return {
      text,
      eventTitle,
      eventId: eventId != null && Number.isFinite(eventId) ? eventId : null,
      parentEventTitle,
      parentEventId: parentId,
      pathLabel,
    };
  };

  if (Array.isArray(o.reflections) && o.reflections.length > 0) {
    const items = o.reflections.map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const r = raw as Record<string, unknown>;
      const text = typeof r.text === 'string' ? r.text.trim() : '';
      if (!text) return null;
      const eventTitle = typeof r.eventTitle === 'string' ? r.eventTitle : null;
      return toItem(eventTitle, r.eventId, text);
    }).filter((x): x is ParsedAfterBlocks => Boolean(x));
    if (items.length) return items;
  }

  const text = extractAnswerText(data);
  const eventTitle = typeof o.eventTitle === 'string' ? o.eventTitle : null;
  const item = toItem(eventTitle, o.eventId, text);
  if (!item.text && !item.pathLabel) return [];
  return [item];
}

function afterBlocksPathLabel(r: Pick<KindAnswerRow, 'parentEventTitle' | 'eventTitle'>): string | null {
  const parent = r.parentEventTitle?.trim() || '';
  const topic = r.eventTitle?.trim() || '';
  if (parent && topic && parent !== topic) return `${parent} → ${topic}`;
  return topic || parent || null;
}

function buildDistribution(
  counts: Map<string, number>,
  total: number,
): { label: string; count: number; pct: number }[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
    .map(([label, count]) => ({
      label,
      count,
      pct: total ? Math.round((count / total) * 1000) / 10 : 0,
    }));
}

export async function collectKindAnswerRows(
  mode: KindDashboardMode,
  filters: AnalyticsFilters,
): Promise<{
  rows: KindAnswerRow[];
  questionMeta: { id: number; title: string; dayNumber: number | null }[];
}> {
  const settings = await getForumSettings();
  const days = resolveDayRange(filters, settings.currentDay ?? 1);

  const qConds = [];
  if (filters.shiftId != null) qConds.push(eq(questions.shiftId, filters.shiftId));
  if (days.length === 1) qConds.push(eq(questions.dayNumber, days[0]));
  else if (days.length > 1) qConds.push(inArray(questions.dayNumber, days));

  const allQs = qConds.length
    ? await db.select().from(questions).where(and(...qConds))
    : await db.select().from(questions);
  const kindQs = allQs.filter(q => isPublishedStatus(q.status) && matchesKind(q, mode));
  const qIds = kindQs.map(q => q.id);
  if (!qIds.length) return { rows: [], questionMeta: [] };

  const pConds = [isNull(participants.selfDeletedAt), inArray(answers.questionId, qIds)];
  if (filters.shiftId != null) pConds.push(eq(participants.shiftId, filters.shiftId));
  if (filters.direction?.trim()) {
    pConds.push(sql`LOWER(COALESCE(${participants.direction}, '')) = ${filters.direction.trim().toLowerCase()}`);
  }
  if (filters.group?.trim()) {
    pConds.push(sql`LOWER(COALESCE(${participants.groupName}, '')) = ${filters.group.trim().toLowerCase()}`);
  }

  const joinRows = await db.select({
    a: answers,
    p: participants,
    q: questions,
  })
    .from(answers)
    .innerJoin(questions, eq(answers.questionId, questions.id))
    .innerJoin(participants, eq(answers.participantId, participants.id))
    .where(and(...pConds));

  const qById = new Map(kindQs.map(q => [q.id, q]));
  const rows: KindAnswerRow[] = [];

  for (const r of joinRows) {
    const q = qById.get(r.q.id) ?? r.q;
    if (!matchesKind(q, mode)) continue;
    const direction = (r.p.direction || '—').trim() || '—';
    const group = r.p.groupName || '';
    const day = q.dayNumber ?? 0;

    if (mode === 'after_blocks') {
      const parsedItems = parseAfterBlocksItems(r.a.answerData);
      for (const parsed of parsedItems) {
        if (!parsed.text && !parsed.pathLabel) continue;
        rows.push({
          answerId: r.a.id,
          participantId: r.p.id,
          name: fullName(r.p),
          direction,
          group,
          day,
          questionId: q.id,
          questionTitle: q.title || q.text || `Вопрос #${q.id}`,
          answer: parsed.text,
          eventTitle: parsed.eventTitle,
          eventId: parsed.eventId,
          parentEventTitle: parsed.parentEventTitle,
          parentEventId: parsed.parentEventId,
          emotion: null,
          emotionZone: null,
          energy: null,
          timePoint: q.timePoint ?? null,
          filledAt: r.a.createdAt ? formatTs(r.a.createdAt) : null,
          createdAt: r.a.createdAt ?? null,
        });
      }
      continue;
    }

    const payload = parseCheckinPayload(r.a.answerData) as {
      emotion?: string;
      energy?: number;
      reason?: string;
      timePoint?: string;
      emotionZone?: string;
      emotionZoneLabel?: string;
    };
    const energy = typeof payload.energy === 'number' ? payload.energy : Number(payload.energy);
    const emotion = typeof payload.emotion === 'string' ? payload.emotion : null;
    const zoneRaw = typeof payload.emotionZone === 'string' ? payload.emotionZone.trim().toLowerCase() : null;
    const zone = (zoneRaw && zoneRaw in EMOTION_ZONE_LABELS
      ? zoneRaw as keyof typeof EMOTION_ZONE_LABELS
      : null) ?? emotionIdToZone(emotion);
    rows.push({
      answerId: r.a.id,
      participantId: r.p.id,
      name: fullName(r.p),
      direction,
      group,
      day,
      questionId: q.id,
      questionTitle: q.title || q.text || `Вопрос #${q.id}`,
      answer: typeof payload.reason === 'string' ? payload.reason : extractAnswerText(r.a.answerData),
      eventTitle: null,
      eventId: null,
      parentEventTitle: null,
      parentEventId: null,
      emotion,
      emotionZone: zone,
      energy: Number.isFinite(energy) ? energy : null,
      timePoint: payload.timePoint || q.timePoint || null,
      filledAt: r.a.createdAt ? formatTs(r.a.createdAt) : null,
      createdAt: r.a.createdAt ?? null,
    });
  }

  return {
    rows,
    questionMeta: kindQs.map(q => ({
      id: q.id,
      title: q.title || q.text || `Вопрос #${q.id}`,
      dayNumber: q.dayNumber ?? null,
    })),
  };
}

export async function buildKindDashboard(
  mode: KindDashboardMode,
  filters: AnalyticsFilters,
  req?: AdminRequest,
) {
  const settings = await getForumSettings();
  const currentDay = settings.currentDay ?? 1;
  const days = resolveDayRange(filters, currentDay);
  const dayFilter = days.length === 1 ? days[0] : null;

  const cohort = await loadCohortParticipants(filters, req);
  const cohortSize = cohort.filter(p => p.onboardingCompletedAt).length;
  const cohortIds = new Set(cohort.map(p => p.id));

  const collected = await collectKindAnswerRows(mode, filters);
  const rows = collected.rows.filter(r => cohortIds.has(r.participantId));
  const questionMeta = collected.questionMeta;

  const uniqueParticipants = new Set(rows.map(r => r.participantId));
  const submitted = uniqueParticipants.size;
  const answerCount = rows.length;
  const fillRatePct = cohortSize
    ? Math.round((submitted / cohortSize) * 1000) / 10
    : 0;

  const registeredByDir = new Map<string, number>();
  for (const p of cohort) {
    if (!p.onboardingCompletedAt) continue;
    const d = (p.direction || '—').trim() || '—';
    registeredByDir.set(d, (registeredByDir.get(d) || 0) + 1);
  }
  const submittedByDir = new Map<string, Set<number>>();
  for (const r of rows) {
    if (!submittedByDir.has(r.direction)) submittedByDir.set(r.direction, new Set());
    submittedByDir.get(r.direction)!.add(r.participantId);
  }
  const allDirs = new Set([...registeredByDir.keys(), ...submittedByDir.keys()]);
  const byDirection = [...allDirs]
    .map(direction => {
      const submittedCount = submittedByDir.get(direction)?.size ?? 0;
      const registered = registeredByDir.get(direction) ?? 0;
      return {
        direction,
        submitted: submittedCount,
        answers: rows.filter(r => r.direction === direction).length,
        registered,
        fillRatePct: registered
          ? Math.round((submittedCount / registered) * 1000) / 10
          : 0,
      };
    })
    .sort((a, b) => b.submitted - a.submitted || a.direction.localeCompare(b.direction, 'ru'));

  const questionsOut: KindQuestionStat[] = questionMeta.map(qm => {
    const qRows = rows.filter(r => r.questionId === qm.id);
    const counts = new Map<string, number>();
    if (mode === 'after_blocks') {
      for (const r of qRows) {
        const label = afterBlocksPathLabel(r) || 'Без блока';
        counts.set(label, (counts.get(label) || 0) + 1);
      }
    } else {
      for (const r of qRows) {
        const zoneKey = (r.emotionZone as keyof typeof EMOTION_ZONE_LABELS | null)
          ?? emotionIdToZone(r.emotion);
        const label = (zoneKey && EMOTION_ZONE_LABELS[zoneKey])
          || emotionZoneToLabel(r.emotionZone)
          || emotionIdToLabel(r.emotion)
          || 'без зоны';
        counts.set(label, (counts.get(label) || 0) + 1);
      }
    }
    return {
      key: String(qm.id),
      label: qm.title,
      day: qm.dayNumber,
      answered: qRows.length,
      uniqueParticipants: new Set(qRows.map(r => r.participantId)).size,
      distribution: buildDistribution(counts, qRows.length),
      answers: qRows.map(publicAnswer),
    };
  });
  questionsOut.sort((a, b) => (a.day ?? 99) - (b.day ?? 99) || a.label.localeCompare(b.label, 'ru'));

  const exportParams = new URLSearchParams();
  exportParams.set('mode', days.length > 1 ? 'shift' : 'day');
  if (dayFilter != null) exportParams.set('day', String(dayFilter));
  if (filters.direction?.trim()) exportParams.set('direction', filters.direction.trim());
  if (filters.group?.trim()) exportParams.set('group', filters.group.trim());
  const exportBase = mode === 'after_blocks'
    ? '/exports/after-blocks'
    : '/exports/state-checks';
  const exportQs = exportParams.toString();
  const exportPath = `${exportBase}?${exportQs}`;

  const diagnosticsNotes: string[] = [];
  if (!questionMeta.length) {
    diagnosticsNotes.push(
      mode === 'after_blocks'
        ? 'Нет опубликованных вопросов «После блоков» в выбранном срезе дня/смены.'
        : 'Нет опубликованных вопросов «Проверка состояния» в выбранном срезе дня/смены.',
    );
  } else if (!rows.length) {
    diagnosticsNotes.push('Вопросы есть, но ответов участников в срезе пока нет.');
  }
  if (filters.direction?.trim()) {
    diagnosticsNotes.push(`Фильтр направления: ${filters.direction.trim()}.`);
  }
  if (filters.group?.trim()) {
    diagnosticsNotes.push(`Фильтр группы: ${filters.group.trim()}.`);
  }

  const { daySeries, byDirectionDaySeries } = await buildKindDaySeries(
    mode,
    cohort,
    forumSeriesDays(currentDay),
    filters.shiftId,
  );

  const base = {
    filters,
    currentForumDay: currentDay,
    mode,
    activity: {
      submitted,
      answerCount,
      cohortSize,
      fillRatePct,
      questionsPublished: questionMeta.length,
      byDirection,
      daySeries,
      byDirectionDaySeries,
    },
    daySeries,
    byDirectionDaySeries,
    byDirection,
    questions: questionsOut,
    exportPath,
    diagnostics: { notes: diagnosticsNotes },
  };

  if (mode === 'after_blocks') {
    const byEvent = new Map<string, number>();
    for (const r of rows) {
      const label = afterBlocksPathLabel(r) || 'Без блока';
      byEvent.set(label, (byEvent.get(label) || 0) + 1);
    }
    return {
      ...base,
      byEvent: buildDistribution(byEvent, rows.length),
      title: 'После блоков',
    };
  }

  const zones = emptyZoneDistribution();
  const zonesByPhase = {
    morning: emptyZoneDistribution(),
    day: emptyZoneDistribution(),
    evening: emptyZoneDistribution(),
  };
  const energyVals: number[] = [];
  const reasons: string[] = [];
  const byPhaseCount = { morning: 0, day: 0, evening: 0 };
  const emotionCounts = new Map<string, number>();

  for (const r of rows) {
    accumulateZoneFromAnswer(zones, {
      emotion: r.emotion,
      emotionZone: r.emotionZone,
      energy: r.energy,
      reason: r.answer,
    });
    const phase = resolveStatePhase(r);
    byPhaseCount[phase] += 1;
    accumulateZoneFromAnswer(zonesByPhase[phase], {
      emotion: r.emotion,
      emotionZone: r.emotionZone,
    });
    if (r.energy != null) energyVals.push(r.energy);
    if (r.answer?.trim()) reasons.push(r.answer.trim());
    if (r.emotion) {
      const emo = r.emotion.trim().toLowerCase();
      if (emo) emotionCounts.set(emo, (emotionCounts.get(emo) || 0) + 1);
    }
  }

  const avgEnergy = energyVals.length
    ? Math.round((energyVals.reduce((s, n) => s + n, 0) / energyVals.length) * 10) / 10
    : null;
  const sortedEnergy = [...energyVals].sort((a, b) => a - b);
  const medianEnergy = sortedEnergy.length
    ? (() => {
      const mid = Math.floor(sortedEnergy.length / 2);
      const m = sortedEnergy.length % 2 === 0
        ? (sortedEnergy[mid - 1] + sortedEnergy[mid]) / 2
        : sortedEnergy[mid];
      return Math.round(m * 10) / 10;
    })()
    : null;
  const riskPct = zonesToPercent(zones).risk;
  const fatiguePct = zonesToPercent(zones).fatigue;

  const mean = (vals: number[]) => (vals.length
    ? Math.round((vals.reduce((s, n) => s + n, 0) / vals.length) * 10) / 10
    : null);
  const medianOf = (vals: number[]) => {
    if (!vals.length) return null;
    const s = [...vals].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    const m = s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
    return Math.round(m * 10) / 10;
  };

  const energySeriesDays = forumSeriesDays(currentDay);
  /**
   * Серии энергии всегда по D1…Dcurrent — даже если дашборд открыт в режиме одного дня.
   * Иначе сравнение «день A → день B» в Штабе видит только текущий день фильтра.
   */
  let energySourceRows = rows;
  if (days.length === 1 && energySeriesDays.length > 1) {
    const { rows: seriesRows } = await collectKindAnswerRows(mode, {
      ...filters,
      mode: 'shift',
      day: null,
      compareDays: [],
    });
    energySourceRows = seriesRows.filter(
      r => r.day != null && r.day >= 1 && energySeriesDays.includes(r.day),
    );
  }

  const energyByDayMap = new Map<number, number[]>();
  const energyByDirDayMap = new Map<string, number[]>();
  const riskFatigueByDay = new Map<number, { risk: number; total: number }>();
  for (const r of energySourceRows) {
    if (r.day != null && r.day >= 1) {
      if (!riskFatigueByDay.has(r.day)) riskFatigueByDay.set(r.day, { risk: 0, total: 0 });
      const bucket = riskFatigueByDay.get(r.day)!;
      bucket.total += 1;
      const zone = (r.emotionZone as string | null) ?? emotionIdToZone(r.emotion);
      if (zone === 'risk' || zone === 'fatigue') bucket.risk += 1;
    }
    if (r.energy == null || !Number.isFinite(r.energy)) continue;
    if (r.day == null || r.day < 1) continue;
    if (!energyByDayMap.has(r.day)) energyByDayMap.set(r.day, []);
    energyByDayMap.get(r.day)!.push(r.energy);
    const dir = (r.direction || '—').trim() || '—';
    const key = `${dir}::${r.day}`;
    if (!energyByDirDayMap.has(key)) energyByDirDayMap.set(key, []);
    energyByDirDayMap.get(key)!.push(r.energy);
  }
  const energyByDay = energySeriesDays.map(day => {
    const vals = energyByDayMap.get(day) ?? [];
    const rf = riskFatigueByDay.get(day);
    return {
      day,
      avg: mean(vals),
      median: medianOf(vals),
      responses: vals.length,
      riskFatiguePct: rf && rf.total
        ? Math.round((rf.risk / rf.total) * 1000) / 10
        : null,
    };
  });
  const energyDirections = [...new Set(energySourceRows.map(r => (r.direction || '—').trim() || '—'))]
    .sort((a, b) => a.localeCompare(b, 'ru'));
  const energyByDirectionDay = energySeriesDays.flatMap(day =>
    energyDirections.map(direction => {
      const vals = energyByDirDayMap.get(`${direction}::${day}`) ?? [];
      return { direction, day, avg: mean(vals), median: medianOf(vals), responses: vals.length };
    }),
  );

  return {
    ...base,
    title: 'Проверка состояния',
    emotionalPulse: {
      zoneLabels: EMOTION_ZONE_LABELS,
      zonesPercent: zonesToPercent(zones),
      byPhase: {
        morning: zonesToPercent(zonesByPhase.morning),
        day: zonesToPercent(zonesByPhase.day),
        evening: zonesToPercent(zonesByPhase.evening),
      },
      phaseCounts: byPhaseCount,
      avgEnergy,
      medianEnergy,
      energyCount: energyVals.length,
      riskFatiguePct: Math.round((riskPct + fatiguePct) * 10) / 10,
      emotions: buildEmotionDistribution(emotionCounts, rows.length),
      topReasons: topReasonTokens(reasons, 20),
      energyByDay,
      energyByDirectionDay,
    },
  };
}
