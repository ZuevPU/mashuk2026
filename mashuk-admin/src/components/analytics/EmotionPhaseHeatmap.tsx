import { useEffect, useMemo, useState } from 'react';
import {
  EMOTION_COLORS, EMOTION_LABELS, EMOTION_ORDER, formatForumDay,
} from './chartRu';

type DayPhasePoint = {
  day: number;
  morningPct: number | null;
  dayPct: number | null;
  eveningPct: number | null;
  morningCount: number;
  dayCount: number;
  eveningCount: number;
};

type EmotionDynamics = {
  days?: number[];
  emotions?: {
    id: string;
    label: string;
    byDay: DayPhasePoint[];
  }[];
  note?: string;
};

function emotionColor(id: string): string {
  return EMOTION_COLORS[id] ?? '#3182CE';
}

function heatBgPct(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return '#f3f4f6';
  const t = Math.min(1, Math.max(0, pct / 100));
  if (t < 0.2) {
    return `rgba(148, 163, 184, ${(0.12 + t).toFixed(2)})`;
  }
  if (t < 0.45) {
    return `rgba(49, 130, 206, ${(0.18 + (t - 0.2) * 0.8).toFixed(2)})`;
  }
  if (t < 0.7) {
    return `rgba(10, 123, 111, ${(0.28 + (t - 0.45) * 0.9).toFixed(2)})`;
  }
  return `rgba(56, 161, 105, ${Math.min(0.9, 0.45 + (t - 0.7) * 1.2).toFixed(2)})`;
}

function heatTextPct(pct: number | null): string {
  if (pct == null) return '#9ca3af';
  return pct >= 45 ? '#fff' : '#1a202c';
}

/**
 * Тепловая карта эмоций × (день · фаза) — из «Образа участника», для Штаб · Состояние.
 */
export function EmotionPhaseHeatmap({
  dynamics,
}: {
  dynamics?: EmotionDynamics | null;
}) {
  const emotionOptions = useMemo(() => {
    const fromDynamics = (dynamics?.emotions ?? []).map(e => ({ id: e.id, label: e.label }));
    if (fromDynamics.length) return fromDynamics;
    return EMOTION_ORDER.map(id => ({ id, label: EMOTION_LABELS[id] ?? id }));
  }, [dynamics?.emotions]);

  const optionsKey = emotionOptions.map(o => o.id).join(',');
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(emotionOptions.map(o => o.id)),
  );

  useEffect(() => {
    setSelected(new Set(emotionOptions.map(o => o.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optionsKey tracks catalog
  }, [optionsKey]);

  const selectedList = emotionOptions.filter(o => selected.has(o.id));

  const days = useMemo(() => {
    if (dynamics?.days?.length) return dynamics.days;
    return Array.from({ length: 8 }, (_, i) => i + 1);
  }, [dynamics?.days]);

  const hasData = (dynamics?.emotions ?? []).some(e =>
    e.byDay.some(d => (d.morningCount + d.dayCount + d.eveningCount) > 0),
  );

  if (!hasData) {
    return (
      <div className="adm-dash-card">
        <div className="adm-dash-card-title">Тепловая карта · доля эмоции по фазам всех дней (%)</div>
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
          Нет ответов проверки состояния по фазам смены.
        </p>
      </div>
    );
  }

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="adm-dash-card">
      <div className="adm-dash-card-title" style={{ marginBottom: 6 }}>
        Тепловая карта · доля эмоции по фазам всех дней (%)
      </div>
      <p className="adm-muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
        Строки — эмоции, столбцы — День N · Утро / День / Вечер за всю смену
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <button
          type="button"
          className="adm-btn adm-btn-secondary adm-btn-sm"
          onClick={() => setSelected(new Set(emotionOptions.map(o => o.id)))}
        >
          Выбрать все
        </button>
        <button
          type="button"
          className="adm-btn adm-btn-secondary adm-btn-sm"
          onClick={() => setSelected(new Set())}
        >
          Снять все
        </button>
        <span className="adm-muted" style={{ fontSize: 12 }}>
          Выбрано: {selectedList.length} / {emotionOptions.length}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {emotionOptions.map(o => {
          const on = selected.has(o.id);
          return (
            <label
              key={o.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 8,
                border: `1px solid ${on ? emotionColor(o.id) : '#d2d2d7'}`,
                background: on ? `${emotionColor(o.id)}18` : '#fff',
                fontSize: 12,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input type="checkbox" checked={on} onChange={() => toggle(o.id)} />
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: emotionColor(o.id), display: 'inline-block',
              }}
              />
              {o.label}
            </label>
          );
        })}
      </div>

      {selectedList.length === 0 ? (
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Выберите хотя бы одну эмоцию.</p>
      ) : (
        <div className="adm-table-scroll">
          <table
            className="adm-table adm-table-compact"
            style={{ width: '100%', minWidth: Math.max(640, 120 + days.length * 3 * 56) }}
          >
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>Эмоция</th>
                {days.flatMap(day => ([
                  <th key={`${day}-m`} style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{formatForumDay(day)}·У</th>,
                  <th key={`${day}-d`} style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{formatForumDay(day)}·Д</th>,
                  <th key={`${day}-e`} style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{formatForumDay(day)}·В</th>,
                ]))}
              </tr>
            </thead>
            <tbody>
              {selectedList.map(o => {
                const byDay = (dynamics?.emotions ?? []).find(e => e.id === o.id)?.byDay ?? [];
                return (
                  <tr key={o.id}>
                    <td style={{
                      position: 'sticky', left: 0, background: '#fff', zIndex: 1, whiteSpace: 'nowrap',
                    }}
                    >
                      <span style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: emotionColor(o.id), marginRight: 6,
                      }}
                      />
                      {o.label}
                    </td>
                    {days.flatMap(day => {
                      const hit = byDay.find(d => d.day === day);
                      const cells: { pct: number | null; n: number; title: string }[] = [
                        {
                          pct: hit?.morningPct ?? null,
                          n: hit?.morningCount ?? 0,
                          title: `${o.label} · ${formatForumDay(day)} · Утро`,
                        },
                        {
                          pct: hit?.dayPct ?? null,
                          n: hit?.dayCount ?? 0,
                          title: `${o.label} · ${formatForumDay(day)} · День`,
                        },
                        {
                          pct: hit?.eveningPct ?? null,
                          n: hit?.eveningCount ?? 0,
                          title: `${o.label} · ${formatForumDay(day)} · Вечер`,
                        },
                      ];
                      return cells.map((c, idx) => (
                        <td
                          key={`${o.id}-${day}-${idx}`}
                          title={`${c.title}: ${c.pct ?? '—'}% · N=${c.n}`}
                          style={{
                            textAlign: 'center',
                            fontSize: 11,
                            fontWeight: 600,
                            background: heatBgPct(c.pct),
                            color: heatTextPct(c.pct),
                            minWidth: 44,
                          }}
                        >
                          {c.pct != null ? c.pct : '—'}
                        </td>
                      ));
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
