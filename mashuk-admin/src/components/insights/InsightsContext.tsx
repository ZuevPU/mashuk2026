import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Tab } from '../../tabs';

export type DashboardId =
  | 'pulse'
  | 'direction'
  | 'evening'
  | 'after-blocks'
  | 'participant-profile'
  | 'portrait'
  | 'program'
  | 'activity'
  | 'piggybank'
  | 'semantic'
  | 'clubs'
  | 'departure'
  | 'overview'
  | 'roles';

/** Старый id «state-checks» слит в «pulse». */
function normalizeDashboardId(id: string | undefined | null): DashboardId {
  if (id === 'state-checks') return 'pulse';
  const allowed: DashboardId[] = [
    'pulse', 'direction', 'evening', 'after-blocks', 'participant-profile', 'portrait', 'program',
    'activity', 'piggybank', 'semantic', 'clubs', 'departure', 'overview', 'roles',
  ];
  if (id && (allowed as string[]).includes(id)) return id as DashboardId;
  return 'overview';
}

export type InsightsMeta = {
  currentForumDay?: number;
  forumDays?: { day: number; label: string; calendarDate: string | null }[];
  refreshMs?: number;
  semanticV2?: boolean;
  filters?: {
    directions: string[];
    groups: string[];
    roles: string[];
    ageCategories?: { id: string; label: string }[];
    activities?: string[];
  };
  roleTaxonomy?: { matrix?: unknown; catalog?: { roleKey: string; name: string }[] };
  dashboardCatalog?: {
    id: string;
    label: string;
    minForumDay: number;
    availabilityTier: string;
    path?: string;
    kind?: string;
    requiresV2?: boolean;
  }[];
};

type InsightsContextValue = {
  forumDay: string;
  setForumDay: (d: string) => void;
  direction: string;
  setDirection: (v: string) => void;
  group: string;
  setGroup: (v: string) => void;
  ageCategory: string;
  setAgeCategory: (v: string) => void;
  activity: string;
  setActivity: (v: string) => void;
  activeDashboardId: DashboardId;
  setActiveDashboardId: (id: DashboardId | string) => void;
  meta: InsightsMeta | null;
  metaLoading: boolean;
  reloadMeta: () => void;
  setTab: (t: Tab) => void;
  activeSection: 'analytics' | 'exports';
  adminFetch: (path: string, init?: RequestInit) => Promise<unknown>;
  analyticsDashboardAllowlist?: string[] | null;
};

const STORAGE_KEY = 'mashuk_insights_filters';

const InsightsContext = createContext<InsightsContextValue | null>(null);

type StoredFilters = {
  forumDay: string;
  direction: string;
  group: string;
  ageCategory: string;
  activity: string;
  dash: DashboardId;
};

const DEFAULT_FILTERS: StoredFilters = {
  forumDay: '1',
  direction: '',
  group: '',
  ageCategory: '',
  activity: '',
  dash: 'overview',
};

/** null = no session prefs yet (auto-pick current forum day once meta loads). */
function readStored(): StoredFilters | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return {
      forumDay: String(p.forumDay ?? '1'),
      direction: String(p.direction ?? ''),
      group: String(p.group ?? ''),
      ageCategory: String(p.ageCategory ?? ''),
      activity: String(p.activity ?? ''),
      dash: normalizeDashboardId(p.dash),
    };
  } catch {
    return null;
  }
}

