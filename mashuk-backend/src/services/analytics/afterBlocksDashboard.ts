import type { AdminRequest } from '../../middlewares/adminAuth.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { buildKindDashboard } from './questionKindDashboard.js';

export async function buildAfterBlocksDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  return buildKindDashboard('after_blocks', filters, req);
}
