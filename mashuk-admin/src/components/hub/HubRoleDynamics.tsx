import { useMemo, useState } from 'react';
import { formatForumDay } from '../analytics/chartRu';
import { DashCard, SectionLabel } from '../analytics/dashboardUi';

export type RoleShare = {
  roleKey: string;
  name: string;
  count: number;
  pct: number;
};

export type RoleDayShares = {
  day: number;
  n: number;
  cells: RoleShare[];
};

export type RoleDynamicsData = {
  roles?: Array<{ roleKey: string; name: string; color: string }>;
  days?: number[];
  starting?: {
    forum: RoleShare[];
    forumN: number;
    byDirection: { direction: string; n: number; cells: RoleShare[] }[];
  };
  forumByDay?: RoleDayShares[];
  byDirection?: { direction: string; byDay: RoleDayShares[] }[];
  insights?: Array<{ metric: string; text: string }>;
};

type Props = {
  data: RoleDynamicsData | null | undefined;
  /** Глобальный фильтр направления из тулбара штаба */
  toolbarDirection?: string;
  onOpenDirection?: (direction: string) => void;
};

const THINKING = new Set(['meaning_researcher', 'content_packer']);
const ACTION = new Set(['practice_realizer', 'process_navigator']);

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function daysWord(n: number): string {
  const m = Math.abs(n) % 100;
  const k = Math.abs(n) % 10;
  if (m >= 11 && m <= 14) return 'дней';
  if (k === 1) return 'день';
  if (k >= 2 && k <= 4) return 'дня';
  return 'дней';
}

/** Локальные смыслы для выбранного среза (форум — с бэка, направление — здесь). */
function insightsForSeries(
  byDay: RoleDayShares[],
  roles: Array<{ roleKey: string; name: string }>,
): Array<{ metric: string; text: string }> {
  if (byDay.length < 2) {
    return [{ metric: '—', text: 'Нужно минимум два дня с ролями, чтобы увидеть сдвиг.' }];
  }
  const first = byDay[0];
  const last = byDay[byDay.length - 1];
  const deltas = roles.map(r => {
    const a = first.cells.find(c => c.roleKey === r.roleKey)?.pct ?? 0;
    const b = last.cells.find(c => c.roleKey === r.roleKey)?.pct ?? 0;
    return { roleKey: r.roleKey, name: r.name, from: a, to: b, delta: round1(b - a) };
  });
  const out: Array<{ metric: string; text: string }> = [];
  const drop = [...deltas].sort((a, b) => a.delta - b.delta)[0];
  if (drop && drop.delta < -1) {
    const wasTop = first.cells.every(c => c.roleKey === drop.roleKey || c.pct <= drop.from);
    out.push({
      metric: `${drop.delta} п.п.`,
      text: wasTop
        ? `«${drop.name}» перестал быть доминирующим выбором.`
        : `Доля «${drop.name}» снизилась сильнее остальных (${drop.from}% → ${drop.to}%).`,
    });
  }
  const rise = [...deltas].sort((a, b) => b.delta - a.delta)[0];
  if (rise && rise.delta > 1 && rise.from > 0) {
    const mult = round1(rise.to / rise.from);
    out.push({
      metric: mult >= 1.5 ? `×${String(mult).replace('.', ',')}` : `+${rise.delta} п.п.`,
      text: mult >= 1.5
        ? `Выросла доля «${rise.name}»: участники перешли от осмысления к пробе.`
        : `Доля «${rise.name}» выросла с ${rise.from}% до ${rise.to}%.`,
    });
  } else if (rise && rise.delta > 1) {
    out.push({
      metric: `+${rise.delta} п.п.`,
      text: `Сильнее всего выросла доля «${rise.name}» (до ${rise.to}%).`,
    });
  }
  let pivotDay: number | null = null;
  for (const row of byDay) {
    let think = 0;
    let act = 0;
    for (const c of row.cells) {
      if (THINKING.has(c.roleKey)) think += c.pct;
      if (ACTION.has(c.roleKey)) act += c.pct;
    }
    if (Math.abs(think - act) <= 3 && think > 0 && act > 0) {
      pivotDay = row.day;
      break;
    }
  }
  if (pivotDay != null) {
    out.push({
      metric: `день ${pivotDay}`,
      text: 'Точка разворота: роли действия впервые сравнялись с ролями мышления.',
    });
  } else if (out.length < 3) {
    const lastThink = last.cells.filter(c => THINKING.has(c.roleKey)).reduce((s, c) => s + c.pct, 0);
    const lastAct = last.cells.filter(c => ACTION.has(c.roleKey)).reduce((s, c) => s + c.pct, 0);
    const lead = lastAct >= lastThink ? 'действия' : 'мышления';
    out.push({
      metric: `${round1(Math.abs(lastAct - lastThink))} п.п.`,
      text: `К дню ${last.day} лидируют роли ${lead}.`,
    });
  }
  return out.slice(0, 3);
}

