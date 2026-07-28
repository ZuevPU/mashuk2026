import { eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { medals, participants, taskSubmissions, tasks, userMedals } from '../../db/schema.js';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { computeLeaderboardScores } from '../leaderboardService.js';
import { getForumSettings } from '../helpers.js';
import { loadCohortParticipants } from './cohort.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { resolveDayRange } from './analyticsQuery.js';

export async function buildActivityDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  const settings = await getForumSettings();
  const days = resolveDayRange(filters, settings.currentDay ?? 1);
  const cohort = await loadCohortParticipants(filters, req);
  const ids = cohort.map(p => p.id);

  const allP = cohort.length ? cohort : await db.select().from(participants).where(isNull(participants.selfDeletedAt));
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

  return {
    filters,
    days,
    ratings: {
      path: rankList(pathScores),
      experience: rankList(expScores),
      total: rankList(totalScores),
      day: rankList(dayTotal),
    },
    tasks: {
      popular: popularTasks,
      byCategory: [...byCategory.entries()].map(([category, count]) => ({ category, count })),
      pendingModeration: filteredSubs.filter(r => r.s.status === 'pending').length,
      pendingTeam: filteredSubs.filter(r => r.s.status === 'pending_team').length,
    },
    medals: medalsList.slice(0, 100),
  };
}
