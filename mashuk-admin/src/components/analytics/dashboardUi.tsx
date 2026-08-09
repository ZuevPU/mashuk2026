import { useState, type ReactNode } from 'react';
import { ZONE_COLORS, ZONE_LABELS, ZONE_ORDER } from './chartRu';
import { ChartOrientToggle, type BarsLayout } from './orientableBars';

export const DASH_TAB_SHORT: Record<string, string> = {
  overview: 'Главный',
  direction: 'Направление',
  pulse: 'Пульс',
  evening: 'Анкета вечера',
  'after-blocks': 'После блоков',
  'state-checks': 'Состояние',
  portrait: 'Портрет',
  program: 'Программа',
  activity: 'Рейтинг',
  piggybank: 'Копилка',
  semantic: 'Смыслы',
  clubs: 'Клубы',
  departure: 'Заезд→выезд',
  roles: 'Роли 2×3',
};

export function dashVal(v: unknown): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return String(v);
}

export function DashKpi({
  value,
  label,
  sub,
  trend,
  trendTone = 'flat',
  accent,
}: {
  value: ReactNode;
  label: string;
  sub?: string;
  trend?: string;
  trendTone?: 'up' | 'down' | 'flat';
  accent?: string;
}) {
  return (
    <div className="adm-dash-kpi">
      <div className="adm-dash-kpi-val" style={accent ? { color: accent } : undefined}>
        {value ?? '—'}
      </div>
      <div className="adm-dash-kpi-label">{label}</div>
      {sub ? <div className="adm-dash-kpi-sub">{sub}</div> : null}
      {trend ? <div className={`adm-dash-kpi-trend ${trendTone}`}>{trend}</div> : null}
    </div>
  );
}

export function DashGrid({
  cols = 2,
  children,
}: {
  cols?: 2 | 3 | 4;
  children: ReactNode;
}) {
  return <div className={`adm-dash-grid adm-dash-grid-${cols}`}>{children}</div>;
}

