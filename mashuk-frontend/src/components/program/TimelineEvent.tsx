import React from 'react';
import '../../style.css';

interface TimelineEventProps {
  time: string;
  title: string;
  subtitle: string;
  tags?: string[];
  status: 'past' | 'now' | 'future';
  onClick?: () => void;
}

export const TimelineEvent: React.FC<TimelineEventProps> = ({ time, title, subtitle, tags, status, onClick }) => {
  let rowClass = 'm-tl-row';
  if (status === 'past') rowClass += ' past';
  if (status === 'now') rowClass += ' now-row';

  return (
    <div className={rowClass} onClick={onClick}>
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
        {status === 'now' && <div className="m-tl-badge">сейчас</div>}
      </div>
      {status === 'past' && <div className="m-tl-check">✓</div>}
      {status === 'now' && <div style={{ fontSize: '16px', color: 'rgba(255,255,255,.6)', marginLeft: '8px' }}>›</div>}
      {status === 'future' && <div className="m-tl-arr">›</div>}
    </div>
  );
};
