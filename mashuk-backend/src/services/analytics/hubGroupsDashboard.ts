import { asc, eq } from 'drizzle-orm';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { db } from '../../db/index.js';
import { directions, participantGroups } from '../../db/schema.js';
import { getForumSettings } from '../helpers.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { loadCohortParticipants } from './cohort.js';
import { buildEveningDaySeries, forumSeriesDays } from './dayComparison.js';
import { buildTouchpointSlotCoverageByGroup } from './touchpointMetrics.js';

function pct(n: number, d: number): number {
  return d ? Math.round((n / d) * 1000) / 10 : 0;
}

function groupOf(p: { groupName?: string | null }): string {
  return (p.groupName || 'без группы').trim() || 'без группы';
}

/**
 * Линза «Группы» для вкладки «Штаб».
 * Основная таблица: группа × итоговая анкета по дням (сдано / всего).
 */
export async function buildHubGroupsDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  // Все группы в срезе; фильтр направления / возраста / деятельности сохраняем.
  const groupFilters: AnalyticsFilters = { ...filters, group: null };

  const settings = await getForumSettings();
  const currentForumDay = settings.currentDay ?? 1;
  // Итоговая анкета — дни 1–7; день 8 = точка Б.
  const days = forumSeriesDays(Math.min(currentForumDay, 7));

  const cohort = await loadCohortParticipants(groupFilters, req);
  const registeredPeople = cohort.filter(p => p.onboardingCompletedAt);
  const registered = registeredPeople.length;

  const selectedDayRaw = filters.day ?? currentForumDay;
  const selectedDay = Math.min(Math.max(1, selectedDayRaw), 7);
  const touchpointDay = selectedDay;

  const [{ daySeries, byGroupDaySeries }, touchpointByGroup] = await Promise.all([
    buildEveningDaySeries(cohort, days),
    buildTouchpointSlotCoverageByGroup(cohort, touchpointDay, groupFilters.shiftId),
  ]);

  const touchpointByGroupMap = new Map(
    touchpointByGroup.byGroup.map(row => [row.group, row]),
  );

  const byGroupMap = new Map<string, {
    group: string;
    direction: string;
    total: number;
    registered: number;
    byDay: Map<number, number>;
  }>();

  for (const p of cohort) {
    const g = groupOf(p);
    if (!byGroupMap.has(g)) {
      byGroupMap.set(g, {
        group: g,
        direction: (p.direction || '—').trim() || '—',
        total: 0,
        registered: 0,
        byDay: new Map(days.map(d => [d, 0])),
      });
    }
    const row = byGroupMap.get(g)!;
    row.total += 1;
    if (p.onboardingCompletedAt) row.registered += 1;
    const dir = (p.direction || '—').trim() || '—';
    if (row.direction !== dir && row.direction !== '—' && dir !== '—') {
      row.direction = 'несколько';
    } else if (row.direction === '—' && dir !== '—') {
      row.direction = dir;
    }
  }

  for (const point of byGroupDaySeries) {
    if (!byGroupMap.has(point.group)) {
      byGroupMap.set(point.group, {
        group: point.group,
        direction: '—',
        total: 0,
        registered: point.registered,
        byDay: new Map(days.map(d => [d, 0])),
      });
    }
    byGroupMap.get(point.group)!.byDay.set(point.day, point.submitted);
  }

  // Каталог групп смены — чтобы пустые группы тоже были в таблице.
  if (groupFilters.shiftId != null) {
    const catalog = await db.select({
      name: participantGroups.name,
      directionName: directions.name,
    })
      .from(participantGroups)
      .leftJoin(directions, eq(participantGroups.directionId, directions.id))
      .where(eq(participantGroups.shiftId, groupFilters.shiftId))
      .orderBy(asc(participantGroups.id));

    for (const g of catalog) {
      const name = (g.name || '').trim();
      if (!name) continue;
      if (groupFilters.direction && (!g.directionName || g.directionName !== groupFilters.direction)) {
        continue;
      }
      if (!byGroupMap.has(name)) {
        byGroupMap.set(name, {
          group: name,
          direction: (g.directionName || '—').trim() || '—',
          total: 0,
          registered: 0,
          byDay: new Map(days.map(d => [d, 0])),
        });
      } else if (byGroupMap.get(name)!.direction === '—' && g.directionName) {
        byGroupMap.get(name)!.direction = g.directionName;
      }
    }
  }

  const todaySeries = daySeries.find(r => r.day === selectedDay) ?? daySeries[daySeries.length - 1];

  const emptyTouchpointSlots = touchpointByGroup.slotsMeta.map(meta => ({
    index: meta.index,
    title: meta.title,
    shortLabel: meta.shortLabel,
    completed: 0,
    coveragePct: 0,
  }));

  const byGroup = [...byGroupMap.values()]
    .map(row => {
      const eveningByDay = days.map(day => ({
        day,
        submitted: row.byDay.get(day) ?? 0,
        fillRatePct: pct(row.byDay.get(day) ?? 0, row.registered),
      }));
      const selectedSubmitted = row.byDay.get(selectedDay) ?? 0;
      const tp = touchpointByGroupMap.get(row.group);
      const touchpointSlots = tp
        ? tp.slots.map(s => ({
          index: s.index,
          title: s.title,
          shortLabel: s.shortLabel,
          completed: s.completed,
          coveragePct: s.coveragePct,
        }))
        : emptyTouchpointSlots;
      return {
        group: row.group,
        direction: row.direction,
        total: row.total,
        registered: row.registered,
        eveningByDay,
        selectedDaySubmitted: selectedSubmitted,
        selectedDayFillPct: pct(selectedSubmitted, row.registered),
        touchpointSlots,
      };
    })
    .sort((a, b) =>
      a.direction.localeCompare(b.direction, 'ru')
      || a.group.localeCompare(b.group, 'ru'));

  const groupsWithPeople = byGroup.filter(g => g.total > 0).length;
  const groupsFullToday = byGroup.filter(
    g => g.registered > 0 && g.selectedDaySubmitted >= g.registered,
  ).length;

  const touchpointTotals = touchpointByGroup.slotsMeta.map(meta => {
    let completed = 0;
    let denom = 0;
    for (const row of byGroup) {
      const slot = row.touchpointSlots.find(s => s.index === meta.index);
      completed += slot?.completed ?? 0;
      denom += row.registered;
    }
    return {
      index: meta.index,
      title: meta.title,
      shortLabel: meta.shortLabel,
      completed,
      coveragePct: pct(completed, denom),
    };
  });

  return {
    filters: groupFilters,
    currentForumDay,
    selectedDay,
    touchpointDay,
    days,
    touchpointSlotsMeta: touchpointByGroup.slotsMeta,
    slotsTotal: touchpointByGroup.slotsTotal,
    kpi: {
      groupsCount: byGroup.length,
      groupsWithPeople,
      registered,
      cohortSize: cohort.length,
      eveningSubmitted: todaySeries?.submitted ?? 0,
      eveningFillPct: todaySeries?.fillRatePct ?? 0,
      eveningDrafts: todaySeries?.drafts ?? 0,
      groupsFullToday,
    },
    byGroup,
    touchpointTotals,
    daySeries,
  };
}
