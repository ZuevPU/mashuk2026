import React from 'react';
import '../../style.css';

interface TimelineEventProps {
  time: string;
  endTime?: string;
  title: string;
  subtitle: string;
  tags?: string[];
  status: 'past' | 'now' | 'future';
  onClick?: () => void;
  expandState?: 'collapsed' | 'expanded' | null;
  /** When events are grouped under one time header, show time inside the card */
  showTime?: boolean;
}

export const TimelineEvent: React.FC<TimelineEventProps> = ({
  time,
  endTime,
  title,
  subtitle,
  tags,
  status,
  onClick,
  expandState = null,
  showTime = false,
}) => {
  let rowClass = 'm-prog-card';
  if (status === 'past') rowClass += ' m-prog-card--past';
  if (status === 'now') rowClass += ' m-prog-card--now';

  const trailing = expandState === 'expanded'
    ? '▼'
    : expandState === 'collapsed'
      ? '▶'
      : status === 'past'
        ? '✓'
        : '›';

  const timeRange = endTime && endTime !== time ? `${time}–${endTime}` : time;

  return (
    <button type="button" className={rowClass} onClick={onClick}>
      <div className="m-prog-card-main">
        {showTime && time && (
          <div className="m-prog-card-time-pill">{timeRange}</div>
        )}
        <div className="m-prog-card-title">{title}</div>
        {subtitle && <div className="m-prog-card-sub">{subtitle}</div>}
        {tags && tags.length > 0 && (
          <div className="m-prog-card-tags">
            {tags.map(tag => (
              <span key={tag} className="m-prog-card-tag">{tag}</span>
            ))}
          </div>
        )}
        {status === 'now' && (
          <div className="m-prog-card-live" title="По московскому времени">Сейчас</div>
        )}
      </div>
      <span
        className={`m-prog-card-arr${status === 'past' && !expandState ? ' m-prog-card-arr--done' : ''}`}
        aria-hidden
      >
        {trailing}
      </span>
    </button>
  );
};
