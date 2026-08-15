import { useMemo, useState } from 'react';
import { DashCard } from '../analytics/dashboardUi';
import { ForumResultsAnswerSheet } from './ForumResultsAnswerSheet';

export type ForumPeopleColumn = {
  key: string;
  ratingKey: string;
  label: string;
  max: 5 | 10;
  days: number[];
};

export type ForumPeopleRow = {
  participantId: number;
  name: string;
  direction: string;
  group: string;
  days: number[];
  lastDay: number;
  filledAt: string | null;
  heat: Array<{ key: string; v: number | null }>;
  index: number | null;
};

type SortKey = 'name' | 'direction' | 'group' | 'index' | `heat:${string}`;

type Props = {
  columns: ForumPeopleColumn[];
  rows: ForumPeopleRow[];
  adminFetch: (path: string, init?: RequestInit) => Promise<unknown>;
};

const PAGE = 10;

function heatStyle(v: number | null, max: number): { background: string; color: string } {
  if (v == null || !Number.isFinite(v)) {
    return { background: 'rgba(60, 60, 67, 0.06)', color: '#8E8E93' };
  }
  const t = max <= 5 ? v / 5 : v / 10;
  if (t < 0.45) return { background: 'rgba(255, 59, 48, 0.16)', color: '#C41C16' };
  if (t < 0.7) return { background: 'rgba(255, 204, 0, 0.22)', color: '#8A6A00' };
  return { background: 'rgba(52, 199, 89, 0.18)', color: '#1B7A3A' };
}

function heatValue(row: ForumPeopleRow, key: string): number | null {
  return row.heat.find(c => c.key === key)?.v ?? null;
}

export function ForumResultsPeopleTable({ columns, rows, adminFetch }: Props) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [openId, setOpenId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? rows.filter(r => r.name.toLowerCase().includes(q))
      : rows;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === 'index') {
        return ((a.index ?? -1) - (b.index ?? -1)) * dir;
      }
      if (sortKey.startsWith('heat:')) {
        const key = sortKey.slice(5);
        const av = heatValue(a, key);
        const bv = heatValue(b, key);
        if (av == null && bv == null) return a.name.localeCompare(b.name, 'ru');
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av - bv) * dir;
      }
      return a[sortKey as 'name' | 'direction' | 'group'].localeCompare(
        b[sortKey as 'name' | 'direction' | 'group'],
        'ru',
      ) * dir;
    });
  }, [rows, query, sortKey, sortDir]);

  const visible = filtered.slice(0, limit);
  const remaining = Math.max(0, filtered.length - visible.length);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'name' || key === 'direction' || key === 'group' ? 'asc' : 'desc');
  };

  const sortMark = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

  return (
    <>
      <DashCard className="adm-frp-card">
        <div className="adm-frp-toolbar">
          <label className="adm-frp-search">
            <span className="adm-frp-search-icon" aria-hidden>⌕</span>
            <input
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
              placeholder="Поиск по ФИО"
              aria-label="Поиск по ФИО"
            />
          </label>
          <div className="adm-frp-toolbar-right">
            <p className="adm-frp-count">
              {visible.length} из {filtered.length}
              {filtered.length !== rows.length ? ` · найдено по «${query.trim()}»` : ''}
            </p>
            {remaining > 0 && (
              <button
                type="button"
                className="adm-btn adm-btn-primary adm-btn-sm"
                onClick={() => setLimit(filtered.length)}
              >
                Показать всех
              </button>
            )}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="adm-muted" style={{ margin: '8px 0 0' }}>Никого не нашли.</p>
        ) : (
          <div className="adm-frp-scroll">
            <table className="adm-frp-table">
              <thead>
                <tr>
                  <th className="adm-frp-sticky">
                    <button type="button" onClick={() => toggleSort('name')}>ФИО{sortMark('name')}</button>
                  </th>
                  <th>
                    <button type="button" onClick={() => toggleSort('direction')}>Направление{sortMark('direction')}</button>
                  </th>
                  <th>
                    <button type="button" onClick={() => toggleSort('group')}>Группа{sortMark('group')}</button>
                  </th>
                  {columns.map(col => (
                    <th key={col.key} className="adm-frp-th-score">
                      <button type="button" onClick={() => toggleSort(`heat:${col.key}`)} title={col.label}>
                        <span>{col.label}</span>
                        {sortMark(`heat:${col.key}`)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map(row => (
                  <tr key={row.participantId} onClick={() => setOpenId(row.participantId)}>
                    <td className="adm-frp-sticky">
                      <div className="adm-frp-name">{row.name}</div>
                      <div className="adm-frp-sub">день {row.lastDay}</div>
                    </td>
                    <td>{row.direction}</td>
                    <td>{row.group}</td>
                    {columns.map((col, i) => {
                      const cell = row.heat[i];
                      return (
                        <td key={col.key} className="adm-frp-td-score">
                          <span
                            className="adm-frp-heat-cell"
                            style={heatStyle(cell?.v ?? null, col.max)}
                          >
                            {cell?.v == null ? '—' : cell.v}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {remaining > 0 && (
          <div className="adm-frp-more">
            <button
              type="button"
              className="adm-btn adm-btn-secondary"
              onClick={() => setLimit(n => n + PAGE)}
            >
              Загрузить ещё {Math.min(PAGE, remaining)}
            </button>
            <button
              type="button"
              className="adm-btn adm-btn-primary"
              onClick={() => setLimit(filtered.length)}
            >
              Показать всех · {filtered.length}
            </button>
          </div>
        )}
      </DashCard>

      {openId != null && (
        <ForumResultsAnswerSheet
          participantId={openId}
          adminFetch={adminFetch}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
