import type { ReactNode } from 'react';

type Props = {
  title: string;
  hint?: string;
  children?: ReactNode;
};

export function AdminPageHero({ title, hint, children }: Props) {
  return (
    <div className="adm-forum-hero card adm-kb-panel">
      <div className="adm-kb-panel-head" style={{ marginBottom: children ? 12 : 0 }}>
        <h2 className="adm-forum-hero-title">{title}</h2>
        {hint && <p className="adm-kb-panel-sub">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
