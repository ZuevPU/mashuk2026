import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { db } from '../../db/index.js';
import {
  answers,
  exchangeQuestions,
  participantDayState,
  participants,
  piggybank,
  questions,
} from '../../db/schema.js';
import { emotionIdToZone } from '../emotionZones.js';
import { getForumSettings } from '../helpers.js';
import { isOrganizerDirection } from '../leaderboardQuery.js';
import { getCalendarForumDay, getMoscowParts } from '../timePhase.js';
import { TOUCHPOINT_SLOTS, windowsForDay } from '../touchpointTemplates.js';
import { touchpointTypeForQuestion } from '../exports/touchpointFilter.js';
import { collectEveningExportRows } from '../exports/eveningExportData.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { isQuestionLiveForAnalytics } from './analyticsQuestionLive.js';
import { loadCohortParticipants } from './cohort.js';
import { collectKindAnswerRows } from './questionKindDashboard.js';
import {
  appropriationPct,
  classifyReflection,
} from './afterBlocksHubMetrics.js';
import { ZONE_ORDER, ZONE_RU, type ZoneKey } from './stateDashboardMetrics.js';
import {
  TOOL_META,
  TOOL_ORDER,
  countEmptySlots,
  countOpenSlots,
  pct,
  reconDiffTone,
  round1,
  toolKeyFromTouchpoint,
  type DayStatsToolKey,
  type SlotStatus,
} from './dayStatsHubMetrics.js';

type QRow = typeof questions.$inferSelect;

function questionMatchesDay(q: QRow, day: number): boolean {
  if (q.dayNumber === day) return true;
  if (Array.isArray(q.dayNumbers) && q.dayNumbers.includes(day)) return true;
  return false;
}

function mskMinutesNow(now = new Date()): number {
  return getMoscowParts(now).totalMinutes;
}

function isWaiting(q: QRow, tool: DayStatsToolKey, day: number, startDate: Date | null, now: Date): boolean {
  if (q.publishTime && now.getTime() < q.publishTime.getTime()) return true;
  if (q.publishTime) return false;
  // Fallback по шаблону слота, если publishTime не задан
  if (!startDate || Number.isNaN(startDate.getTime())) {
    if (tool === 'evening') return mskMinutesNow(now) < 22 * 60;
    return false;
  }
  const slot = tool === 'evening'
    ? TOUCHPOINT_SLOTS.find(s => s.index === 7)
    : tool === 'checkin'
      ? null
      : tool === 'direction'
        ? TOUCHPOINT_SLOTS.find(s => s.index === 2)
        : tool === 'lesson_important'
          ? TOUCHPOINT_SLOTS.find(s => s.index === 4)
          : tool === 'lesson_open'
            ? TOUCHPOINT_SLOTS.find(s => s.index === 5)
            : null;
  if (!slot) return false;
  const { publishTime } = windowsForDay(startDate, day, slot);
  return now.getTime() < publishTime.getTime();
}

function parseEmotionZone(answerData: unknown): ZoneKey | null {
  if (!answerData || typeof answerData !== 'object') return null;
  const d = answerData as {
    emotion?: string;
    emotionZone?: string;
  };
  const zoneRaw = typeof d.emotionZone === 'string' ? d.emotionZone.trim().toLowerCase() : null;
  if (zoneRaw && (ZONE_ORDER as readonly string[]).includes(zoneRaw)) {
    return zoneRaw as ZoneKey;
  }
  const z = emotionIdToZone(d.emotion);
  if (z && (ZONE_ORDER as readonly string[]).includes(z)) return z as ZoneKey;
  return null;
}

