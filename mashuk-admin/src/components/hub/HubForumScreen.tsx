import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { Tab } from '../../tabs';
import { useInsights } from '../insights/InsightsContext';
import {
  DashCard,
  DashGrid,
  DashScreenTitle,
  SectionLabel,
  SrcBars,
  TagPills,
  ZoneBars,
  dashVal,
} from '../analytics/dashboardUi';
import {
  ChartTooltipRu,
  ZONE_COLORS,
  ZONE_ORDER,
  formatForumDay,
  formatZoneName,
  zonesByDayRows,
} from '../analytics/chartRu';
import { DayComparisonPanel, PULSE_DAY_METRICS } from '../analytics/DayComparisonPanel';
import { EnergyAverages } from '../analytics/EnergyAverages';
import { EveningScaleAverages } from '../analytics/EveningScaleAverages';
import { PracticeRecommendNpsTable } from '../analytics/PracticeRecommendNpsTable';
import { GoalProgressByDirectionChart } from './GoalProgressByDirectionChart';
import { GoalRestateDay5Panel } from './GoalRestateDay5Panel';
import { ExchangeAnalyticsPanel } from '../analytics/ExchangeAnalyticsPanel';
import { TouchpointCoveragePanel } from '../analytics/TouchpointCoveragePanel';
import { HubKpiRow } from './HubKpiRow';
import { SignalsTable } from './SignalsTable';
import { DirectionEmotionPulseChart } from './DirectionEmotionPulseChart';
import { DirectionZonePhaseTable } from './DirectionZonePhaseTable';
import { PhaseEmotionPulseChart } from './PhaseEmotionPulseChart';
import { DirectionEnergyCompareChart } from './DirectionEnergyCompareChart';
import { DirectionEmotionEnergyBlock } from './DirectionEmotionEnergyBlock';
import { DirectionRadarCompare } from './DirectionRadarCompare';
import { StateReasonsByDirectionTable } from './StateReasonsByDirectionTable';
import { HubRoleDynamics } from './HubRoleDynamics';
import { HubRoleExperimentDigest } from './HubRoleExperimentDigest';
import { RoleDirectionHeatmap } from './RoleDirectionHeatmap';
import { TouchpointDirectionSlotChart, TouchpointSlotChart } from './TouchpointSlotChart';
import { PiggybankDirectionMatrix } from './PiggybankDirectionMatrix';
import { HubEmotionsDayChart } from './HubEmotionsDayChart';
import { DeferMount } from './DeferMount';
import { HubLensLayout, type HubNavItem } from './HubSideNav';
import { downloadHubExport, forumExportItems, forumPackExportItem } from './hubExports';
import {
  hubDisplayDay,
  hubFilterParams,
  isAllForumDay,
} from './hubQuery';
import type { HubLens } from './hubLenses';

const FORUM_NAV: HubNavItem[] = [
  { id: 'forum-overview', label: 'Обзор' },
  { id: 'forum-directions', label: 'Направления' },
  { id: 'forum-emotions', label: 'Эмоции' },
  { id: 'forum-energy', label: 'Энергия' },
  { id: 'forum-roles', label: 'Роли' },
  { id: 'forum-touchpoints', label: 'Точки дня' },
  { id: 'forum-exchange', label: 'Обмен' },
  { id: 'forum-signals', label: 'Сигналы' },
  { id: 'forum-community', label: 'Сообщество' },
  { id: 'forum-evening', label: 'Анкета' },
  { id: 'forum-after', label: 'После блоков' },
  { id: 'forum-piggybank', label: 'Копилка' },
];

type DaySeriesRow = {
  day: number;
  active?: number;
  coveragePct?: number;
  eveningCompleted?: number;
  touchpoints?: number;
  answers?: number;
};

/** v6: TTL + лимит ключей, чтобы localStorage не раздувался */
const FORUM_CACHE_PREFIX = 'mashuk_hub_forum_v7:';
const FORUM_CACHE_ANY = 'mashuk_hub_forum_';
const FORUM_CACHE_TTL_MS = 5 * 60 * 1000;
const FORUM_CACHE_MAX_KEYS = 8;

