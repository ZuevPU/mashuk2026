import { useState } from 'react';
import { useInsights } from '../insights/InsightsContext';
import { DashCard, SectionLabel, dashVal } from '../analytics/dashboardUi';
import { hubFilterParams } from './hubQuery';

type MatrixCell = {
  direction: string;
  tag: string;
  uniqueParticipants: number;
  entries: number;
  coveragePct: number;
};

type MatrixData = {
  tags: string[];
  directions: string[];
  registeredByDirection: Record<string, number>;
  cells: MatrixCell[];
};

function cellColor(pct: number): string {
  if (pct <= 0) return 'transparent';
  if (pct < 15) return 'rgba(47, 111, 237, 0.12)';
  if (pct < 35) return 'rgba(47, 111, 237, 0.28)';
  if (pct < 55) return 'rgba(10, 123, 111, 0.35)';
  return 'rgba(10, 123, 111, 0.55)';
}

/** Heatmap направление × тег копилки — только по кнопке (не грузим при открытии форума). */
export function PiggybankDirectionMatrix() {
  const { adminFetch, forumDay, ageCategory, activity, organizers } = useInsights();
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const params = hubFilterParams({
      mode: 'shift',
      forumDay,
      ageCategory,
      activity,
      organizers,
    });
    try {
      const res = await adminFetch(`/analytics/hub/piggybank-matrix?${params.toString()}`);
      setData(res as MatrixData);
    } catch {
      setData(null);
      setError('Не удалось загрузить матрицу. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  };

  if (!data && !loading) {
    return (
      <>
        <SectionLabel>Копилка × направление</SectionLabel>
        <DashCard title="Копилка × направление">
          <p className="adm-muted" style={{ fontSize: 13, margin: '0 0 10px' }}>
            Тяжёлая матрица не грузится автоматически — чтобы не перегружать сервер.
          </p>
          {error && <p style={{ color: '#ef4444', fontSize: 13, margin: '0 0 8px' }}>{error}</p>}
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => { void load(); }}>
            Загрузить матрицу
          </button>
        </DashCard>
      </>
    );
  }

  if (loading && !data) {
    return (
      <DashCard title="Копилка × направление">
        <div className="tab-loading" style={{ margin: '8px 0' }}>
          <span className="tab-loading-bar" />
        </div>
        <p className="adm-muted" style={{ margin: 0 }}>Загрузка…</p>
      </DashCard>
    );
  }

  if (!data || !data.directions.length) {
    return (
      <DashCard title="Копилка × направление">
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Нет записей копилки в срезе.</p>
        <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" style={{ marginTop: 8 }} onClick={() => { void load(); }}>
          Обновить
        </button>
      </DashCard>
    );
  }

  const lookup = new Map(data.cells.map(c => [`${c.direction}\0${c.tag}`, c]));

  return (
    <>
      <SectionLabel>Копилка × направление</SectionLabel>
      <DashCard title="Охват уникальных участников по тегам">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <button
            type="button"
            className="adm-btn adm-btn-secondary adm-btn-sm"
            disabled={loading}
            onClick={() => { void load(); }}
          >
            {loading ? 'Обновление…' : 'Обновить матрицу'}
          </button>
        </div>
        <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 10 }}>
          В ячейке — % участников направления, у которых есть хотя бы одна запись с тегом (не число записей).
        </p>
        <div style={{ overflow: 'auto' }}>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Направление</th>
                <th>Зарег.</th>
                {data.tags.map(tag => <th key={tag}>{tag}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.directions.map(dir => (
                <tr key={dir}>
                  <td>{dir}</td>
                  <td>{dashVal(data.registeredByDirection[dir])}</td>
                  {data.tags.map(tag => {
                    const cell = lookup.get(`${dir}\0${tag}`);
                    const pct = cell?.coveragePct ?? 0;
                    return (
                      <td
                        key={tag}
                        title={cell ? `${cell.uniqueParticipants} уч. · ${cell.entries} записей` : 'нет'}
                        style={{ background: cellColor(pct), textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
                      >
                        {pct > 0 ? `${pct}%` : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashCard>
    </>
  );
}
