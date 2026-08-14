import { useEffect, useMemo, useState } from 'react';
import { speakerFullLabel } from '../speakers/speakerFormat';
import { resolveDraftAudienceIds } from './eventEditorShared';
import { parseOptionalTimeSlot, parseTimeSlot, type ProgramEvent, type ScheduleDayRow } from './types';

const WEEKDAYS = ['сб', 'вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб · отъезд'];

type Props = {
  day: number;
  totalDays: number;
  liveDay: number;
  events: ProgramEvent[];
  scheduleDays: ScheduleDayRow[];
  directions: { id: number; name: string }[];
  directionId: number | null;
  onDayChange: (day: number) => void;
};

type PreviewChild = {
  id: number;
  title: string;
  place?: string | null;
  time: string;
  endTime?: string;
  description?: string | null;
  descriptionHtml?: string | null;
  speakers: ProgramEvent['speakers'];
  draft: boolean;
  children: PreviewChild[];
};

type PreviewEvent = PreviewChild & {
  subtitle: string;
  status: 'past' | 'now' | 'future';
};

type PreviewSlot = {
  timeSlot: string;
  parallel: boolean;
  events: PreviewEvent[];
};

function eventVisible(e: ProgramEvent, directionId: number | null): boolean {
  const ids = resolveDraftAudienceIds(e);
  if (!ids.length || directionId == null) return true;
  return ids.includes(directionId);
}

function filterTree(nodes: ProgramEvent[], directionId: number | null): ProgramEvent[] {
  return nodes
    .filter(e => eventVisible(e, directionId))
    .map(e => ({ ...e, children: filterTree(e.children || [], directionId) }));
}

function countNested(nodes: PreviewChild[] | undefined): number {
  if (!nodes?.length) return 0;
  return nodes.reduce((n, ch) => n + 1 + countNested(ch.children), 0);
}

function speakersLine(speakers?: ProgramEvent['speakers']): string {
  return (speakers || []).map(s => speakerFullLabel(s)).filter(Boolean).join(', ');
}

function mapChild(e: ProgramEvent): PreviewChild {
  const { start, end } = parseOptionalTimeSlot(e.timeSlot);
  return {
    id: e.id,
    title: e.title || 'Без названия',
    place: e.place,
    time: start,
    endTime: end && end !== start ? end : undefined,
    description: e.description,
    descriptionHtml: e.descriptionHtml,
    speakers: e.speakers,
    draft: e.isPublished === false,
    children: (e.children || []).map(mapChild),
  };
}

function mapRoot(e: ProgramEvent, liveDay: number, day: number): PreviewEvent {
  const child = mapChild(e);
  const speakerText = speakersLine(e.speakers);
  const status: PreviewEvent['status'] = day < liveDay ? 'past' : day === liveDay ? 'future' : 'future';
  return {
    ...child,
    subtitle: [e.place, speakerText].filter(Boolean).join(' · '),
    status,
  };
}

function slotLabel(e: ProgramEvent): { key: string; sort: string; label: string } {
  const raw = e.timeSlot?.trim();
  if (!raw) {
    const { start, end } = parseTimeSlot(e.timeSlot);
    return { key: start, sort: start, label: end && end !== start ? `${start}–${end}` : start };
  }
  const { start, end } = parseOptionalTimeSlot(raw);
  const label = start && end && end !== start ? `${start}–${end}` : (start || raw);
  return { key: start || raw, sort: start || '99:99', label };
}

function buildSlots(roots: ProgramEvent[], liveDay: number, day: number): PreviewSlot[] {
  const groups = new Map<string, { label: string; sort: string; events: ProgramEvent[] }>();
  for (const e of roots) {
    const slot = slotLabel(e);
    const g = groups.get(slot.key) ?? { label: slot.label, sort: slot.sort, events: [] };
    g.events.push(e);
    groups.set(slot.key, g);
  }
  return [...groups.values()]
    .sort((a, b) => a.sort.localeCompare(b.sort))
    .map(g => ({
      timeSlot: g.label,
      parallel: g.events.length > 1,
      events: g.events.map(e => mapRoot(e, liveDay, day)),
    }));
}

