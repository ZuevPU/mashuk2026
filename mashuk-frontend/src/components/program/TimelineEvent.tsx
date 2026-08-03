import React from 'react';
import '../../style.css';

export type ProgramSpeakerInfo = {
  id: number;
  name: string;
  credentials?: string | null;
  initials?: string | null;
};

export function formatSpeakerLabel(s: ProgramSpeakerInfo): string {
  const cred = s.credentials?.trim();
  return cred ? `${s.name} — ${cred}` : s.name;
}

export function speakersLine(speakers?: ProgramSpeakerInfo[] | null): string {
  if (!speakers?.length) return '';
  return speakers.map(formatSpeakerLabel).filter(Boolean).join(', ');
}

interface TimelineEventProps {
  time: string;
  endTime?: string;
  title: string;
  subtitle: string;
  speakers?: ProgramSpeakerInfo[];
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
  speakers,
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
  const speakerText = speakersLine(speakers);

  return (
    <button type="button" className={rowClass} onClick={onClick}>
      <div className="m-prog-card-main">
        {showTime && time && (
          <div className="m-prog-card-time-pill">{timeRange}</div>
        )}
        <div className="m-prog-card-title">{title}</div>
        {subtitle && <div className="m-prog-card-sub">{subtitle}</div>}
        {speakerText && <div className="m-prog-card-speakers">{speakerText}</div>}
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
