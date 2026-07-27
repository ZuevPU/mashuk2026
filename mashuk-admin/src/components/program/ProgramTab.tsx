import { useCallback, useEffect, useMemo, useState } from 'react';
import { label } from '../../labels/ru';
import { EventCard } from './EventCard';
import {
  BLOCK_TYPE_OPTIONS,
  buildTimeSlot,
  eventVisibilityLabel,
  groupEventsBySlot,
  type ProgramEvent,
  type ThematicTag,
} from './types';

import type { AdminTabProps } from '../admin/types';

const emptyForm = (day: number) => ({
  title: '',
  place: '',
  description: '',
  timeStart: '09:00',
  timeEnd: '10:30',
  blockType: 'session',
  pushReminder: true,
  tagNames: [] as string[],
  dayNumber: day,
});

export function ProgramTab({ adminFetch, act, reloadKey }: AdminTabProps) {
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(1);
  const [totalDays, setTotalDays] = useState(8);
  const [forumCurrentDay, setForumCurrentDay] = useState(1);
  const [events, setEvents] = useState<ProgramEvent[]>([]);
  const [tags, setTags] = useState<ThematicTag[]>([]);
  const [scheduleDays, setScheduleDays] = useState<{ dayNumber: number; isPublished?: boolean }[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [editingTag, setEditingTag] = useState<{ id: number; name: string } | null>(null);
  const [mergeFrom, setMergeFrom] = useState('');
  const [mergeTo, setMergeTo] = useState('');
  const [copyFromDay, setCopyFromDay] = useState(1);
  const [form, setForm] = useState(emptyForm(1));

  const reloadEvents = useCallback(async () => {
    const res = await adminFetch('/events');
    setEvents(res.events || []);
  }, [adminFetch]);

  const reloadTags = useCallback(async () => {
    const res = await adminFetch('/thematic-tags');
    setTags(res.tags || []);
  }, [adminFetch]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fs = (await adminFetch('/forum-settings')).settings;
      const td = fs?.totalDays ?? 8;
      const cd = fs?.currentDay ?? 1;
      setTotalDays(td);
      setForumCurrentDay(cd);
      setSelectedDay(cd);
      setForm(emptyForm(cd));
      await Promise.all([reloadEvents(), reloadTags()]);
      const sched = await adminFetch(`/schedule/versions?day=${cd}`);
      setScheduleDays(sched.days || []);
      setVersions(sched.versions || []);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, reloadEvents, reloadTags]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  useEffect(() => {
    setForm(f => ({ ...f, dayNumber: selectedDay }));
    adminFetch(`/schedule/versions?day=${selectedDay}`)
      .then(r => {
        setVersions(r.versions || []);
        setScheduleDays(prev => {
          const days = r.days || [];
          if (days.length) return days;
          return prev;
        });
      })
      .catch(() => {});
  }, [selectedDay, adminFetch]);

  const dayEvents = useMemo(
    () => events.filter(e => (e.dayNumber ?? 1) === selectedDay),
    [events, selectedDay],
  );

  const slotGroups = useMemo(() => groupEventsBySlot(dayEvents), [dayEvents]);

  const dayPublished = scheduleDays.find(d => d.dayNumber === selectedDay)?.isPublished === true;

  const counts = useMemo(() => {
    let draft = 0;
    let visible = 0;
    for (const e of dayEvents) {
      const v = eventVisibilityLabel(e);
      if (v === 'visible') visible += 1;
      else draft += 1;
    }
    return { total: dayEvents.length, draft, visible };
  }, [dayEvents]);

  const toggleFormTag = (name: string) => {
    setForm(f => ({
      ...f,
      tagNames: f.tagNames.includes(name) ? f.tagNames.filter(t => t !== name) : [...f.tagNames, name],
    }));
  };

  const createEvent = () => {
    if (!form.title.trim()) {
      alert('Укажите название события.');
      return;
    }
    const isKeyBlock = form.blockType === 'key_block';
    act(async () => {
      await adminFetch('/events', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          place: form.place.trim() || null,
          description: form.description.trim() || null,
          dayNumber: selectedDay,
          timeSlot: buildTimeSlot(form.timeStart, form.timeEnd),
          tags: form.tagNames,
          blockType: isKeyBlock ? 'key_block' : form.blockType,
          isKeyBlock,
          pushReminder: form.pushReminder,
          isPublished: false,
          dayPublished: false,
        }),
      });
      await reloadEvents();
      setForm(emptyForm(selectedDay));
    }, 'Событие добавлено в черновик');
  };

  const copyDay = () => {
    if (copyFromDay === selectedDay) {
      alert('Выберите другой исходный день.');
      return;
    }
    const source = events.filter(e => (e.dayNumber ?? 1) === copyFromDay);
    if (source.length === 0) {
      alert(`На дне ${copyFromDay} нет событий.`);
      return;
    }
    if (!confirm(`Скопировать ${source.length} событ. с дня ${copyFromDay} на день ${selectedDay}?`)) return;
    act(async () => {
      for (const e of source) {
        const isKeyBlock = e.blockType === 'key_block' || e.isKeyBlock;
        await adminFetch('/events', {
          method: 'POST',
          body: JSON.stringify({
            title: e.title,
            place: e.place,
            description: e.description,
            dayNumber: selectedDay,
            timeSlot: e.timeSlot,
            tags: e.tags || [],
            blockType: isKeyBlock ? 'key_block' : (e.blockType || 'session'),
            isKeyBlock: !!isKeyBlock,
            pushReminder: e.pushReminder !== false,
            isPublished: false,
            dayPublished: false,
          }),
        });
      }
      await reloadEvents();
    }, 'День скопирован');
  };

  const publishDay = () => {
    if (dayEvents.length === 0) {
      alert('Добавьте хотя бы одно событие перед публикацией.');
      return;
    }
    if (!confirm(`Опубликовать расписание дня ${selectedDay} для всех участников?`)) return;
    act(async () => {
      await adminFetch('/schedule/publish', {
        method: 'POST',
        body: JSON.stringify({ dayNumber: selectedDay }),
      });
      await reloadEvents();
      const sched = await adminFetch(`/schedule/versions?day=${selectedDay}`);
      setVersions(sched.versions || []);
      setScheduleDays(sched.days || []);
    }, `День ${selectedDay} опубликован`);
  };

  if (loading) return <p className="adm-muted">Загрузка программы…</p>;

  return (
    <div className="adm-forum adm-program">
      <div className="card adm-forum-hero">
        <h2 className="adm-forum-hero-title">
          Расписание: <span className="adm-forum-accent">день {selectedDay}</span> из {totalDays}
        </h2>
        <p className="adm-forum-hint">
          Текущий день форума для участников: {forumCurrentDay}. Участник видит расписание дня только после «Опубликовать день»
          (здесь или во вкладке «Форум»).
        </p>
        <p className="adm-forum-hint">
          Событий: {counts.total} · черновик/ожидает: {counts.draft} · в расписании у участников: {counts.visible}
          {' · '}
          <strong>{dayPublished ? label('day_published') : label('day_draft')}</strong>
        </p>
        <div className="adm-seg adm-forum-day-seg">
          {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => (
            <button key={d} type="button" className={selectedDay === d ? 'on' : ''} onClick={() => setSelectedDay(d)}>
              Д{d}
            </button>
          ))}
        </div>
      </div>

      <div className="card adm-forum-block">
        <h3>Тематические теги</h3>
        <p className="adm-forum-hint">Совпадают с интересами из онбординга — от них строится блок «Рекомендуем тебе».</p>
        {tags.length === 0 && <p className="adm-muted">Создайте теги — без них не работают рекомендации.</p>}
        <div className="adm-forum-toolbar">
          <input className="adm-input" value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="Новый тег" style={{ maxWidth: 220 }} />
          <button
            type="button"
            className="adm-btn adm-btn-secondary adm-btn-sm"
            onClick={() => {
              if (!newTagName.trim()) return;
              act(async () => {
                await adminFetch('/thematic-tags', { method: 'POST', body: JSON.stringify({ name: newTagName.trim() }) });
                setNewTagName('');
                await reloadTags();
              }, 'Тег добавлен');
            }}
          >
            Добавить
          </button>
        </div>
        <div className="adm-program-tag-pick" style={{ marginTop: 10 }}>
          {tags.map(t => (
            <span key={t.id} className="tag-chip adm-program-tag-chip">
              {editingTag?.id === t.id ? (
                <>
                  <input
                    className="adm-input adm-input-narrow"
                    value={editingTag.name}
                    onChange={e => setEditingTag({ id: t.id, name: e.target.value })}
                  />
                  <button type="button" className="adm-btn adm-btn-sm adm-btn-primary" onClick={() => act(async () => {
                    await adminFetch(`/thematic-tags/${t.id}`, { method: 'PATCH', body: JSON.stringify({ name: editingTag.name.trim() }) });
                    setEditingTag(null);
                    await reloadTags();
                  }, 'Сохранено')}>OK</button>
                  <button type="button" className="adm-btn adm-btn-sm adm-btn-ghost" onClick={() => setEditingTag(null)}>×</button>
                </>
              ) : (
                <>
                  <span className="adm-program-tag-name">{t.name}</span>
                  <button
                    type="button"
                    className="adm-tag-icon-btn"
                    title="Изменить"
                    aria-label="Изменить"
                    onClick={() => setEditingTag({ id: t.id, name: t.name })}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="adm-tag-icon-btn adm-tag-icon-btn-delete"
                    title="Удалить"
                    aria-label="Удалить"
                    onClick={() => {
                      if (!confirm('Удалить тег?')) return;
                      act(async () => {
                        await adminFetch(`/thematic-tags/${t.id}`, { method: 'DELETE' });
                        await reloadTags();
                      });
                    }}
                  >
                    ×
                  </button>
                </>
              )}
            </span>
          ))}
        </div>
        <details className="adm-program-merge" style={{ marginTop: 16 }}>
          <summary>Обслуживание: объединить два тега</summary>
          <div className="adm-forum-toolbar" style={{ marginTop: 8 }}>
            <select className="adm-input" value={mergeFrom} onChange={e => setMergeFrom(e.target.value)}>
              <option value="">Откуда (удалится)</option>
              {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <span>→</span>
            <select className="adm-input" value={mergeTo} onChange={e => setMergeTo(e.target.value)}>
              <option value="">Куда</option>
              {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button
              type="button"
              className="adm-btn adm-btn-secondary adm-btn-sm"
              onClick={() => {
                if (!mergeFrom || !mergeTo) return;
                if (!confirm('Объединить теги? Это необратимо.')) return;
                act(async () => {
                  await adminFetch('/thematic-tags/merge', {
                    method: 'POST',
                    body: JSON.stringify({ fromId: Number(mergeFrom), toId: Number(mergeTo) }),
                  });
                  setMergeFrom('');
                  setMergeTo('');
                  await reloadTags();
                  await reloadEvents();
                }, 'Теги объединены');
              }}
            >
              Объединить
            </button>
          </div>
        </details>
      </div>

      <div className="card adm-forum-block">
        <h3>Добавить событие в день {selectedDay}</h3>
        <div className="adm-forum-grid-2">
          <label className="adm-field">
            <span className="adm-label">Название</span>
            <input className="adm-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          </label>
          <label className="adm-field">
            <span className="adm-label">Место</span>
            <input className="adm-input" value={form.place} onChange={e => setForm({ ...form, place: e.target.value })} />
          </label>
        </div>
        <div className="adm-forum-grid-2">
          <label className="adm-field">
            <span className="adm-label">Начало</span>
            <input type="time" className="adm-input" value={form.timeStart} onChange={e => setForm({ ...form, timeStart: e.target.value })} />
          </label>
          <label className="adm-field">
            <span className="adm-label">Окончание</span>
            <input type="time" className="adm-input" value={form.timeEnd} onChange={e => setForm({ ...form, timeEnd: e.target.value })} />
          </label>
        </div>
        <label className="adm-field">
          <span className="adm-label">Описание</span>
          <textarea className="adm-input" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        </label>
        <label className="adm-field">
          <span className="adm-label">Тип блока</span>
          <select className="adm-input" value={form.blockType} onChange={e => setForm({ ...form, blockType: e.target.value })}>
            {BLOCK_TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{label(o.labelKey)}</option>
            ))}
          </select>
        </label>
        <div className="adm-field">
          <span className="adm-label">Теги</span>
          <div className="adm-program-tag-pick">
            {tags.map(t => (
              <label key={t.id} className={`adm-chip-btn ${form.tagNames.includes(t.name) ? 'on' : ''}`} style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={form.tagNames.includes(t.name)} onChange={() => toggleFormTag(t.name)} style={{ display: 'none' }} />
                {t.name}
              </label>
            ))}
          </div>
        </div>
        <label className="adm-forum-check">
          <input type="checkbox" checked={form.pushReminder} onChange={e => setForm({ ...form, pushReminder: e.target.checked })} />
          Уведомление за ~15 мин
        </label>
        <button type="button" className="adm-btn adm-btn-primary" style={{ marginTop: 12 }} onClick={createEvent}>
          Добавить в черновик
        </button>
      </div>

      <div className="card adm-forum-block">
        <h3>Расписание дня {selectedDay}</h3>
        {dayEvents.length === 0 && (
          <div className="adm-program-empty">
            <p>Нет событий на этот день.</p>
            <div className="adm-forum-toolbar">
              <label className="adm-forum-inline">
                Скопировать с дня
                <select value={copyFromDay} onChange={e => setCopyFromDay(Number(e.target.value))}>
                  {Array.from({ length: totalDays }, (_, i) => i + 1).filter(d => d !== selectedDay).map(d => (
                    <option key={d} value={d}>День {d}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={copyDay}>Копировать</button>
            </div>
          </div>
        )}
        {[...slotGroups.entries()].map(([slot, list]) => (
          <div key={slot} className="adm-program-slot">
            <div className="adm-program-slot-head">
              <strong>{slot}</strong>
              {list.length > 1 && <span className="adm-muted"> · параллельные потоки ({list.length})</span>}
            </div>
            <div className={list.length > 1 ? 'adm-program-slot-parallel' : ''}>
              {list.map(e => (
                <EventCard
                  key={e.id}
                  event={e}
                  allTags={tags}
                  adminFetch={adminFetch}
                  act={act}
                  onSaved={reloadEvents}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card adm-forum-block">
        <h3>Публикация дня {selectedDay}</h3>
        <p className="adm-forum-hint">После публикации участники увидят события этого дня в приложении (при условии, что события не в черновике).</p>
        <button type="button" className="adm-btn adm-btn-primary" onClick={publishDay} disabled={dayEvents.length === 0}>
          Опубликовать день {selectedDay}
        </button>
        {versions.length > 0 && (
          <table className="adm-table" style={{ marginTop: 12 }}>
            <thead><tr><th>Версия</th><th>Когда</th><th>Событий в снимке</th></tr></thead>
            <tbody>
              {versions.slice(0, 5).map((v: any) => (
                <tr key={v.id}>
                  <td>{v.version}</td>
                  <td>{v.publishedAt ? new Date(v.publishedAt).toLocaleString('ru-RU') : '—'}</td>
                  <td>{Array.isArray(v.eventsSnapshot) ? v.eventsSnapshot.length : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