export function DashCard({
  title,
  badge,
  children,
  className = '',
}: {
  title?: string;
  badge?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`adm-dash-card ${className}`.trim()}>
      {title ? (
        <div className="adm-dash-card-title">
          {title}
          {badge ? <span className="adm-dash-badge-v2">{badge}</span> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="adm-dash-section-label">{children}</div>;
}

export function StatusFlag({
  status,
}: {
  status: 'ok' | 'warn' | 'flag' | string;
}) {
  const map: Record<string, { cls: string; text: string }> = {
    ok: { cls: 'ok', text: 'Норма' },
    green: { cls: 'ok', text: 'Норма' },
    warn: { cls: 'warn', text: 'Внимание' },
    yellow: { cls: 'warn', text: 'Внимание' },
    flag: { cls: 'flag', text: 'Флаг' },
    red: { cls: 'flag', text: 'Флаг' },
  };
  const m = map[status] ?? { cls: 'ok', text: String(status) };
  return (
    <span className="adm-dash-status">
      <span className={`adm-dash-flag adm-dash-flag-${m.cls}`} />
      {m.text}
    </span>
  );
}

export function ZoneBars({
  zones,
  title,
}: {
  zones: Record<string, number> | undefined | null;
  title?: string;
}) {
  const [barsLayout, setBarsLayout] = useState<BarsLayout>('horizontal');
  const vertical = barsLayout === 'vertical';
  const data = ZONE_ORDER.map(key => ({
    key,
    label: ZONE_LABELS[key] ?? key,
    value: Number(zones?.[key] ?? 0),
    color: ZONE_COLORS[key],
  }));
  const hasAny = data.some(d => d.value > 0);
  return (
    <div className="adm-chart-frame">
      <ChartOrientToggle value={barsLayout} onChange={setBarsLayout} />
      <div className={`adm-dash-zone-bars${vertical ? ' is-vertical' : ''}`}>
        {title ? <div className="adm-dash-card-title">{title}</div> : null}
        {!hasAny ? (
          <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет данных по зонам</p>
        ) : (
          data.map(d => {
            const pct = Math.min(100, Math.max(0, d.value));
            return (
              <div key={d.key} className="adm-dash-zone-row">
                <span className="adm-dash-zone-label">{d.label}</span>
                <div className="adm-dash-zone-track">
                  <div
                    className="adm-dash-zone-fill"
                    style={vertical
                      ? { height: `${pct}%`, background: d.color }
                      : { width: `${pct}%`, background: d.color }}
                  >
                    {!vertical && d.value >= 8 ? `${Math.round(d.value)}%` : ''}
                  </div>
                </div>
                <span className="adm-dash-zone-pct">{Math.round(d.value)}%</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function SrcBars({
  items,
}: {
  items: { label: string; count: number; pct?: number }[];
}) {
  const [barsLayout, setBarsLayout] = useState<BarsLayout>('horizontal');
  const vertical = barsLayout === 'vertical';
  const max = Math.max(1, ...items.map(i => i.count));
  if (!items.length) {
    return <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет данных</p>;
  }
  return (
    <div className="adm-chart-frame">
      <ChartOrientToggle value={barsLayout} onChange={setBarsLayout} />
      <div className={`adm-dash-src-bars${vertical ? ' is-vertical' : ''}`}>
        {items.map(i => {
          const pct = i.pct != null ? i.pct : Math.round((i.count / max) * 100);
          const barPct = Math.min(100, Math.max(0, pct));
          return (
            <div key={i.label} className="adm-dash-src-row" title={i.label}>
              <span className="adm-dash-src-label">{i.label}</span>
              <div className="adm-dash-src-track">
                <div
                  className="adm-dash-src-fill"
                  style={vertical ? { height: `${barPct}%` } : { width: `${barPct}%` }}
                />
              </div>
              <span className="adm-dash-src-pct">{i.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LeaderList({
  items,
}: {
  items: { name: string; sub?: string; score: ReactNode }[];
}) {
  if (!items.length) {
    return <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет данных</p>;
  }
  return (
    <div className="adm-dash-leader-list">
      {items.map((item, i) => (
        <div key={`${item.name}-${i}`} className="adm-dash-leader-row">
          <span className={`adm-dash-leader-rank rank-${i < 3 ? i + 1 : 'n'}`}>{i + 1}</span>
          <div className="adm-dash-leader-body">
            <div className="adm-dash-leader-name">{item.name}</div>
            {item.sub ? <div className="adm-dash-leader-sub">{item.sub}</div> : null}
          </div>
          <div className="adm-dash-leader-score">{item.score}</div>
        </div>
      ))}
    </div>
  );
}

export function QuoteList({
  items,
}: {
  items: { text: string; meta?: string }[];
}) {
  if (!items.length) {
    return <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет цитат</p>;
  }
  return (
    <div className="adm-dash-quote-list">
      {items.map((q, i) => (
        <div key={i} className="adm-dash-quote">
          {q.text}
          {q.meta ? <div className="adm-dash-quote-meta">{q.meta}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function TagPills({
  items,
  tone = 'neutral',
}: {
  items: { label: string; tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' }[];
  tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';
}) {
  if (!items.length) return null;
  return (
    <div className="adm-dash-tags">
      {items.map((t, i) => (
        <span key={i} className={`adm-dash-tag adm-dash-tag-${t.tone ?? tone}`}>
          {t.label}
        </span>
      ))}
    </div>
  );
}

export function RoleMatrixGrid({
  cells,
}: {
  cells: {
    leader: { thinking?: string; actions?: string; people?: string };
    org: { thinking?: string; actions?: string; people?: string };
  };
}) {
  const cell = (name?: string, pct?: number) => (
    <div className="adm-dash-rg-cell">
      <div className="adm-dash-rg-name">{name || '—'}</div>
      {pct != null ? <div className="adm-dash-rg-pct">{pct}%</div> : null}
    </div>
  );
  return (
    <div className="adm-dash-role-grid">
      <div className="adm-dash-rg-header" />
      <div className="adm-dash-rg-header">Мышление</div>
      <div className="adm-dash-rg-header">Действия</div>
      <div className="adm-dash-rg-header">Люди</div>
      <div className="adm-dash-rg-axis">Лидерский</div>
      {cell(cells.leader.thinking)}
      {cell(cells.leader.actions)}
      {cell(cells.leader.people)}
      <div className="adm-dash-rg-axis">Организационный</div>
      {cell(cells.org.thinking)}
      {cell(cells.org.actions)}
      {cell(cells.org.people)}
    </div>
  );
}

export function DashScreenTitle({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="adm-dash-screen-title">
      <h2>{title}</h2>
      {hint ? <p className="adm-muted">{hint}</p> : null}
    </div>
  );
}

/** Heuristic direction flag from activity rate % */
export function flagFromActivityRate(pct: number): 'ok' | 'warn' | 'flag' {
  if (pct >= 70) return 'ok';
  if (pct >= 50) return 'warn';
  return 'flag';
}
