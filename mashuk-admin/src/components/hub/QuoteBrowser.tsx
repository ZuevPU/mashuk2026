import { useState } from 'react';

export type QuoteItem = { text: string; meta?: string };

export function QuoteBrowser({
  quotes,
  total,
  compact,
}: {
  quotes: QuoteItem[];
  total?: number;
  compact?: boolean;
}) {
  const [idx, setIdx] = useState(0);
  if (!quotes.length) {
    return <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет развёрнутых ответов.</p>;
  }
  const cur = quotes[idx] ?? quotes[0];
  const n = quotes.length;
  return (
    <div className={`adm-qbrowser${compact ? ' is-compact' : ''}`}>
      <div className="adm-qbrowser-card">
        {cur.text}
        {cur.meta ? <span className="adm-qbrowser-who">{cur.meta}</span> : null}
      </div>
      <div className="adm-qbrowser-nav">
        <button
          type="button"
          className="adm-btn adm-btn-ghost adm-btn-sm"
          onClick={() => setIdx(i => (i - 1 + n) % n)}
        >
          ‹ Назад
        </button>
        <span className="adm-qbrowser-counter">
          Ответ {idx + 1} из {n}{total && total > n ? ` (примеры из ${total} всего)` : ''}
        </span>
        <button
          type="button"
          className="adm-btn adm-btn-ghost adm-btn-sm"
          onClick={() => setIdx(i => (i + 1) % n)}
        >
          Далее ›
        </button>
      </div>
    </div>
  );
}
