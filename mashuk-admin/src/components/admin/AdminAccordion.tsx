import { useState, type ReactNode } from 'react';

type Props = {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  /** Якорь для правой навигации */
  id?: string;
  children: ReactNode;
};

export function AdminAccordion({ title, summary, defaultOpen = false, id, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      id={id}
      className={[
        'adm-accordion',
        'card',
        'adm-forum-block',
        'adm-kb-panel',
        open ? 'open' : '',
        id ? 'adm-forum-anchor' : '',
      ].filter(Boolean).join(' ')}
    >
      <button type="button" className="adm-accordion-head" onClick={() => setOpen(v => !v)}>
        <span className="adm-accordion-title">{title}</span>
        {summary && <span className="adm-accordion-summary adm-muted">{summary}</span>}
        <span className="adm-accordion-chevron" aria-hidden>{open ? '▼' : '▶'}</span>
      </button>
      {open && <div className="adm-accordion-body">{children}</div>}
    </div>
  );
}
