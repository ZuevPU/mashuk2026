import { inArray } from 'drizzle-orm';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { db } from '../../db/index.js';
import {
  exchangeAnswers, exchangeCategories, exchangeQuestions, participants,
} from '../../db/schema.js';
import { getForumSettings } from '../helpers.js';
import { isOrganizerDirection } from '../leaderboardQuery.js';
import { getCalendarForumDay, getMoscowParts } from '../timePhase.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { loadCohortParticipants } from './cohort.js';
import {
  ANSWER_LADDER,
  LEN_BINS,
  answerLadderBucket,
  lenBin,
  median,
  medianFirstReplyMinutes,
  mskHour,
  round1,
  topShareCounts,
} from './exchangeHubMetrics.js';

function isOtherSlug(slug: string | null | undefined): boolean {
  return (slug || '').toLowerCase() === 'other';
}

export async function buildExchangeHubDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  const settings = await getForumSettings();
  const currentDay = settings.currentDay ?? 1;
  const day = Math.min(8, Math.max(1, filters.day ?? currentDay));
  const totalDays = settings.totalDays ?? 8;
  const startDate = settings.startDate ? new Date(settings.startDate) : null;

  const cohort = await loadCohortParticipants(filters, req);
  const registeredRows = cohort.filter(
    p => p.onboardingCompletedAt && !isOrganizerDirection(p.direction),
  );
  const registered = registeredRows.length;
  const cohortById = new Map(
    registeredRows.map(p => [p.id, { direction: (p.direction || '—').trim() || '—' }]),
  );
  const cohortIds = [...cohortById.keys()];
  const cohortSet = new Set(cohortIds);

  const dayOf = (createdAt: Date | null | undefined): number | null => {
    if (!createdAt) return null;
    if (!startDate || Number.isNaN(startDate.getTime())) return currentDay;
    return getCalendarForumDay(startDate, createdAt, totalDays);
  };

  const cats = await db.select().from(exchangeCategories);
  const catById = new Map(cats.map(c => [c.id, c]));

  const allQ = await db.select().from(exchangeQuestions);
  const questions = allQ.filter(q => cohortSet.has(q.participantId));
  const qIds = questions.map(q => q.id);

  // Все ответы на вопросы авторов из когорты (объём площадки)
  const answersOnCohortQ = qIds.length
    ? await db.select().from(exchangeAnswers).where(inArray(exchangeAnswers.questionId, qIds))
    : [];

  const askers = new Set(questions.map(q => q.participantId));
  const answerers = new Set(answersOnCohortQ.map(a => a.participantId).filter(id => cohortSet.has(id)));
  // если отвечающий вне когорты (фильтр направления) — не считаем в answerers
  const both = [...askers].filter(id => answerers.has(id)).length;
  const peopleSet = new Set([...askers, ...answerers]);

  const approvedQ = questions.filter(q => String(q.moderationStatus).toLowerCase() === 'approved');
  const rejectedN = questions.filter(q => String(q.moderationStatus).toLowerCase() === 'rejected').length;

  // Ответы по вопросу (все уровни)
  const answersByQ = new Map<number, typeof answersOnCohortQ>();
  for (const a of answersOnCohortQ) {
    if (!answersByQ.has(a.questionId)) answersByQ.set(a.questionId, []);
    answersByQ.get(a.questionId)!.push(a);
  }

  const unanswered = approvedQ.filter(q => !(answersByQ.get(q.id)?.length)).length;
  const unansweredPct = approvedQ.length
    ? round1((unanswered / approvedQ.length) * 100)
    : 0;

  const firstReplyPairs: Array<{ askedAt: Date; firstAnswerAt: Date }> = [];
  for (const q of approvedQ) {
    if (!q.createdAt) continue;
    const list = answersByQ.get(q.id) ?? [];
    if (!list.length) continue;
    const first = list
      .filter(a => a.createdAt)
      .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime())[0];
    if (first?.createdAt) {
      firstReplyPairs.push({ askedAt: q.createdAt, firstAnswerAt: first.createdAt });
    }
  }
  const medFirstReplyMin = medianFirstReplyMinutes(firstReplyPairs);

  const perQ = questions.length
    ? round1(answersOnCohortQ.length / questions.length)
    : 0;

  // byDay 1..8
  type DayBucket = {
    q: number; a: number; other: number; people: Set<number>; dateLabel: string;
  };
  const byDayMap = new Map<number, DayBucket>();
  for (let d = 1; d <= 8; d++) {
    byDayMap.set(d, { q: 0, a: 0, other: 0, people: new Set(), dateLabel: `Д${d}` });
  }
  for (const q of questions) {
    const d = dayOf(q.createdAt);
    if (d == null || !byDayMap.has(d)) continue;
    const b = byDayMap.get(d)!;
    b.q += 1;
    b.people.add(q.participantId);
    const cat = q.categoryId != null ? catById.get(q.categoryId) : null;
    if (!cat || isOtherSlug(cat.slug)) b.other += 1;
  }
  for (const a of answersOnCohortQ) {
    const d = dayOf(a.createdAt);
    if (d == null || !byDayMap.has(d)) continue;
    const b = byDayMap.get(d)!;
    b.a += 1;
    if (cohortSet.has(a.participantId)) b.people.add(a.participantId);
  }

  // date labels from calendar if possible
  if (startDate && !Number.isNaN(startDate.getTime())) {
    for (let d = 1; d <= 8; d++) {
      const base = new Date(startDate.getTime() + (d - 1) * 86_400_000);
      const parts = getMoscowParts(base);
      const [, mo, dd] = parts.dateKey.split('-');
      byDayMap.get(d)!.dateLabel = `${dd}.${mo}`;
    }
  }

  const byDay = [1, 2, 3, 4, 5, 6, 7, 8]
    .filter(d => d <= currentDay)
    .map(d => {
      const b = byDayMap.get(d)!;
      return {
        day: d,
        date: b.dateLabel,
        q: b.q,
        a: b.a,
        other: b.q ? round1((b.other / b.q) * 100) : 0,
        people: b.people.size,
      };
    });

  const todayBucket = byDayMap.get(day) ?? byDayMap.get(currentDay)!;
  const peakAnswers = Math.max(0, ...byDay.map(d => d.a));
  const todayOtherPct = todayBucket.q
    ? round1((todayBucket.other / todayBucket.q) * 100)
    : 0;

  // Categories
  const catCounts = new Map<string, { key: string; name: string; n: number; sys: boolean }>();
  let legacyOther = 0;
  for (const q of questions) {
    const cat = q.categoryId != null ? catById.get(q.categoryId) : null;
    const key = cat?.slug || 'other';
    const name = cat
      ? (isOtherSlug(cat.slug) ? 'Другое — не размечено' : cat.title)
      : 'Другое — не размечено';
    const sys = !cat || Boolean(cat.isSystem);
    if (!catCounts.has(key)) catCounts.set(key, { key, name, n: 0, sys });
    catCounts.get(key)!.n += 1;
    if (isOtherSlug(key)) legacyOther += 1;
  }
  const catsAll = [...catCounts.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ru'));
  const catsLive = catsAll.filter(c => !isOtherSlug(c.key));

  // Roles / concentration among answerers in cohort
  const ansCountByPid = new Map<number, number>();
  for (const a of answersOnCohortQ) {
    if (!cohortSet.has(a.participantId)) continue;
    ansCountByPid.set(a.participantId, (ansCountByPid.get(a.participantId) || 0) + 1);
  }
  const ansCounts = [...ansCountByPid.values()];
  const ladderMap = Object.fromEntries(ANSWER_LADDER.map(n => [n, 0])) as Record<string, number>;
  for (const c of ansCounts) ladderMap[answerLadderBucket(c)] += 1;
  const ladder = ANSWER_LADDER.map(name => ({ name, n: ladderMap[name] }));
  const conc = {
    answerers: ansCounts.length,
    top10: topShareCounts(ansCounts, 10),
    top20: topShareCounts(ansCounts, 20),
    one: ansCounts.filter(c => c === 1).length,
    max: ansCounts.length ? Math.max(...ansCounts) : 0,
    median: Math.round(median(ansCounts)),
  };

  // Length
  const lenMap = Object.fromEntries(LEN_BINS.map(n => [n, 0])) as Record<string, number>;
  for (const a of answersOnCohortQ) {
    lenMap[lenBin((a.text || '').trim().length)] += 1;
  }
  const lenBins = LEN_BINS.map(name => ({ name, n: lenMap[name] }));
  const shortN = lenMap['меньше 20 знаков'];
  const shortPct = answersOnCohortQ.length
    ? round1((shortN / answersOnCohortQ.length) * 100)
    : 0;

  // Directions n≥40 registered
  const dirReg = new Map<string, number>();
  for (const p of registeredRows) {
    const dir = (p.direction || '—').trim() || '—';
    dirReg.set(dir, (dirReg.get(dir) || 0) + 1);
  }
  const dirPeople = new Map<string, Set<number>>();
  const dirQ = new Map<string, number>();
  const dirA = new Map<string, number>();
  for (const q of questions) {
    const dir = cohortById.get(q.participantId)?.direction || '—';
    if (!dirPeople.has(dir)) dirPeople.set(dir, new Set());
    dirPeople.get(dir)!.add(q.participantId);
    dirQ.set(dir, (dirQ.get(dir) || 0) + 1);
  }
  for (const a of answersOnCohortQ) {
    if (!cohortSet.has(a.participantId)) continue;
    const dir = cohortById.get(a.participantId)?.direction || '—';
    if (!dirPeople.has(dir)) dirPeople.set(dir, new Set());
    dirPeople.get(dir)!.add(a.participantId);
    dirA.set(dir, (dirA.get(dir) || 0) + 1);
  }
  const dirs = [...dirReg.entries()]
    .filter(([, reg]) => reg >= 40)
    .map(([dir, reg]) => {
      const people = dirPeople.get(dir)?.size ?? 0;
      return {
        dir,
        reg,
        people,
        cov: round1((people / Math.max(1, reg)) * 100),
        q: dirQ.get(dir) || 0,
        a: dirA.get(dir) || 0,
      };
    })
    .sort((a, b) => b.cov - a.cov || a.dir.localeCompare(b.dir, 'ru'));

  // Hours
  const hourMap = new Map<number, { q: number; a: number }>();
  for (let h = 0; h < 24; h++) hourMap.set(h, { q: 0, a: 0 });
  for (const q of questions) {
    if (!q.createdAt) continue;
    hourMap.get(mskHour(q.createdAt))!.q += 1;
  }
  for (const a of answersOnCohortQ) {
    if (!a.createdAt) continue;
    hourMap.get(mskHour(a.createdAt))!.a += 1;
  }
  const hours = [...hourMap.entries()]
    .map(([h, v]) => ({ h, q: v.q, a: v.a }))
    .filter(h => h.q + h.a > 0);

  // Experience discrepancy
  const scoreRows = cohortIds.length
    ? await db.select({
      id: participants.id,
      experiencePoints: participants.experiencePoints,
    }).from(participants).where(inArray(participants.id, cohortIds))
    : [];
  const expNonZero = scoreRows.filter(r => (r.experiencePoints ?? 0) > 0).length;

  const daySeries = [1, 2, 3, 4, 5, 6, 7, 8].map(d => {
    if (d > currentDay) return { day: d, q: null as number | null, a: null as number | null };
    const b = byDayMap.get(d)!;
    return { day: d, q: b.q, a: b.a };
  });

  const peakDay = byDay.reduce((best, d) => (d.a > (best?.a ?? -1) ? d : best), byDay[0] ?? null);

  return {
    filters,
    currentForumDay: currentDay,
    meta: {
      day,
      questions: questions.length,
      answers: answersOnCohortQ.length,
      people: peopleSet.size,
      registered,
      perQ,
      askers: askers.size,
      answerers: answerers.size,
      both,
      legacy: legacyOther,
      rejected: rejectedN,
      shortAns: shortPct,
      coveragePct: round1((peopleSet.size / Math.max(1, registered)) * 100),
      todayAnswers: todayBucket.a,
      peakAnswers,
      todayOtherPct,
      unanswered,
      unansweredPct,
      medFirstReplyMin,
      approved: approvedQ.length,
      expNonZero,
      now: new Date().toISOString(),
    },
    byDay,
    cats: catsAll,
    catsLive,
    dirs,
    conc,
    ladder,
    lenBins,
    hours,
    daySeries,
    gaps: [
      {
        title: unansweredPct > 0
          ? `${unansweredPct}% вопросов без ответа`
          : 'Вопросы без ответа',
        text: approvedQ.length
          ? `Среди ${approvedQ.length} одобренных без отклика — ${unanswered}. Это главная метрика здоровья: вопрос без ответа бьёт по автору сильнее всего.`
          : 'Пока нет одобренных вопросов для расчёта.',
        tone: unansweredPct >= 25 ? 'bad' : 'warn',
      },
      {
        title: 'Время до первого ответа',
        text: medFirstReplyMin != null
          ? `Медиана — ${medFirstReplyMin} мин. Считается по связи answer.questionId → вопрос.`
          : 'Пока нет пар вопрос→ответ для расчёта.',
        tone: 'ok',
      },
      {
        title: 'Статус только у вопросов',
        text: 'У ответов нет moderationStatus в модели — модерация ответов не предусмотрена. Если понадобится — это отдельное поле.',
        tone: 'warn',
      },
      {
        title: 'Расхождение с баллами «Опыт»',
        text: `Ненулевой «Опыт» у ${expNonZero} человек, в модуле отметились ${peopleSet.size}. Баллы могут начисляться не только за обмен — стоит сверить правила.`,
        tone: 'warn',
      },
    ],
    peakLabel: peakDay ? `${peakDay.date} · ${peakDay.a} отв.` : null,
    exportPath: '/exports/exchange?format=xlsx',
  };
}
