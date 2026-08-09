import { Fragment, useEffect, useMemo, useState } from 'react';
import { useInsights } from '../insights/InsightsContext';
import {
  DashCard,
  DashScreenTitle,
  SectionLabel,
  dashVal,
} from '../analytics/dashboardUi';
import { HubKpiRow } from './HubKpiRow';
import { hubFilterParams } from './hubQuery';
import type { HubLens } from './HubTab';

type EveningDayCell = {
  day: number;
  submitted: number;
  fillRatePct: number;
};

type TouchpointSlotCell = {
  index: number;
  title: string;
  shortLabel: string;
  completed: number;
  coveragePct: number;
};

type GroupRow = {
  group: string;
  direction: string;
  total: number;
  registered: number;
  eveningByDay: EveningDayCell[];
  selectedDaySubmitted: number;
  selectedDayFillPct: number;
  touchpointSlots: TouchpointSlotCell[];
};

type SlotMeta = {
  index: number;
  title: string;
  shortLabel: string;
};

/**
 * Линза «Группы» — итоговая анкета по дням и 7 точек активности за выбранный день.
 */
export function HubGroupsScreen({
  onLensChange,
}: {
  onLensChange: (lens: HubLens) => void;
}) {
  const {
    adminFetch, forumDay, setDirection, setGroup, meta, ageCategory, activity, direction,
  } = useInsights();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = hubFilterParams({
      mode: 'day',
      forumDay,
      direction,
      ageCategory,
      activity,
    });
    adminFetch(`/analytics/hub/groups?${params.toString()}`)
      .then(res => setData(res))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [adminFetch, forumDay, direction, ageCategory, activity]);

  const days = (data?.days ?? []) as number[];
  const byGroup = (data?.byGroup ?? []) as GroupRow[];
  const slotsMeta = (data?.touchpointSlotsMeta ?? []) as SlotMeta[];
  const touchpointTotals = (data?.touchpointTotals ?? []) as TouchpointSlotCell[];
  const kpi = data?.kpi ?? {};
  const selectedDay = Number(data?.selectedDay ?? forumDay) || meta?.currentForumDay || 1;
  const touchpointDay = Number(data?.touchpointDay ?? selectedDay) || selectedDay;

  const totalsRow = useMemo(() => {
    if (!byGroup.length || !days.length) return null;
    const totalPeople = byGroup.reduce((s, r) => s + (r.total ?? 0), 0);
    const registered = byGroup.reduce((s, r) => s + (r.registered ?? 0), 0);
    const byDay = days.map(day => {
      const submitted = byGroup.reduce((s, r) => {
        const cell = r.eveningByDay?.find(c => c.day === day);
        return s + (cell?.submitted ?? 0);
      }, 0);
      return { day, submitted };
    });
    return { totalPeople, registered, byDay };
  }, [byGroup, days]);

  function openDirection(dir: string) {
    if (!dir || dir === '—' || dir === 'несколько') return;
    setDirection(dir);
    setGroup('');
    onLensChange('direction');
  }

  function slotCell(slots: TouchpointSlotCell[] | undefined, index: number) {
    return slots?.find(s => s.index === index);
  }

  if (loading && !data) {
    return <p className="adm-muted">Загрузка групп…</p>;
  }
  if (!data) {
    return <p className="adm-muted">Не удалось загрузить сводку по группам.</p>;
  }

  return (
    <div className="adm-dash-stack">
      <DashScreenTitle
        title="Группы"
        hint="Итоговая анкета по дням · 7 точек активности за выбранный день"
      />

      <HubKpiRow
        cols={3}
        items={[
          {
            value: `${selectedDay} / 8`,
            label: 'день форума',
            sub: meta?.currentForumDay != null ? `сейчас идёт ${meta.currentForumDay}` : undefined,
            accent: 'var(--m-accent)',
          },
          {
            value: dashVal(kpi.groupsCount),
            label: 'групп в срезе',
            sub: kpi.groupsWithPeople != null ? `с людьми · ${kpi.groupsWithPeople}` : undefined,
          },
          {
            value: dashVal(kpi.registered),
            label: 'зарегистрировано',
            sub: kpi.cohortSize != null ? `в когорте · ${kpi.cohortSize}` : undefined,
          },
          {
            value: dashVal(kpi.eveningSubmitted),
            label: `итоговая анкета · день ${selectedDay}`,
            sub: kpi.eveningFillPct != null ? `охват ${kpi.eveningFillPct}%` : undefined,
            accent: '#22c55e',
          },
          {
            value: dashVal(kpi.eveningDrafts),
            label: 'черновики сегодня',
          },
          {
            value: dashVal(kpi.groupsFullToday),
            label: 'групп со 100% сдачи',
            sub: `за день ${selectedDay}`,
            accent: '#22c55e',
          },
        ]}
      />

      <SectionLabel>Группы · итоговая анкета и точки активности</SectionLabel>
      <DashCard title="Сводка по группам">
        <p className="adm-muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 8 }}>
          Д1…ДN — сдача итоговой анкеты по дням.
          Т1…Т7 — сколько человек закрыли точку активности за день {touchpointDay} (кол-во и % от зарег.).
        </p>
        {byGroup.length === 0 ? (
          <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Нет групп в срезе.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th rowSpan={2}>Группа</th>
                  <th rowSpan={2}>Направление</th>
                  <th rowSpan={2}>Всего</th>
                  <th rowSpan={2}>Зарег.</th>
                  {days.map(d => (
                    <th key={`e-${d}`} rowSpan={2}>Д{d}</th>
                  ))}
                  <th rowSpan={2}>Д{selectedDay} %</th>
                  {slotsMeta.map(s => (
                    <th
                      key={`tp-${s.index}`}
                      colSpan={2}
                      title={s.title}
                      style={{ textAlign: 'center' }}
                    >
                      Т{s.index}
                    </th>
                  ))}
                </tr>
                <tr>
                  {slotsMeta.map(s => (
                    <Fragment key={`tp-h-${s.index}`}>
                      <th title={`${s.shortLabel} · кол-во`}>кол-во</th>
                      <th title={`${s.shortLabel} · %`}>%</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byGroup.map(row => (
                  <tr key={row.group}>
                    <td>{row.group}</td>
                    <td>
                      {row.direction && row.direction !== '—' && row.direction !== 'несколько' ? (
                        <button
                          type="button"
                          className="adm-link"
                          onClick={() => openDirection(row.direction)}
                        >
                          {row.direction}
                        </button>
                      ) : (
                        row.direction || '—'
                      )}
                    </td>
                    <td>{row.total}</td>
                    <td>{row.registered}</td>
                    {days.map(d => {
                      const cell = row.eveningByDay?.find(c => c.day === d);
                      const n = cell?.submitted ?? 0;
                      const muted = row.registered > 0 && n === 0;
                      return (
                        <td
                          key={d}
                          style={muted ? { color: 'var(--adm-muted, #94a3b8)' } : undefined}
                          title={cell ? `${cell.fillRatePct}%` : undefined}
                        >
                          {n}
                        </td>
                      );
                    })}
                    <td>{row.selectedDayFillPct}%</td>
                    {slotsMeta.map(s => {
                      const cell = slotCell(row.touchpointSlots, s.index);
                      const n = cell?.completed ?? 0;
                      const p = cell?.coveragePct ?? 0;
                      const muted = row.registered > 0 && n === 0;
                      return (
                        <Fragment key={`${row.group}-tp-${s.index}`}>
                          <td
                            style={muted ? { color: 'var(--adm-muted, #94a3b8)' } : undefined}
                            title={s.shortLabel}
                          >
                            {n}
                          </td>
                          <td
                            style={muted ? { color: 'var(--adm-muted, #94a3b8)' } : undefined}
                            title={s.title}
                          >
                            {p}%
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                ))}
                {totalsRow && (
                  <tr style={{ fontWeight: 600 }}>
                    <td>Итого</td>
                    <td />
                    <td>{totalsRow.totalPeople}</td>
                    <td>{totalsRow.registered}</td>
                    {totalsRow.byDay.map(c => (
                      <td key={c.day}>{c.submitted}</td>
                    ))}
                    <td>
                      {totalsRow.registered
                        ? `${Math.round((byGroup.reduce((s, r) => s + r.selectedDaySubmitted, 0) / totalsRow.registered) * 1000) / 10}%`
                        : '—'}
                    </td>
                    {slotsMeta.map(s => {
                      const cell = touchpointTotals.find(t => t.index === s.index);
                      return (
                        <Fragment key={`tot-tp-${s.index}`}>
                          <td>{cell?.completed ?? 0}</td>
                          <td>{cell?.coveragePct ?? 0}%</td>
                        </Fragment>
                      );
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {slotsMeta.length > 0 && (
          <p className="adm-muted" style={{ fontSize: 11, marginTop: 10, marginBottom: 0 }}>
            Точки: {slotsMeta.map(s => `Т${s.index} — ${s.shortLabel}`).join(' · ')}
          </p>
        )}
      </DashCard>
    </div>
  );
}
