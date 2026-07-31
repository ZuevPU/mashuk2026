import { useState, type ReactNode } from 'react';

type Props = {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function AdminAccordion({ title, summary, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`adm-accordion card adm-forum-block ${open ? 'open' : ''}`}>
      <button type="button" className="adm-accordion-head" onClick={() => setOpen(v => !v)}>
        <span className="adm-accordion-title">{title}</span>
        {summary && <span className="adm-accordion-summary adm-muted">{summary}</span>}
        <span className="adm-accordion-chevron">{open ? '▼' : '▶'}</span>
      </button>
      {open && <div className="adm-accordion-body">{children}</div>}
    </div>
  );
}
