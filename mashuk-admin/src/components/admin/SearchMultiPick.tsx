import { useEffect, useMemo, useState } from 'react';

export type SearchPickItem = { id: number; label: string; sublabel?: string };

type Props = {
  items: SearchPickItem[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  placeholder?: string;
  emptyHint?: string;
  minQueryLength?: number;
  filterItem?: (item: SearchPickItem, needle: string) => boolean;
};

export function SearchMultiPick({
  items,
  selectedIds,
  onChange,
  placeholder = 'Поиск…',
  emptyHint = 'Введите 2+ символа для поиска',
  minQueryLength = 2,
  filterItem,
}: Props) {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  const selected = useMemo(
    () => items.filter(i => selectedIds.includes(i.id)),
    [items, selectedIds],
  );

  const filtered = useMemo(() => {
    const needle = debouncedQ.toLowerCase();
    if (needle.length < minQueryLength) return [];
    const fn = filterItem ?? ((item: SearchPickItem, n: string) =>
      item.label.toLowerCase().includes(n) || (item.sublabel?.toLowerCase().includes(n) ?? false));
    return items.filter(i => !selectedIds.includes(i.id) && fn(i, needle)).slice(0, 20);
  }, [items, debouncedQ, selectedIds, minQueryLength, filterItem]);

  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  };

  return (
    <div className="adm-search-pick">
      {selected.length > 0 && (
        <div className="adm-search-pick-selected">
          {selected.map(s => (
            <span key={s.id} className="adm-search-pick-chip" title={s.sublabel ? `${s.label} — ${s.sublabel}` : s.label}>
              {s.label}
              <button type="button" className="adm-search-pick-chip-x" aria-label="Убрать" onClick={() => toggle(s.id)}>×</button>
            </span>
          ))}
        </div>
      )}
      <input
        className="adm-input adm-input-sm"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={placeholder}
      />
      {debouncedQ.length > 0 && debouncedQ.length < minQueryLength && (
        <p className="adm-muted adm-search-pick-hint">{emptyHint}</p>
      )}
      {debouncedQ.length >= minQueryLength && (
        <div className="adm-search-pick-list" role="listbox">
          {filtered.map(item => (
            <button
              key={item.id}
              type="button"
              className="adm-search-pick-row"
              onClick={() => { toggle(item.id); setQ(''); }}
            >
              <span className="adm-search-pick-name">{item.label}</span>
              {item.sublabel && <span className="adm-search-pick-sub">{item.sublabel}</span>}
            </button>
          ))}
          {filtered.length === 0 && <div className="adm-muted adm-search-pick-empty">Ничего не найдено</div>}
        </div>
      )}
    </div>
  );
}