function RoleBarCell({
  pct,
  color,
}: {
  pct: number;
  color: string;
}) {
  const fill = Math.max(0, Math.min(100, pct));
  return (
    <div
      title={`${Math.round(pct)}%`}
      style={{
        position: 'relative',
        height: 28,
        borderRadius: 999,
        background: '#eceae6',
        overflow: 'hidden',
        minWidth: 56,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width: `${fill}%`,
          background: color,
          borderRadius: 999,
          transition: 'width 0.25s ease',
        }}
      />
      <span
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          fontSize: 12,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: fill >= 42 ? '#1a1a1a' : '#333',
        }}
      >
        {pct > 0 ? Math.round(pct) : '·'}
      </span>
    </div>
  );
}

/**
 * Стартовые роли + динамика 6 ролей по дням (форум / направление)
 * + блок «Что видно за N дней» по макету штаба.
 */
export function HubRoleDynamics({ data, toolbarDirection, onOpenDirection }: Props) {
  const roles = data?.roles ?? [];
  const days = data?.days ?? [];
  const directions = (data?.byDirection ?? []).map(d => d.direction);
  const [scope, setScope] = useState<'forum' | string>(() => {
    if (toolbarDirection && directions.includes(toolbarDirection)) return toolbarDirection;
    return 'forum';
  });

  // Синхрон с тулбаром, если пользователь выбрал направление сверху
  const effectiveScope = useMemo(() => {
    if (toolbarDirection && directions.includes(toolbarDirection)) return toolbarDirection;
    if (scope !== 'forum' && !directions.includes(scope)) return 'forum';
    return scope;
  }, [toolbarDirection, directions, scope]);

  const byDay: RoleDayShares[] = useMemo(() => {
    if (effectiveScope === 'forum') return data?.forumByDay ?? [];
    return data?.byDirection?.find(d => d.direction === effectiveScope)?.byDay ?? [];
  }, [data, effectiveScope]);

  const startCells: RoleShare[] = useMemo(() => {
    if (effectiveScope === 'forum') return data?.starting?.forum ?? [];
    return data?.starting?.byDirection?.find(d => d.direction === effectiveScope)?.cells ?? [];
  }, [data, effectiveScope]);

  const startN = useMemo(() => {
    if (effectiveScope === 'forum') return data?.starting?.forumN ?? 0;
    return data?.starting?.byDirection?.find(d => d.direction === effectiveScope)?.n ?? 0;
  }, [data, effectiveScope]);

  const insights = useMemo(() => {
    if (effectiveScope === 'forum' && (data?.insights?.length ?? 0) > 0) {
      return data!.insights!;
    }
    return insightsForSeries(byDay, roles);
  }, [effectiveScope, data, byDay, roles]);
  const daySpan = days.length || byDay.length;

  if (!roles.length) {
    return (
      <DashCard title="Динамика ролей">
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
          Нет данных по ролям в срезе.
        </p>
      </DashCard>
    );
  }

  const colorOf = (key: string) => roles.find(r => r.roleKey === key)?.color || '#C4B5A0';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'flex-end',
        justifyContent: 'space-between',
      }}>
        <SectionLabel>Роли участников</SectionLabel>
        <label className="adm-insights-filter" style={{ margin: 0 }}>
          Срез
          <select
            className="adm-input"
            value={effectiveScope}
            onChange={e => setScope(e.target.value)}
            disabled={Boolean(toolbarDirection)}
            title={toolbarDirection ? 'Срез задан фильтром направления в тулбаре' : undefined}
          >
            <option value="forum">Весь форум</option>
            {directions.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
      </div>

      <DashCard title="Стартовые роли">
        <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 10 }}>
          Распределение по роли онбординга
          {effectiveScope === 'forum' ? ' · весь форум' : ` · ${effectiveScope}`}
          {startN ? ` · ${startN} чел.` : ''}
        </p>
        {startCells.every(c => c.count === 0) ? (
          <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Нет стартовых ролей в срезе.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...startCells]
              .filter(c => c.count > 0)
              .sort((a, b) => b.pct - a.pct)
              .map(c => (
                <div
                  key={c.roleKey}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(120px, 180px) 1fr auto',
                    gap: 10,
                    alignItems: 'center',
                  }}
                  title={`${c.count} чел. · ${Math.round(c.pct)}%`}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>{c.name}</span>
                  <div style={{
                    height: 10,
                    borderRadius: 999,
                    background: '#eceae6',
                    overflow: 'hidden',
                  }}
                  >
                    <div style={{
                      width: `${Math.min(100, c.pct)}%`,
                      height: '100%',
                      background: colorOf(c.roleKey),
                      borderRadius: 999,
                    }}
                    />
                  </div>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    minWidth: 64,
                    textAlign: 'right',
                  }}
                  >
                    {Math.round(c.pct)}% · {c.count}
                  </span>
                </div>
              ))}
          </div>
        )}
      </DashCard>

      {insights.length > 0 && (
        <DashCard title={`Что видно за ${daySpan || 0} ${daysWord(daySpan || 0)}`}>
          {effectiveScope !== 'forum' && (
            <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 4 }}>
              Смыслы по направлению «{effectiveScope}»
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {insights.map((ins, i) => (
              <div
                key={`${ins.metric}-${i}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(72px, auto) 1fr',
                  gap: 16,
                  alignItems: 'baseline',
                  padding: '14px 0',
                  borderTop: i === 0 ? 'none' : '1px solid #e8e4de',
                }}
              >
                <div style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: '#E07A3D',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1.1,
                }}
                >
                  {ins.metric}
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--m-text)' }}>
                  {ins.text}
                </div>
              </div>
            ))}
          </div>
        </DashCard>
      )}

      <DashCard title="Динамика всех шести ролей">
        <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 12 }}>
          Доля участников с ролью по дням
          {effectiveScope === 'forum' ? ' · форум' : ` · ${effectiveScope}`}.
          Роль дня = активная роль проверки состояния, иначе стартовая.
        </p>

        {!byDay.length ? (
          <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Нет дневных срезов.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="adm-table" style={{ fontSize: 12, minWidth: 640, borderCollapse: 'separate', borderSpacing: '0 6px' }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 150, textAlign: 'left', borderBottom: 'none' }}>Роль</th>
                  {byDay.map(d => (
                    <th key={d.day} style={{ textAlign: 'center', borderBottom: 'none', fontWeight: 600 }}>
                      {formatForumDay(d.day)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roles.map(role => (
                  <tr key={role.roleKey}>
                    <td style={{
                      fontWeight: 600,
                      verticalAlign: 'middle',
                      borderBottom: 'none',
                      paddingRight: 12,
                      maxWidth: 160,
                      lineHeight: 1.25,
                    }}
                    >
                      {role.name}
                    </td>
                    {byDay.map(d => {
                      const cell = d.cells.find(c => c.roleKey === role.roleKey);
                      const pct = cell?.pct ?? 0;
                      return (
                        <td key={d.day} style={{ borderBottom: 'none', padding: '2px 6px', verticalAlign: 'middle' }}>
                          <RoleBarCell pct={pct} color={role.color} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="adm-muted" style={{ fontSize: 11, margin: '10px 0 0' }}>
          Длина цветной полосы помогает сравнивать значения; числа — точная доля участников.
          {effectiveScope !== 'forum' && onOpenDirection && (
            <>
              {' '}
              <button type="button" className="adm-link" onClick={() => onOpenDirection(effectiveScope)}>
                Открыть направление →
              </button>
            </>
          )}
        </p>
      </DashCard>
    </div>
  );
}
