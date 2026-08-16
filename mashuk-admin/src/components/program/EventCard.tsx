import { useEffect, useMemo, useState } from 'react';
import { label } from '../../labels/ru';
import { confirmDelete, CONFIRM_DELETE_EVENT } from '../../admin/confirmDelete';
import { downloadDataUrl } from '../../admin/client';
import { ParticipantPreviewModal } from '../admin/ParticipantPreviewModal';
import { DescriptionEditor } from '../admin/DescriptionEditor';
import { PlaceSelect } from './ProgramPlacesBlock';
import { SpeakerMultiPick } from './ProgramCatalogs';
import { ThematicTagPick } from './ThematicTagPick';
import { speakerFullLabel } from '../speakers/speakerFormat';
import { NestedEventNode } from './NestedEventNode';
import { EventParticipantPreview } from './EventParticipantPreview';
import {
  BLOCK_TYPE_OPTIONS,
  buildTimeSlot,
  eventVisibilityLabel,
  nestLevelLabel,
  parseTimeSlot,
  type ProgramBlockType,
  type ProgramEvent,
  type ProgramPlace,
  type ProgramSpeaker,
  type ThematicTag,
} from './types';

type Draft = {
  title: string;
  place: string;
  description: string;
  descriptionHtml: string;
  timeStart: string;
  timeEnd: string;
  blockType: string;
  pushReminder: boolean;
  hideFromHome: boolean;
  tagNames: string[];
  audienceType: 'all' | 'direction';
  audienceDirectionId: string;
  speakerIds: number[];
  hasSubSessions: boolean;
};

function draftFromEvent(e: ProgramEvent): Draft {
  const { start, end } = parseTimeSlot(e.timeSlot);
  const tags = Array.isArray(e.tags) ? e.tags : [];
  const blockType = e.blockType === 'key_block' || e.isKeyBlock ? 'key_block' : (e.blockType || 'session');
  const speakerIds = Array.isArray(e.speakerIds) ? e.speakerIds : (e.speakers?.map(s => s.id) ?? []);
  return {
    title: e.title || '',
    place: e.place || '',
    description: e.description || '',
    descriptionHtml: e.descriptionHtml || e.description || '',
    timeStart: start,
    timeEnd: end,
    blockType,
    pushReminder: e.pushReminder !== false,
    hideFromHome: e.hideFromHome === true,
    tagNames: [...tags],
    audienceType: (e.audienceType === 'direction' ? 'direction' : 'all') as 'all' | 'direction',
    audienceDirectionId: e.audienceDirectionId ? String(e.audienceDirectionId) : '',
    speakerIds: [...speakerIds],
    hasSubSessions: e.hasSubSessions === true,
  };
}

function blockTypeLabel(blockTypes: ProgramBlockType[], key: string): string {
  const hit = blockTypes.find(b => b.key === key);
  if (hit) return hit.name;
  const opt = BLOCK_TYPE_OPTIONS.find(o => o.value === key);
  return opt ? label(opt.labelKey) : key;
}

