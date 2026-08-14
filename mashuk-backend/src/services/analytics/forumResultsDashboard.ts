import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { collectForumWrapExportRows } from '../exports/forumWrapExportData.js';
import { getForumSettings } from '../helpers.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { loadCohortParticipants } from './cohort.js';
import { assembleHubResultsFromRows } from './dayResultsDashboard.js';

/**
 * Итоги форума — те же агрегаты, что «Итоги дня», по ответам итоговой анкеты форума.
 */
export async function buildForumResultsDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  const settings = await getForumSettings(filters.shiftId);
  const currentDay = settings.currentDay ?? 1;
  const cohort = await loadCohortParticipants(filters, req);
  const { rows, fields } = await collectForumWrapExportRows({
    shiftId: filters.shiftId,
    direction: filters.direction ?? undefined,
    group: filters.group ?? undefined,
    ageCategory: filters.ageCategory ?? undefined,
    activityQ: filters.activity ?? undefined,
    includeDrafts: true,
  });

  return assembleHubResultsFromRows({
    filters,
    settings,
    currentDay,
    dayFilter: null,
    cohort,
    rows,
    fields,
    diagnostics: { notes: [] },
    fetchAllDaysForSeries: false,
    skipDaySeries: true,
    directionDays: [{ day: 1, label: 'Форум' }],
    exportPath: null,
  });
}
