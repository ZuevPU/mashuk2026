import type { Conclusion } from './forumConclusions';

export function ConclusionCard({
  c,
  index,
}: {
  c: Conclusion;
  index?: number;
}) {
  return (
    <div className="adm-narr-card">
      <div className="adm-narr-card-head">
        {index != null && (
          <span className="adm-narr-card-idx">{String(index + 1).padStart(2, '0')}</span>
        )}
        <div className="adm-narr-card-h">{c.h}</div>
      </div>
      <div className="adm-narr-card-p">{c.p}</div>
      <div className="adm-narr-card-a">
        <span className="adm-narr-card-a-l">Что сделать · </span>
        {c.a}
      </div>
    </div>
  );
}