export function EventCard({
  event,
  allTags,
  allPlaces,
  blockTypes,
  speakers,
  directions,
  selectedDay,
  daySchedulePublished,
  onSaved,
  onGoToDay,
  adminFetch,
  act,
}: {
  event: ProgramEvent;
  allTags: ThematicTag[];
  allPlaces: ProgramPlace[];
  blockTypes: ProgramBlockType[];
  speakers: ProgramSpeaker[];
  directions: { id: number; name: string }[];
  selectedDay: number;
  daySchedulePublished: boolean;
  onSaved: () => void;
  /** После дублирования на другой день — перейти к нему */
  onGoToDay?: (day: number) => void;
  adminFetch: (path: string, opts?: RequestInit) => Promise<any>;
  act: (fn: () => Promise<void>, msg?: string) => void;
}) {
  const [draft, setDraft] = useState(() => draftFromEvent(event));
  const [expanded, setExpanded] = useState(true);
  const [childTitle, setChildTitle] = useState('');
  const [childPlace, setChildPlace] = useState('');
  const [childTimeStart, setChildTimeStart] = useState('');
  const [childTimeEnd, setChildTimeEnd] = useState('');
  const [childSpeakerIds, setChildSpeakerIds] = useState<number[]>([]);
  const [childTagNames, setChildTagNames] = useState<string[]>([]);
  const [childAudienceType, setChildAudienceType] = useState<'all' | 'direction'>('all');
  const [childAudienceDirectionId, setChildAudienceDirectionId] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dupDay, setDupDay] = useState(String(selectedDay));

  useEffect(() => {
    setDraft(draftFromEvent(event));
    setDupDay(String(selectedDay));
  }, [event.id, event.title, event.timeSlot, event.dayPublished, event.isPublished, event.children?.length, selectedDay]);

  const blockOptions = useMemo(() => {
    if (blockTypes.length) {
      return blockTypes.map(b => ({ value: b.key, label: b.name }));
    }
    return BLOCK_TYPE_OPTIONS.map(o => ({ value: o.value, label: label(o.labelKey) }));
  }, [blockTypes]);

  const vis = eventVisibilityLabel(event);
  const visLabel =
    vis === 'visible' ? label('schedule_visible') : vis === 'waiting_day' ? label('schedule_waiting_day') : label('draft');

  const speakerLine = (
    event.speakers?.map(s => speakerFullLabel(s)).join('; ')
    || speakers.filter(s => draft.speakerIds.includes(s.id)).map(speakerFullLabel).join('; ')
  );

  const patchBody = () => {
    const blockType = draft.blockType;
    const isKeyBlock = blockType === 'key_block';
    return {
      title: draft.title.trim(),
      place: draft.place.trim() || null,
      description: draft.description.trim() || null,
      descriptionHtml: draft.descriptionHtml.trim() || draft.description.trim() || null,
      timeSlot: buildTimeSlot(draft.timeStart, draft.timeEnd),
      tags: draft.tagNames,
      blockType: isKeyBlock ? 'key_block' : blockType,
      isKeyBlock,
      pushReminder: draft.pushReminder,
      hideFromHome: draft.hideFromHome,
      dayNumber: event.dayNumber,
      audienceType: draft.audienceType,
      audienceDirectionId: draft.audienceType === 'direction' && draft.audienceDirectionId
        ? Number(draft.audienceDirectionId)
        : null,
      speakerIds: draft.speakerIds,
      hasSubSessions: draft.hasSubSessions,
    };
  };

  const save = () => {
    if (!draft.title.trim()) {
      alert('Укажите название события.');
      return;
    }
    act(async () => {
      await adminFetch(`/events/${event.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patchBody()),
      });
      onSaved();
    }, 'Изменения сохранены');
  };

  const publishPayload = () => ({
    ...patchBody(),
    isPublished: true,
    ...(daySchedulePublished ? { dayPublished: true } : {}),
  });

  const addChild = () => {
    if (!childTitle.trim()) {
      alert('Название подблока обязательно.');
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
          dayNumber: event.dayNumber ?? selectedDay,
          timeSlot: buildTimeSlot(childTimeStart, childTimeEnd) || null,
          parentEventId: event.id,
          isPublished: event.isPublished === true,
          ...(event.isPublished && daySchedulePublished ? { dayPublished: true } : {}),
          blockType: 'session',
          tags: childTagNames,
          speakerIds: childSpeakerIds,
          audienceType: childAudienceType,
          audienceDirectionId: childAudienceType === 'direction' && childAudienceDirectionId
            ? Number(childAudienceDirectionId)
            : null,
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
      if (!draft.hasSubSessions) {
        await adminFetch(`/events/${event.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...patchBody(), hasSubSessions: true }),
        });
      }
      onSaved();
    }, 'Подблок добавлен');
  };

  const preview = `${draft.timeStart}${draft.timeEnd ? `–${draft.timeEnd}` : ''} · ${draft.title || '…'}${draft.place ? ` · ${draft.place}` : ''}${speakerLine ? ` · ${speakerLine}` : ''}`;

  const children = event.children || [];

  return (
    <div className="adm-program-event-card">
      <div className="adm-program-event-head" style={{ cursor: 'pointer' }} onClick={() => setExpanded(v => !v)}>
        <span className={`adm-program-badge adm-program-badge-${vis}`}>{visLabel}</span>
        <span className="adm-muted adm-program-badge" style={{ marginLeft: 6 }}>{blockTypeLabel(blockTypes, draft.blockType)}</span>
        <span className="adm-program-preview-line">{preview}</span>
        <span className="adm-muted" style={{ marginLeft: 'auto' }}>{expanded ? '▼' : '▶'}</span>
      </div>
      {expanded && (
        <>
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
                legacyPlace={event.place}
                onChange={name => setDraft({ ...draft, place: name })}
              />
            </label>
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
            editingKey={event.id}
          />
          <label className="adm-field">
            <span className="adm-label">Тип блока</span>
            <select className="adm-input" value={draft.blockType} onChange={e => setDraft({ ...draft, blockType: e.target.value })}>
              {blockOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <div className="adm-forum-grid-2">
            <label className="adm-field">
              <span className="adm-label">Аудитория</span>
              <select className="adm-input" value={draft.audienceType} onChange={e => setDraft({ ...draft, audienceType: e.target.value as 'all' | 'direction' })}>
                <option value="all">Все участники</option>
                <option value="direction">Направление</option>
              </select>
            </label>
            {draft.audienceType === 'direction' && (
              <label className="adm-field">
                <span className="adm-label">Направление</span>
                <select className="adm-input" value={draft.audienceDirectionId} onChange={e => setDraft({ ...draft, audienceDirectionId: e.target.value })}>
                  <option value="">—</option>
                  {directions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="adm-field">
            <span className="adm-label">Спикеры</span>
            <SpeakerMultiPick speakers={speakers} selectedIds={draft.speakerIds} onChange={ids => setDraft({ ...draft, speakerIds: ids })} />
          </div>
          <div className="adm-field">
            <span className="adm-label">Интересы</span>
            <ThematicTagPick tags={allTags} selectedNames={draft.tagNames} onChange={names => setDraft({ ...draft, tagNames: names })} />
          </div>
          <p className="adm-muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
            Напоминание за 15 минут само не уходит. Оповещение — из «Уведомления → По дням».
          </p>
          <label className="adm-forum-check">
            <input
              type="checkbox"
              checked={draft.hideFromHome}
              onChange={e => setDraft({ ...draft, hideFromHome: e.target.checked })}
            />
            Не показывать на главной (в программе останется)
          </label>
          <label className="adm-forum-check">
            <input type="checkbox" checked={draft.hasSubSessions} onChange={e => setDraft({ ...draft, hasSubSessions: e.target.checked })} />
            Блок с подблоками (можно вкладывать подблоки в подблоки)
          </label>
          {draft.hasSubSessions && (
            <div className="adm-program-subsessions" style={{ marginTop: 12 }}>
              <strong>Подблоки</strong>
              <p className="adm-muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
                Можно задать аудиторию отдельно: участник увидит только подблоки своего направления.
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
                  selectedDay={selectedDay}
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
                <div className="adm-forum-grid-2" style={{ marginTop: 6 }}>
                  <label className="adm-field">
                    <span className="adm-label">Аудитория</span>
                    <select className="adm-input" value={childAudienceType} onChange={e => setChildAudienceType(e.target.value as 'all' | 'direction')}>
                      <option value="all">Все участники</option>
                      <option value="direction">Направление</option>
                    </select>
                  </label>
                  {childAudienceType === 'direction' && (
                    <label className="adm-field">
                      <span className="adm-label">Направление</span>
                      <select className="adm-input" value={childAudienceDirectionId} onChange={e => setChildAudienceDirectionId(e.target.value)}>
                        <option value="">—</option>
                        {directions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <div className="adm-field" style={{ marginTop: 8 }}>
                  <span className="adm-label">Спикеры подблока</span>
                  <SpeakerMultiPick speakers={speakers} selectedIds={childSpeakerIds} onChange={setChildSpeakerIds} />
                </div>
                <div className="adm-field" style={{ marginTop: 8 }}>
                  <span className="adm-label">Интересы</span>
                  <ThematicTagPick tags={allTags} selectedNames={childTagNames} onChange={setChildTagNames} />
                </div>
                <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" style={{ marginTop: 8 }} onClick={addChild}>
                  + Подблок
                </button>
              </div>
            </div>
          )}
          <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={save}>
              Сохранить черновик
            </button>
            <button
              type="button"
              className="adm-btn adm-btn-primary adm-btn-sm"
              onClick={() => act(async () => {
                await adminFetch(`/events/${event.id}`, { method: 'PATCH', body: JSON.stringify(publishPayload()) });
                onSaved();
              }, 'Опубликовано')}
            >
              Опубликовать
            </button>
            <button
              type="button"
              className="adm-btn adm-btn-secondary adm-btn-sm"
              onClick={() => act(async () => {
                await adminFetch(`/events/${event.id}`, { method: 'PATCH', body: JSON.stringify({ ...patchBody(), isPublished: false }) });
                onSaved();
              }, 'Скрыто')}
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
                  if (td !== selectedDay && onGoToDay) {
                    onGoToDay(td);
                  } else {
                    onSaved();
                  }
                }, `Дубликат создан на день ${td}`);
              }}
            >
              Дублировать
            </button>
            <button
              type="button"
              className="adm-btn adm-btn-secondary adm-btn-sm"
              onClick={() => act(async () => {
                const r = await adminFetch('/qr/download', { method: 'POST', body: JSON.stringify({ type: 'event', id: event.id }) });
                if (!r?.qrImageUrl) throw new Error('Не удалось получить QR');
                downloadDataUrl(r.qrImageUrl, `event-${event.id}-qr.png`);
              }, 'QR скачан')}
            >
              QR посещаемости
            </button>
            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setPreviewOpen(true)}>
              👁 Посмотреть как участник
            </button>
            <button
              type="button"
              className="adm-btn adm-btn-danger adm-btn-sm"
              onClick={() => {
                if (!confirmDelete(CONFIRM_DELETE_EVENT)) return;
                act(async () => {
                  await adminFetch(`/events/${event.id}`, { method: 'DELETE' });
                  onSaved();
                }, 'Удалено');
              }}
            >
              Удалить
            </button>
          </div>
          {previewOpen && (
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
        </>
      )}
    </div>
  );
}
