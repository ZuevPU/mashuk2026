import type { AdminRequest } from '../../middlewares/adminAuth.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { buildKindDashboard } from './questionKindDashboard.js';

export async function buildStateCheckDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  return buildKindDashboard('state_check', filters, req);
}
