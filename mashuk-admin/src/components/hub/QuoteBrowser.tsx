import { useEffect, useState } from 'react';

export type QuoteItem = { text: string; meta?: string };

function previewText(text: string, max = 180): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trimEnd()}…`;
}

function QuoteReaderModal({
  quotes,
  index,
  title,
  total,
  onClose,
  onIndex,
}: {
  quotes: QuoteItem[];
  index: number;
  title?: string;
  total?: number;
  onClose: () => void;
  onIndex: (next: number) => void;
}) {
  const n = quotes.length;
  const cur = quotes[index] ?? quotes[0];
  const go = (delta: number) => onIndex((index + delta + n) % n);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onIndex((index - 1 + n) % n);
      if (e.key === 'ArrowRight') onIndex((index + 1) % n);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [index, n, onClose, onIndex]);

  if (!cur) return null;

  return (
    <div
      className="adm-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="card adm-modal adm-quote-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adm-quote-modal-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="adm-quote-modal-head">
          <div>
            <h3 id="adm-quote-modal-title">{title || 'Ответ участника'}</h3>
            <p className="adm-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
              Ответ {index + 1} из {n}
              {total && total > n ? ` · примеры из ${total}` : ''}
            </p>
          </div>
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <div className="adm-quote-modal-body">
          <p className="adm-quote-modal-text">{cur.text}</p>
          {cur.meta ? <span className="adm-qbrowser-who">{cur.meta}</span> : null}
        </div>
        <div className="adm-quote-modal-nav">
          <button
            type="button"
            className="adm-btn adm-btn-secondary adm-btn-sm"
            disabled={n < 2}
            onClick={() => go(-1)}
          >
            ‹ Назад
          </button>
          <span className="adm-qbrowser-counter">{index + 1} / {n}</span>
          <button
            type="button"
            className="adm-btn adm-btn-secondary adm-btn-sm"
            disabled={n < 2}
            onClick={() => go(1)}
          >
            Далее ›
          </button>
        </div>
      </div>
    </div>
  );
}

export function QuoteBrowser({
  quotes,
  total,
  compact,
  title,
}: {
  quotes: QuoteItem[];
  total?: number;
  compact?: boolean;
  title?: string;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [shown, setShown] = useState(compact ? 4 : 8);

  if (!quotes.length) {
    return <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет развёрнутых ответов.</p>;
  }

  const n = quotes.length;
  const visible = quotes.slice(0, shown);

  return (
    <div className={`adm-qbrowser${compact ? ' is-compact' : ''}`}>
      <div className="adm-qbrowser-list">
        {visible.map((q, i) => (
          <button
            key={`${i}-${q.text.slice(0, 24)}`}
            type="button"
            className="adm-qbrowser-item"
            onClick={() => setOpenIdx(i)}
          >
            <span className="adm-qbrowser-item-text">{previewText(q.text, compact ? 120 : 220)}</span>
            {q.meta ? <span className="adm-qbrowser-who">{q.meta}</span> : null}
          </button>
        ))}
      </div>
      <div className="adm-qbrowser-nav">
        {n > shown ? (
          <button
            type="button"
            className="adm-btn adm-btn-ghost adm-btn-sm"
            onClick={() => setShown(s => Math.min(s + (compact ? 4 : 8), n))}
          >
            Показать ещё ({n - shown})
          </button>
        ) : (
          <span className="adm-qbrowser-counter">
            {n} {n === 1 ? 'ответ' : n < 5 ? 'ответа' : 'ответов'}
            {total && total > n ? ` · примеры из ${total}` : ''}
          </span>
        )}
        <button
          type="button"
          className="adm-btn adm-btn-ghost adm-btn-sm"
          onClick={() => setOpenIdx(0)}
        >
          Открыть все
        </button>
      </div>
      {openIdx != null && (
        <QuoteReaderModal
          quotes={quotes}
          index={openIdx}
          title={title}
          total={total}
          onClose={() => setOpenIdx(null)}
          onIndex={setOpenIdx}
        />
      )}
    </div>
  );
}
