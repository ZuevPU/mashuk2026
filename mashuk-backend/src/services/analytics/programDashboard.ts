import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { eventAttendance, events, materials, participantDayState } from '../../db/schema.js';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { EVENING_SCALE_KEYS } from '../touchpointTemplates.js';
import { materialIncludedInAnalytics } from '../publishStatus.js';
import { loadCohortParticipants } from './cohort.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { resolveDayRange } from './analyticsQuery.js';
import { getForumSettings } from '../helpers.js';
import { topReasonTokens } from './zoneDistribution.js';

const SCALE_LABELS: Record<string, string> = {
  direction: 'Направление',
  lessonsImportant: 'Уроки о важном',
  openLessons: 'Открытые уроки',
  morningHealth: 'Утренняя программа',
  workshops: 'Практики',
  eveningAtmosphere: 'Вечерняя программа',
  food: 'Питание',
  housing: 'Проживание',
  curator: 'Куратор',
};

export async function buildProgramDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  const settings = await getForumSettings();
  const days = resolveDayRange(filters, settings.currentDay ?? 1);
  const cohort = await loadCohortParticipants(filters, req);
  const ids = new Set(cohort.map(p => p.id));

  const states = (await db.select().from(participantDayState))
    .filter(s => ids.has(s.participantId) && days.includes(s.dayNumber));

  function scaleBlock(keys: string[]) {
    const sums: Record<string, { sum: number; n: number }> = {};
    for (const key of keys) sums[key] = { sum: 0, n: 0 };
    for (const st of states) {
      const ratings = st.eveningRatings as Record<string, unknown> | null;
      if (!ratings) continue;
      for (const key of keys) {
        const v = ratings[key];
        if (typeof v === 'number' && v >= 1 && v <= 5) {
          sums[key].sum += v;
          sums[key].n += 1;
        }
      }
    }
    return keys.map(key => ({
      key,
      label: SCALE_LABELS[key] || key,
      avg: sums[key].n ? Math.round((sums[key].sum / sums[key].n) * 10) / 10 : 0,
      responses: sums[key].n,
    }));
  }

  const directionBlock = scaleBlock(['direction']);
  const lessonsImportant = scaleBlock(['lessonsImportant']);
  const openLessons = scaleBlock(['openLessons']);
  const workshops = scaleBlock(['workshops']);

  const attendance = await db.select().from(eventAttendance);
  const programEvents = await db.select().from(events);
  const attendanceByEvent = new Map<number, number>();
  for (const a of attendance) {
    if (!ids.has(a.participantId)) continue;
    attendanceByEvent.set(a.eventId, (attendanceByEvent.get(a.eventId) || 0) + 1);
  }

  const eventsRanked = programEvents
    .map(e => ({
      id: e.id,
      title: e.title,
      dayNumber: e.dayNumber,
      tags: Array.isArray(e.tags) ? (e.tags as string[]) : [],
      attendance: attendanceByEvent.get(e.id) || 0,
    }))
    .sort((a, b) => b.attendance - a.attendance);

  const clubTags = ['клуб', 'club', 'budushchee', 'единство'];
  const clubs = eventsRanked.filter(e => e.tags.some(t => clubTags.some(c => t.toLowerCase().includes(c))));

  const eveningTexts: string[] = [];
  for (const st of states) {
    const ratings = st.eveningRatings as Record<string, unknown> | null;
    const fav = ratings?.favoriteEvent ?? ratings?.bestToday;
    if (typeof fav === 'string' && fav.trim()) eveningTexts.push(fav.trim());
  }

  const mentionCounts = topReasonTokens(eveningTexts, 30);
  const mentionMap = new Map(mentionCounts.map(m => [m.token.toLowerCase(), m.count]));

  const divergenceHighAttLowRating = eventsRanked
    .filter(e => e.attendance > 0)
    .map(e => {
      const ratingProxy = workshops.find(w => w.responses > 0)?.avg ?? 0;
      return {
        eventId: e.id,
        title: e.title,
        attendance: e.attendance,
        ratingProxy,
        flagHighRatingLowAttendance: e.attendance < 5 && ratingProxy >= 4,
      };
    })
    .filter(x => x.flagHighRatingLowAttendance)
    .slice(0, 10);

  const divergencePopularLowRating = eventsRanked
    .map(e => {
      const titleTokens = e.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      let mentions = 0;
      for (const t of titleTokens) mentions += mentionMap.get(t) || 0;
      const ratingProxy = workshops.find(w => w.responses > 0)?.avg ?? 0;
      return {
        eventId: e.id,
        title: e.title,
        attendance: e.attendance,
        mentionScore: mentions,
        avgRating: ratingProxy,
        flagPopularLowRating: mentions >= 3 && ratingProxy > 0 && ratingProxy < 3.5,
        flagHighRatingLowAttendance: e.attendance < 5 && ratingProxy >= 4,
      };
    })
    .filter(x => x.flagPopularLowRating || x.flagHighRatingLowAttendance)
    .slice(0, 15);

  const shiftPracticeRank = eventsRanked
    .filter(e => e.tags.some(t => t.toLowerCase().includes('практ') || t.toLowerCase().includes('workshop')))
    .slice(0, 20);

  type PracticeAgg = { n: number; sum: number; promoters: number; detractors: number };
  const byPractice = new Map<string, PracticeAgg>();
  for (const st of states) {
    const ratings = st.eveningRatings as Record<string, unknown> | null;
    if (!ratings || ratings.practiceYes !== true) continue;
    const score = ratings.recommendScore;
    if (typeof score !== 'number' || score < 1 || score > 10) continue;
    const name = typeof ratings.practiceName === 'string' && ratings.practiceName.trim()
      ? ratings.practiceName.trim()
      : 'Практика (без названия)';
    const agg = byPractice.get(name) ?? { n: 0, sum: 0, promoters: 0, detractors: 0 };
    agg.n += 1;
    agg.sum += score;
    if (score >= 9) agg.promoters += 1;
    else if (score <= 6) agg.detractors += 1;
    byPractice.set(name, agg);
  }
  const practiceNps = [...byPractice.entries()]
    .map(([practice, agg]) => ({
      practice,
      responses: agg.n,
      avgScore: agg.n ? Math.round((agg.sum / agg.n) * 10) / 10 : 0,
      nps: agg.n ? Math.round(((agg.promoters - agg.detractors) / agg.n) * 100) : 0,
      promoters: agg.promoters,
      detractors: agg.detractors,
    }))
    .sort((a, b) => b.responses - a.responses);

  const allMats = (await db.select().from(materials)).filter(m => materialIncludedInAnalytics(m));

  return {
    filters,
    blocks: {
      direction: directionBlock,
      lessonsImportant,
      openLessons,
      clubs: clubs.slice(0, 10),
      workshops,
      materialsPublished: allMats.length,
      materialsList: allMats.slice(0, 30).map(m => ({ id: m.id, title: m.title })),
    },
    dayEvents: {
      topMentions: mentionCounts.slice(0, 15),
      topEvents: eventsRanked.slice(0, 15),
      llmReflectionMentionsDeferred: 'Неспровоцированные упоминания в рефлексиях — отложено (LLM)',
    },
    divergence: divergenceHighAttLowRating,
    divergenceExtended: divergencePopularLowRating,
    practicesByDay: days.map(day => ({
      day,
      top: eventsRanked.filter(e => e.dayNumber === day).slice(0, 5),
    })),
    practicesShiftRank: shiftPracticeRank,
    nps: {
      available: practiceNps.length > 0,
      note: practiceNps.length > 0
        ? 'NPS по шкале 1–10 из вечерней анкеты (recommendScore): промоутеры 9–10, детракторы 1–6.'
        : 'NPS по практикам появится после ответов «Готов рекомендовать» + оценка практики в итогах дня.',
      byPractice: practiceNps,
    },
  };
}
