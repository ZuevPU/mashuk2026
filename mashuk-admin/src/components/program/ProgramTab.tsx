import { useCallback, useEffect, useMemo, useState } from 'react';
import { confirmDelete } from '../../admin/confirmDelete';
import { label } from '../../labels/ru';
import { EventCard } from './EventCard';
import { PlaceSelect, ProgramPlacesBlock } from './ProgramPlacesBlock';
import { ProgramBlockTypesBlock, SpeakerMultiPick } from './ProgramCatalogs';
import {
  BLOCK_TYPE_OPTIONS,
  buildTimeSlot,
  eventVisibilityLabel,
  groupEventsBySlot,
  type ProgramBlockType,
  type ProgramEvent,
  type ProgramPlace,
  type ProgramSpeaker,
  type ScheduleDayRow,
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
  audienceType: 'all' as 'all' | 'direction',
  audienceDirectionId: '' as string | number,
  speakerIds: [] as number[],
  hasSubSessions: false,
});

export function ProgramTab({ adminFetch, act, reloadKey, setTab }: AdminTabProps) {
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(1);
  const [totalDays, setTotalDays] = useState(8);
  const [forumCurrentDay, setForumCurrentDay] = useState(1);
  const [events, setEvents] = useState<ProgramEvent[]>([]);
  const [tags, setTags] = useState<ThematicTag[]>([]);
  const [places, setPlaces] = useState<ProgramPlace[]>([]);
  const [blockTypes, setBlockTypes] = useState<ProgramBlockType[]>([]);
  const [speakers, setSpeakers] = useState<ProgramSpeaker[]>([]);
  const [directions, setDirections] = useState<{ id: number; name: string }[]>([]);
  const [scheduleDays, setScheduleDays] = useState<ScheduleDayRow[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newPlaceName, setNewPlaceName] = useState('');
  const [newBlockTypeName, setNewBlockTypeName] = useState('');
  const [editingTag, setEditingTag] = useState<{ id: number; name: string } | null>(null);
  const [editingPlace, setEditingPlace] = useState<{ id: number; name: string } | null>(null);
  const [editingBlockType, setEditingBlockType] = useState<{ id: number; name: string } | null>(null);
  const [newDayNumber, setNewDayNumber] = useState('');
  const [newDayLabel, setNewDayLabel] = useState('');
  const [newDayDate, setNewDayDate] = useState('');
  const [mergeFrom, setMergeFrom] = useState('');
  const [mergeTo, setMergeTo] = useState('');
  const [copyFromDay, setCopyFromDay] = useState(1);
  const [form, setForm] = useState(emptyForm(1));

  const reloadEvents = useCallback(async (day: number) => {
    const res = await adminFetch(`/events?day=${day}`);
    setEvents(res.events || []);
  }, [adminFetch]);

  const reloadBlockTypes = useCallback(async () => {
    const res = await adminFetch('/program-block-types');
    setBlockTypes(res.blockTypes || []);
  }, [adminFetch]);

  const reloadSpeakers = useCallback(async () => {
    const res = await adminFetch('/program-speakers');
    setSpeakers(res.speakers || []);
  }, [adminFetch]);

  const reloadScheduleDays = useCallback(async () => {
    const res = await adminFetch('/schedule/days');
    setScheduleDays(res.days || []);
  }, [adminFetch]);

  const reloadTags = useCallback(async () => {
    const res = await adminFetch('/thematic-tags');
    setTags(res.tags || []);
  }, [adminFetch]);

  const reloadPlaces = useCallback(async () => {
    const res = await adminFetch('/program-places');
    setPlaces(res.places || []);
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
      await Promise.all([
        reloadEvents(cd),
        reloadTags(),
        reloadPlaces(),
        reloadBlockTypes(),
        reloadSpeakers(),
        reloadScheduleDays(),
      ]);
      setDirections((await adminFetch('/directions')).directions || []);
      const sched = await adminFetch(`/schedule/versions?day=${cd}`);
      setScheduleDays(sched.days || []);
      setVersions(sched.versions || []);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, reloadEvents, reloadTags, reloadPlaces, reloadBlockTypes, reloadSpeakers, reloadScheduleDays]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  useEffect(() => {
    setForm(f => ({ ...f, dayNumber: selectedDay }));
    reloadEvents(selectedDay).catch(() => {});
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
  }, [selectedDay, adminFetch, reloadEvents]);

  const dayTabs = useMemo(() => {
    if (scheduleDays.length) {
      return [...scheduleDays].sort((a, b) => a.dayNumber - b.dayNumber);
    }
    return Array.from({ length: totalDays }, (_, i) => ({
      dayNumber: i + 1,
      isPublished: false,
      displayLabel: `День ${i + 1}`,
    } as ScheduleDayRow));
  }, [scheduleDays, totalDays]);

  const dayEvents = useMemo(() => events, [events]);

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

  const buildNewEventBody = (publish: boolean) => {
    const isKeyBlock = form.blockType === 'key_block';
    return {
      title: form.title.trim(),
      place: form.place.trim() || null,
      description: form.description.trim() || null,
      dayNumber: selectedDay,
      timeSlot: buildTimeSlot(form.timeStart, form.timeEnd),
      tags: form.tagNames,
      blockType: isKeyBlock ? 'key_block' : form.blockType,
      isKeyBlock,
      pushReminder: form.pushReminder,
      isPublished: publish,
      ...(publish && dayPublished ? { dayPublished: true } : {}),
      audienceType: form.audienceType,
      audienceDirectionId: form.audienceType === 'direction' && form.audienceDirectionId
        ? Number(form.audienceDirectionId)
        : null,
      speakerIds: form.speakerIds,
      hasSubSessions: form.hasSubSessions,
    };
  };

  const createEvent = (publish: boolean) => {
    if (!form.title.trim()) {
      alert('Укажите название события.');
      return;
    }
    act(async () => {
      await adminFetch('/events', {
        method: 'POST',
        body: JSON.stringify(buildNewEventBody(publish)),
      });
      await reloadEvents(selectedDay);
      setForm(emptyForm(selectedDay));
    }, publish ? 'Событие опубликовано' : 'Событие добавлено в черновик');
  };

  const copyDay = () => {
    if (copyFromDay === selectedDay) {
      alert('Выберите другой исходный день.');
      return;
    }
    act(async () => {
      const res = await adminFetch(`/events?day=${copyFromDay}`);
      const source = (res.events || []) as ProgramEvent[];
      if (source.length === 0) {
        alert(`На дне ${copyFromDay} нет событий.`);
        return;
      }
      if (!confirm(`Скопировать ${source.length} блок(ов) с дня ${copyFromDay} на день ${selectedDay}?`)) return;
      const copyNode = async (e: ProgramEvent, parentEventId: number | null) => {
        const isKeyBlock = e.blockType === 'key_block' || e.isKeyBlock;
        const created = await adminFetch('/events', {
          method: 'POST',
          body: JSON.stringify({
            title: e.title,
            place: e.place,
            description: e.description,
            dayNumber: selectedDay,
            timeSlot: e.timeSlot || null,
            tags: e.tags || [],
            blockType: isKeyBlock ? 'key_block' : (e.blockType || 'session'),
            isKeyBlock: !!isKeyBlock,
            pushReminder: e.pushReminder !== false,
            isPublished: false,
            dayPublished: false,
            audienceType: e.audienceType || 'all',
            audienceDirectionId: e.audienceDirectionId ?? null,
            speakerIds: e.speakerIds || [],
            hasSubSessions: (e.children?.length ?? 0) > 0 || e.hasSubSessions === true,
            ...(parentEventId ? { parentEventId } : {}),
          }),
        });
        const newId = created.event?.id as number | undefined;
        if (!newId) return;
        for (const ch of e.children || []) {
          await copyNode(ch, newId);
        }
      };
      for (const e of source) {
        await copyNode(e, null);
      }
      await reloadEvents(selectedDay);
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
      await reloadEvents(selectedDay);
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
          {dayTabs.map(d => (
            <button key={d.dayNumber} type="button" className={selectedDay === d.dayNumber ? 'on' : ''} onClick={() => setSelectedDay(d.dayNumber)}>
              {d.displayLabel || `Д${d.dayNumber}`}
            </button>
          ))}
        </div>
      </div>

      <div className="card adm-forum-block">
        <h3>Тематические теги</h3>
        <p className="adm-forum-hint">
          Совпадают с интересами из онбординга — от них строится блок «Рекомендуем тебе».
          {setTab && (
            <>
              {' '}
              <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => setTab('recommendation-tags')}>
                Полное управление тегами →
              </button>
            </>
          )}
        </p>
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
                      if (!confirmDelete('Удалить тег?')) return;
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
                  await reloadEvents(selectedDay);
                }, 'Теги объединены');
              }}
            >
              Объединить
            </button>
          </div>
        </details>
      </div>

      <p className="adm-muted adm-forum-hint" style={{ margin: '0 0 8px 0' }}>
        Справочник мест (Пушкин, Гоголь и др.) — для поля «Место» в событиях программы.
      </p>
      <ProgramPlacesBlock
        places={places}
        newPlaceName={newPlaceName}
        onNewPlaceNameChange={setNewPlaceName}
        editingPlace={editingPlace}
        onEditingPlaceChange={setEditingPlace}
        onAdd={() => {
          if (!newPlaceName.trim()) return;
          act(async () => {
            await adminFetch('/program-places', { method: 'POST', body: JSON.stringify({ name: newPlaceName.trim() }) });
            setNewPlaceName('');
            await reloadPlaces();
          }, 'Место добавлено');
        }}
        onSaveEdit={() => {
          if (!editingPlace?.name.trim()) return;
          act(async () => {
            await adminFetch(`/program-places/${editingPlace.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ name: editingPlace.name.trim() }),
            });
            setEditingPlace(null);
            await reloadPlaces();
            await reloadEvents(selectedDay);
          }, 'Сохранено');
        }}
        onDelete={id => {
          if (!confirmDelete('Удалить место? У событий с этим местом поле будет очищено.')) return;
          act(async () => {
            await adminFetch(`/program-places/${id}`, { method: 'DELETE' });
            await reloadPlaces();
            await reloadEvents(selectedDay);
          });
        }}
      />

      <ProgramBlockTypesBlock
        blockTypes={blockTypes}
        newName={newBlockTypeName}
        onNewNameChange={setNewBlockTypeName}
        editing={editingBlockType}
        onEditingChange={setEditingBlockType}
        onAdd={() => {
          if (!newBlockTypeName.trim()) return;
          const key = newBlockTypeName.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 64);
          act(async () => {
            await adminFetch('/program-block-types', { method: 'POST', body: JSON.stringify({ key, name: newBlockTypeName.trim() }) });
            setNewBlockTypeName('');
            await reloadBlockTypes();
          }, 'Тип добавлен');
        }}
        onSaveEdit={() => {
          if (!editingBlockType) return;
          act(async () => {
            await adminFetch(`/program-block-types/${editingBlockType.id}`, { method: 'PATCH', body: JSON.stringify({ name: editingBlockType.name }) });
            setEditingBlockType(null);
            await reloadBlockTypes();
          }, 'Сохранено');
        }}
        onDelete={id => {
          if (!confirmDelete('Удалить тип блока?')) return;
          act(async () => {
            await adminFetch(`/program-block-types/${id}`, { method: 'DELETE' });
            await reloadBlockTypes();
          });
        }}
      />

      <div className="card adm-forum-block adm-forum-hint-only">
        <p className="adm-forum-hint" style={{ margin: 0 }}>
          Спикеров добавляйте и редактируйте во вкладке <strong>«Спикеры»</strong> — здесь только выбор из справочника.
        </p>
      </div>

      <div className="card adm-forum-block">
        <h3>Дни смены</h3>
        <p className="adm-forum-hint">Добавление дня увеличивает totalDays при необходимости. «Черновик дня» снимает публикацию со всех событий дня.</p>
        <div className="adm-forum-grid-2">
          <label className="adm-field">
            <span className="adm-label">Номер дня</span>
            <input className="adm-input" value={newDayNumber} onChange={e => setNewDayNumber(e.target.value)} placeholder="9" />
          </label>
          <label className="adm-field">
            <span className="adm-label">Подпись</span>
            <input className="adm-input" value={newDayLabel} onChange={e => setNewDayLabel(e.target.value)} placeholder="День 9" />
          </label>
          <label className="adm-field">
            <span className="adm-label">Дата</span>
            <input type="date" className="adm-input" value={newDayDate} onChange={e => setNewDayDate(e.target.value)} />
          </label>
        </div>
        <div className="adm-forum-toolbar">
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => {
            const dn = Number(newDayNumber);
            if (!dn) return;
            act(async () => {
              await adminFetch('/schedule/days', {
                method: 'POST',
                body: JSON.stringify({
                  dayNumber: dn,
                  displayLabel: newDayLabel.trim() || `День ${dn}`,
                  calendarDate: newDayDate || undefined,
                }),
              });
              setNewDayNumber('');
              setNewDayLabel('');
              setNewDayDate('');
              await reloadScheduleDays();
              setSelectedDay(dn);
            }, 'День добавлен');
          }}>+ Добавить день</button>
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => act(async () => {
            await adminFetch('/schedule/draft', { method: 'POST', body: JSON.stringify({ dayNumber: selectedDay }) });
            await reloadEvents(selectedDay);
            await reloadScheduleDays();
          }, 'Черновик дня сохранён')}>Сохранить черновик дня</button>
        </div>
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
            <PlaceSelect places={places} value={form.place} onChange={name => setForm({ ...form, place: name })} />
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
            {(blockTypes.length ? blockTypes.map(b => ({ value: b.key, label: b.name })) : BLOCK_TYPE_OPTIONS.map(o => ({ value: o.value, label: label(o.labelKey) }))).map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <div className="adm-forum-grid-2">
          <label className="adm-field">
            <span className="adm-label">Аудитория</span>
            <select className="adm-input" value={form.audienceType} onChange={e => setForm({ ...form, audienceType: e.target.value as 'all' | 'direction' })}>
              <option value="all">Все</option>
              <option value="direction">Направление</option>
            </select>
          </label>
          {form.audienceType === 'direction' && (
            <label className="adm-field">
              <span className="adm-label">Направление</span>
              <select className="adm-input" value={form.audienceDirectionId} onChange={e => setForm({ ...form, audienceDirectionId: e.target.value })}>
                <option value="">—</option>
                {directions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="adm-field">
          <span className="adm-label">Спикеры</span>
          <SpeakerMultiPick speakers={speakers} selectedIds={form.speakerIds} onChange={ids => setForm({ ...form, speakerIds: ids })} />
        </div>
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
        <label className="adm-forum-check">
          <input type="checkbox" checked={form.hasSubSessions} onChange={e => setForm({ ...form, hasSubSessions: e.target.checked })} />
          Блок с под-темами
        </label>
        <p className="adm-forum-hint" style={{ marginTop: 8 }}>
          Черновик виден только в админке. «Опубликовать» делает событие готовым для участников
          {dayPublished ? ' (день уже опубликован — пункт сразу появится в приложении).' : ' (участники увидят его после «Опубликовать день»).'}
        </p>
        <div className="adm-forum-toolbar" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => createEvent(false)}>
            Сохранить черновик
          </button>
          <button type="button" className="adm-btn adm-btn-primary" onClick={() => createEvent(true)}>
            Опубликовать
          </button>
        </div>
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
                  allPlaces={places}
                  blockTypes={blockTypes}
                  speakers={speakers}
                  directions={directions}
                  selectedDay={selectedDay}
                  daySchedulePublished={dayPublished}
                  adminFetch={adminFetch}
                  act={act}
                  onSaved={() => reloadEvents(selectedDay)}
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
