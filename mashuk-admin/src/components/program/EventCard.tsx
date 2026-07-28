import { useEffect, useMemo, useState } from 'react';
import { label } from '../../labels/ru';
import { confirmDelete, CONFIRM_DELETE_EVENT, CONFIRM_DELETE_SUBTOPIC } from '../../admin/confirmDelete';
import { ParticipantPreviewHtml, ParticipantPreviewModal } from '../admin/ParticipantPreviewModal';
import { RichHtmlEditor } from '../admin/RichHtmlEditor';
import { PlaceSelect } from './ProgramPlacesBlock';
import { SpeakerMultiPick } from './ProgramCatalogs';
import {
  BLOCK_TYPE_OPTIONS,
  buildTimeSlot,
  eventVisibilityLabel,
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
  tagNames: string[];
  audienceType: 'all' | 'direction';
  audienceDirectionId: string;
  speakerIds: number[];
  hasSubSessions: boolean;
  isPublished: boolean;
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
    tagNames: [...tags],
    audienceType: (e.audienceType === 'direction' ? 'direction' : 'all') as 'all' | 'direction',
    audienceDirectionId: e.audienceDirectionId ? String(e.audienceDirectionId) : '',
    speakerIds: [...speakerIds],
    hasSubSessions: e.hasSubSessions === true,
    isPublished: e.isPublished === true,
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
  onSaved,
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
  onSaved: () => void;
  adminFetch: (path: string, opts?: RequestInit) => Promise<any>;
  act: (fn: () => Promise<void>, msg?: string) => void;
}) {
  const [draft, setDraft] = useState(() => draftFromEvent(event));
  const [expanded, setExpanded] = useState(true);
  const [childTitle, setChildTitle] = useState('');
  const [childPlace, setChildPlace] = useState('');
  const [childSpeakerIds, setChildSpeakerIds] = useState<number[]>([]);
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

  const vis = eventVisibilityLabel({ ...event, isPublished: draft.isPublished, dayPublished: event.dayPublished });
  const visLabel =
    vis === 'visible' ? label('schedule_visible') : vis === 'waiting_day' ? label('schedule_waiting_day') : label('draft');

  const speakerLine = (event.speakers?.map(s => s.name).join(', ') || speakers.filter(s => draft.speakerIds.includes(s.id)).map(s => s.name).join(', '));

  const toggleTag = (name: string) => {
    setDraft(d => ({
      ...d,
      tagNames: d.tagNames.includes(name) ? d.tagNames.filter(t => t !== name) : [...d.tagNames, name],
    }));
  };

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
      dayNumber: event.dayNumber,
      isPublished: draft.isPublished,
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
    }, 'Событие сохранено');
  };

  const addChild = () => {
    if (!childTitle.trim()) {
      alert('Название под-темы обязательно.');
      return;
    }
    act(async () => {
      await adminFetch('/events', {
        method: 'POST',
        body: JSON.stringify({
          title: childTitle.trim(),
          place: childPlace.trim() || null,
          dayNumber: event.dayNumber ?? selectedDay,
          timeSlot: event.timeSlot,
          parentEventId: event.id,
          isPublished: draft.isPublished,
          dayPublished: false,
          blockType: 'session',
          tags: [],
          speakerIds: childSpeakerIds,
        }),
      });
      setChildTitle('');
      setChildPlace('');
      setChildSpeakerIds([]);
      if (!draft.hasSubSessions) {
        await adminFetch(`/events/${event.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...patchBody(), hasSubSessions: true }),
        });
      }
      onSaved();
    }, 'Под-тема добавлена');
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
          <label className="adm-field">
            <span className="adm-label">Описание (текст)</span>
            <textarea className="adm-input" rows={2} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
          </label>
          <RichHtmlEditor
            label="Описание (HTML / rich)"
            value={draft.descriptionHtml}
            onChange={html => setDraft({ ...draft, descriptionHtml: html })}
            resetKey={event.id}
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
            <span className="adm-label">Тематические теги</span>
            <div className="adm-program-tag-pick">
              {allTags.length === 0 && <span className="adm-muted">Создайте теги выше</span>}
              {allTags.map(t => (
                <label key={t.id} className={`adm-chip-btn ${draft.tagNames.includes(t.name) ? 'on' : ''}`} style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={draft.tagNames.includes(t.name)} onChange={() => toggleTag(t.name)} style={{ display: 'none' }} />
                  {t.name}
                </label>
              ))}
            </div>
          </div>
          <label className="adm-forum-check">
            <input type="checkbox" checked={draft.pushReminder} onChange={e => setDraft({ ...draft, pushReminder: e.target.checked })} />
            Уведомление за ~15 мин до начала
          </label>
          <label className="adm-forum-check">
            <input type="checkbox" checked={draft.isPublished} onChange={e => setDraft({ ...draft, isPublished: e.target.checked })} />
            Опубликовано (видно участникам при опубликованном дне)
          </label>
          <label className="adm-forum-check">
            <input type="checkbox" checked={draft.hasSubSessions} onChange={e => setDraft({ ...draft, hasSubSessions: e.target.checked })} />
            Блок с несколькими под-темами
          </label>
          {draft.hasSubSessions && (
            <div className="adm-program-subsessions" style={{ marginTop: 12, paddingLeft: 12, borderLeft: '3px solid #e2e8f0' }}>
              <strong>Под-темы</strong>
              {children.length === 0 && <p className="adm-muted">Пока нет под-тем</p>}
              {children.map(ch => (
                <div key={ch.id} className="adm-forum-toolbar" style={{ alignItems: 'center', marginTop: 6 }}>
                  <span>{ch.title}{ch.place ? ` · ${ch.place}` : ''}</span>
                  <button
                    type="button"
                    className="adm-btn adm-btn-danger adm-btn-sm"
                    onClick={() => {
                      if (!confirmDelete(CONFIRM_DELETE_SUBTOPIC)) return;
                      act(async () => {
                        await adminFetch(`/events/${ch.id}`, { method: 'DELETE' });
                        onSaved();
                      }, 'Удалено');
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="adm-forum-grid-2" style={{ marginTop: 8 }}>
                <input className="adm-input" placeholder="Название под-темы" value={childTitle} onChange={e => setChildTitle(e.target.value)} />
                <PlaceSelect places={allPlaces} value={childPlace} onChange={setChildPlace} />
              </div>
              <div className="adm-field" style={{ marginTop: 8 }}>
                <span className="adm-label">Спикеры под-темы</span>
                <SpeakerMultiPick speakers={speakers} selectedIds={childSpeakerIds} onChange={setChildSpeakerIds} />
              </div>
              <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" style={{ marginTop: 8 }} onClick={addChild}>
                + Под-тема
              </button>
            </div>
          )}
          <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={save}>
              Сохранить черновик
            </button>
            <button
              type="button"
              className="adm-btn adm-btn-sm"
              onClick={() => act(async () => {
                await adminFetch(`/events/${event.id}`, { method: 'PATCH', body: JSON.stringify({ ...patchBody(), isPublished: true }) });
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
                if (!td) return;
                act(async () => {
                  await adminFetch(`/events/${event.id}/duplicate`, { method: 'POST', body: JSON.stringify({ targetDayNumber: td }) });
                  onSaved();
                }, 'Дубликат создан');
              }}
            >
              Дублировать
            </button>
            <button
              type="button"
              className="adm-btn adm-btn-secondary adm-btn-sm"
              onClick={() => act(async () => {
                const r = await adminFetch('/qr/download', { method: 'POST', body: JSON.stringify({ type: 'event', id: event.id }) });
                if (r.qrImageUrl) window.open(r.qrImageUrl, '_blank');
              }, 'QR готов')}
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
              <p className="adm-muted">{preview}</p>
              <ParticipantPreviewHtml
                title={draft.title || 'Событие'}
                html={draft.descriptionHtml || draft.description.replace(/\n/g, '<br/>')}
              />
            </ParticipantPreviewModal>
          )}
        </>
      )}
    </div>
  );
}