type ForumCacheEntry = {
  updatedAt: string;
  data: unknown;
};

function forumCacheKey(
  day: string,
  ageCategory: string,
  activity: string,
  direction: string,
  group: string,
): string {
  return `${FORUM_CACHE_PREFIX}${day}|${ageCategory || ''}|${activity || ''}|${direction || ''}|${group || ''}`;
}

function pruneForumCache(keepKey?: string) {
  try {
    const now = Date.now();
    const kept: { key: string; at: number }[] = [];
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith(FORUM_CACHE_ANY)) continue;
      if (!key.startsWith(FORUM_CACHE_PREFIX)) {
        localStorage.removeItem(key);
        continue;
      }
      if (key === keepKey) continue;
      let at = 0;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || '') as ForumCacheEntry;
        at = parsed?.updatedAt ? Date.parse(parsed.updatedAt) : 0;
      } catch {
        at = 0;
      }
      if (!at || now - at > FORUM_CACHE_TTL_MS) {
        localStorage.removeItem(key);
        continue;
      }
      kept.push({ key, at });
    }
    kept.sort((a, b) => a.at - b.at);
    const maxOthers = Math.max(0, FORUM_CACHE_MAX_KEYS - (keepKey ? 1 : 0));
    while (kept.length > maxOthers) {
      const drop = kept.shift();
      if (drop) localStorage.removeItem(drop.key);
    }
  } catch {
    /* quota / private mode */
  }
}

function readForumCache(key: string): ForumCacheEntry | null {
  pruneForumCache(key);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ForumCacheEntry;
    if (!parsed?.updatedAt || parsed.data == null) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeForumCache(key: string, data: unknown): string {
  const updatedAt = new Date().toISOString();
  pruneForumCache(key);
  try {
    localStorage.setItem(key, JSON.stringify({ updatedAt, data }));
  } catch {
    pruneForumCache();
    try {
      localStorage.setItem(key, JSON.stringify({ updatedAt, data }));
    } catch {
      /* quota / private mode */
    }
  }
  return updatedAt;
}

function formatUpdatedAtRu(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Moscow',
    });
  } catch {
    return iso;
  }
}

