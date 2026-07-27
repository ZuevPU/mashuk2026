import { useEffect, useState } from 'react';
import { label } from '../../labels/ru';
import { PlaceSelect } from './ProgramPlacesBlock';
import {
  BLOCK_TYPE_OPTIONS,
  buildTimeSlot,
  eventVisibilityLabel,
  parseTimeSlot,
  type ProgramEvent,
  type ProgramPlace,
  type ThematicTag,
} from './types';

type Draft = {
  title: string;
  place: string;
  description: string;
  timeStart: string;
  timeEnd: string;
  blockType: string;
  pushReminder: boolean;
  tagNames: string[];
};

function draftFromEvent(e: ProgramEvent): Draft {
  const { start, end } = parseTimeSlot(e.timeSlot);
  const tags = Array.isArray(e.tags) ? e.tags : [];
  const blockType = e.blockType === 'key_block' || e.isKeyBlock ? 'key_block' : (e.blockType || 'session');
  return {
    title: e.title || '',
    place: e.place || '',
    description: e.description || '',
    timeStart: start,
    timeEnd: end,
    blockType,
    pushReminder: e.pushReminder !== false,
    tagNames: [...tags],
  };
}

export function EventCard({
  event,
  allTags,
  allPlaces,
  onSaved,
  adminFetch,
  act,
}: {
  event: ProgramEvent;
  allTags: ThematicTag[];
  allPlaces: ProgramPlace[];
  onSaved: () => void;
  adminFetch: (path: string, opts?: RequestInit) => Promise<any>;
  act: (fn: () => Promise<void>, msg?: string) => void;
}) {
  const [draft, setDraft] = useState(() => draftFromEvent(event));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(draftFromEvent(event));
    setDirty(false);
  }, [event.id, event.title, event.timeSlot, event.dayPublished, event.isPublished]);

  const vis = eventVisibilityLabel(event);
  const visLabel =
    vis === 'visible' ? label('schedule_visible') : vis === 'waiting_day' ? label('schedule_waiting_day') : label('draft');

  const toggleTag = (name: string) => {
    setDirty(true);
    setDraft(d => ({
      ...d,
      tagNames: d.tagNames.includes(name) ? d.tagNames.filter(t => t !== name) : [...d.tagNames, name],
    }));
  };

  const save = () => {
    if (!draft.title.trim()) {
      alert('Укажите название события.');
      return;
    }
    const blockType = draft.blockType;
    const isKeyBlock = blockType === 'key_block';
    act(async () => {
      await adminFetch(`/events/${event.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: draft.title.trim(),
          place: draft.place.trim() || null,
          description: draft.description.trim() || null,
          timeSlot: buildTimeSlot(draft.timeStart, draft.timeEnd),
          tags: draft.tagNames,
          blockType: isKeyBlock ? 'key_block' : blockType,
          isKeyBlock,
          pushReminder: draft.pushReminder,
          dayNumber: event.dayNumber,
        }),
      });
      onSaved();
    }, 'Событие сохранено');
  };

  const preview = `${draft.timeStart}${draft.timeEnd ? `–${draft.timeEnd}` : ''} · ${draft.title || '…'}${draft.place ? ` · ${draft.place}` : ''}`;

  return (
    <div className="adm-program-event-card">
      <div className="adm-program-event-head">
        <span className={`adm-program-badge adm-program-badge-${vis}`}>{visLabel}</span>
        <span className="adm-program-preview-line">{preview}</span>
      </div>
      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">Название</span>
          <input className="adm-input" value={draft.title} onChange={e => { setDirty(true); setDraft({ ...draft, title: e.target.value }); }} />
        </label>
        <label className="adm-field">
          <span className="adm-label">Место</span>
          <PlaceSelect
            places={allPlaces}
            value={draft.place}
            legacyPlace={event.place}
            onChange={name => { setDirty(true); setDraft({ ...draft, place: name }); }}
          />
        </label>
      </div>
      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">Начало</span>
          <input type="time" className="adm-input" value={draft.timeStart} onChange={e => { setDirty(true); setDraft({ ...draft, timeStart: e.target.value }); }} />
        </label>
        <label className="adm-field">
          <span className="adm-label">Окончание</span>
          <input type="time" className="adm-input" value={draft.timeEnd} onChange={e => { setDirty(true); setDraft({ ...draft, timeEnd: e.target.value }); }} />
        </label>
      </div>
      <label className="adm-field">
        <span className="adm-label">Описание</span>
        <textarea className="adm-input" rows={2} value={draft.description} onChange={e => { setDirty(true); setDraft({ ...draft, description: e.target.value }); }} />
      </label>
      <label className="adm-field">
        <span className="adm-label">Тип блока</span>
        <select className="adm-input" value={draft.blockType} onChange={e => { setDirty(true); setDraft({ ...draft, blockType: e.target.value }); }}>
          {BLOCK_TYPE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{label(o.labelKey)}</option>
          ))}
        </select>
      </label>
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
        <input type="checkbox" checked={draft.pushReminder} onChange={e => { setDirty(true); setDraft({ ...draft, pushReminder: e.target.checked }); }} />
        Уведомление за ~15 мин до начала
      </label>
      <div className="adm-forum-toolbar">
        <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={save}>
          Сохранить
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
        <a className="adm-btn adm-btn-ghost adm-btn-sm" href={`#knowledge-event-${event.id}`} onClick={e => e.preventDefault()} title="Откройте вкладку «База знаний» и привяжите материал к событию">
          Материалы (БЗ) · id {event.id}
        </a>
        <button
          type="button"
          className="adm-btn adm-btn-danger adm-btn-sm"
          onClick={() => {
            if (!confirm('Удалить событие?')) return;
            act(async () => {
              await adminFetch(`/events/${event.id}`, { method: 'DELETE' });
              onSaved();
            }, 'Удалено');
          }}
        >
          Удалить
        </button>
      </div>
    </div>
  );
}
