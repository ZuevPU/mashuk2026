import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Tab } from '../../tabs';

export type DashboardId =
  | 'pulse'
  | 'portrait'
  | 'program'
  | 'activity'
  | 'piggybank'
  | 'semantic'
  | 'clubs'
  | 'departure'
  | 'overview'
  | 'roles';

export type InsightsMeta = {
  currentForumDay?: number;
  forumDays?: { day: number; label: string; calendarDate: string | null }[];
  refreshMs?: number;
  semanticV2?: boolean;
  filters?: { directions: string[]; groups: string[]; roles: string[] };
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
  activeDashboardId: DashboardId;
  setActiveDashboardId: (id: DashboardId) => void;
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

function readStored(): { forumDay: string; direction: string; group: string; dash: DashboardId } {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { forumDay: '1', direction: '', group: '', dash: 'pulse' };
    const p = JSON.parse(raw);
    return {
      forumDay: String(p.forumDay ?? '1'),
      direction: String(p.direction ?? ''),
      group: String(p.group ?? ''),
      dash: (p.dash as DashboardId) || 'pulse',
    };
  } catch {
    return { forumDay: '1', direction: '', group: '', dash: 'pulse' };
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
  const [forumDay, setForumDayState] = useState(stored.forumDay);
  const [direction, setDirectionState] = useState(stored.direction);
  const [group, setGroupState] = useState(stored.group);
  const [activeDashboardId, setActiveDashboardIdState] = useState<DashboardId>(stored.dash);
  const [meta, setMeta] = useState<InsightsMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);

  const persist = useCallback((patch: Partial<{ forumDay: string; direction: string; group: string; dash: DashboardId }>) => {
    const next = {
      forumDay,
      direction,
      group,
      dash: activeDashboardId,
      ...patch,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [forumDay, direction, group, activeDashboardId]);

  const setForumDay = (d: string) => { setForumDayState(d); persist({ forumDay: d }); };
  const setDirection = (v: string) => { setDirectionState(v); persist({ direction: v }); };
  const setGroup = (v: string) => { setGroupState(v); persist({ group: v }); };
  const setActiveDashboardId = (id: DashboardId) => {
    setActiveDashboardIdState(id);
    persist({ dash: id });
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
    if (!analyticsDashboardAllowlist.includes(activeDashboardId)) {
      setActiveDashboardIdState(analyticsDashboardAllowlist[0] as DashboardId);
    }
  }, [analyticsDashboardAllowlist, activeDashboardId]);

  useEffect(() => {
    if (meta?.currentForumDay && forumDay === '1' && stored.forumDay === '1') {
      setForumDayState(String(meta.currentForumDay));
    }
  }, [meta?.currentForumDay, forumDay, stored.forumDay]);

  const value = useMemo(() => ({
    forumDay,
    setForumDay,
    direction,
    setDirection,
    group,
    setGroup,
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
    forumDay, direction, group, activeDashboardId, meta, metaLoading, reloadMeta,
    setTab, activeSection, adminFetch, analyticsDashboardAllowlist,
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
