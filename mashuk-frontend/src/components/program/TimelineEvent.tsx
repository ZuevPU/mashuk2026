import React from 'react';
import '../../style.css';

interface TimelineEventProps {
  time: string;
  title: string;
  subtitle: string;
  tags?: string[];
  status: 'past' | 'now' | 'future';
  onClick?: () => void;
  expandState?: 'collapsed' | 'expanded' | null;
}

export const TimelineEvent: React.FC<TimelineEventProps> = ({
  time, title, subtitle, tags, status, onClick, expandState = null,
}) => {
  let rowClass = 'm-tl-row';
  if (status === 'past') rowClass += ' past';
  if (status === 'now') rowClass += ' now-row';

  const trailing = expandState === 'expanded'
    ? '▼'
    : expandState === 'collapsed'
      ? '▶'
      : status === 'past'
        ? '✓'
        : '›';

  return (
    <div className={rowClass} onClick={onClick} role={onClick ? 'button' : undefined}>
      <div className="m-tl-time">{time}</div>
      <div className="m-tl-body">
        <div className="m-tl-title">{title}</div>
        <div className="m-tl-sub">{subtitle}</div>
        {tags && tags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {tags.map(tag => (
              <span key={tag} style={{ fontSize: 9, background: '#F5F0E8', padding: '2px 6px', borderRadius: 4 }}>{tag}</span>
            ))}
          </div>
        )}
        {status === 'now' && <div className="m-tl-badge" title="По московскому времени">Сейчас</div>}
      </div>
      {status === 'past' && !expandState ? (
        <div className="m-tl-check">✓</div>
      ) : (
        <div
          className="m-tl-arr"
          style={status === 'now' && !expandState ? { color: 'rgba(255,255,255,.6)' } : undefined}
        >
          {trailing}
        </div>
      )}
    </div>
  );
};