async function computeDaySlice(
  day: number,
  cohortIds: number[],
  registered: number,
  cohortById: Map<number, { direction: string }>,
  allQuestions: QRow[],
  startDate: Date | null,
  now: Date,
  opts: { treatFutureAsWait: boolean },
) {
  const published = allQuestions.filter(q =>
    isQuestionLiveForAnalytics(q, now) && questionMatchesDay(q, day),
  );
  const qIds = published.map(q => q.id);

  const ans = qIds.length && cohortIds.length
    ? await db.select({
      participantId: answers.participantId,
      questionId: answers.questionId,
      answerData: answers.answerData,
    }).from(answers).where(and(
      inArray(answers.participantId, cohortIds),
      inArray(answers.questionId, qIds),
    ))
    : [];

  const eveningStates = cohortIds.length
    ? await db.select({
      participantId: participantDayState.participantId,
      eveningRatings: participantDayState.eveningRatings,
    }).from(participantDayState).where(and(
      eq(participantDayState.dayNumber, day),
      inArray(participantDayState.participantId, cohortIds),
    ))
    : [];
  const eveningDone = new Set(
    eveningStates
      .filter(s => s.eveningRatings != null && typeof s.eveningRatings === 'object')
      .map(s => s.participantId),
  );

  const answersByQ = new Map<number, typeof ans>();
  for (const a of ans) {
    if (!answersByQ.has(a.questionId)) answersByQ.set(a.questionId, []);
    answersByQ.get(a.questionId)!.push(a);
  }

  type Slot = {
    id: number;
    tool: DayStatsToolKey;
    title: string;
    status: SlotStatus;
    answers: number;
  };
  const slots: Slot[] = [];

  for (const q of published) {
    const tool = toolKeyFromTouchpoint(touchpointTypeForQuestion(q));
    const list = answersByQ.get(q.id) ?? [];
    let n = list.length;
    if (tool === 'evening' && eveningDone.size) {
      // вечерняя анкета часто в day_state — считаем вопрос заполненным, если есть рейтинги
      n = Math.max(n, eveningDone.size);
    }
    let status: SlotStatus = 'empty';
    if (n > 0) status = 'ok';
    else if (opts.treatFutureAsWait && isWaiting(q, tool, day, startDate, now)) status = 'wait';
    slots.push({
      id: q.id,
      tool,
      title: q.title || TOOL_META[tool].name,
      status,
      answers: n,
    });
  }

  // Если вечерних вопросов нет, но day_state уже есть — виртуальный слот итогов
  if (!slots.some(s => s.tool === 'evening') && eveningDone.size > 0) {
    slots.push({
      id: -day,
      tool: 'evening',
      title: 'Итоговая анкета по дню',
      status: 'ok',
      answers: eveningDone.size,
    });
  } else if (!slots.some(s => s.tool === 'evening')) {
    const waiting = opts.treatFutureAsWait && (
      !startDate || Number.isNaN(startDate.getTime())
        ? mskMinutesNow(now) < 22 * 60
        : now.getTime() < windowsForDay(startDate, day, TOUCHPOINT_SLOTS[6]).publishTime.getTime()
    );
    slots.push({
      id: -day,
      tool: 'evening',
      title: 'Итоговая анкета по дню',
      status: waiting ? 'wait' : (eveningDone.size ? 'ok' : 'empty'),
      answers: eveningDone.size,
    });
  }

  const tools = TOOL_ORDER.map(key => {
    const toolSlots = slots.filter(s => s.tool === key);
    const q = toolSlots.length;
    const a = toolSlots.filter(s => s.status === 'ok').length;
    const wait = toolSlots.filter(s => s.status === 'wait').length;
    return {
      key,
      name: TOOL_META[key].name,
      note: TOOL_META[key].note,
      q,
      a,
      wait,
      empty: toolSlots.filter(s => s.status === 'empty').length,
    };
  });

  const otherSlots = slots.filter(s => s.tool === 'other');
  if (otherSlots.length) {
    tools.push({
      key: 'other',
      name: TOOL_META.other.name,
      note: TOOL_META.other.note,
      q: otherSlots.length,
      a: otherSlots.filter(s => s.status === 'ok').length,
      wait: otherSlots.filter(s => s.status === 'wait').length,
      empty: otherSlots.filter(s => s.status === 'empty').length,
    });
  }

  const peopleSet = new Set<number>();
  for (const a of ans) peopleSet.add(a.participantId);
  for (const pid of eveningDone) peopleSet.add(pid);

  // Зоны — только checkin-ответы
  const zoneCounts: Record<ZoneKey, number> = {
    lift: 0, engagement: 0, neutral: 0, fatigue: 0, risk: 0,
  };
  let zoneMarks = 0;
  for (const q of published) {
    if (toolKeyFromTouchpoint(touchpointTypeForQuestion(q)) !== 'checkin') continue;
    for (const a of answersByQ.get(q.id) ?? []) {
      const z = parseEmotionZone(a.answerData);
      if (!z) continue;
      zoneCounts[z] += 1;
      zoneMarks += 1;
    }
  }
  const zones = ZONE_ORDER.map(k => ({
    key: k,
    name: ZONE_RU[k],
    n: zoneCounts[k],
    pct: pct(zoneCounts[k], zoneMarks),
  }));

  // Худшее направление: мин. охват среди направлений с n≥40
  const dirReg = new Map<string, number>();
  for (const [, p] of cohortById) {
    dirReg.set(p.direction, (dirReg.get(p.direction) || 0) + 1);
  }
  const dirPeople = new Map<string, Set<number>>();
  for (const a of ans) {
    const dir = cohortById.get(a.participantId)?.direction || '—';
    if (!dirPeople.has(dir)) dirPeople.set(dir, new Set());
    dirPeople.get(dir)!.add(a.participantId);
  }
  for (const pid of eveningDone) {
    const dir = cohortById.get(pid)?.direction || '—';
    if (!dirPeople.has(dir)) dirPeople.set(dir, new Set());
    dirPeople.get(dir)!.add(pid);
  }
  let worstDir: { dir: string; cov: number; people: number; reg: number } | null = null;
  for (const [dir, reg] of dirReg) {
    if (reg < 40) continue;
    const people = dirPeople.get(dir)?.size ?? 0;
    const cov = pct(people, reg);
    if (!worstDir || cov < worstDir.cov) {
      worstDir = { dir, cov, people, reg };
    }
  }

  const empty = countEmptySlots(slots);
  const openSlots = countOpenSlots(slots);
  const answerRows = ans.length + eveningDone.size;

  return {
    published: published.length,
    slots,
    tools,
    people: peopleSet.size,
    registered,
    answerRows,
    empty,
    openSlots,
    zones,
    zoneMarks,
    riskPct: pct(zoneCounts.risk, zoneMarks),
    fatiguePct: pct(zoneCounts.fatigue, zoneMarks),
    worstDir,
    peoplePct: pct(peopleSet.size, registered),
  };
}

