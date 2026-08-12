import { useEffect, useMemo, useState, type ReactNode } from 'react';

export type HubNavItem = {
  id: string;
  label: string;
};

type NavProps = {
  items: HubNavItem[];
  /** Подпись для aria-label, напр. «Разделы статистики» */
  label?: string;
};

/**
 * Лёгкая правая навигация по блокам любой линзы Штаба — в духе Apple:
 * тонкая, fixed в пустой зоне справа, без карточек. Только ≥1480px (см. CSS).
 */
export function HubSideNav({ items, label = 'Разделы на странице' }: NavProps) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? '');

  const idsKey = useMemo(() => items.map(i => i.id).join('|'), [items]);

  useEffect(() => {
    if (!items[0]?.id) {
      setActiveId('');
      return;
    }
    setActiveId(prev => (items.some(i => i.id === prev) ? prev : items[0].id));

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
    <nav className="adm-hub-side-nav" aria-label={label}>
      <div className="adm-hub-side-nav-inner">
        <div className="adm-hub-side-nav-title">На странице</div>
        <ul className="adm-hub-side-nav-list">
          {items.map(item => {
            const on = item.id === activeId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`adm-hub-side-nav-link${on ? ' is-on' : ''}`}
                  onClick={() => scrollTo(item.id)}
                  aria-current={on ? 'true' : undefined}
                >
                  <span className="adm-hub-side-nav-dot" aria-hidden />
                  <span className="adm-hub-side-nav-label">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

/** Обёртка линзы: контент + правая навигация по якорям. */
export function HubLensLayout({
  items,
  navLabel,
  children,
  className,
}: {
  items: HubNavItem[];
  navLabel?: string;
  children: ReactNode;
  /** Доп. класс на корень (напр. adm-day-results) */
  className?: string;
}) {
  const rootCls = 'adm-hub-layout';
  const mainCls = ['adm-hub-main', className].filter(Boolean).join(' ');
  return (
    <div className={rootCls}>
      <div className={mainCls}>{children}</div>
      <HubSideNav items={items} label={navLabel} />
    </div>
  );
}
