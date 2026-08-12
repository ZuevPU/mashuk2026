import { useEffect, useMemo, useState } from 'react';

export type ForumNavItem = {
  id: string;
  label: string;
};

type Props = {
  items: ForumNavItem[];
};

/**
 * Лёгкая правая навигация по блокам линзы «Форум» — в духе Apple:
 * тонкая, sticky, без карточек и лишнего шума. Только ≥1280px.
 */
export function HubForumSideNav({ items }: Props) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? '');

  const idsKey = useMemo(() => items.map(i => i.id).join('|'), [items]);

  useEffect(() => {
    const nodes = items
      .map(i => document.getElementById(i.id))
      .filter((n): n is HTMLElement => !!n);
    if (!nodes.length) return;

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target?.id) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        // Учитываем sticky toolbar штаба
        rootMargin: '-18% 0px -55% 0px',
        threshold: [0, 0.15, 0.35, 0.6],
      },
    );

    for (const n of nodes) observer.observe(n);
    return () => observer.disconnect();
  }, [idsKey, items]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveId(id);
  };

  if (!items.length) return null;

  return (
    <nav className="adm-forum-side-nav" aria-label="Разделы форума">
      <div className="adm-forum-side-nav-inner">
        <div className="adm-forum-side-nav-title">На странице</div>
        <ul className="adm-forum-side-nav-list">
          {items.map(item => {
            const on = item.id === activeId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`adm-forum-side-nav-link${on ? ' is-on' : ''}`}
                  onClick={() => scrollTo(item.id)}
                  aria-current={on ? 'true' : undefined}
                >
                  <span className="adm-forum-side-nav-dot" aria-hidden />
                  <span className="adm-forum-side-nav-label">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
