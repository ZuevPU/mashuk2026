import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { confirmDelete } from '../../admin/confirmDelete';
import { ADMIN_SHIFT_CHANGED_EVENT, getAdminEditingShiftId } from '../../admin/client';
import { label } from '../../labels/ru';
import { AdminAccordion } from '../admin/AdminAccordion';
import { PlaceSelect, ProgramPlacesBlock } from './ProgramPlacesBlock';
import { ProgramBlockTypesBlock } from './ProgramCatalogs';
import { ProgramCalendarGrid } from './ProgramCalendarGrid';
import { EventEditorDrawer, type DrawerState } from './EventEditorDrawer';
import { countShiftStats } from './programCalendar';
import {
  type ProgramBlockType,
  type ProgramEvent,
  type ProgramPlace,
  type ProgramSpeaker,
  type ScheduleDayRow,
  type ThematicTag,
} from './types';

import type { AdminTabProps } from '../admin/types';

function programDayStorageKey(shiftId: number | null): string {
  return `mashuk_admin_program_day_${shiftId ?? 'default'}`;
}

function readStoredProgramDay(shiftId: number | null): number | null {
  try {
    const n = Number(sessionStorage.getItem(programDayStorageKey(shiftId)));
    return Number.isFinite(n) && n >= 1 ? n : null;
  } catch {
    return null;
  }
}

function writeStoredProgramDay(shiftId: number | null, day: number) {
  try {
    sessionStorage.setItem(programDayStorageKey(shiftId), String(day));
  } catch {
    /* ignore */
  }
}

