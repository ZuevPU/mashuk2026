import { useEffect, useMemo, useRef, useState } from 'react';

export type SearchPickItem = { id: number; label: string; sublabel?: string };

type Props = {
  items: SearchPickItem[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  placeholder?: string;
  emptyHint?: string;
  /** 0 = show full dropdown on focus (catalog pick). Default 0. */
  minQueryLength?: number;
  filterItem?: (item: SearchPickItem, needle: string) => boolean;
};

export function SearchMultiPick({
  items,
  selectedIds,
  onChange,
  placeholder = 'Поиск или выберите из списка…',
  emptyHint = 'Начните ввод для фильтра',
  minQueryLength = 0,
  filterItem,
}: Props) {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 150);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selected = useMemo(
    () => items.filter(i => selectedIds.includes(i.id)),
    [items, selectedIds],
  );

  const filtered = useMemo(() => {
    const needle = debouncedQ.toLowerCase();
    if (needle.length < minQueryLength) {
      if (minQueryLength === 0) {
        return items.filter(i => !selectedIds.includes(i.id)).slice(0, 40);
      }
      return [];
    }
    const fn = filterItem ?? ((item: SearchPickItem, n: string) =>
      item.label.toLowerCase().includes(n) || (item.sublabel?.toLowerCase().includes(n) ?? false));
    // Empty needle + minQueryLength 0 → full catalog (already handled above)
    if (!needle) return items.filter(i => !selectedIds.includes(i.id)).slice(0, 40);
    return items.filter(i => !selectedIds.includes(i.id) && fn(i, needle)).slice(0, 40);
  }, [items, debouncedQ, selectedIds, minQueryLength, filterItem]);

  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  };

  const showList = open && debouncedQ.length >= minQueryLength;
  const showHint = open && debouncedQ.length > 0 && debouncedQ.length < minQueryLength;

  return (
    <div className="adm-search-pick" ref={rootRef}>
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
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        aria-expanded={showList}
        aria-haspopup="listbox"
        autoComplete="off"
      />
      {showHint && (
        <p className="adm-muted adm-search-pick-hint">{emptyHint}</p>
      )}
      {showList && (
        <div className="adm-search-pick-list" role="listbox">
          {filtered.map(item => (
            <button
              key={item.id}
              type="button"
              className="adm-search-pick-row"
              onClick={() => { toggle(item.id); setQ(''); setOpen(true); }}
            >
              <span className="adm-search-pick-name">{item.label}</span>
              {item.sublabel && <span className="adm-search-pick-sub">{item.sublabel}</span>}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="adm-muted adm-search-pick-empty">
              {items.length === 0 ? 'Справочник пуст' : debouncedQ ? 'Ничего не найдено' : 'Все уже выбраны'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
