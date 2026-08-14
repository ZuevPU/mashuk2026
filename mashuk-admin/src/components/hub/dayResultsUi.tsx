import type { ReactNode } from 'react';

const SCALE_COLORS: Record<number, string> = {
  1: '#e2685e',
  2: '#c9705f',
  3: '#6f7d95',
  4: '#b79a58',
  5: '#57bd9c',
};

export function DayResultsSection({
  id,
  title,
  note,
  children,
}: {
  /** Якорь для правой навигации Штаба */
  id?: string;
  title: string;
  note?: string;
  children?: ReactNode;
}) {
  return (
    <section id={id} className={`adm-day-results-section${id ? ' adm-hub-anchor' : ''}`}>
      <div className="adm-dash-section-label">{title}</div>
      {note ? <p className="adm-day-results-note">{note}</p> : null}
      {children}
    </section>
  );
}

export function Flag({
  tone,
  children,
}: {
  tone: 'bad' | 'warn' | 'ok';
  children: ReactNode;
}) {
  return <span className={`adm-day-results-flag adm-day-results-flag-${tone}`}>{children}</span>;
}

export function lowTone(low: number): 'bad' | 'warn' | 'ok' {
  if (low >= 12) return 'bad';
  if (low >= 8) return 'warn';
  return 'ok';
}

export function fillTone(fill: number): 'bad' | 'warn' | 'ok' {
  if (fill >= 88) return 'ok';
  if (fill >= 60) return 'warn';
  return 'bad';
}

/** Диверг-полоса: слева 1–3, справа 4–5, нуль между ними. */
export function SpineBar({ dist }: { dist: number[] }) {
  const tot = dist.reduce((a, b) => a + b, 0) || 1;
  const pct = (v: number) => (v / tot) * 100;
  const left = (dist[0] ?? 0) + (dist[1] ?? 0) + (dist[2] ?? 0);
  const zeroX = 42;
  let x = zeroX - pct(left) * 0.42;
  const segs: ReactNode[] = [];
  [1, 2, 3].forEach(v => {
    const w = pct(dist[v - 1] ?? 0) * 0.42;
    segs.push(
      <span
        key={v}
        className="adm-day-results-seg"
        style={{ left: `${x}%`, width: `${w}%`, background: SCALE_COLORS[v] }}
      />,
    );
    x += w;
  });
  [4, 5].forEach(v => {
    const w = pct(dist[v - 1] ?? 0) * 0.58;
    segs.push(
      <span
        key={v}
        className="adm-day-results-seg"
        style={{ left: `${x}%`, width: `${w}%`, background: SCALE_COLORS[v] }}
      />,
    );
    x += w;
  });
  return (
    <div className="adm-day-results-bar">
      {segs}
      <span className="adm-day-results-zero" style={{ left: `${zeroX}%` }} />
    </div>
  );
}

export function SpineLegend() {
  return (
    <div className="adm-day-results-legend">
      {[1, 2, 3, 4, 5].map(v => (
        <span key={v}>
          <i style={{ background: SCALE_COLORS[v] }} />
          {v}
        </span>
      ))}
      <span className="adm-day-results-legend-hint">справа — среднее и доля оценок ниже 4</span>
    </div>
  );
}

export function heatCellStyle(dev: number): { background: string; color: string } {
  const a = Math.min(Math.abs(dev) / 0.45, 1);
  if (dev < -0.05) {
    return {
      background: `rgba(226, 104, 94, ${(a * 0.42).toFixed(2)})`,
      color: dev < -0.25 ? '#b91c1c' : 'var(--m-text)',
    };
  }
  if (dev > 0.05) {
    return {
      background: `rgba(87, 189, 156, ${(a * 0.34).toFixed(2)})`,
      color: 'var(--m-text)',
    };
  }
  return { background: 'transparent', color: 'var(--m-text)' };
}

/** Абсолютная оценка 1–5: низкая — красный, средняя — розовый, высокая — зелёный. */
export function scoreCellStyle(avg: number | null): { background: string; color: string } {
  if (avg == null || !Number.isFinite(avg)) {
    return { background: 'transparent', color: 'var(--m-text-secondary)' };
  }
  if (avg < 4) {
    return { background: 'rgba(255, 59, 48, 0.18)', color: '#B91C1C' };
  }
  if (avg < 4.5) {
    return { background: 'rgba(255, 59, 48, 0.08)', color: '#9F1239' };
  }
  return { background: 'rgba(52, 199, 89, 0.18)', color: '#0F766E' };
}

export function HBar({
  widthPct,
  color = 'var(--m-accent)',
}: {
  widthPct: number;
  color?: string;
}) {
  return (
    <div className="adm-day-results-track">
      <div
        className="adm-day-results-hbar"
        style={{ width: `${Math.max(0, Math.min(100, widthPct))}%`, background: color }}
      />
    </div>
  );
}

export function StackBar({
  items,
  colors,
}: {
  items: { name: string; n: number }[];
  colors: string[];
}) {
  const tot = items.reduce((a, e) => a + e.n, 0) || 1;
  return (
    <div className="adm-day-results-stack">
      {items.map((e, i) => {
        const pct = (e.n / tot) * 100;
        return (
          <div
            key={e.name}
            title={`${e.name} — ${e.n}`}
            style={{ width: `${pct}%`, background: colors[i % colors.length] }}
          >
            {pct > 7 ? `${Math.round(pct)}%` : ''}
          </div>
        );
      })}
    </div>
  );
}

export const EXPERIMENT_COLORS = [
  '#57bd9c', '#7fb98a', '#e6ae4a', '#c9a06a', '#e2685e', '#6f7d95',
];
