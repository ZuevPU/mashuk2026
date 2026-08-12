import { useEffect, useRef, useState, type ReactNode } from 'react';

function nearestScrollRoot(el: HTMLElement): Element | null {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    const oy = style.overflowY;
    if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && node.scrollHeight > node.clientHeight + 8) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Монтирует тяжёлые блоки (Recharts и т.п.) только когда они близко к вьюпорту.
 * После первого показа остаётся смонтированным, чтобы не дёргать графики при скролле.
 */
export function DeferMount({
  children,
  minHeight = 240,
  rootMargin = '280px 0px',
}: {
  children: ReactNode;
  minHeight?: number;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (show) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShow(true);
        observer.disconnect();
      },
      {
        root: nearestScrollRoot(el),
        rootMargin,
        threshold: 0.01,
      },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [show, rootMargin]);

  return (
    <div ref={ref} style={show ? undefined : { minHeight }}>
      {show ? children : null}
    </div>
  );
}
