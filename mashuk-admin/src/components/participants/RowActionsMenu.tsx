import { useEffect, useRef, useState } from 'react';

export type RowAction = {
  label: string;
  onClick: () => void;
  danger?: boolean;
};

export function RowActionsMenu({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="adm-row-menu" ref={ref}>
      <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onClick={() => setOpen(v => !v)} aria-label="Действия">
        ⋮
      </button>
      {open && (
        <div className="adm-row-menu-pop">
          {actions.map(a => (
            <button
              key={a.label}
              type="button"
              className={a.danger ? 'adm-row-menu-item danger' : 'adm-row-menu-item'}
              onClick={() => { setOpen(false); a.onClick(); }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function formatParticipantActivity(lastActiveAt?: string | null): string {
  if (!lastActiveAt) return 'Нет данных';
  const t = new Date(lastActiveAt).getTime();
  const diff = Date.now() - t;
  const days = Math.floor(diff / (86400000));
  if (diff < 86400000) return 'Сегодня';
  if (days === 1) return '1 день назад';
  if (days < 7) return `${days} дн. назад`;
  return new Date(lastActiveAt).toLocaleDateString('ru-RU');
}
