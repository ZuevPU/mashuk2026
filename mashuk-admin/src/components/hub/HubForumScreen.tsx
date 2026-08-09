import { useEffect, useMemo, useState } from 'react';
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
import { RoleDirectionHeatmap } from './RoleDirectionHeatmap';
import { TouchpointSlotChart } from './TouchpointSlotChart';
import { PiggybankDirectionMatrix } from './PiggybankDirectionMatrix';
import { downloadAllHubExports, downloadHubExport, forumExportItems } from './hubExports';
import { hubFilterParams } from './hubQuery';
import type { HubLens } from './HubTab';

type DaySeriesRow = {
  day: number;
  active?: number;
  coveragePct?: number;
  eveningCompleted?: number;
  touchpoints?: number;
  answers?: number;
};

function deltaTone(delta: number | null): 'up' | 'down' | 'flat' {
  if (delta == null || delta === 0) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

function formatDelta(delta: number | null, suffix = ''): string | undefined {
  if (delta == null) return undefined;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta}${suffix} к пред. дню`;
}

/**
 * Линза «Форум» — грузит GET /analytics/hub/forum и собирает блоки один раз.
 */
export function HubForumScreen({
  onLensChange,
}: {
  onLensChange: (lens: HubLens) => void;
}) {
  const {
    adminFetch, forumDay, setDirection, setGroup, setTab, meta, ageCategory, activity,
  } = useInsights();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = hubFilterParams({
      mode: 'day',
      forumDay,
      ageCategory,
      activity,
    });
    adminFetch(`/analytics/hub/forum?${params.toString()}`)
      .then(res => setData(res))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [adminFetch, forumDay, ageCategory, activity]);

  const daySeries = (data?.daySeries ?? data?.pulse?.activity?.daySeries ?? []) as DaySeriesRow[];
  const selectedDay = Number(forumDay) || meta?.currentForumDay || 1;

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

  if (loading && !data) {
    return <DashCard title="Форум"><p className="adm-muted" style={{ margin: 0 }}>Загрузка…</p></DashCard>;
  }
  if (!data) {
    return <DashCard title="Форум"><p className="adm-muted" style={{ margin: 0 }}>Нет данных для этого среза.</p></DashCard>;
  }

  const kpi = data.kpi ?? {};
  const pulse = data.pulse?.emotionalPulse ?? {};
  const exports = forumExportItems(String(selectedDay));
  const openDirection = (direction: string) => {
    setDirection(direction);
    setGroup('');
    onLensChange('direction');
  };

  return (
    <div className="adm-dash-stack">
      <DashScreenTitle
        title="Штаб · Форум"
        hint={`День ${selectedDay} из 8 · общая сводка без дублей 14 панелей`}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
        {exports.map(item => (
          <button
            key={item.id}
            type="button"
            className="adm-btn adm-btn-secondary adm-btn-sm"
            onClick={() => { void downloadHubExport(item); }}
          >
            Скачать · {item.label}
          </button>
        ))}
        <button
          type="button"
          className="adm-btn adm-btn-primary adm-btn-sm"
          onClick={() => { void downloadAllHubExports(exports); }}
        >
          Выгрузить всё
        </button>
      </div>

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
            label: 'активны сегодня',
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

      <SectionLabel>Эмоции и энергия</SectionLabel>
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
      {(pulse.emotions ?? []).length > 0 && (
        <DashCard title="11 эмоций">
          <SrcBars items={(pulse.emotions as { label: string; count: number; pct: number }[]).map(d => ({
            label: `${d.label} (${d.pct}%) · ${d.count}`,
            count: d.count,
          }))} />
        </DashCard>
      )}
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
      <DashGrid cols={2}>
        <DirectionEnergyCompareChart byDirectionDay={pulse.energyByDirectionDay} />
        <DirectionRadarCompare rows={data.directionMetrics} />
      </DashGrid>
      <StateReasonsByDirectionTable
        rows={data.pulse?.stateReasons?.byDirection}
        directions={(data.byDirection ?? []).map((r: { direction: string }) => r.direction)}
        onOpenDirection={openDirection}
      />
      <RoleDirectionHeatmap
        data={data.roleDirectionMatrix}
        onOpenDirection={openDirection}
      />

      <SectionLabel>Точки дня · охват</SectionLabel>
      <TouchpointSlotChart
        data={data.touchpointSlotCoverage ?? data.pulse?.activity?.touchpointSlotCoverage}
      />
      <TouchpointCoveragePanel data={data.touchpointThreshold ?? data.pulse?.activity?.touchpointThreshold} />

      <DayComparisonPanel
        title="Динамика по дням · форум"
        series={daySeries}
        byDirectionDaySeries={data.byDirectionDaySeries ?? data.pulse?.activity?.byDirectionDaySeries}
        metrics={PULSE_DAY_METRICS}
      />

      <SectionLabel>Обмен опытом</SectionLabel>
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

      <SectionLabel>Сигналы</SectionLabel>
      <SignalsTable
        rows={data.byDirection ?? data.pulse?.activity?.completionByDirection}
        onOpenDirection={openDirection}
      />

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

      <SectionLabel>Итоговая анкета · сводка</SectionLabel>
      <EveningScaleAverages
        compact
        rows={data.evening?.scaleAverages}
        overallAvg={data.evening?.scaleOverallAvg}
        byDay={data.evening?.scaleByDay}
        byDirectionDay={data.evening?.scaleByDirectionDay}
      />
      <PracticeRecommendNpsTable
        data={data.evening?.practiceRecommendNps}
        title="Готов ли рекомендовать эту практику коллегам?"
      />

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

      <SectionLabel>Копилка · сводка</SectionLabel>
      {(data.piggybank?.topThemes ?? []).length > 0 && (
        <DashCard title="Топ тем копилки">
          <TagPills items={(data.piggybank.topThemes as { token: string; count: number }[]).map(t => ({
            label: `${t.token} · ${t.count}`,
          }))} />
        </DashCard>
      )}
      <PiggybankDirectionMatrix />
    </div>
  );
}
