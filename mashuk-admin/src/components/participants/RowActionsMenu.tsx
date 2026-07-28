import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type RowAction = {
  label: string;
  onClick: () => void;
  danger?: boolean;
  confirmMessage?: string;
};

type PopCoords = { top: number; left: number; minWidth: number };

function computePopCoords(anchor: HTMLElement): PopCoords {
  const rect = anchor.getBoundingClientRect();
  const minWidth = Math.max(220, rect.width);
  const pad = 8;
  const maxMenuHeight = Math.min(400, window.innerHeight - pad * 2);
  const gap = 4;

  let left = rect.right - minWidth;
  if (left < pad) left = pad;
  if (left + minWidth > window.innerWidth - pad) {
    left = Math.max(pad, window.innerWidth - minWidth - pad);
  }

  let top = rect.bottom + gap;
  const spaceBelow = window.innerHeight - top - pad;
  if (spaceBelow < 120 && rect.top > maxMenuHeight) {
    top = Math.max(pad, rect.top - gap - maxMenuHeight);
  } else if (top + maxMenuHeight > window.innerHeight - pad) {
    top = Math.max(pad, window.innerHeight - maxMenuHeight - pad);
  }

  return { top, left, minWidth };
}

export function RowActionsMenu({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<PopCoords | null>(null);

  const updateCoords = useCallback(() => {
    if (!anchorRef.current) return;
    setCoords(computePopCoords(anchorRef.current));
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updateCoords();
  }, [open, updateCoords, actions.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onReflow = () => updateCoords();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, updateCoords]);

  const popover = open && coords && createPortal(
    <div
      ref={popRef}
      className="adm-row-menu-pop adm-row-menu-pop--fixed"
      style={{
        top: coords.top,
        left: coords.left,
        minWidth: coords.minWidth,
      }}
      role="menu"
    >
      {actions.map(a => (
        <button
          key={a.label}
          type="button"
          role="menuitem"
          className={a.danger ? 'adm-row-menu-item danger' : 'adm-row-menu-item'}
          onClick={() => {
            setOpen(false);
            if (a.confirmMessage && !confirm(a.confirmMessage)) return;
            a.onClick();
          }}
        >
          {a.label}
        </button>
      ))}
    </div>,
    document.body,
  );

  return (
    <div className="adm-row-menu" ref={anchorRef}>
      <button
        type="button"
        className="adm-btn adm-btn-sm adm-btn-secondary"
        onClick={e => {
          e.stopPropagation();
          setOpen(v => !v);
        }}
        aria-label="Действия"
        aria-expanded={open}
      >
        ⋮
      </button>
      {popover}
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
