import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { medals, participants, pointsLog, taskSubmissions, tasks, userMedals } from '../../db/schema.js';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import {
  computeLeaderboardScores,
  computeNominationLeaderboard,
  computeMedalCountLeaderboard,
  NOMINATION_LABELS,
  NOMINATION_LEADERBOARD_KEYS,
} from '../leaderboardService.js';
import { FORUM_RATING_MAX_DAY } from '../leaderboardQuery.js';
import { getForumSettings } from '../helpers.js';
import { loadCohortParticipants } from './cohort.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { resolveDayRange } from './analyticsQuery.js';
import { activityByDaySeries } from './touchpointMetrics.js';

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function buildActivityDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  const settings = await getForumSettings();
  const days = resolveDayRange(filters, settings.currentDay ?? 1);
  const cohort = await loadCohortParticipants(filters, req);
  const ids = cohort.map(p => p.id);

  let allP = cohort.length ? cohort : await db.select().from(participants).where(isNull(participants.selfDeletedAt));
  allP = allP.filter(p => (p.direction || '').toLowerCase() !== 'организатор форума');
  const allIds = allP.map(p => p.id);

  const day = filters.day ?? settings.currentDay ?? 1;
  const pathScores = await computeLeaderboardScores(allIds, { scope: 'shift', track: 'path' });
  const expScores = await computeLeaderboardScores(allIds, { scope: 'shift', track: 'experience' });
  const totalScores = await computeLeaderboardScores(allIds, { scope: 'shift', track: 'total' });
  const dayTotal = await computeLeaderboardScores(allIds, { scope: 'day', day, track: 'total' });

  function rankList(scores: Map<number, number>) {
    return allP
      .map(p => ({ id: p.id, name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(), direction: p.direction, points: scores.get(p.id) ?? 0 }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 25)
      .map((r, i) => ({ rank: i + 1, ...r }));
  }

  const subs = await db.select({ s: taskSubmissions, t: tasks })
    .from(taskSubmissions)
    .leftJoin(tasks, eq(taskSubmissions.taskId, tasks.id));
  const cohortSet = new Set(ids.length ? ids : allIds);
  const filteredSubs = subs.filter(r => cohortSet.has(r.s.participantId));

  const taskCounts = new Map<number, number>();
  for (const r of filteredSubs.filter(r => r.s.status === 'approved')) {
    taskCounts.set(r.t!.id, (taskCounts.get(r.t!.id) || 0) + 1);
  }
  const popularTasks = [...taskCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([taskId, count]) => {
      const t = subs.find(r => r.t?.id === taskId)?.t;
      return { taskId, title: t?.title, category: t?.category, count };
    });

  const byCategory = new Map<string, number>();
  for (const r of filteredSubs.filter(r => r.s.status === 'approved')) {
    const c = r.t?.category || 'прочее';
    byCategory.set(c, (byCategory.get(c) || 0) + 1);
  }

  const medalRows = await db.select({ um: userMedals, m: medals, p: participants })
    .from(userMedals)
    .leftJoin(medals, eq(userMedals.medalId, medals.id))
    .leftJoin(participants, eq(userMedals.participantId, participants.id));

  const medalsList = medalRows
    .filter(r => cohortSet.has(r.um.participantId))
    .map(r => ({
      participantId: r.um.participantId,
      name: `${r.p?.firstName ?? ''} ${r.p?.lastName ?? ''}`.trim(),
      medal: r.m?.name,
      level: r.m?.level,
      hidden: r.m?.visibility === 'hidden',
      awardedAt: r.um.awardedAt,
    }));

  const medalsOpen = medalsList.filter(m => !m.hidden);
  const medalsHidden = medalsList.filter(m => m.hidden);

  const dirMap = new Map<string, typeof allP>();
  for (const p of allP) {
    const d = p.direction || '—';
    if (!dirMap.has(d)) dirMap.set(d, []);
    dirMap.get(d)!.push(p);
  }
  const ratingsByDirection: { direction: string; top: ReturnType<typeof rankList> }[] = [];
  for (const [direction, list] of dirMap) {
    const subIds = new Set(list.map(p => p.id));
    const subScores = new Map<number, number>();
    for (const [pid, pts] of totalScores) {
      if (subIds.has(pid)) subScores.set(pid, pts);
    }
    ratingsByDirection.push({
      direction,
      top: list
        .map(p => ({ id: p.id, name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(), direction: p.direction, points: subScores.get(p.id) ?? 0 }))
        .sort((a, b) => b.points - a.points)
        .slice(0, 5)
        .map((r, i) => ({ rank: i + 1, ...r })),
    });
  }

  const tasksByDay = days.map(d => ({
    day: d,
    approved: filteredSubs.filter(r => {
      if (r.s.status !== 'approved') return false;
      const dn = r.t?.dayNumber;
      const dns = Array.isArray(r.t?.dayNumbers) ? (r.t!.dayNumbers as number[]) : [];
      return dn === d || dns.includes(d);
    }).length,
  }));

  const cohortIds = ids.length ? ids : allIds;
  const todayStart = startOfTodayUtc();
  const approvedSubs = filteredSubs.filter(r => r.s.status === 'approved');
  const rejectedSubs = filteredSubs.filter(r => r.s.status === 'rejected');
  const pendingSubs = filteredSubs.filter(r => r.s.status === 'pending' || r.s.status === 'pending_team');
  const moderatedTotal = approvedSubs.length + rejectedSubs.length;

  const pointsByDayRows = cohortIds.length
    ? await db.select({
      forumDay: pointsLog.forumDay,
      total: sql<number>`coalesce(sum(${pointsLog.points}), 0)::int`,
      activeParticipants: sql<number>`count(distinct ${pointsLog.participantId})::int`,
    }).from(pointsLog).where(and(
      inArray(pointsLog.participantId, cohortIds),
      isNull(pointsLog.revokedAt),
      sql`${pointsLog.points} > 0`,
      sql`${pointsLog.forumDay} IS NOT NULL`,
    )).groupBy(pointsLog.forumDay)
    : [];
  const pointsByDayMap = new Map(pointsByDayRows.map(r => [r.forumDay!, r]));
  const pointsByDay = days.map(d => ({
    day: d,
    points: pointsByDayMap.get(d)?.total ?? 0,
    activeParticipants: pointsByDayMap.get(d)?.activeParticipants ?? 0,
  }));

  const pointsByNomination = await Promise.all(
    NOMINATION_LEADERBOARD_KEYS.map(async key => {
      const scores = await computeNominationLeaderboard(key, cohortIds, { scope: 'shift' });
      const total = [...scores.values()].reduce((s, v) => s + v, 0);
      return { key, label: NOMINATION_LABELS[key] ?? key, points: total };
    }),
  );

  const taskStats = new Map<number, { approved: number; rejected: number; pending: number; title?: string; category?: string | null }>();
  for (const r of filteredSubs) {
    const tid = r.t?.id;
    if (!tid) continue;
    if (!taskStats.has(tid)) {
      taskStats.set(tid, { approved: 0, rejected: 0, pending: 0, title: r.t?.title, category: r.t?.category });
    }
    const st = taskStats.get(tid)!;
    if (r.s.status === 'approved') st.approved += 1;
    else if (r.s.status === 'rejected') st.rejected += 1;
    else if (r.s.status === 'pending' || r.s.status === 'pending_team') st.pending += 1;
  }
  const hardestTasks = [...taskStats.entries()]
    .map(([taskId, st]) => {
      const decided = st.approved + st.rejected;
      return {
        taskId,
        title: st.title,
        category: st.category,
        approved: st.approved,
        rejected: st.rejected,
        totalSubmissions: decided + st.pending,
        approvalRate: decided > 0 ? Math.round((st.approved / decided) * 1000) / 10 : null,
      };
    })
    .sort((a, b) => a.approved - b.approved || (a.approvalRate ?? 100) - (b.approvalRate ?? 100))
    .slice(0, 15);

  const activitySeries = await activityByDaySeries(cohortIds, days.length > 1 ? days : [1, 2, 3, 4, 5, 6]);
  const engagementSeries = days.map(d => {
    const pts = pointsByDay.find(p => p.day === d);
    const act = activitySeries.find(a => a.day === d);
    const taskDone = tasksByDay.find(t => t.day === d);
    return {
      day: d,
      points: pts?.points ?? 0,
      activeParticipants: pts?.activeParticipants ?? 0,
      answers: act?.answers ?? 0,
      touchpoints: act?.touchpoints ?? 0,
      taskCompletions: taskDone?.approved ?? 0,
    };
  });

  const nominationRatings = await Promise.all(
    NOMINATION_LEADERBOARD_KEYS.map(async key => {
      const scores = await computeNominationLeaderboard(key, cohortIds, {
        scope: filters.day ? 'day' : 'shift',
        day: filters.day ?? day,
      });
      const top = allP
        .map(p => ({ id: p.id, name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(), direction: p.direction, points: scores.get(p.id) ?? 0 }))
        .filter(r => r.points > 0)
        .sort((a, b) => b.points - a.points)
        .slice(0, 10)
        .map((r, i) => ({ rank: i + 1, ...r }));
      return { key, label: NOMINATION_LABELS[key] ?? key, top };
    }),
  );

  const medalDayScores = await computeMedalCountLeaderboard(cohortIds, {
    scope: 'day',
    day: filters.day ?? day,
  });
  const medalsDayTop = allP
    .map(p => ({ id: p.id, name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(), direction: p.direction, points: medalDayScores.get(p.id) ?? 0 }))
    .filter(r => r.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 10)
    .map((r, i) => ({ rank: i + 1, ...r }));

  const medalShiftScores = await computeMedalCountLeaderboard(cohortIds, {
    scope: 'shift',
  });
  const medalsShiftTop = allP
    .map(p => ({ id: p.id, name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(), direction: p.direction, points: medalShiftScores.get(p.id) ?? 0 }))
    .filter(r => r.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 10)
    .map((r, i) => ({ rank: i + 1, ...r }));

  return {
    filters,
    days,
    participants: {
      total: allP.length,
      registered: allP.filter(p => p.onboardingCompletedAt).length,
      activeToday: allP.filter(p => p.lastActiveAt && p.lastActiveAt >= todayStart).length,
      completedAtLeastOneTask: new Set(approvedSubs.map(r => r.s.participantId)).size,
    },
    pointsByDay,
    pointsByNomination,
    engagementSeries,
    moderation: {
      approved: approvedSubs.length,
      rejected: rejectedSubs.length,
      pending: pendingSubs.length,
      rejectedPercent: moderatedTotal > 0 ? Math.round((rejectedSubs.length / moderatedTotal) * 1000) / 10 : 0,
    },
    ratings: {
      path: rankList(pathScores),
      experience: rankList(expScores),
      total: rankList(totalScores),
      day: rankList(dayTotal),
      byDirection: ratingsByDirection,
      nominations: nominationRatings.filter(n => n.top.length > 0),
      medalsDay: medalsDayTop,
      medalsShift: medalsShiftTop,
      forumDays: FORUM_RATING_MAX_DAY,
    },
    tasks: {
      popular: popularTasks,
      hardest: hardestTasks,
      byCategory: [...byCategory.entries()].map(([category, count]) => ({ category, count })),
      pendingModeration: filteredSubs.filter(r => r.s.status === 'pending').length,
      pendingTeam: filteredSubs.filter(r => r.s.status === 'pending_team').length,
      byDay: tasksByDay,
    },
    medals: medalsList.slice(0, 100),
    medalsSummary: { open: medalsOpen.length, hidden: medalsHidden.length },
  };
}