function deltaTone(delta: number | null): 'up' | 'down' | 'flat' {
  if (delta == null || delta === 0) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

function formatDelta(delta: number | null, suffix = ''): string | undefined {
  if (delta == null) return undefined;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta}${suffix} к пред. дню`;
}

const FORUM_POLL_MS = 60_000;

/**
 * Линза «Форум» — автозагрузка при открытии / смене дня и опрос раз в минуту.
 */
export function HubForumScreen({
  onLensChange,
}: {
  onLensChange: (lens: HubLens) => void;
}) {
  const {
    adminFetch, forumDay, setDirection, setGroup, setTab, meta, ageCategory, activity,
    direction, group,
  } = useInsights();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadGen = useRef(0);
  const dataRef = useRef<unknown>(null);

  const allForum = isAllForumDay(forumDay);
  const selectedDay = hubDisplayDay(forumDay, meta?.currentForumDay || 1);
  const cacheKey = forumCacheKey(
    allForum ? 'all' : String(selectedDay),
    ageCategory || '',
    activity || '',
    direction || '',
    group || '',
  );

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    const gen = ++loadGen.current;
    const silent = Boolean(opts?.silent && dataRef.current);
    if (!silent) setLoading(true);
    setLoadError(null);
    const params = hubFilterParams({
      mode: 'day',
      forumDay,
      direction,
      group,
      ageCategory,
      activity,
    });
    const qs = params.toString();
    try {
      const res = await adminFetch(`/analytics/hub/forum?${qs}`) as Record<string, unknown>;
      if (gen !== loadGen.current) return;
      dataRef.current = res;
      setData(res);
      const ts = writeForumCache(cacheKey, res);
      setUpdatedAt(ts);
      setLoading(false);
      try {
        const extras = await adminFetch(`/analytics/hub/forum-extras?${qs}`) as Record<string, unknown>;
        if (gen !== loadGen.current) return;
        const merged = {
          ...res,
          touchpointThreshold: extras.touchpointThreshold ?? null,
          touchpointSlotCoverage: extras.touchpointSlotCoverage ?? null,
          roleDirectionMatrix: extras.roleDirectionMatrix ?? null,
          roleDynamics: extras.roleDynamics ?? null,
          exchange: extras.exchange ?? res.exchange ?? null,
        };
        dataRef.current = merged;
        setData(merged);
        writeForumCache(cacheKey, merged);
      } catch {
        /* extras optional */
      }
    } catch {
      if (gen !== loadGen.current) return;
      setLoadError('Не удалось загрузить данные. Сервер перегружен или таймаут — обновится автоматически.');
      setLoading(false);
    }
  }, [adminFetch, forumDay, direction, group, ageCategory, activity, cacheKey]);

  useEffect(() => {
    const cached = readForumCache(cacheKey);
    if (cached) {
      dataRef.current = cached.data;
      setData(cached.data);
      setUpdatedAt(cached.updatedAt);
      setLoadError(null);
    } else {
      dataRef.current = null;
      setData(null);
      setUpdatedAt(null);
    }
    void refresh({ silent: true });

    const poll = () => {
      if (document.hidden) return;
      void refresh({ silent: true });
    };
    const timer = window.setInterval(poll, FORUM_POLL_MS);
    const onVis = () => {
      if (!document.hidden) void refresh({ silent: true });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
      loadGen.current += 1;
    };
  }, [cacheKey, refresh]);

  const daySeries = (data?.daySeries ?? data?.pulse?.activity?.daySeries ?? []) as DaySeriesRow[];

  const deltas = useMemo(() => {
    const cur = daySeries.find(r => r.day === selectedDay);
    const prev = daySeries.find(r => r.day === selectedDay - 1);
    if (!cur || !prev) {
      return { active: null as number | null, coverage: null as number | null };
    }
    return {
      active: (cur.active ?? 0) - (prev.active ?? 0),
      coverage: Math.round(((cur.coveragePct ?? 0) - (prev.coveragePct ?? 0)) * 10) / 10,
    };
  }, [daySeries, selectedDay]);

  const energyByDay = (data?.pulse?.emotionalPulse?.energyByDay ?? []) as {
    day: number; avg: number | null; responses: number;
  }[];
  const energyDelta = useMemo(() => {
    const cur = energyByDay.find(r => r.day === selectedDay);
    const prev = energyByDay.find(r => r.day === selectedDay - 1);
    if (cur?.avg == null || prev?.avg == null) return null;
    return Math.round((cur.avg - prev.avg) * 10) / 10;
  }, [energyByDay, selectedDay]);

  const zoneDayRows = useMemo(
    () => zonesByDayRows(data?.pulse?.emotionalPulse?.byDay ?? data?.pulse?.emotionalPulse?.compareZones),
    [data],
  );

  const qaByDay = useMemo(() => {
    const byDay = (data?.exchange?.byDay ?? []) as {
      day: number; total: number; answers: number;
    }[];
    return byDay.map(row => ({
      dayLabel: formatForumDay(row.day),
      questions: row.total,
      answers: row.answers,
    }));
  }, [data]);

  const afterByEvent = (data?.afterBlocks?.byEvent ?? []) as { label: string; count: number; pct: number }[];

  const exportScope = {
    day: String(selectedDay),
    ageCategory: ageCategory || undefined,
    activity: activity || undefined,
  };
  const exports = forumExportItems(exportScope);
  const openDirection = (nextDirection: string) => {
    setDirection(nextDirection);
    setGroup('');
    onLensChange('direction');
  };

  const goalRestate = data?.evening?.goalRestateDay5 as {
    answered?: number;
    themes?: unknown[];
  } | null | undefined;
  const showGoalRestate = Boolean(goalRestate)
    && (allForum || selectedDay === 5)
    && ((goalRestate?.answered ?? 0) > 0 || (goalRestate?.themes?.length ?? 0) > 0);
  const forumNav = useMemo(() => {
    if (!showGoalRestate) return FORUM_NAV;
    const items = [...FORUM_NAV];
    const i = items.findIndex(x => x.id === 'forum-evening');
    items.splice(i >= 0 ? i + 1 : items.length, 0, { id: 'forum-goal-restate', label: 'Цель D5' });
    return items;
  }, [showGoalRestate]);

  const statusBar = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 4 }}>
      <span className="adm-muted" style={{ fontSize: 12 }}>
        {loading && !data
          ? 'Загрузка…'
          : updatedAt
            ? `Обновлено: ${formatUpdatedAtRu(updatedAt)} (МСК) · авто каждые ${FORUM_POLL_MS / 1000} с`
            : 'Загрузка…'}
      </span>
      {loading && (
        <div className="tab-loading" style={{ flex: '1 1 160px', minWidth: 120, margin: 0 }}>
          <span className="tab-loading-bar" />
        </div>
      )}
    </div>
  );

  const dayHint = allForum
    ? 'Весь форум · автообновление'
    : `День ${selectedDay} из 8 · автообновление`;
  const dayHintFull = allForum
    ? 'Весь форум · общая сводка'
    : `День ${selectedDay} из 8 · общая сводка без дублей 14 панелей`;

  if (!data) {
    return (
      <div className="adm-dash-stack">
        <DashScreenTitle
          title="Штаб · Форум"
          hint={dayHint}
        />
        {statusBar}
        <DashCard title="Форум">
          <p className="adm-muted" style={{ margin: 0 }}>
            {loadError || 'Загрузка сводки форума…'}
          </p>
        </DashCard>
      </div>
    );
  }

  const kpi = data.kpi ?? {};
  const pulse = data.pulse?.emotionalPulse ?? {};

  return (
    <HubLensLayout items={forumNav} navLabel="Разделы форума" className="adm-dash-stack">
        <DashScreenTitle
          title="Штаб · Форум"
          hint={dayHintFull}
        />

        {statusBar}
        {loadError && (
          <p className="adm-muted" style={{ margin: 0, color: '#ef4444', fontSize: 13 }}>{loadError}</p>
        )}
        {Array.isArray(data?.diagnostics?.notes) && data.diagnostics.notes.length > 0 && (
          <DashCard title="Почему пусто">
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.45 }}>
              {(data.diagnostics.notes as string[]).map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </DashCard>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
          {exports.map(item => (
            <button
              key={item.id}
              type="button"
              className="adm-btn adm-btn-secondary adm-btn-sm"
              onClick={() => {
                void downloadHubExport(item).catch((err: unknown) => {
                  window.alert(err instanceof Error ? err.message : 'Не удалось скачать файл');
                });
              }}
            >
              Скачать · {item.label}
            </button>
          ))}
          <button
            type="button"
            className="adm-btn adm-btn-primary adm-btn-sm"
            onClick={() => {
              void downloadHubExport(forumPackExportItem(exportScope)).catch((err: unknown) => {
                window.alert(err instanceof Error ? err.message : 'Не удалось скачать файл');
              });
            }}
          >
            Выгрузить всё · D{selectedDay}
          </button>
        </div>

        <section id="forum-overview" className="adm-forum-anchor">
          <HubKpiRow
            items={[
              {
                value: `${selectedDay} / 8`,
                label: 'день форума',
                sub: meta?.currentForumDay != null ? `сейчас идёт ${meta.currentForumDay}` : undefined,
                accent: 'var(--m-accent)',
              },
              {
                value: dashVal(kpi.registered),
                label: 'зарегистрировано',
              },
              {
                value: dashVal(kpi.activeToday),
                label: 'активны за день',
                trend: formatDelta(deltas.active),
                trendTone: deltaTone(deltas.active),
              },
              {
                value: kpi.touchpointCoveragePct != null ? `${kpi.touchpointCoveragePct}%` : '—',
                label: 'охват активности',
                trend: formatDelta(deltas.coverage, ' п.п.'),
                trendTone: deltaTone(deltas.coverage),
                accent: '#22c55e',
              },
              {
                value: dashVal(kpi.avgEnergy),
                label: 'средняя энергия',
                sub: 'шкала 0–10',
                trend: formatDelta(energyDelta),
                trendTone: deltaTone(energyDelta),
                accent: '#f59e0b',
              },
              {
                value: kpi.riskFatiguePct != null ? `${kpi.riskFatiguePct}%` : '—',
                label: 'риск + усталость',
                accent: '#ef4444',
              },
              {
                value: `${dashVal(kpi.eveningSubmitted)} / ${dashVal(kpi.afterBlocksSubmitted)}`,
                label: 'итоги дня / после блоков',
                sub: `охват ${kpi.eveningFillPct ?? '—'}% · ${kpi.afterBlocksFillPct ?? '—'}%`,
              },
              {
                value: dashVal(kpi.stateCheckSubmitted),
                label: 'проверка состояния',
                sub: kpi.stateCheckFillPct != null ? `охват ${kpi.stateCheckFillPct}%` : undefined,
              },
              {
                value: `${dashVal(kpi.phaseCounts?.morning)} / ${dashVal(kpi.phaseCounts?.day)} / ${dashVal(kpi.phaseCounts?.evening)}`,
                label: 'состояние утро · день · вечер',
              },
              {
                value: dashVal(kpi.zeroActivityCount),
                label: 'зарегистрированы, 0 активности',
                accent: '#ef4444',
              },
            ]}
          />
        </section>

        <section id="forum-directions" className="adm-forum-anchor">
          <SectionLabel>Направления</SectionLabel>
          <DashCard title="Сводка по направлениям">
            {(data.byDirection ?? []).length === 0 ? (
              <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Нет направлений в срезе.</p>
            ) : (
              <table className="adm-table">
                <thead>
                  <tr><th>Направление</th><th>Зарег.</th><th>Активны</th><th>%</th><th /></tr>
                </thead>
                <tbody>
                  {(data.byDirection as { direction: string; registered: number; activeParticipants: number; activityRatePct: number }[]).map(row => (
                    <tr key={row.direction}>
                      <td>{row.direction}</td>
                      <td>{row.registered}</td>
                      <td>{row.activeParticipants}</td>
                      <td>{row.activityRatePct}%</td>
                      <td>
                        <button type="button" className="adm-link" onClick={() => openDirection(row.direction)}>
                          Открыть →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </DashCard>
        </section>

        <section id="forum-emotions" className="adm-forum-anchor">
          <SectionLabel>Эмоции и энергия</SectionLabel>
          <DeferMount minHeight={720}>
          <ZoneBars title="Зоны эмоций · форум" zones={pulse.zonesPercent} />
          <DashGrid cols={3}>
            <ZoneBars title="Зоны · утро" zones={pulse.byPhase?.morning} />
            <ZoneBars title="Зоны · день" zones={pulse.byPhase?.day} />
            <ZoneBars title="Зоны · вечер" zones={pulse.byPhase?.evening} />
          </DashGrid>
          <PhaseEmotionPulseChart byPhase={pulse.byPhase} />
          <DirectionEmotionPulseChart
            byDirection={pulse.byDirection}
            byDirectionPhase={pulse.byDirectionPhase}
            onOpenDirection={openDirection}
          />
          <DirectionZonePhaseTable
            rows={pulse.byDirectionPhase}
            onOpenDirection={openDirection}
          />
          <HubEmotionsDayChart
            emotions={pulse.emotions as {
              id?: string; label: string; count: number; pct: number;
            }[] | undefined}
            emotionSeries={pulse.emotionSeries as {
              emotion: string;
              label: string;
              morningPct: number;
              dayPct: number;
              eveningPct: number;
              morningCount?: number;
              dayCount?: number;
              eveningCount?: number;
            }[] | undefined}
            emotionsForum={pulse.emotionsForum as {
              id?: string; label: string; count: number; pct: number;
            }[] | undefined}
            byDirectionPhase={pulse.byDirectionPhase}
            byDirectionPhaseForum={pulse.byDirectionPhaseForum}
            directions={(data.byDirection ?? []).map((r: { direction: string }) => r.direction)}
            directionEmotionEnergy={data.directionEmotionEnergy ?? pulse.directionEmotionEnergy}
          />
          {zoneDayRows.length > 0 && (
            <DashCard title="Динамика зон по дням">
              <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
                Каждая линия — эмоциональная зона, ось Y — доля ответов в %.
              </p>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={zoneDayRows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} />
                  <Tooltip content={<ChartTooltipRu />} />
                  <Legend />
                  {ZONE_ORDER.map(key => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={formatZoneName(key)}
                      stroke={ZONE_COLORS[key]}
                      dot={false}
                      strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </DashCard>
          )}
          </DeferMount>
        </section>

        <section id="forum-energy" className="adm-forum-anchor">
          <SectionLabel>Средняя энергия</SectionLabel>
          <DeferMount minHeight={520}>
          <EnergyAverages
            avg={pulse.avgEnergy}
            byDay={pulse.energyByDay}
            byDirectionDay={pulse.energyByDirectionDay}
            title="Средняя энергия · 0–10"
          />
          <DirectionEmotionEnergyBlock
            rows={data.directionEmotionEnergy ?? pulse.directionEmotionEnergy}
            onOpenDirection={openDirection}
          />
          <DirectionEnergyCompareChart byDirectionDay={pulse.energyByDirectionDay} />
          <DirectionRadarCompare rows={data.directionMetrics} />
          <StateReasonsByDirectionTable
            rows={data.pulse?.stateReasons?.byDirection}
            directions={(data.byDirection ?? []).map((r: { direction: string }) => r.direction)}
            onOpenDirection={openDirection}
          />
          </DeferMount>
        </section>

        <section id="forum-roles" className="adm-forum-anchor">
          <SectionLabel>Роли</SectionLabel>
          <DeferMount minHeight={720}>
          <HubRoleDynamics
            data={data.roleDynamics}
            toolbarDirection={direction || undefined}
            onOpenDirection={openDirection}
          />
          <HubRoleExperimentDigest />
          <RoleDirectionHeatmap
            data={data.roleDirectionMatrix}
            onOpenDirection={openDirection}
          />
          </DeferMount>
        </section>

        <section id="forum-touchpoints" className="adm-forum-anchor">
          <SectionLabel>Точки дня · охват</SectionLabel>
          <DeferMount minHeight={480}>
          <TouchpointSlotChart
            data={data.touchpointSlotCoverage ?? data.pulse?.activity?.touchpointSlotCoverage}
          />
          <TouchpointDirectionSlotChart
            data={data.touchpointSlotCoverage ?? data.pulse?.activity?.touchpointSlotCoverage}
          />
          <TouchpointCoveragePanel data={data.touchpointThreshold ?? data.pulse?.activity?.touchpointThreshold} />

          <DayComparisonPanel
            title="Динамика по дням · форум"
            series={daySeries}
            byDirectionDaySeries={data.byDirectionDaySeries ?? data.pulse?.activity?.byDirectionDaySeries}
            metrics={PULSE_DAY_METRICS}
          />
          </DeferMount>
        </section>

        <section id="forum-exchange" className="adm-forum-anchor">
          <SectionLabel>Обмен опытом</SectionLabel>
          <DeferMount minHeight={360}>
          {qaByDay.some(r => r.questions > 0 || r.answers > 0) && (
            <DashCard title="Вопросы и ответы по дням">
              <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
                Синяя — вопросы · бирюзовая — ответы.
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={qaByDay} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />
                  <XAxis dataKey="dayLabel" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTooltipRu />} />
                  <Legend />
                  <Line type="monotone" dataKey="questions" name="Вопросы" stroke="#2563eb" strokeWidth={2.5} dot />
                  <Line type="monotone" dataKey="answers" name="Ответы" stroke="#0A7B6F" strokeWidth={2.5} dot />
                </LineChart>
              </ResponsiveContainer>
            </DashCard>
          )}
          <ExchangeAnalyticsPanel data={data.exchange} />
          </DeferMount>
        </section>

        <section id="forum-signals" className="adm-forum-anchor">
          <SectionLabel>Сигналы</SectionLabel>
          <SignalsTable
            rows={data.byDirection ?? data.pulse?.activity?.completionByDirection}
            onOpenDirection={openDirection}
          />
        </section>

        <section id="forum-community" className="adm-forum-anchor">
          <SectionLabel>Очереди и сообщество</SectionLabel>
          <DashGrid cols={3}>
            <DashCard title="На модерации · обмен">
              <div style={{ fontSize: 28, fontWeight: 700 }}>{dashVal(data.community?.pendingExchange)}</div>
              <button type="button" className="adm-link" style={{ marginTop: 8 }} onClick={() => setTab('moderation' as Tab)}>
                Открыть →
              </button>
            </DashCard>
            <DashCard title="Обращения к дирекции">
              <div style={{ fontSize: 28, fontWeight: 700 }}>{dashVal(data.community?.orgQuestionsWaiting)}</div>
              <button type="button" className="adm-link" style={{ marginTop: 8 }} onClick={() => setTab('forum' as Tab)}>
                Открыть →
              </button>
            </DashCard>
            <DashCard title="Одобрено в ленте">
              <div style={{ fontSize: 28, fontWeight: 700 }}>{dashVal(data.community?.activeExchange)}</div>
              <button type="button" className="adm-link" style={{ marginTop: 8 }} onClick={() => setTab('moderation' as Tab)}>
                Открыть →
              </button>
            </DashCard>
          </DashGrid>
        </section>

        <section id="forum-evening" className="adm-forum-anchor">
          <SectionLabel>Итоговая анкета · сводка</SectionLabel>
          <DeferMount minHeight={360}>
          <EveningScaleAverages
            compact
            rows={data.evening?.scaleAverages}
            overallAvg={data.evening?.scaleOverallAvg}
            byDay={data.evening?.scaleByDay}
            byDirectionDay={data.evening?.scaleByDirectionDay}
          />
          <GoalProgressByDirectionChart
            data={data.evening?.goalProgressByDirection}
            onOpenDirection={openDirection}
          />
          <PracticeRecommendNpsTable
            data={data.evening?.practiceRecommendNps}
            title="Готов ли рекомендовать эту практику коллегам?"
          />
          </DeferMount>
        </section>

        {showGoalRestate && (
          <section id="forum-goal-restate" className="adm-forum-anchor">
            <SectionLabel>Уточнённая цель · день 5</SectionLabel>
            <DeferMount minHeight={420}>
              <GoalRestateDay5Panel
                data={data.evening?.goalRestateDay5}
                onOpenDirection={openDirection}
              />
            </DeferMount>
          </section>
        )}

        <section id="forum-after" className="adm-forum-anchor">
          <SectionLabel>После блоков · сводка</SectionLabel>
          <DashCard title="После блоков">
            <p style={{ margin: 0, fontSize: 13 }}>
              Ответов: <strong>{dashVal(kpi.afterBlocksSubmitted)}</strong>
              {kpi.afterBlocksFillPct != null ? ` · охват ${kpi.afterBlocksFillPct}%` : ''}
            </p>
            <p className="adm-muted" style={{ fontSize: 12, margin: '6px 0 8px' }}>
              Качественная рефлексия (свободный текст), без шкалы 1–5. Полный разбор — в линзе «Направление».
            </p>
            {afterByEvent.length > 0 && (
              <SrcBars items={afterByEvent.map(d => ({
                label: `${d.label} (${d.pct}%)`,
                count: d.count,
              }))} />
            )}
          </DashCard>
        </section>

        <section id="forum-piggybank" className="adm-forum-anchor">
          <SectionLabel>Копилка · сводка</SectionLabel>
          {(data.piggybank?.topThemes ?? []).length > 0 && (
            <DashCard title="Топ тем копилки">
              <TagPills items={(data.piggybank.topThemes as { token: string; count: number }[]).map(t => ({
                label: `${t.token} · ${t.count}`,
              }))} />
            </DashCard>
          )}
          <PiggybankDirectionMatrix />
        </section>
    </HubLensLayout>
  );
}