export async function buildDayStatsHubDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  const settings = await getForumSettings(filters.shiftId);
  const currentDay = settings.currentDay ?? 1;
  const day = Math.min(8, Math.max(1, filters.day ?? currentDay));
  const startDate = settings.startDate ? new Date(settings.startDate) : null;
  const now = new Date();
  const msk = getMoscowParts(now);

  const cohort = await loadCohortParticipants(filters, req);
  const registeredRows = cohort.filter(
    p => p.onboardingCompletedAt && !isOrganizerDirection(p.direction),
  );
  const registered = registeredRows.length;
  const cohortById = new Map(
    registeredRows.map(p => [p.id, { direction: (p.direction || '—').trim() || '—' }]),
  );
  const cohortIds = [...cohortById.keys()];

  const shiftId = filters.shiftId;
  const allQuestions = shiftId != null
    ? await db.select().from(questions).where(
      or(eq(questions.shiftId, shiftId), isNull(questions.shiftId))!,
    )
    : await db.select().from(questions);

  const slice = await computeDaySlice(
    day, cohortIds, registered, cohortById, allQuestions, startDate, now,
    { treatFutureAsWait: true },
  );

  // Сверка с первичными панелями (те же коллекторы)
  const dayFilters: AnalyticsFilters = { ...filters, day, mode: 'day', compareDays: [] };
  const [{ rows: stateRows }, { rows: afterRows }, eveningPack] = await Promise.all([
    collectKindAnswerRows('state_check', dayFilters),
    collectKindAnswerRows('after_blocks', dayFilters),
    collectEveningExportRows({
      shiftId: filters.shiftId,
      day,
      direction: filters.direction ?? undefined,
      group: filters.group ?? undefined,
      ageCategory: filters.ageCategory ?? undefined,
      activityQ: filters.activity ?? undefined,
      includeDrafts: false,
    }),
  ]);

  const allowed = new Set(cohortIds);
  const stateScoped = stateRows.filter(r => allowed.has(r.participantId) && r.day === day);
  const afterScoped = afterRows.filter(r => {
    if (!allowed.has(r.participantId) || r.day !== day) return false;
    const text = (r.answer || '').trim();
    return text && !text.startsWith('(ответ без');
  });
  const eveningSubmitted = eveningPack.rows.filter(
    r => r.status === 'сдано'
      && allowed.has(r.p.id)
      && !isOrganizerDirection(r.directionName || r.p.direction),
  );

  const srcRows = stateScoped.length + afterScoped.length + eveningSubmitted.length;
  const srcPeople = new Set([
    ...stateScoped.map(r => r.participantId),
    ...afterScoped.map(r => r.participantId),
    ...eveningSubmitted.map(r => r.p.id),
  ]).size;

  const afterLevels = afterScoped.map(r => classifyReflection((r.answer || '').trim()));
  const ownPct = appropriationPct(afterLevels);

  // Nav tiles — числа из тех же источников, что панели
  const [exQ, pigRows, scoreRows] = await Promise.all([
    db.select({
      id: exchangeQuestions.id,
      participantId: exchangeQuestions.participantId,
      createdAt: exchangeQuestions.createdAt,
    }).from(exchangeQuestions),
    cohortIds.length
      ? db.select({
        participantId: piggybank.participantId,
        forumDay: piggybank.forumDay,
      }).from(piggybank).where(and(
        inArray(piggybank.participantId, cohortIds),
        eq(piggybank.forumDay, day),
        isNull(piggybank.deletedAt),
      ))
      : Promise.resolve([] as Array<{ participantId: number; forumDay: number | null }>),
    cohortIds.length
      ? db.select({
        id: participants.id,
        lastActiveAt: participants.lastActiveAt,
      }).from(participants).where(inArray(participants.id, cohortIds))
      : Promise.resolve([] as Array<{ id: number; lastActiveAt: Date | null }>),
  ]);

  const totalDays = settings.totalDays ?? 8;
  const exDayQ = exQ.filter(q => {
    if (!allowed.has(q.participantId) || !q.createdAt || !startDate) return false;
    return getCalendarForumDay(startDate, q.createdAt, totalDays) === day;
  });

  const pigPeople = new Set(pigRows.map(r => r.participantId)).size;
  const pigCov = pct(pigPeople, registered);

  const nowKey = msk.dateKey;
  let old = 0;
  let never = 0;
  for (const r of scoreRows) {
    if (!r.lastActiveAt) {
      never += 1;
      continue;
    }
    const key = getMoscowParts(r.lastActiveAt).dateKey;
    if (key < nowKey) {
      // упрощённо: не сегодня → «старое»; панель Активность детальнее
      const today = new Date(`${nowKey}T12:00:00+03:00`);
      const last = new Date(`${key}T12:00:00+03:00`);
      const diff = Math.round((today.getTime() - last.getTime()) / 86_400_000);
      if (diff >= 2) old += 1;
    }
  }
  const dropped = old + never;

  const eveningWaiting = slice.tools.find(t => t.key === 'evening')?.wait ?? 0;
  const eveningFill = pct(eveningSubmitted.length, registered);

  const riskN = slice.zones.find(z => z.key === 'risk')?.n ?? 0;
  const fatigueN = slice.zones.find(z => z.key === 'fatigue')?.n ?? 0;

  const nav = [
    {
      lens: 'state',
      title: 'Состояние участников',
      sub: `риск ${riskN} · усталость ${fatigueN}`,
      metric: `${slice.riskPct}% в риске`,
    },
    {
      lens: 'afterBlocks',
      title: 'Осмысление после блоков',
      sub: `${afterScoped.length} текстов`,
      metric: `${ownPct}% присвоения`,
    },
    {
      lens: 'dayResults',
      title: 'Итоги дня',
      sub: eveningWaiting > 0 && eveningSubmitted.length === 0
        ? 'откроется в 22:00'
        : `${eveningSubmitted.length} сдано`,
      metric: eveningWaiting > 0 && eveningSubmitted.length === 0
        ? 'ждём'
        : `${Math.round(eveningFill)}% заполн.`,
    },
    {
      lens: 'forumResults',
      title: 'Итоги форума',
      sub: 'итоговая анкета смены',
      metric: 'сводка',
    },
    {
      lens: 'exchange',
      title: 'Обмен опытом',
      sub: `${exDayQ.length} вопросов за день`,
      metric: exDayQ.length ? `${exDayQ.length} вопросов` : 'тихо',
    },
    {
      lens: 'piggybank',
      title: 'Копилка',
      sub: 'добровольный инструмент',
      metric: `${Math.round(pigCov)}% охвата`,
    },
    {
      lens: 'activity',
      title: 'Активность',
      sub: 'выпавших 2+ дня',
      metric: `${dropped} человек`,
    },
  ];

  const recon = [
    {
      m: 'Строк ответов',
      stat: slice.answerRows,
      src: srcRows,
      srcNote: `${stateScoped.length} состояние + ${afterScoped.length} после блоков + ${eveningSubmitted.length} итоги`,
      diff: slice.answerRows - srcRows,
      tone: reconDiffTone(slice.answerRows, srcRows),
    },
    {
      m: 'Участников с ответами',
      stat: slice.people,
      src: srcPeople,
      srcNote: 'объединение по состоянию, после блоков и итогам дня',
      diff: slice.people - srcPeople,
      tone: reconDiffTone(slice.people, srcPeople),
    },
  ];

  // Динамика по дням
  const daySeries = [];
  for (let d = 1; d <= 8; d++) {
    if (d > currentDay) {
      daySeries.push({
        day: d,
        peoplePct: null as number | null,
        empty: null as number | null,
        riskFatiguePct: null as number | null,
      });
      continue;
    }
    const s = d === day
      ? slice
      : await computeDaySlice(
        d, cohortIds, registered, cohortById, allQuestions, startDate, now,
        { treatFutureAsWait: false },
      );
    daySeries.push({
      day: d,
      peoplePct: s.peoplePct,
      empty: s.empty,
      riskFatiguePct: round1(s.riskPct + s.fatiguePct),
    });
  }

  const emptyOpen = slice.empty;
  const callout = emptyOpen > 0
    ? `${emptyOpen} из ${slice.openSlots} открытых вопросов без единого ответа.`
    : 'Все открытые вопросы дня уже собрали хотя бы один ответ.';

  return {
    filters,
    currentForumDay: currentDay,
    meta: {
      day,
      now: now.toISOString(),
      nowLabel: `${msk.dateKey} ${String(msk.hours).padStart(2, '0')}:${String(msk.minutes).padStart(2, '0')} МСК`,
      people: slice.people,
      registered,
      peoplePct: slice.peoplePct,
      answerRows: slice.answerRows,
      perPerson: slice.people ? round1(slice.answerRows / slice.people) : 0,
      empty: emptyOpen,
      published: slice.published,
      openSlots: slice.openSlots,
      zoneMarks: slice.zoneMarks,
      riskPct: slice.riskPct,
      fatiguePct: slice.fatiguePct,
    },
    slots: slice.slots.map(s => ({
      id: s.id,
      tool: s.tool,
      title: s.title,
      status: s.status,
    })),
    tools: slice.tools,
    zones: slice.zones,
    deadZones: [
      { name: 'Спокойствие', n: 0, note: 'остаток старой модели — в системе нет' },
      { name: 'Напряжение', n: 0, note: 'остаток старой модели — в системе нет' },
    ],
    recon,
    nav,
    worstDir: slice.worstDir,
    gaps: [
      {
        title: 'Время среза',
        text: `Срез: ${msk.dateKey} ${String(msk.hours).padStart(2, '0')}:${String(msk.minutes).padStart(2, '0')} МСК. Вопросы, чьё окно ещё не открылось, серые и не входят в счётчик пустых.`,
        tone: 'ok',
      },
      {
        title: 'Знаменатели',
        text: slice.zoneMarks
          ? `Зоны считаются в долях от ${slice.zoneMarks} отметок состояния за день.`
          : 'Пока нет отметок состояния для знаменателя зон.',
        tone: slice.zoneMarks ? 'ok' : 'warn',
      },
      {
        title: 'Полный набор зон',
        text: 'В панели — пять рабочих зон. Мёртвые «Спокойствие» и «Напряжение» помечены отдельно и не входят в доли.',
        tone: 'ok',
      },
      {
        title: 'Худшее направление дня',
        text: slice.worstDir
          ? `${slice.worstDir.dir}: охват ${slice.worstDir.cov}% (${slice.worstDir.people} из ${slice.worstDir.reg}).`
          : 'Недостаточно направлений с n≥40 для сравнения.',
        tone: slice.worstDir && slice.worstDir.cov < 50 ? 'bad' : 'warn',
      },
    ],
    daySeries,
    callout,
    exportPath: `/exports/day/stats?day=${day}`,
  };
}