function htmlOrText(html?: string | null, text?: string | null): string {
  if (html?.trim()) return html;
  if (text?.trim()) return text.replace(/\n/g, '<br/>');
  return '';
}

export function ProgramParticipantPreview({
  day,
  totalDays,
  liveDay,
  events,
  scheduleDays,
  directions,
  directionId,
  onDayChange,
}: Props) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [selected, setSelected] = useState<PreviewEvent | PreviewChild | null>(null);

  useEffect(() => {
    setSelected(null);
    setExpanded({});
  }, [day, directionId]);

  const dayPublished = scheduleDays.find(d => d.dayNumber === day)?.isPublished === true;
  const roots = useMemo(
    () => filterTree(events.filter(e => e.dayNumber === day), directionId),
    [events, day, directionId],
  );
  const slots = useMemo(() => buildSlots(roots, liveDay, day), [roots, liveDay, day]);
  const weekday = WEEKDAYS[day - 1] || '';
  const directionName = directionId
    ? directions.find(d => d.id === directionId)?.name
    : null;

  const toggle = (id: number) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const renderChild = (ch: PreviewChild, depth: number) => {
    const hasKids = ch.children.length > 0;
    const open = expanded[ch.id];
    const time = ch.time ? (ch.endTime ? `${ch.time}–${ch.endTime}` : ch.time) : '·';
    const sub = [ch.place, speakersLine(ch.speakers)].filter(Boolean).join(' · ');
    return (
      <div key={ch.id}>
        <button
          type="button"
          className={`adm-prog-preview-nested${ch.draft ? ' is-draft' : ''}`}
          style={{ marginLeft: Math.max(0, (depth - 1) * 10) }}
          onClick={() => (hasKids ? toggle(ch.id) : setSelected(ch))}
        >
          <span className="adm-prog-preview-nested-time">{time}</span>
          <span className="adm-prog-preview-nested-body">
            <span className="adm-prog-preview-nested-title">
              {ch.title}
              {hasKids && !open ? ` · ${ch.children.length}` : ''}
              {ch.draft ? ' · черновик' : ''}
            </span>
            {sub && <span className="adm-prog-preview-nested-sub">{sub}</span>}
          </span>
          <span className="adm-prog-preview-arr">{hasKids ? (open ? '▼' : '▶') : '›'}</span>
        </button>
        {hasKids && open && ch.children.map(grand => renderChild(grand, depth + 1))}
      </div>
    );
  };

  return (
    <div className="adm-evening-preview-shell">
      <div className="adm-forum-preview-label">
        Как у участника · программа
        {directionName ? ` · ${directionName}` : ''}
      </div>
      <div className="adm-evening-preview-phone">
        <div className="adm-evening-preview-card adm-kb-preview-card adm-prog-preview-card">
          <div className="adm-kb-preview-appbar">Программа</div>
          <div className="adm-kb-preview-tabs">
            <span className="adm-kb-preview-tab active">Расписание</span>
            <span className="adm-kb-preview-tab">База знаний</span>
          </div>
          <div className="adm-kb-preview-days">
            {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => (
              <button
                key={d}
                type="button"
                className={`adm-kb-preview-day${d === day ? ' active' : ''}`}
                onClick={() => onDayChange(d)}
              >
                Д{d}
              </button>
            ))}
          </div>

          {selected ? (
            <div className="adm-prog-preview-detail">
              <button type="button" className="adm-prog-preview-back" onClick={() => setSelected(null)}>
                ← К расписанию
              </button>
              <div className="adm-prog-preview-detail-title">{selected.title}</div>
              <div className="adm-prog-preview-detail-row">
                <span>Время</span>
                <b>
                  {selected.time || '—'}
                  {selected.endTime ? ` — ${selected.endTime}` : ''}
                </b>
              </div>
              {selected.place && (
                <div className="adm-prog-preview-detail-row">
                  <span>Место</span>
                  <b>{selected.place}</b>
                </div>
              )}
              {speakersLine(selected.speakers) && (
                <div className="adm-prog-preview-detail-row">
                  <span>Спикеры</span>
                  <b>{speakersLine(selected.speakers)}</b>
                </div>
              )}
              {htmlOrText(selected.descriptionHtml, selected.description) && (
                <div
                  className="adm-prog-preview-detail-html"
                  dangerouslySetInnerHTML={{ __html: htmlOrText(selected.descriptionHtml, selected.description) }}
                />
              )}
              <p className="adm-prog-preview-hint">В превью посещаемость и рекомендации не считаются.</p>
            </div>
          ) : (
            <>
              <div className="adm-kb-preview-day-card">
                <div className="adm-kb-preview-day-title">День {day}{weekday ? ` · ${weekday}` : ''}</div>
                <div className="adm-kb-preview-day-meta">
                  {dayPublished
                    ? `Участники видят опубликованные блоки${directionName ? ` направления «${directionName}»` : ''}`
                    : 'День не опубликован — участники это расписание не видят'}
                </div>
              </div>

              {day === 8 ? (
                <div className="adm-prog-preview-day8">
                  <div className="adm-prog-preview-day8-ico">🎯</div>
                  <div className="adm-prog-preview-day8-title">День 8 · Отъезд</div>
                  <div className="adm-prog-preview-day8-sub">
                    Утро — Точка Б (финальная рефлексия). Дневная программа не запускается.
                  </div>
                </div>
              ) : slots.length === 0 ? (
                <div className="adm-kb-preview-empty">
                  {!dayPublished
                    ? 'Расписание ещё не опубликовано. Добавьте блоки и нажмите «Опубликовать день».'
                    : `События для дня ${day} появятся позже`}
                </div>
              ) : (
                <div className="adm-prog-preview-timeline">
                  {slots.map(slot => (
                    <section key={slot.timeSlot} className="adm-prog-preview-block">
                      <div className="adm-prog-preview-rail">
                        <div className="adm-prog-preview-rail-time">{slot.timeSlot}</div>
                        <div className="adm-prog-preview-rail-line" />
                      </div>
                      <div className="adm-prog-preview-stack">
                        {slot.events.map(event => {
                          const hasKids = event.children.length > 0;
                          const open = expanded[event.id];
                          const nested = countNested(event.children);
                          const sub = hasKids && !open
                            ? [event.subtitle, `${nested} тем`].filter(Boolean).join(' · ')
                            : event.subtitle;
                          return (
                            <div key={event.id}>
                              <button
                                type="button"
                                className={`adm-prog-preview-card-row${event.draft ? ' is-draft' : ''}${event.status === 'past' ? ' is-past' : ''}`}
                                onClick={() => (hasKids ? toggle(event.id) : setSelected(event))}
                              >
                                <div className="adm-prog-preview-card-main">
                                  {slot.parallel && event.time && (
                                    <div className="adm-prog-preview-time-pill">
                                      {event.endTime ? `${event.time}–${event.endTime}` : event.time}
                                    </div>
                                  )}
                                  <div className="adm-prog-preview-card-title">
                                    {event.title}
                                    {event.draft ? <em> черновик</em> : null}
                                  </div>
                                  {sub && <div className="adm-prog-preview-card-sub">{sub}</div>}
                                </div>
                                <span className="adm-prog-preview-arr">
                                  {hasKids ? (open ? '▼' : '▶') : event.status === 'past' ? '✓' : '›'}
                                </span>
                              </button>
                              {hasKids && open && (
                                <div className="adm-prog-preview-children">
                                  {event.children.map(ch => renderChild(ch, 1))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
