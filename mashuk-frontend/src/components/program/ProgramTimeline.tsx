import React from 'react';
import { TimelineEvent, speakersLine, type ProgramSpeakerInfo } from './TimelineEvent';
import '../../style.css';

export interface ProgramChildEvent {
  id: number;
  title: string;
  place?: string | null;
  time: string;
  endTime?: string;
  description?: string;
  descriptionHtml?: string | null;
  tags?: string[];
  speakers?: ProgramSpeakerInfo[];
  hasSubSessions?: boolean;
  children?: ProgramChildEvent[];
}

export interface ProgramEvent {
  id: number;
  time: string;
  endTime?: string;
  title: string;
  subtitle: string;
  description?: string;
  descriptionHtml?: string | null;
  place?: string;
  tags?: string[];
  speakers?: ProgramSpeakerInfo[];
  status: 'past' | 'now' | 'future';
  hasSubSessions?: boolean;
  children?: ProgramChildEvent[];
}

export interface ProgramSlot {
  timeSlot: string;
  parallel: boolean;
  events: ProgramEvent[];
}

type Props = {
  slots: ProgramSlot[];
  expandedParents: Record<number, boolean>;
  onToggleParent: (id: number) => void;
  onSelectEvent: (event: ProgramEvent) => void;
};

function countNested(nodes: ProgramChildEvent[] | undefined): number {
  if (!nodes?.length) return 0;
  return nodes.reduce((n, ch) => n + 1 + countNested(ch.children), 0);
}

function placeOnlySubtitle(subtitle: string, speakers?: ProgramSpeakerInfo[]): string {
  const line = speakersLine(speakers);
  if (!line || !subtitle) return subtitle;
  if (subtitle === line) return '';
  if (subtitle.endsWith(` · ${line}`)) return subtitle.slice(0, -(line.length + 3));
  if (subtitle.startsWith(`${line} · `)) return subtitle.slice(line.length + 3);
  return subtitle;
}

export function ProgramTimeline({
  slots,
  expandedParents,
  onToggleParent,
  onSelectEvent,
}: Props) {
  const renderChildTree = (ch: ProgramChildEvent, root: ProgramEvent, depth: number) => {
    const hasKids = (ch.children?.length ?? 0) > 0;
    const expanded = expandedParents[ch.id];
    const timeLabel = ch.time || (ch.endTime ? `–${ch.endTime}` : '·');
    const nestedSpeakers = speakersLine(ch.speakers);
    const nestedSub = [ch.place, nestedSpeakers].filter(Boolean).join(' · ');
    return (
      <React.Fragment key={ch.id}>
        <button
          type="button"
          className="m-prog-nested"
          style={{ marginLeft: Math.max(0, (depth - 1) * 10) }}
          onClick={() => {
            if (hasKids) onToggleParent(ch.id);
            else {
              onSelectEvent({
                ...root,
                id: ch.id,
                title: ch.title,
                place: ch.place || undefined,
                time: ch.time,
                endTime: ch.endTime,
                tags: ch.tags,
                speakers: ch.speakers,
                description: ch.description,
                descriptionHtml: ch.descriptionHtml,
                subtitle: nestedSub,
                hasSubSessions: false,
                children: [],
              });
            }
          }}
        >
          <span className="m-prog-nested-time">{timeLabel}</span>
          <span className="m-prog-nested-body">
            <span className="m-prog-nested-title">
              {ch.title}
              {hasKids && !expanded ? ` · ${ch.children!.length}` : ''}
            </span>
            {nestedSub && <span className="m-prog-nested-sub">{nestedSub}</span>}
          </span>
          <span className="m-prog-nested-arr">{hasKids ? (expanded ? '▼' : '▶') : '›'}</span>
        </button>
        {hasKids && expanded && ch.children!.map(grand => renderChildTree(grand, root, depth + 1))}
      </React.Fragment>
    );
  };

  const renderEvent = (event: ProgramEvent, grouped: boolean) => {
    const hasChildren = (event.children?.length ?? 0) > 0;
    const expanded = expandedParents[event.id];
    const nestedCount = countNested(event.children);
    const baseSub = placeOnlySubtitle(event.subtitle, event.speakers);
    const subtitle = hasChildren && !expanded
      ? [baseSub, `${nestedCount} тем`].filter(Boolean).join(' · ')
      : baseSub;

    return (
      <div key={event.id} className="m-prog-event-wrap">
        <TimelineEvent
          time={event.time}
          endTime={event.endTime}
          title={event.title}
          subtitle={subtitle}
          speakers={event.speakers}
          status={event.status}
          showTime={grouped}
          expandState={hasChildren ? (expanded ? 'expanded' : 'collapsed') : null}
          onClick={() => {
            if (hasChildren) onToggleParent(event.id);
            else onSelectEvent(event);
          }}
        />
        {hasChildren && expanded && (
          <div className="m-prog-children">
            {event.children!.map(ch => renderChildTree(ch, event, 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="m-prog-timeline">
      {slots.map((slot, index) => {
        const hasNow = slot.events.some(e => e.status === 'now');
        return (
          <section
            key={`${slot.timeSlot}-${index}`}
            className={`m-prog-block${hasNow ? ' m-prog-block--live' : ''}`}
          >
            <div className="m-prog-rail">
              <div className="m-prog-rail-time">{slot.timeSlot}</div>
              <div className="m-prog-rail-line" aria-hidden />
            </div>

            <div className="m-prog-stack">
              {slot.events.map(event => renderEvent(event, slot.parallel && slot.events.length > 1))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
