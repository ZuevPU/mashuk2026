import { useEffect, useState } from 'react';
import { confirmDelete, CONFIRM_DELETE_SUBTOPIC } from '../../admin/confirmDelete';
import { PlaceSelect } from './ProgramPlacesBlock';
import { SpeakerMultiPick } from './ProgramCatalogs';
import {
  MAX_PROGRAM_NEST_DEPTH,
  buildTimeSlot,
  nestLevelLabel,
  parseOptionalTimeSlot,
  type ProgramEvent,
  type ProgramPlace,
  type ProgramSpeaker,
} from './types';

type NestedDraft = {
  title: string;
  place: string;
  timeStart: string;
  timeEnd: string;
  speakerIds: number[];
};

function draftFrom(e: ProgramEvent): NestedDraft {
  const { start, end } = parseOptionalTimeSlot(e.timeSlot);
  const speakerIds = Array.isArray(e.speakerIds) ? e.speakerIds : (e.speakers?.map(s => s.id) ?? []);
  return {
    title: e.title || '',
    place: e.place || '',
    timeStart: start,
    timeEnd: end,
    speakerIds: [...speakerIds],
  };
}

export function NestedEventNode({
  node,
  depth,
  allPlaces,
  speakers,
  selectedDay,
  daySchedulePublished,
  parentPublished,
  onSaved,
  adminFetch,
  act,
}: {
  node: ProgramEvent;
  /** 2 = подблок, 3 = пункт */
  depth: number;
  allPlaces: ProgramPlace[];
  speakers: ProgramSpeaker[];
  selectedDay: number;
  daySchedulePublished: boolean;
  parentPublished: boolean;
  onSaved: () => void;
  adminFetch: (path: string, opts?: RequestInit) => Promise<any>;
  act: (fn: () => Promise<void>, msg?: string) => void;
}) {
  const [draft, setDraft] = useState(() => draftFrom(node));
  const [open, setOpen] = useState(true);
  const [childTitle, setChildTitle] = useState('');
  const [childPlace, setChildPlace] = useState('');
  const [childTimeStart, setChildTimeStart] = useState('');
  const [childTimeEnd, setChildTimeEnd] = useState('');
  const [childSpeakerIds, setChildSpeakerIds] = useState<number[]>([]);

  useEffect(() => {
    setDraft(draftFrom(node));
  }, [node.id, node.title, node.timeSlot, node.place, node.children?.length]);

  const levelLabel = nestLevelLabel(depth);
  const canAddInside = depth < MAX_PROGRAM_NEST_DEPTH;
  const children = node.children || [];
  const childLabel = nestLevelLabel(depth + 1);

  const save = () => {
    if (!draft.title.trim()) {
      alert(`Укажите название (${levelLabel.toLowerCase()}).`);
      return;
    }
    const place = draft.place.trim() || null;
    act(async () => {
      await adminFetch(`/events/${node.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: draft.title.trim(),
          place,
          timeSlot: buildTimeSlot(draft.timeStart, draft.timeEnd) || null,
          speakerIds: draft.speakerIds,
          dayNumber: node.dayNumber ?? selectedDay,
        }),
      });
      // Keep local place immediately — full tab reload may jump day
      setDraft(d => ({ ...d, place: place || '' }));
      onSaved();
    }, 'Сохранено');
  };

  const addChild = () => {
    if (!childTitle.trim()) {
      alert(`Название (${childLabel.toLowerCase()}) обязательно.`);
      return;
    }
    act(async () => {
      await adminFetch('/events', {
        method: 'POST',
        body: JSON.stringify({
          title: childTitle.trim(),
          place: childPlace.trim() || null,
          dayNumber: node.dayNumber ?? selectedDay,
          timeSlot: buildTimeSlot(childTimeStart, childTimeEnd) || null,
          parentEventId: node.id,
          isPublished: parentPublished,
          ...(parentPublished && daySchedulePublished ? { dayPublished: true } : {}),
          blockType: 'session',
          tags: [],
          speakerIds: childSpeakerIds,
        }),
      });
      setChildTitle('');
      setChildPlace('');
      setChildTimeStart('');
      setChildTimeEnd('');
      setChildSpeakerIds([]);
      onSaved();
    }, `${childLabel} добавлен`);
  };

  const timePreview = draft.timeStart
    ? `${draft.timeStart}${draft.timeEnd ? `–${draft.timeEnd}` : ''}`
    : 'без времени';

  return (
    <div className="adm-program-nested-node" style={{ marginTop: 8, paddingLeft: 12, borderLeft: '3px solid #e2e8f0' }}>
      <div
        className="adm-forum-toolbar"
        style={{ alignItems: 'center', cursor: 'pointer', gap: 8 }}
        onClick={() => setOpen(v => !v)}
      >
        <span className="adm-muted" style={{ fontSize: 11 }}>{levelLabel}</span>
        <span style={{ fontSize: 13 }}>
          {timePreview} · {draft.title || '…'}
          {draft.place ? ` · ${draft.place}` : ''}
        </span>
        <span className="adm-muted" style={{ marginLeft: 'auto' }}>{open ? '▼' : '▶'}</span>
      </div>
      {open && (
        <div onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
          <div className="adm-forum-grid-2" style={{ marginTop: 8 }}>
            <label className="adm-field">
              <span className="adm-label">Название</span>
              <input className="adm-input" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label className="adm-field">
              <span className="adm-label">Место</span>
              <PlaceSelect
                places={allPlaces}
                value={draft.place}
                legacyPlace={node.place}
                onChange={name => setDraft({ ...draft, place: name })}
              />
            </label>
          </div>
          <div className="adm-forum-grid-2">
            <label className="adm-field">
              <span className="adm-label">Начало (необязательно)</span>
              <input type="time" className="adm-input" value={draft.timeStart} onChange={e => setDraft({ ...draft, timeStart: e.target.value })} />
            </label>
            <label className="adm-field">
              <span className="adm-label">Окончание</span>
              <input type="time" className="adm-input" value={draft.timeEnd} onChange={e => setDraft({ ...draft, timeEnd: e.target.value })} />
            </label>
          </div>
          <div className="adm-field">
            <span className="adm-label">Спикеры</span>
            <SpeakerMultiPick speakers={speakers} selectedIds={draft.speakerIds} onChange={ids => setDraft({ ...draft, speakerIds: ids })} />
          </div>
          <div className="adm-forum-toolbar" style={{ marginTop: 6 }}>
            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={save}>Сохранить</button>
            <button
              type="button"
              className="adm-btn adm-btn-danger adm-btn-sm"
              onClick={() => {
                if (!confirmDelete(CONFIRM_DELETE_SUBTOPIC)) return;
                act(async () => {
                  await adminFetch(`/events/${node.id}`, { method: 'DELETE' });
                  onSaved();
                }, 'Удалено');
              }}
            >
              Удалить
            </button>
          </div>

          {children.map(ch => (
            <NestedEventNode
              key={ch.id}
              node={ch}
              depth={depth + 1}
              allPlaces={allPlaces}
              speakers={speakers}
              selectedDay={selectedDay}
              daySchedulePublished={daySchedulePublished}
              parentPublished={parentPublished}
              onSaved={onSaved}
              adminFetch={adminFetch}
              act={act}
            />
          ))}

          {canAddInside && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed #e2e8f0' }}>
              <strong style={{ fontSize: 12 }}>+ {childLabel}</strong>
              <div className="adm-forum-grid-2" style={{ marginTop: 6 }}>
                <input
                  className="adm-input"
                  placeholder={`Название (${childLabel.toLowerCase()})`}
                  value={childTitle}
                  onChange={e => setChildTitle(e.target.value)}
                />
                <PlaceSelect places={allPlaces} value={childPlace} onChange={setChildPlace} />
              </div>
              <div className="adm-forum-grid-2" style={{ marginTop: 6 }}>
                <label className="adm-field">
                  <span className="adm-label">Начало (необязательно)</span>
                  <input type="time" className="adm-input" value={childTimeStart} onChange={e => setChildTimeStart(e.target.value)} />
                </label>
                <label className="adm-field">
                  <span className="adm-label">Окончание</span>
                  <input type="time" className="adm-input" value={childTimeEnd} onChange={e => setChildTimeEnd(e.target.value)} />
                </label>
              </div>
              <div className="adm-field" style={{ marginTop: 6 }}>
                <span className="adm-label">Спикеры</span>
                <SpeakerMultiPick speakers={speakers} selectedIds={childSpeakerIds} onChange={setChildSpeakerIds} />
              </div>
              <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" style={{ marginTop: 8 }} onClick={addChild}>
                + {childLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
