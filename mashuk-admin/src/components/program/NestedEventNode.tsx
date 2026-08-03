import { useEffect, useState } from 'react';
import { confirmDelete, CONFIRM_DELETE_SUBTOPIC } from '../../admin/confirmDelete';
import { PlaceSelect } from './ProgramPlacesBlock';
import { SpeakerMultiPick } from './ProgramCatalogs';
import { ThematicTagPick } from './ThematicTagPick';
import {
  MAX_PROGRAM_NEST_DEPTH,
  buildTimeSlot,
  nestLevelLabel,
  parseOptionalTimeSlot,
  type ProgramEvent,
  type ProgramPlace,
  type ProgramSpeaker,
  type ThematicTag,
} from './types';

type DirectionOpt = { id: number; name: string };

type NestedDraft = {
  title: string;
  place: string;
  timeStart: string;
  timeEnd: string;
  speakerIds: number[];
  tagNames: string[];
  audienceType: 'all' | 'direction';
  audienceDirectionId: string;
};

function draftFrom(e: ProgramEvent): NestedDraft {
  const { start, end } = parseOptionalTimeSlot(e.timeSlot);
  const speakerIds = Array.isArray(e.speakerIds) ? e.speakerIds : (e.speakers?.map(s => s.id) ?? []);
  const tags = Array.isArray(e.tags) ? e.tags : [];
  return {
    title: e.title || '',
    place: e.place || '',
    timeStart: start,
    timeEnd: end,
    speakerIds: [...speakerIds],
    tagNames: [...tags],
    audienceType: e.audienceType === 'direction' ? 'direction' : 'all',
    audienceDirectionId: e.audienceDirectionId ? String(e.audienceDirectionId) : '',
  };
}

function audiencePayload(audienceType: 'all' | 'direction', audienceDirectionId: string) {
  return {
    audienceType,
    audienceDirectionId: audienceType === 'direction' && audienceDirectionId
      ? Number(audienceDirectionId)
      : null,
  };
}

function AudienceFields({
  audienceType,
  audienceDirectionId,
  directions,
  onTypeChange,
  onDirectionChange,
}: {
  audienceType: 'all' | 'direction';
  audienceDirectionId: string;
  directions: DirectionOpt[];
  onTypeChange: (v: 'all' | 'direction') => void;
  onDirectionChange: (v: string) => void;
}) {
  return (
    <div className="adm-forum-grid-2" style={{ marginTop: 6 }}>
      <label className="adm-field">
        <span className="adm-label">Аудитория</span>
        <select
          className="adm-input"
          value={audienceType}
          onChange={e => onTypeChange(e.target.value as 'all' | 'direction')}
        >
          <option value="all">Все участники</option>
          <option value="direction">Направление</option>
        </select>
      </label>
      {audienceType === 'direction' && (
        <label className="adm-field">
          <span className="adm-label">Направление</span>
          <select
            className="adm-input"
            value={audienceDirectionId}
            onChange={e => onDirectionChange(e.target.value)}
          >
            <option value="">—</option>
            {directions.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

export function NestedEventNode({
  node,
  depth,
  allPlaces,
  allTags,
  directions,
  speakers,
  selectedDay,
  daySchedulePublished,
  parentPublished,
  onSaved,
  adminFetch,
  act,
}: {
  node: ProgramEvent;
  /** 2+ = nested subblock under a root block */
  depth: number;
  allPlaces: ProgramPlace[];
  allTags: ThematicTag[];
  directions: DirectionOpt[];
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
  const [childTagNames, setChildTagNames] = useState<string[]>([]);
  const [childAudienceType, setChildAudienceType] = useState<'all' | 'direction'>('all');
  const [childAudienceDirectionId, setChildAudienceDirectionId] = useState('');

  useEffect(() => {
    setDraft(draftFrom(node));
  }, [node.id, node.title, node.timeSlot, node.place, node.tags, node.audienceType, node.audienceDirectionId, node.children?.length]);

  const levelLabel = nestLevelLabel(depth);
  const canAddInside = depth < MAX_PROGRAM_NEST_DEPTH;
  const children = node.children || [];
  const childLabel = nestLevelLabel(depth + 1);
  const directionName = draft.audienceType === 'direction' && draft.audienceDirectionId
    ? directions.find(d => String(d.id) === draft.audienceDirectionId)?.name
    : null;

  const save = () => {
    if (!draft.title.trim()) {
      alert(`Укажите название (${levelLabel.toLowerCase()}).`);
      return;
    }
    if (draft.audienceType === 'direction' && !draft.audienceDirectionId) {
      alert('Выберите направление для аудитории.');
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
          tags: draft.tagNames,
          dayNumber: node.dayNumber ?? selectedDay,
          ...audiencePayload(draft.audienceType, draft.audienceDirectionId),
        }),
      });
      setDraft(d => ({ ...d, place: place || '' }));
      onSaved();
    }, 'Сохранено');
  };

  const addChild = () => {
    if (!childTitle.trim()) {
      alert(`Название (${childLabel.toLowerCase()}) обязательно.`);
      return;
    }
    if (childAudienceType === 'direction' && !childAudienceDirectionId) {
      alert('Выберите направление для аудитории.');
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
          tags: childTagNames,
          speakerIds: childSpeakerIds,
          ...audiencePayload(childAudienceType, childAudienceDirectionId),
        }),
      });
      setChildTitle('');
      setChildPlace('');
      setChildTimeStart('');
      setChildTimeEnd('');
      setChildSpeakerIds([]);
      setChildTagNames([]);
      setChildAudienceType('all');
      setChildAudienceDirectionId('');
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
          {directionName ? ` · ${directionName}` : ''}
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
          <AudienceFields
            audienceType={draft.audienceType}
            audienceDirectionId={draft.audienceDirectionId}
            directions={directions}
            onTypeChange={v => setDraft({ ...draft, audienceType: v })}
            onDirectionChange={v => setDraft({ ...draft, audienceDirectionId: v })}
          />
          <div className="adm-field">
            <span className="adm-label">Спикеры</span>
            <SpeakerMultiPick speakers={speakers} selectedIds={draft.speakerIds} onChange={ids => setDraft({ ...draft, speakerIds: ids })} />
          </div>
          <div className="adm-field">
            <span className="adm-label">Тематические теги</span>
            <ThematicTagPick tags={allTags} selectedNames={draft.tagNames} onChange={names => setDraft({ ...draft, tagNames: names })} />
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
              allTags={allTags}
              directions={directions}
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
              <AudienceFields
                audienceType={childAudienceType}
                audienceDirectionId={childAudienceDirectionId}
                directions={directions}
                onTypeChange={setChildAudienceType}
                onDirectionChange={setChildAudienceDirectionId}
              />
              <div className="adm-field" style={{ marginTop: 6 }}>
                <span className="adm-label">Спикеры</span>
                <SpeakerMultiPick speakers={speakers} selectedIds={childSpeakerIds} onChange={setChildSpeakerIds} />
              </div>
              <div className="adm-field" style={{ marginTop: 6 }}>
                <span className="adm-label">Тематические теги</span>
                <ThematicTagPick tags={allTags} selectedNames={childTagNames} onChange={setChildTagNames} />
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
