import { inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { exchangeAnswers, exchangeCategories, exchangeQuestions } from '../../db/schema.js';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { getForumSettings } from '../helpers.js';
import { getCalendarForumDay } from '../timePhase.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { loadCohortParticipants } from './cohort.js';
import { forumSeriesDays } from './dayComparison.js';

type Status = 'pending' | 'approved' | 'rejected' | string;

function normStatus(s: string | null | undefined): Status {
  const v = String(s || 'pending').toLowerCase();
  if (v === 'approved' || v === 'rejected' || v === 'pending') return v;
  return v;
}

function reactionScore(reactions: unknown): { likes: number; discuss: number } {
  if (!reactions || typeof reactions !== 'object') return { likes: 0, discuss: 0 };
  const r = reactions as { likes?: number; discuss?: number };
  return {
    likes: Number(r.likes) || 0,
    discuss: Number(r.discuss) || 0,
  };
}

/**
 * Аналитика «Обмен опытом»: модерация по дням, авторы по направлениям, топ вопросов и вовлечённость.
 */
export async function buildExchangeAnalytics(filters: AnalyticsFilters, req?: AdminRequest) {
  const settings = await getForumSettings();
  const currentDay = settings.currentDay ?? 1;
  const totalDays = settings.totalDays ?? 8;
  const startDate = settings.startDate ? new Date(settings.startDate) : null;
  const days = forumSeriesDays(currentDay);
  const cohort = await loadCohortParticipants(filters, req);
  const cohortById = new Map(cohort.map(p => [p.id, p]));
  const cohortIds = new Set(cohort.map(p => p.id));

  const qRows = await db.select().from(exchangeQuestions);
  const questionsInCohort = qRows.filter(q => cohortIds.has(q.participantId));
  const qIds = questionsInCohort.map(q => q.id);

  const aRows = qIds.length
    ? await db.select().from(exchangeAnswers).where(inArray(exchangeAnswers.questionId, qIds))
    : [];

  const dayOf = (createdAt: Date | null | undefined): number | null => {
    if (!createdAt) return null;
    if (!startDate || Number.isNaN(startDate.getTime())) {
      // без startDate кладём в текущий день форума
      return currentDay;
    }
    return getCalendarForumDay(startDate, createdAt, totalDays);
  };

  const byDayMap = new Map<number, {
    total: number;
    approved: number;
    rejected: number;
    pending: number;
    answers: number;
    uniqueAskers: Set<number>;
  }>();
  for (const d of days) {
    byDayMap.set(d, {
      total: 0, approved: 0, rejected: 0, pending: 0, answers: 0, uniqueAskers: new Set(),
    });
  }

  for (const q of questionsInCohort) {
    const day = dayOf(q.createdAt);
    if (day == null || !byDayMap.has(day)) continue;
    const bucket = byDayMap.get(day)!;
    bucket.total += 1;
    bucket.uniqueAskers.add(q.participantId);
    const st = normStatus(q.moderationStatus);
    if (st === 'approved') bucket.approved += 1;
    else if (st === 'rejected') bucket.rejected += 1;
    else bucket.pending += 1;
  }

  for (const a of aRows) {
    const day = dayOf(a.createdAt);
    if (day == null || !byDayMap.has(day)) continue;
    byDayMap.get(day)!.answers += 1;
  }

  const byDay = days.map(day => {
    const b = byDayMap.get(day)!;
    return {
      day,
      total: b.total,
      approved: b.approved,
      rejected: b.rejected,
      pending: b.pending,
      answers: b.answers,
      uniqueAskers: b.uniqueAskers.size,
      approvalRatePct: b.total
        ? Math.round(((b.approved) / b.total) * 100)
        : 0,
    };
  });

  /** Уникальные авторы вопросов по направлению × день */
  const dirDayAskers = new Map<string, Set<number>>();
  const dirDayQuestions = new Map<string, number>();
  for (const q of questionsInCohort) {
    const day = dayOf(q.createdAt);
    if (day == null || !days.includes(day)) continue;
    const p = cohortById.get(q.participantId);
    const direction = (p?.direction || '—').trim() || '—';
    const key = `${direction}::${day}`;
    if (!dirDayAskers.has(key)) dirDayAskers.set(key, new Set());
    dirDayAskers.get(key)!.add(q.participantId);
    dirDayQuestions.set(key, (dirDayQuestions.get(key) || 0) + 1);
  }

  const directions = [...new Set(cohort.map(p => (p.direction || '—').trim() || '—'))].sort((a, b) =>
    a.localeCompare(b, 'ru'));
  const byDirectionDay = days.flatMap(day =>
    directions.map(direction => {
      const key = `${direction}::${day}`;
      return {
        direction,
        day,
        people: dirDayAskers.get(key)?.size ?? 0,
        questions: dirDayQuestions.get(key) ?? 0,
      };
    }),
  );

  const answersByQ = new Map<number, typeof aRows>();
  for (const a of aRows) {
    if (!answersByQ.has(a.questionId)) answersByQ.set(a.questionId, []);
    answersByQ.get(a.questionId)!.push(a);
  }

  const topQuestions = questionsInCohort
    .filter(q => normStatus(q.moderationStatus) === 'approved')
    .map(q => {
      const ans = answersByQ.get(q.id) ?? [];
      let likes = 0;
      let discuss = 0;
      let replies = 0;
      for (const a of ans) {
        const r = reactionScore(a.reactions);
        likes += r.likes;
        discuss += r.discuss;
        if (a.parentAnswerId != null) replies += 1;
      }
      const answerCount = ans.length;
      const score = answerCount * 3 + likes + discuss * 2 + replies;
      const author = cohortById.get(q.participantId);
      return {
        id: q.id,
        text: (q.text || '').slice(0, 220),
        direction: (author?.direction || '—').trim() || '—',
        authorName: [author?.lastName, author?.firstName].filter(Boolean).join(' ') || `#${q.participantId}`,
        answerCount,
        likes,
        discuss,
        replies,
        score,
        audience: q.audience || 'all',
        createdAt: q.createdAt?.toISOString() ?? null,
        day: dayOf(q.createdAt),
      };
    })
    .sort((a, b) => b.score - a.score || b.answerCount - a.answerCount)
    .slice(0, 10);

  const askerCounts = new Map<number, number>();
  const answererCounts = new Map<number, number>();
  for (const q of questionsInCohort) {
    if (normStatus(q.moderationStatus) !== 'approved') continue;
    askerCounts.set(q.participantId, (askerCounts.get(q.participantId) || 0) + 1);
  }
  for (const a of aRows) {
    answererCounts.set(a.participantId, (answererCounts.get(a.participantId) || 0) + 1);
  }

  const mapPeople = (m: Map<number, number>, limit: number) =>
    [...m.entries()]
      .map(([id, count]) => {
        const p = cohortById.get(id);
        return {
          id,
          name: [p?.lastName, p?.firstName].filter(Boolean).join(' ') || `#${id}`,
          direction: (p?.direction || '—').trim() || '—',
          count,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

  const audienceMix = new Map<string, number>();
  for (const q of questionsInCohort) {
    const key = (q.audience || 'all').trim() || 'all';
    audienceMix.set(key, (audienceMix.get(key) || 0) + 1);
  }

  const total = questionsInCohort.length;
  const approved = questionsInCohort.filter(q => normStatus(q.moderationStatus) === 'approved').length;
  const rejected = questionsInCohort.filter(q => normStatus(q.moderationStatus) === 'rejected').length;
  const pending = questionsInCohort.filter(q => normStatus(q.moderationStatus) === 'pending').length;
  const answerCount = aRows.length;
  const uniqueAskers = new Set(questionsInCohort.map(q => q.participantId)).size;
  const uniqueAnswerers = new Set(aRows.map(a => a.participantId)).size;
  let approvedAnswerSum = 0;
  for (const q of questionsInCohort) {
    if (normStatus(q.moderationStatus) !== 'approved') continue;
    approvedAnswerSum += (answersByQ.get(q.id) ?? []).length;
  }
  const avgAnswersPerApproved = approved
    ? Math.round((approvedAnswerSum / approved) * 10) / 10
    : 0;

  const cats = await db.select().from(exchangeCategories);
  const catById = new Map(cats.map(c => [c.id, c]));
  const byCategoryMap = new Map<string, number>();
  let otherCount = 0;
  for (const q of questionsInCohort) {
    const cat = q.categoryId != null ? catById.get(q.categoryId) : null;
    const key = cat ? `${cat.emoji || ''} ${cat.title}`.trim() : 'Без рубрики';
    byCategoryMap.set(key, (byCategoryMap.get(key) || 0) + 1);
    if (cat?.slug === 'other') otherCount += 1;
  }
  const byCategory = [...byCategoryMap.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  const otherSharePct = total ? Math.round((otherCount / total) * 1000) / 10 : 0;

  return {
    kpi: {
      total,
      approved,
      rejected,
      pending,
      answers: answerCount,
      uniqueAskers,
      uniqueAnswerers,
      approvalRatePct: total ? Math.round((approved / total) * 100) : 0,
      rejectRatePct: total ? Math.round((rejected / total) * 100) : 0,
      avgAnswersPerApproved,
      otherCount,
      otherSharePct,
    },
    byDay,
    byDirectionDay,
    byCategory,
    topQuestions,
    topAskers: mapPeople(askerCounts, 8),
    topAnswerers: mapPeople(answererCounts, 8),
    audienceMix: [...audienceMix.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    answersByDay: byDay.map(d => ({ day: d.day, answers: d.answers })),
  };
}
