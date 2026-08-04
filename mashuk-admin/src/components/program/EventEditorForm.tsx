import { useEffect, useMemo, useState } from 'react';
import { label } from '../../labels/ru';
import { confirmDelete, CONFIRM_DELETE_EVENT } from '../../admin/confirmDelete';
import { ParticipantPreviewModal } from '../admin/ParticipantPreviewModal';
import { DescriptionEditor } from '../admin/DescriptionEditor';
import { PlaceSelect } from './ProgramPlacesBlock';
import { SpeakerMultiPick } from './ProgramCatalogs';
import { ThematicTagPick } from './ThematicTagPick';
import { speakerFullLabel } from '../speakers/speakerFormat';
import { NestedEventNode } from './NestedEventNode';
import { EventParticipantPreview } from './EventParticipantPreview';
import { DirectionAudiencePick } from './DirectionAudiencePick';
import {
  BLOCK_TYPE_OPTIONS,
  buildTimeSlot,
  eventVisibilityLabel,
  nestLevelLabel,
  type ProgramBlockType,
  type ProgramEvent,
  type ProgramPlace,
  type ProgramSpeaker,
  type ThematicTag,
} from './types';
import { draftFromEvent, draftToBody, emptyEventDraft, type EventDraft } from './eventEditorShared';

function blockTypeLabel(blockTypes: ProgramBlockType[], key: string): string {
  const hit = blockTypes.find(b => b.key === key);
  if (hit) return hit.name;
  const opt = BLOCK_TYPE_OPTIONS.find(o => o.value === key);
  return opt ? label(opt.labelKey) : key;
}

type Props = {
  mode: 'create' | 'edit';
  event?: ProgramEvent;
  initialDraft?: Partial<EventDraft>;
  allTags: ThematicTag[];
  allPlaces: ProgramPlace[];
  blockTypes: ProgramBlockType[];
  speakers: ProgramSpeaker[];
  directions: { id: number; name: string }[];
  daySchedulePublished: boolean;
  onSaved: () => void;
  onClose: () => void;
  onGoToDay?: (day: number) => void;
  adminFetch: (path: string, opts?: RequestInit) => Promise<any>;
  act: (fn: () => Promise<void>, msg?: string) => void;
};

