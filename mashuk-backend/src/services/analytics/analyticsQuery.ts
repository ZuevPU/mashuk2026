import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { resolveAdminShiftId } from '../shiftService.js';

export type AnalyticsViewMode = 'today' | 'day' | 'shift' | 'compare';

export type AnalyticsFilters = {
  mode: AnalyticsViewMode;
  day: number | null;
  compareDays: number[];
  direction: string | null;
  group: string | null;
  roleKey: string | null;
  participantId: number | null;
  tag: string | null;
  source: string | null;
  clubId: string | null;
  ageCategory: string | null;
  activity: string | null;
  page: number;
  limit: number;
  /** Active admin shift; set by resolveAnalyticsFilters */
  shiftId: number | null;
};

function parseDays(raw: unknown): number[] {
  if (raw == null || raw === '') return [];
  const arr = Array.isArray(raw) ? raw : String(raw).split(',');
  return arr.map(d => Number(d)).filter(n => n >= 1 && n <= 8);
}

export function parseAnalyticsQuery(req: AdminRequest): AnalyticsFilters {
  const hasExplicitMode = req.query.mode != null && String(req.query.mode).trim() !== '';
  const modeRaw = String(req.query.mode || 'day').toLowerCase();
  let mode: AnalyticsViewMode =
    modeRaw === 'day' || modeRaw === 'shift' || modeRaw === 'compare' || modeRaw === 'today'
      ? (modeRaw as AnalyticsViewMode)
      : 'day';

  const dayRaw = req.query.day != null && req.query.day !== '' ? Number(req.query.day) : null;
  const day = dayRaw != null && !Number.isNaN(dayRaw) && dayRaw >= 1 ? dayRaw : null;
  const compareDays = parseDays(req.query.days ?? req.query['days[]']);

  // If client sent day=N without mode, treat as single-day slice (not live «today»).
  if (!hasExplicitMode && day != null) mode = 'day';

  return {
    mode,
    day,
    compareDays,
    direction: typeof req.query.direction === 'string' && req.query.direction.trim()
      ? req.query.direction.trim() : null,
    group: typeof req.query.group === 'string' && req.query.group.trim()
      ? req.query.group.trim() : null,
    roleKey: typeof req.query.roleKey === 'string' && req.query.roleKey.trim()
      ? req.query.roleKey.trim() : null,
    participantId: req.query.participantId ? Number(req.query.participantId) : null,
    tag: typeof req.query.tag === 'string' ? req.query.tag : null,
    source: typeof req.query.source === 'string' ? req.query.source : null,
    clubId: typeof req.query.clubId === 'string' && req.query.clubId.trim()
      ? req.query.clubId.trim() : null,
    ageCategory: typeof req.query.ageCategory === 'string' && req.query.ageCategory.trim()
      ? req.query.ageCategory.trim() : null,
    activity: typeof req.query.activity === 'string' && req.query.activity.trim()
      ? req.query.activity.trim() : null,
    page: Math.max(1, Number(req.query.page) || 1),
    limit: Math.min(200, Math.max(10, Number(req.query.limit) || 50)),
    shiftId: null,
  };
}

/** Parse query filters and bind the active admin shift. */
export async function resolveAnalyticsFilters(req: AdminRequest): Promise<AnalyticsFilters> {
  const filters = parseAnalyticsQuery(req);
  filters.shiftId = await resolveAdminShiftId(req);
  return filters;
}

export function resolveDayRange(
  filters: AnalyticsFilters,
  currentForumDay: number,
  totalDays = 8,
): number[] {
  const span = Math.min(8, Math.max(1, totalDays || 8));
  const allShiftDays = () => Array.from({ length: span }, (_, i) => i + 1);

  if (filters.mode === 'compare' && filters.compareDays.length) {
    return filters.compareDays.slice(0, 3);
  }
  if (filters.mode === 'shift') {
    return allShiftDays();
  }
  // Explicit day from UI/export always wins (including day=1).
  if (filters.day != null && filters.day >= 1) {
    return [filters.day];
  }
  if (filters.mode === 'today' || filters.mode === 'day') {
    const live = currentForumDay >= 1 ? currentForumDay : 1;
    return [live];
  }
  return allShiftDays();
}