export function InsightsProvider({
  children,
  adminFetch,
  setTab,
  reloadKey,
  activeSection,
  analyticsDashboardAllowlist = null,
}: {
  children: ReactNode;
  adminFetch: (path: string, init?: RequestInit) => Promise<unknown>;
  setTab: (t: Tab) => void;
  reloadKey: number;
  activeSection: 'analytics' | 'exports';
  analyticsDashboardAllowlist?: string[] | null;
}) {
  const stored = useMemo(() => readStored(), []);
  const initial = stored ?? DEFAULT_FILTERS;
  const [forumDay, setForumDayState] = useState(initial.forumDay);
  const [direction, setDirectionState] = useState(initial.direction);
  const [group, setGroupState] = useState(initial.group);
  const [ageCategory, setAgeCategoryState] = useState(initial.ageCategory);
  const [activity, setActivityState] = useState(initial.activity);
  const [activeDashboardId, setActiveDashboardIdState] = useState<DashboardId>(
    normalizeDashboardId(initial.dash),
  );
  const [meta, setMeta] = useState<InsightsMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  /**
   * Auto-jump to live forum day only on first visit (no session prefs).
   * Once the user picks a day (including day 1), never override it.
   */
  const pendingAutoForumDay = useRef(stored == null);
  const userPickedDay = useRef(false);

  const persist = useCallback((patch: Partial<{
    forumDay: string; direction: string; group: string; ageCategory: string; activity: string; dash: DashboardId;
  }>) => {
    const next = {
      forumDay,
      direction,
      group,
      ageCategory,
      activity,
      dash: activeDashboardId,
      ...patch,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [forumDay, direction, group, ageCategory, activity, activeDashboardId]);

  const setForumDay = useCallback((d: string) => {
    userPickedDay.current = true;
    pendingAutoForumDay.current = false;
    setForumDayState(d);
    persist({ forumDay: d });
  }, [persist]);
  const setDirection = (v: string) => { setDirectionState(v); persist({ direction: v }); };
  const setGroup = (v: string) => { setGroupState(v); persist({ group: v }); };
  const setAgeCategory = (v: string) => { setAgeCategoryState(v); persist({ ageCategory: v }); };
  const setActivity = (v: string) => { setActivityState(v); persist({ activity: v }); };
  const setActiveDashboardId = (id: DashboardId | string) => {
    const next = normalizeDashboardId(id);
    setActiveDashboardIdState(next);
    persist({ dash: next });
    setTab('analytics');
  };

  const reloadMeta = useCallback(() => {
    setMetaLoading(true);
    adminFetch('/analytics/meta')
      .then(m => setMeta(m as InsightsMeta))
      .catch(() => undefined)
      .finally(() => setMetaLoading(false));
  }, [adminFetch]);

  useEffect(() => { reloadMeta(); }, [reloadMeta, reloadKey]);

  useEffect(() => {
    if (!analyticsDashboardAllowlist?.length) return;
    const list = analyticsDashboardAllowlist
      .map(normalizeDashboardId)
      .filter((id, i, arr) => arr.indexOf(id) === i);
    if (!list.includes(activeDashboardId)) {
      setActiveDashboardIdState(list[0] ?? 'overview');
    }
  }, [analyticsDashboardAllowlist, activeDashboardId]);

  useEffect(() => {
    if (userPickedDay.current || !pendingAutoForumDay.current) return;
    const live = meta?.currentForumDay;
    if (live == null || !Number.isFinite(live) || live < 1) return;
    pendingAutoForumDay.current = false;
    const d = String(live);
    setForumDayState(d);
    persist({ forumDay: d });
  }, [meta?.currentForumDay, persist]);

  const value = useMemo(() => ({
    forumDay,
    setForumDay,
    direction,
    setDirection,
    group,
    setGroup,
    ageCategory,
    setAgeCategory,
    activity,
    setActivity,
    activeDashboardId,
    setActiveDashboardId,
    meta,
    metaLoading,
    reloadMeta,
    setTab,
    activeSection,
    adminFetch,
    analyticsDashboardAllowlist,
  }), [
    forumDay, setForumDay, direction, group, ageCategory, activity, activeDashboardId, meta, metaLoading,
    reloadMeta, setTab, activeSection, adminFetch, analyticsDashboardAllowlist,
  ]);

  return <InsightsContext.Provider value={value}>{children}</InsightsContext.Provider>;
}

export function useInsights(): InsightsContextValue {
  const ctx = useContext(InsightsContext);
  if (!ctx) throw new Error('useInsights requires InsightsProvider');
  return ctx;
}

export function useInsightsOptional(): InsightsContextValue | null {
  return useContext(InsightsContext);
}