export function EventEditorForm({
  mode,
  event,
  initialDraft,
  allTags,
  allPlaces,
  blockTypes,
  speakers,
  directions,
  daySchedulePublished,
  onSaved,
  onClose,
  onGoToDay,
  adminFetch,
  act,
}: Props) {
  const editingKey = mode === 'edit' && event ? event.id : `new-${initialDraft?.dayNumber ?? 0}-${initialDraft?.timeStart ?? ''}`;
  const [draft, setDraft] = useState<EventDraft>(() => {
    if (mode === 'edit' && event) return draftFromEvent(event);
    return { ...emptyEventDraft(initialDraft?.dayNumber ?? 1), ...initialDraft };
  });
  const [childTitle, setChildTitle] = useState('');
  const [childPlace, setChildPlace] = useState('');
  const [childTimeStart, setChildTimeStart] = useState('');
  const [childTimeEnd, setChildTimeEnd] = useState('');
  const [childSpeakerIds, setChildSpeakerIds] = useState<number[]>([]);
  const [childTagNames, setChildTagNames] = useState<string[]>([]);
  const [childAudienceDirectionIds, setChildAudienceDirectionIds] = useState<number[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dupDay, setDupDay] = useState(String(draft.dayNumber));

  useEffect(() => {
    if (mode === 'edit' && event) {
      setDraft(draftFromEvent(event));
      setDupDay(String(event.dayNumber ?? 1));
    } else if (mode === 'create') {
      setDraft({ ...emptyEventDraft(initialDraft?.dayNumber ?? 1), ...initialDraft });
      setDupDay(String(initialDraft?.dayNumber ?? 1));
    }
  }, [mode, event?.id, editingKey]);

  const blockOptions = useMemo(() => {
    if (blockTypes.length) {
      return blockTypes.map(b => ({ value: b.key, label: b.name }));
    }
    return BLOCK_TYPE_OPTIONS.map(o => ({ value: o.value, label: label(o.labelKey) }));
  }, [blockTypes]);

  const vis = event ? eventVisibilityLabel(event) : 'draft';
  const visLabel =
    vis === 'visible' ? label('schedule_visible') : vis === 'waiting_day' ? label('schedule_waiting_day') : label('draft');

  const speakerLine = event
    ? (event.speakers?.map(s => speakerFullLabel(s)).join('; ')
      || speakers.filter(s => draft.speakerIds.includes(s.id)).map(speakerFullLabel).join('; '))
    : speakers.filter(s => draft.speakerIds.includes(s.id)).map(speakerFullLabel).join('; ');

  const children = event?.children || [];

  const saveCreate = (publish: boolean) => {
    if (!draft.title.trim()) {
      alert('Укажите название события.');
      return;
    }
    act(async () => {
      await adminFetch('/events', {
        method: 'POST',
        body: JSON.stringify(draftToBody(draft, { publish, dayPublished: daySchedulePublished, dayNumber: draft.dayNumber })),
      });
      onSaved();
      onClose();
    }, publish ? 'Событие опубликовано' : 'Событие добавлено в черновик');
  };

  const saveEdit = () => {
    if (!event || !draft.title.trim()) {
      alert('Укажите название события.');
      return;
    }
    act(async () => {
      await adminFetch(`/events/${event.id}`, {
        method: 'PATCH',
        body: JSON.stringify(draftToBody(draft)),
      });
      onSaved();
    }, 'Изменения сохранены');
  };

  const publishEdit = () => {
    if (!event) return;
    act(async () => {
      await adminFetch(`/events/${event.id}`, {
        method: 'PATCH',
        body: JSON.stringify(draftToBody(draft, { publish: true, dayPublished: daySchedulePublished })),
      });
      onSaved();
    }, 'Опубликовано');
  };

  const addChild = () => {
    if (!event || !childTitle.trim()) {
      alert('Название подблока обязательно.');
      return;
    }
    const ids = childAudienceDirectionIds.filter(n => Number.isInteger(n) && n > 0);
    act(async () => {
      await adminFetch('/events', {
        method: 'POST',
        body: JSON.stringify({
          title: childTitle.trim(),
          place: childPlace.trim() || null,
          dayNumber: event.dayNumber ?? draft.dayNumber,
          timeSlot: buildTimeSlot(childTimeStart, childTimeEnd) || null,
          parentEventId: event.id,
          isPublished: event.isPublished === true,
          ...(event.isPublished && daySchedulePublished ? { dayPublished: true } : {}),
          blockType: 'session',
          tags: childTagNames,
          speakerIds: childSpeakerIds,
          audienceType: ids.length ? 'direction' : 'all',
          audienceDirectionId: ids[0] ?? null,
          audienceDirectionIds: ids,
        }),
      });
      setChildTitle('');
      setChildPlace('');
      setChildTimeStart('');
      setChildTimeEnd('');
      setChildSpeakerIds([]);
      setChildTagNames([]);
      setChildAudienceDirectionIds([]);
      if (!draft.hasSubSessions) {
        await adminFetch(`/events/${event.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...draftToBody(draft), hasSubSessions: true }),
        });
      }
      onSaved();
    }, 'Подблок добавлен');
  };

  return (
    <div className="adm-program-editor-form">
      {mode === 'edit' && event && (
        <div className="adm-program-editor-meta">
          <span className={`adm-program-badge adm-program-badge-${vis}`}>{visLabel}</span>
          <span className="adm-muted adm-program-badge">{blockTypeLabel(blockTypes, draft.blockType)}</span>
        </div>
      )}

      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">Название</span>
          <input className="adm-input" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
        </label>
        <label className="adm-field">
          <span className="adm-label">Место</span>
          <PlaceSelect
            places={allPlaces}
            value={draft.place}
            legacyPlace={event?.place}
            onChange={name => setDraft({ ...draft, place: name })}
          />
        </label>
      </div>
      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">День</span>
          <input
            type="number"
            min={1}
            className="adm-input"
            value={draft.dayNumber}
            onChange={e => setDraft({ ...draft, dayNumber: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
        <span />
      </div>
      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">Начало</span>
          <input type="time" className="adm-input" value={draft.timeStart} onChange={e => setDraft({ ...draft, timeStart: e.target.value })} />
        </label>
        <label className="adm-field">
          <span className="adm-label">Окончание</span>
          <input type="time" className="adm-input" value={draft.timeEnd} onChange={e => setDraft({ ...draft, timeEnd: e.target.value })} />
        </label>
      </div>
      <DescriptionEditor
        description={draft.description}
        descriptionHtml={draft.descriptionHtml}
        onChange={patch => setDraft(d => ({ ...d, ...patch }))}
        editingKey={editingKey}
      />
      <label className="adm-field">
        <span className="adm-label">Тип блока</span>
        <select className="adm-input" value={draft.blockType} onChange={e => setDraft({ ...draft, blockType: e.target.value })}>
          {blockOptions.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <DirectionAudiencePick
        directions={directions}
        selectedIds={draft.audienceDirectionIds}
        onChange={ids => setDraft({ ...draft, audienceDirectionIds: ids })}
      />
      <div className="adm-field">
        <span className="adm-label">Спикеры</span>
        <SpeakerMultiPick speakers={speakers} selectedIds={draft.speakerIds} onChange={ids => setDraft({ ...draft, speakerIds: ids })} />
      </div>
      <div className="adm-field">
        <span className="adm-label">Тематические теги</span>
        <ThematicTagPick tags={allTags} selectedNames={draft.tagNames} onChange={names => setDraft({ ...draft, tagNames: names })} />
      </div>
      <label className="adm-forum-check">
        <input type="checkbox" checked={draft.pushReminder} onChange={e => setDraft({ ...draft, pushReminder: e.target.checked })} />
        Уведомление за ~15 мин до начала
      </label>
      <label className="adm-forum-check">
        <input type="checkbox" checked={draft.hasSubSessions} onChange={e => setDraft({ ...draft, hasSubSessions: e.target.checked })} />
        Блок с подблоками (можно вкладывать подблоки в подблоки)
      </label>

      {mode === 'edit' && event && draft.hasSubSessions && (
        <div className="adm-program-subsessions" style={{ marginTop: 12 }}>
          <strong>Подблоки</strong>
          <p className="adm-muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
            Внутри подблока можно добавить ещё подблоки. Аудиторию можно задать отдельно — участник увидит только свои.
          </p>
          {children.length === 0 && <p className="adm-muted">Пока нет подблоков</p>}
          {children.map(ch => (
            <NestedEventNode
              key={ch.id}
              node={ch}
              depth={2}
              allPlaces={allPlaces}
              allTags={allTags}
              directions={directions}
              speakers={speakers}
              selectedDay={draft.dayNumber}
              daySchedulePublished={daySchedulePublished}
              parentPublished={event.isPublished === true}
              onSaved={onSaved}
              adminFetch={adminFetch}
              act={act}
            />
          ))}
          <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px dashed #e2e8f0' }}>
            <strong style={{ fontSize: 12 }}>+ {nestLevelLabel(2)}</strong>
            <div className="adm-forum-grid-2" style={{ marginTop: 6 }}>
              <input className="adm-input" placeholder="Название подблока" value={childTitle} onChange={e => setChildTitle(e.target.value)} />
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
            <DirectionAudiencePick
              directions={directions}
              selectedIds={childAudienceDirectionIds}
              onChange={setChildAudienceDirectionIds}
            />
            <div className="adm-field" style={{ marginTop: 8 }}>
              <span className="adm-label">Спикеры подблока</span>
              <SpeakerMultiPick speakers={speakers} selectedIds={childSpeakerIds} onChange={setChildSpeakerIds} />
            </div>
            <div className="adm-field" style={{ marginTop: 8 }}>
              <span className="adm-label">Тематические теги</span>
              <ThematicTagPick tags={allTags} selectedNames={childTagNames} onChange={setChildTagNames} />
            </div>
            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" style={{ marginTop: 8 }} onClick={addChild}>
              + Подблок
            </button>
          </div>
        </div>
      )}

      <div className="adm-program-editor-actions">
        {mode === 'create' ? (
          <>
            <button type="button" className="adm-btn adm-btn-secondary" onClick={() => saveCreate(false)}>Сохранить черновик</button>
            <button type="button" className="adm-btn adm-btn-primary" onClick={() => saveCreate(true)}>Опубликовать</button>
          </>
        ) : (
          <>
            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={saveEdit}>Сохранить черновик</button>
            <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={publishEdit}>Опубликовать</button>
            <button
              type="button"
              className="adm-btn adm-btn-secondary adm-btn-sm"
              onClick={() => {
                if (!event) return;
                act(async () => {
                  await adminFetch(`/events/${event.id}`, { method: 'PATCH', body: JSON.stringify({ ...draftToBody(draft), isPublished: false }) });
                  onSaved();
                }, 'Скрыто');
              }}
            >
              Скрыть
            </button>
            <label className="adm-forum-inline">
              Дублировать на день
              <input className="adm-input" style={{ width: 48 }} value={dupDay} onChange={e => setDupDay(e.target.value)} />
            </label>
            <button
              type="button"
              className="adm-btn adm-btn-secondary adm-btn-sm"
              onClick={() => {
                if (!event) return;
                const td = Number(dupDay);
                if (!td || Number.isNaN(td)) {
                  alert('Укажите номер дня для дублирования');
                  return;
                }
                act(async () => {
                  await adminFetch(`/events/${event.id}/duplicate`, {
                    method: 'POST',
                    body: JSON.stringify({ targetDayNumber: td }),
                  });
                  if (onGoToDay) onGoToDay(td);
                  onSaved();
                }, `Дубликат создан на день ${td}`);
              }}
            >
              Дублировать
            </button>
            <button
              type="button"
              className="adm-btn adm-btn-secondary adm-btn-sm"
              onClick={() => {
                if (!event) return;
                act(async () => {
                  const r = await adminFetch('/qr/download', { method: 'POST', body: JSON.stringify({ type: 'event', id: event.id }) });
                  if (r.qrImageUrl) window.open(r.qrImageUrl, '_blank');
                }, 'QR готов');
              }}
            >
              QR посещаемости
            </button>
            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setPreviewOpen(true)}>
              👁 Превью
            </button>
            <button
              type="button"
              className="adm-btn adm-btn-danger adm-btn-sm"
              onClick={() => {
                if (!event || !confirmDelete(CONFIRM_DELETE_EVENT)) return;
                act(async () => {
                  await adminFetch(`/events/${event.id}`, { method: 'DELETE' });
                  onSaved();
                  onClose();
                }, 'Удалено');
              }}
            >
              Удалить
            </button>
          </>
        )}
        <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={onClose}>Закрыть</button>
      </div>

      {previewOpen && event && (
        <ParticipantPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Событие — превью">
          <EventParticipantPreview
            title={draft.title || 'Событие'}
            place={draft.place}
            timeStart={draft.timeStart}
            timeEnd={draft.timeEnd}
            speakerLine={speakerLine || undefined}
            descriptionHtml={draft.descriptionHtml}
            description={draft.description}
            children={children}
          />
        </ParticipantPreviewModal>
      )}
    </div>
  );
}
