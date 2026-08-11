import type { AdminRequest } from '../../middlewares/adminAuth.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { buildKindDashboard, type KindDashboardOptions } from './questionKindDashboard.js';

export async function buildStateCheckDashboard(
  filters: AnalyticsFilters,
  req?: AdminRequest,
  opts?: KindDashboardOptions,
) {
  return buildKindDashboard('state_check', filters, req, opts);
}
