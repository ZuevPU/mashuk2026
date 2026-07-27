import type { ReactNode } from 'react';

type Props = {
  title: string;
  hint?: string;
  children?: ReactNode;
};

export function AdminPageHero({ title, hint, children }: Props) {
  return (
    <div className="adm-forum-hero card">
      <h2 className="adm-forum-hero-title">{title}</h2>
      {hint && <p className="adm-forum-hint">{hint}</p>}
      {children}
    </div>
  );
}
