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

type SortKey = 'name' | 'direction' | 'group' | 'index';

type Props = {
  columns: ForumPeopleColumn[];
  rows: ForumPeopleRow[];
  adminFetch: (path: string, init?: RequestInit) => Promise<unknown>;
  onSaved: () => void;
};

function heatStyle(v: number | null, max: number): { background: string; color: string } {
  if (v == null || !Number.isFinite(v)) {
    return { background: 'rgba(60, 60, 67, 0.06)', color: '#8E8E93' };
  }
  const t = max <= 5 ? v / 5 : v / 10;
  if (t < 0.45) return { background: 'rgba(255, 59, 48, 0.16)', color: '#C41C16' };
  if (t < 0.7) return { background: 'rgba(255, 204, 0, 0.22)', color: '#8A6A00' };
  return { background: 'rgba(52, 199, 89, 0.18)', color: '#1B7A3A' };
}

function shortLabel(label: string): string {
  const words = label.trim().split(/\s+/);
  if (label.length <= 16) return label;
  if (words.length === 1) return `${label.slice(0, 14)}…`;
  return words.slice(0, 2).join(' ');
}

export function ForumResultsPeopleTable({ columns, rows, adminFetch, onSaved }: Props) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState<10 | 50 | 100>(10);
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
        const av = a.index ?? -1;
        const bv = b.index ?? -1;
        return (av - bv) * dir;
      }
      return a[sortKey].localeCompare(b[sortKey], 'ru') * dir;
    });
  }, [rows, query, sortKey, sortDir]);

  const visible = filtered.slice(0, limit);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'index' ? 'desc' : 'asc');
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
              onChange={e => setQuery(e.target.value)}
              placeholder="Поиск по ФИО"
              aria-label="Поиск по ФИО"
            />
          </label>
          <div className="adm-frp-seg" role="group" aria-label="Сколько строк показать">
            {([10, 50, 100] as const).map(n => (
              <button
                key={n}
                type="button"
                className={limit === n ? 'on' : ''}
                onClick={() => setLimit(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <p className="adm-frp-count">
          {filtered.length === rows.length
            ? `${rows.length} участников`
            : `${filtered.length} из ${rows.length}`}
          {filtered.length > limit ? ` · показаны первые ${limit}` : ''}
        </p>

        {visible.length === 0 ? (
          <p className="adm-muted" style={{ margin: '8px 0 0' }}>Никого не нашли.</p>
        ) : (
          <div className="adm-frp-scroll">
            <table className="adm-frp-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" onClick={() => toggleSort('name')}>ФИО{sortMark('name')}</button>
                  </th>
                  <th>
                    <button type="button" onClick={() => toggleSort('direction')}>Направление{sortMark('direction')}</button>
                  </th>
                  <th>
                    <button type="button" onClick={() => toggleSort('group')}>Группа{sortMark('group')}</button>
                  </th>
                  <th>
                    <button type="button" onClick={() => toggleSort('index')}>Оценки{sortMark('index')}</button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map(row => (
                  <tr key={row.participantId} onClick={() => setOpenId(row.participantId)}>
                    <td>
                      <div className="adm-frp-name">{row.name}</div>
                      <div className="adm-frp-sub">день {row.lastDay}</div>
                    </td>
                    <td>{row.direction}</td>
                    <td>{row.group}</td>
                    <td>
                      <div className="adm-frp-heat" title={row.index != null ? `Индекс ${row.index}` : 'Нет оценок'}>
                        {columns.map((col, i) => {
                          const cell = row.heat[i];
                          return (
                            <span
                              key={col.key}
                              className="adm-frp-heat-cell"
                              style={heatStyle(cell?.v ?? null, col.max)}
                              title={`${col.label}: ${cell?.v ?? '—'}`}
                            >
                              {cell?.v == null ? '·' : cell.v}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {columns.length > 0 && (
          <div className="adm-frp-legend">
            {columns.map(col => (
              <span key={col.key}>{shortLabel(col.label)}</span>
            ))}
          </div>
        )}
      </DashCard>

      {openId != null && (
        <ForumResultsAnswerSheet
          participantId={openId}
          adminFetch={adminFetch}
          onClose={() => setOpenId(null)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}