export function ProgramTab({ adminFetch, act, reloadKey, setTab }: AdminTabProps) {
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(() => readStoredProgramDay(getAdminEditingShiftId()) ?? 1);
  const [totalDays, setTotalDays] = useState(8);
  const [forumCurrentDay, setForumCurrentDay] = useState(1);
  const [allEvents, setAllEvents] = useState<ProgramEvent[]>([]);
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
  const [editingDayId, setEditingDayId] = useState<number | null>(null);
  const [editingDayLabel, setEditingDayLabel] = useState('');
  const [newDayDate, setNewDayDate] = useState('');
  const [mergeFrom, setMergeFrom] = useState('');
  const [mergeTo, setMergeTo] = useState('');
  const [copyFromDay, setCopyFromDay] = useState(1);
  const [drawer, setDrawer] = useState<DrawerState>({ open: false });

  const reloadAllEvents = useCallback(async () => {
    const res = await adminFetch('/events');
    setAllEvents(res.events || []);
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

  const selectedDayRef = useRef(selectedDay);
  selectedDayRef.current = selectedDay;

  useEffect(() => {
    writeStoredProgramDay(getAdminEditingShiftId(), selectedDay);
  }, [selectedDay]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fs = (await adminFetch('/forum-settings')).settings;
      const td = fs?.totalDays ?? 8;
      const cd = fs?.currentDay ?? 1;
      setTotalDays(td);
      setForumCurrentDay(cd);
      const day = selectedDayRef.current;
      await Promise.all([
        reloadAllEvents(),
        reloadTags(),
        reloadPlaces(),
        reloadBlockTypes(),
        reloadSpeakers(),
        reloadScheduleDays(),
      ]);
      setDirections((await adminFetch('/directions')).directions || []);
      const sched = await adminFetch(`/schedule/versions?day=${day}`);
      setScheduleDays(prev => (sched.days?.length ? sched.days : prev));
      setVersions(sched.versions || []);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, reloadAllEvents, reloadTags, reloadPlaces, reloadBlockTypes, reloadSpeakers, reloadScheduleDays]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  useEffect(() => {
    const onShiftChanged = () => {
      const day = readStoredProgramDay(getAdminEditingShiftId()) ?? 1;
      setSelectedDay(day);
      setDrawer({ open: false });
    };
    window.addEventListener(ADMIN_SHIFT_CHANGED_EVENT, onShiftChanged);
    return () => window.removeEventListener(ADMIN_SHIFT_CHANGED_EVENT, onShiftChanged);
  }, []);

  useEffect(() => {
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

  const dayEvents = useMemo(
    () => allEvents.filter(e => e.dayNumber === selectedDay),
    [allEvents, selectedDay],
  );

  const shiftStats = useMemo(() => countShiftStats(allEvents), [allEvents]);

  const dayPublished = scheduleDays.find(d => d.dayNumber === selectedDay)?.isPublished === true;

  const findEventById = useCallback((id: number, list: ProgramEvent[] = allEvents): ProgramEvent | undefined => {
    for (const e of list) {
      if (e.id === id) return e;
      if (e.children?.length) {
        const ch = findEventById(id, e.children);
        if (ch) return ch;
      }
    }
    return undefined;
  }, [allEvents]);

  const onSaved = useCallback(async () => {
    const res = await adminFetch('/events');
    const events = res.events || [];
    setAllEvents(events);
    setDrawer(d => {
      if (d.open && d.mode === 'edit') {
        const walk = (list: ProgramEvent[]): ProgramEvent | undefined => {
          for (const e of list) {
            if (e.id === d.event.id) return e;
            if (e.children?.length) {
              const hit = walk(e.children);
              if (hit) return hit;
            }
          }
          return undefined;
        };
        const fresh = walk(events);
        if (fresh) return { open: true, mode: 'edit', event: fresh };
      }
      return d;
    });
  }, [adminFetch]);

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
            isPublished: e.isPublished === true,
            audienceType: e.audienceType || 'all',
            audienceDirectionId: e.audienceDirectionId ?? null,
            audienceDirectionIds: Array.isArray(e.audienceDirectionIds) ? e.audienceDirectionIds : [],
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
      await reloadAllEvents();
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
      await reloadAllEvents();
      const sched = await adminFetch(`/schedule/versions?day=${selectedDay}`);
      setVersions(sched.versions || []);
      setScheduleDays(sched.days || []);
    }, `День ${selectedDay} опубликован`);
  };


  return (
    <div className="adm-forum adm-program">
      <div className="card adm-forum-hero adm-program-hero-compact">
        <h2 className="adm-forum-hero-title">
          Программа смены · <span className="adm-forum-accent">{shiftStats.total} событий</span>
          {' · '}{shiftStats.visible} опубликовано
        </h2>
        <p className="adm-forum-hint">
          Текущий день форума для участников: {forumCurrentDay}. Выбранный день: {selectedDay} из {totalDays}
          {' · '}
          <strong>{dayPublished ? label('day_published') : label('day_draft')}</strong>
        </p>
        <div className="adm-forum-toolbar">
          <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={publishDay} disabled={dayEvents.length === 0}>
            Опубликовать день {selectedDay}
          </button>
          {dayEvents.length === 0 && (
            <>
              <label className="adm-forum-inline">
                Скопировать с дня
                <select value={copyFromDay} onChange={e => setCopyFromDay(Number(e.target.value))}>
                  {Array.from({ length: totalDays }, (_, i) => i + 1).filter(d => d !== selectedDay).map(d => (
                    <option key={d} value={d}>День {d}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={copyDay}>Копировать</button>
            </>
          )}
        </div>
      </div>

      <div className="card adm-forum-block">
        <h3>Календарь смены</h3>
        <ProgramCalendarGrid
          events={allEvents}
          totalDays={totalDays}
          scheduleDays={dayTabs}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          onAddEvent={(day, timeStart, timeEnd) => {
            setSelectedDay(day);
            setDrawer({ open: true, mode: 'create', initialDraft: { dayNumber: day, timeStart, timeEnd } });
          }}
          onEditEvent={ev => {
            const fresh = findEventById(ev.id) ?? ev;
            setSelectedDay(fresh.dayNumber ?? selectedDay);
            setDrawer({ open: true, mode: 'edit', event: fresh });
          }}
        />
      </div>

      <AdminAccordion title="Тематические теги" summary={`${tags.length} тегов`}>
        <p className="adm-forum-hint">
          Совпадают с интересами из регистрации — от них строится блок «Рекомендуем тебе».
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
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const name = editingTag.name.trim();
                        if (!name) return;
                        act(async () => {
                          await adminFetch(`/thematic-tags/${t.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
                          setEditingTag(null);
                          await reloadTags();
                          await reloadAllEvents();
                        }, 'Тег переименован');
                      }
                    }}
                  />
                  <button type="button" className="adm-btn adm-btn-sm adm-btn-primary" onClick={() => {
                    const name = editingTag.name.trim();
                    if (!name) return;
                    act(async () => {
                      await adminFetch(`/thematic-tags/${t.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
                      setEditingTag(null);
                      await reloadTags();
                      await reloadAllEvents();
                    }, 'Тег переименован');
                  }}>Сохранить</button>
                  <button type="button" className="adm-btn adm-btn-sm adm-btn-ghost" onClick={() => setEditingTag(null)}>Отмена</button>
                </>
              ) : (
                <>
                  <span className="adm-program-tag-name">{t.name}</span>
                  <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => setEditingTag({ id: t.id, name: t.name })}>Изменить</button>
                  <button
                    type="button"
                    className="adm-btn adm-btn-ghost adm-btn-sm"
                    style={{ color: '#9B2C2C' }}
                    onClick={() => {
                      if (!confirmDelete(`Удалить тег «${t.name}»?`)) return;
                      act(async () => {
                        try {
                          await adminFetch(`/thematic-tags/${t.id}`, { method: 'DELETE' });
                        } catch (err) {
                          const msg = String(err);
                          if (!msg.includes('Tag has links')) throw err;
                          if (!window.confirm(
                            `Тег «${t.name}» уже используется в событиях, материалах или интересах.\n\nУдалить и снять его со всех связей?`,
                          )) return;
                          await adminFetch(`/thematic-tags/${t.id}?force=1`, { method: 'DELETE' });
                        }
                        await reloadTags();
                        await reloadAllEvents();
                      }, 'Тег удалён');
                    }}
                  >
                    Удалить
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
                  await reloadAllEvents();
                }, 'Теги объединены');
              }}
            >
              Объединить
            </button>
          </div>
        </details>
      </AdminAccordion>

      <AdminAccordion title="Места проведения" summary={`${places.length} мест`}>
        <p className="adm-muted adm-forum-hint">Справочник мест — для поля «Место» в событиях программы.</p>
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
              await reloadAllEvents();
            }, 'Сохранено');
          }}
          onDelete={id => {
            if (!confirmDelete('Удалить место? У событий с этим местом поле будет очищено.')) return;
            act(async () => {
              await adminFetch(`/program-places/${id}`, { method: 'DELETE' });
              await reloadPlaces();
              await reloadAllEvents();
            });
          }}
          embedded
        />
      </AdminAccordion>

      <AdminAccordion title="Типы блоков" summary={`${blockTypes.length} типов`}>
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
          embedded
        />
      </AdminAccordion>

      <AdminAccordion title="Дни смены" summary={`${dayTabs.length} дней`}>
        <p className="adm-forum-hint">Добавление дня увеличивает totalDays при необходимости. «Черновик дня» снимает публикацию со всех событий дня.</p>
        <div className="adm-seg adm-forum-day-seg" style={{ marginBottom: 12 }}>
          {dayTabs.map(d => (
            <span key={d.dayNumber} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {editingDayId != null && d.id === editingDayId ? (
                <>
                  <input
                    className="adm-input adm-input-narrow"
                    value={editingDayLabel}
                    onChange={e => setEditingDayLabel(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && d.id) {
                        e.preventDefault();
                        act(async () => {
                          await adminFetch(`/schedule/days/${d.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ displayLabel: editingDayLabel.trim() || `День ${d.dayNumber}` }),
                          });
                          setEditingDayId(null);
                          await reloadScheduleDays();
                        }, 'День переименован');
                      }
                    }}
                  />
                  <button type="button" className="adm-btn adm-btn-sm adm-btn-primary" onClick={() => {
                    if (!d.id) return;
                    act(async () => {
                      await adminFetch(`/schedule/days/${d.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ displayLabel: editingDayLabel.trim() || `День ${d.dayNumber}` }),
                      });
                      setEditingDayId(null);
                      await reloadScheduleDays();
                    }, 'День переименован');
                  }}>OK</button>
                </>
              ) : (
                <button type="button" className={selectedDay === d.dayNumber ? 'on' : ''} onClick={() => setSelectedDay(d.dayNumber)}>
                  {d.displayLabel || `Д${d.dayNumber}`}
                </button>
              )}
              {d.id && editingDayId !== d.id && selectedDay === d.dayNumber && (
                <button
                  type="button"
                  className="adm-btn adm-btn-ghost adm-btn-sm"
                  title="Переименовать день"
                  onClick={() => {
                    setEditingDayId(d.id!);
                    setEditingDayLabel(d.displayLabel || `День ${d.dayNumber}`);
                  }}
                >
                  ✎
                </button>
              )}
            </span>
          ))}
        </div>
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
            await reloadAllEvents();
            await reloadScheduleDays();
          }, 'Черновик дня сохранён')}>Сохранить черновик дня</button>
          {scheduleDays.find(d => d.dayNumber === selectedDay && d.id) && (
            <button
              type="button"
              className="adm-btn adm-btn-ghost adm-btn-sm"
              style={{ color: '#9B2C2C' }}
              onClick={() => {
                const row = scheduleDays.find(d => d.dayNumber === selectedDay);
                if (!row?.id) return;
                const force = confirm(
                  'Удалить день из расписания? Если на дне есть события — потребуется подтверждение с удалением событий.',
                );
                if (!force) return;
                const forceEvents = confirm('Удалить также все события этого дня?');
                act(async () => {
                  try {
                    await adminFetch(`/schedule/days/${row.id}?force=${forceEvents ? '1' : '0'}`, { method: 'DELETE' });
                  } catch (e: unknown) {
                    const err = e as { status?: number; body?: { eventCount?: number } };
                    if (err?.status === 409 && err?.body?.eventCount) {
                      if (!confirm(`На дне ${selectedDay} есть ${err.body.eventCount} событий. Удалить день вместе с событиями?`)) return;
                      await adminFetch(`/schedule/days/${row.id}?force=1`, { method: 'DELETE' });
                    } else {
                      throw e;
                    }
                  }
                  await reloadScheduleDays();
                  await reloadAllEvents();
                  setSelectedDay(Math.max(1, selectedDay - 1));
                }, 'День удалён');
              }}
            >
              Удалить выбранный день
            </button>
          )}
        </div>
      </AdminAccordion>

      <AdminAccordion title="Публикация и версии" summary={`день ${selectedDay}`}>
        <p className="adm-forum-hint">
          После публикации участники увидят события дня {selectedDay} в приложении (при условии, что события не в черновике).
          Событий на дне: {dayEvents.length} · {dayPublished ? label('day_published') : label('day_draft')}
        </p>
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
      </AdminAccordion>

      <p className="adm-muted adm-forum-hint">
        Спикеров добавляйте во вкладке «Спикеры» — в форме события только поиск по ФИО.
      </p>

      <EventEditorDrawer
        drawer={drawer}
        onClose={() => setDrawer({ open: false })}
        allTags={tags}
        allPlaces={places}
        blockTypes={blockTypes}
        speakers={speakers}
        directions={directions}
        daySchedulePublished={dayPublished}
        onSaved={onSaved}
        onGoToDay={setSelectedDay}
        adminFetch={adminFetch}
        act={act}
      />
    </div>
  );
}
