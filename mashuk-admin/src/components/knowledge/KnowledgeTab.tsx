import { useCallback, useEffect, useMemo, useState } from 'react';
import { confirmDelete } from '../../admin/confirmDelete';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';
import { SpeakerMultiPick } from '../program/ProgramCatalogs';
import type { ProgramSpeaker } from '../program/types';
import { KnowledgeBaseParticipantPreview } from './KnowledgeBaseParticipantPreview';
import { MaterialCard, type MaterialRow } from './MaterialCard';
import { MaterialTypesPanel } from './MaterialTypesPanel';
import { KB_SECTIONS, compareKbMaterials, kbSubsectionOptions } from './kbSections';

type KbUnlock = {
  id: number;
  participantId: number;
  dayNumber: number;
  unlockedAt?: string;
};

const emptyMaterial = () => ({
  dayNumber: 1,
  speakerName: '',
  eventId: '',
  direction: '',
  audienceAll: true,
  tags: '',
  title: '',
  url: '',
  type: '',
  speakerIds: [] as number[],
  isGeneral: false,
  kbUnlockMode: 'touchpoints' as 'immediate' | 'touchpoints',
  kbUnlockMinTouchpoints: '' as number | '',
  kbSection: 'thematic' as string,
  kbSubsection: '' as string,
  topicTitle: '',
  sortOrder: '' as number | '',
});

/** После сохранения оставляем раздел/тему/спикеров — удобно добавлять следующий тип артефакта. */
const keepContextAfterCreate = (prev: ReturnType<typeof emptyMaterial>) => ({
  ...emptyMaterial(),
  dayNumber: prev.dayNumber,
  direction: prev.direction,
  audienceAll: prev.audienceAll,
  speakerIds: prev.speakerIds,
  speakerName: prev.speakerName,
  isGeneral: prev.isGeneral,
  eventId: prev.eventId,
  kbUnlockMode: prev.kbUnlockMode,
  kbUnlockMinTouchpoints: prev.kbUnlockMinTouchpoints,
  kbSection: prev.kbSection,
  kbSubsection: prev.kbSubsection,
  topicTitle: prev.topicTitle,
});

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

export function KnowledgeTab({ adminFetch, act, reloadKey, setTab, onOpenCard }: AdminTabProps & {
  onOpenCard?: (id: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [materialTypes, setMaterialTypes] = useState<{ key: string; name: string }[]>([]);
  const [events, setEvents] = useState<{ id: number; dayNumber: number; title: string }[]>([]);
  const [directions, setDirections] = useState<{ id: number; name: string }[]>([]);
  const [kbUnlocks, setKbUnlocks] = useState<KbUnlock[]>([]);
  const [kbUnlockForm, setKbUnlockForm] = useState({ participantId: '', dayNumber: 1 });
  const [newMaterial, setNewMaterial] = useState(emptyMaterial);
  const [search, setSearch] = useState('');
  const [dayFilter, setDayFilter] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [speakers, setSpeakers] = useState<ProgramSpeaker[]>([]);
  const [previewDay, setPreviewDay] = useState(1);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [kbForumThreshold, setKbForumThreshold] = useState(4);
  const [totalDays, setTotalDays] = useState(8);

  const openDayPreview = (day: number) => {
    setPreviewDay(day);
    setPreviewOpen(true);
    requestAnimationFrame(() => {
      document.getElementById('kb-participant-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const refreshUnlocks = async () => {
    setKbUnlocks((await adminFetch('/kb-unlocks')).unlocks || []);
  };

  const dayOptions = useMemo(() => {
    const fromSettings = Array.from({ length: Math.max(1, totalDays) }, (_, i) => i + 1);
    const fromMaterials = materials
      .map(m => m.dayNumber)
      .filter((d): d is number => typeof d === 'number' && d > 0);
    return [...new Set([...fromSettings, ...fromMaterials])].sort((a, b) => a - b);
  }, [totalDays, materials]);

  const refreshMaterials = useCallback(async () => {
    const matPath = statusFilter ? `/materials?status=${encodeURIComponent(statusFilter)}` : '/materials';
    const matRes = await adminFetch(matPath);
    setMaterials(matRes.materials || []);
  }, [adminFetch, statusFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const matPath = statusFilter ? `/materials?status=${encodeURIComponent(statusFilter)}` : '/materials';
      const [matRes, typesRes, evRes, dirRes, spRes, fsRes, unlockRes] = await Promise.all([
        adminFetch(matPath),
        adminFetch('/material-types').catch(() => ({ types: [] })),
        adminFetch('/events'),
        adminFetch('/directions'),
        adminFetch('/program-speakers').catch(() => ({ speakers: [] })),
        adminFetch('/forum-settings').catch(() => ({ settings: {} })),
        adminFetch('/kb-unlocks').catch(() => ({ unlocks: [] })),
      ]);
      setKbForumThreshold(fsRes.settings?.kbUnlockThreshold ?? 4);
      setTotalDays(fsRes.settings?.totalDays ?? 8);
      setMaterials(matRes.materials || []);
      setMaterialTypes((typesRes.types || []).map((t: { key: string; name: string }) => ({ key: t.key, name: t.name })));
      setEvents(evRes.events || []);
      setDirections(dirRes.directions || []);
      setSpeakers(spRes.speakers || []);
      setKbUnlocks(unlockRes.unlocks || []);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, statusFilter]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  useEffect(() => {
    if (dayFilter) setPreviewDay(Number(dayFilter));
  }, [dayFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const speakerLabel = (m: MaterialRow) => {
      if (m.speakerIds?.length) {
        const names = speakers
          .filter(s => m.speakerIds!.includes(s.id))
          .map(s => s.name)
          .filter(Boolean);
        if (names.length) return names.join('; ');
      }
      return m.speakerName || '';
    };
    return materials
      .filter(m => {
        if (dayFilter && String(m.dayNumber ?? '') !== dayFilter) return false;
        if (directionFilter && (m.direction || '') !== directionFilter) return false;
        if (sectionFilter && (m.kbSection || '') !== sectionFilter) return false;
        if (eventFilter === 'general') {
          if (m.eventId != null || m.isGeneral !== true) return false;
        } else if (eventFilter && String(m.eventId ?? '') !== eventFilter) return false;
        if (q) {
          const hay = `${m.title || ''} ${m.topicTitle || ''} ${speakerLabel(m)}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .slice()
      .sort((a, b) => compareKbMaterials(
        { ...a, speakerName: speakerLabel(a) },
        { ...b, speakerName: speakerLabel(b) },
      ));
  }, [materials, speakers, search, dayFilter, directionFilter, eventFilter, sectionFilter]);

  const buildCreateBody = (status: 'draft' | 'published', extra: Record<string, unknown> = {}) => {
    const tags = newMaterial.tags.split(',').map(s => s.trim()).filter(Boolean);
    const audienceAll = !!newMaterial.audienceAll;
    return {
      dayNumber: Number(newMaterial.dayNumber),
      eventId: newMaterial.isGeneral ? null : (newMaterial.eventId ? Number(newMaterial.eventId) : null),
      direction: audienceAll ? null : (newMaterial.direction || null),
      tags,
      title: newMaterial.title.trim(),
      url: newMaterial.url.trim() || null,
      type: newMaterial.type || null,
      speakerIds: newMaterial.speakerIds,
      speakerName: newMaterial.speakerName || null,
      isGeneral: !!newMaterial.isGeneral,
      kbUnlockMode: newMaterial.kbUnlockMode,
      kbUnlockMinTouchpoints: newMaterial.kbUnlockMode === 'touchpoints' && newMaterial.kbUnlockMinTouchpoints !== ''
        ? newMaterial.kbUnlockMinTouchpoints
        : null,
      kbSection: newMaterial.kbSection || null,
      kbSubsection: newMaterial.kbSection === 'open_lessons' ? (newMaterial.kbSubsection || null) : null,
      topicTitle: newMaterial.topicTitle.trim() || null,
      sortOrder: newMaterial.sortOrder === '' ? 0 : newMaterial.sortOrder,
      status,
      ...extra,
    };
  };

  const createMaterial = (status: 'draft' | 'published') => {
    if (!newMaterial.title.trim()) {
      alert('Укажите название материала');
      return;
    }
    if (!newMaterial.url.trim() && status === 'published') {
      alert('Для публикации укажите ссылку или сначала загрузите файл');
      return;
    }
    if (!newMaterial.audienceAll && !newMaterial.direction) {
      alert('Выберите направление или отметьте «Для всех направлений»');
      return;
    }
    if (newMaterial.kbSection === 'open_lessons' && !newMaterial.kbSubsection) {
      alert('Выберите подраздел для «Открытые уроки»');
      return;
    }
    act(async () => {
      const res = await adminFetch('/materials', {
        method: 'POST',
        body: JSON.stringify(buildCreateBody(status)),
      });
      setNewMaterial(keepContextAfterCreate(newMaterial));
      if (res?.material) {
        setMaterials(prev => [res.material as MaterialRow, ...prev]);
      } else {
        await refreshMaterials();
      }
    }, status === 'published'
      ? 'Опубликован. Можно сразу добавить следующий тип к той же теме'
      : 'Черновик сохранён. Можно сразу добавить следующий тип к той же теме', { reload: false });
  };

  const uploadFile = async (file: File) => {
    const dataUrl = await readFileAsDataUrl(file);
    const res = await adminFetch('/upload-file', {
      method: 'POST',
      body: JSON.stringify({ dataUrl, filename: file.name }),
    });
    return res.fileUrl || res.url;
  };

  const createWithFile = (file: File) => {
    if (!newMaterial.title.trim()) {
      alert('Сначала укажите название материала');
      return;
    }
    if (!newMaterial.audienceAll && !newMaterial.direction) {
      alert('Выберите направление или отметьте «Для всех направлений»');
      return;
    }
    act(async () => {
      const fileUrl = await uploadFile(file);
      const res = await adminFetch('/materials', {
        method: 'POST',
        body: JSON.stringify(buildCreateBody('draft', {
          fileUrl,
          url: newMaterial.url.trim() || fileUrl,
        })),
      });
      setNewMaterial(keepContextAfterCreate(newMaterial));
      if (res?.material) {
        setMaterials(prev => [res.material as MaterialRow, ...prev]);
      } else {
        await refreshMaterials();
      }
    }, 'Файл загружен. Можно сразу добавить следующий тип к той же теме', { reload: false });
  };

  const openCard = (id: number) => {
    if (onOpenCard) onOpenCard(id);
  };

  if (loading && materials.length === 0) return <p className="adm-muted">Загрузка базы знаний…</p>;

  return (
    <div className="adm-forum adm-kb">
      <AdminPageHero
        title={
          filtered.length === materials.length
            ? `База знаний · ${materials.length} материалов`
            : `База знаний · ${filtered.length} из ${materials.length} материалов`
        }
        hint="Разделы: тематические направления, уроки о важном, открытые уроки. Одна тема + несколько типов (презентация, видео…) — укажите одинаковую «Тему», они пойдут подряд у участника. После сохранения форма оставляет раздел/тему/спикеров."
      >
        {setTab && (
          <button type="button" className="adm-kb-btn adm-kb-btn-secondary" onClick={() => setTab('events')}>
            Перейти к программе
          </button>
        )}
      </AdminPageHero>

      <MaterialTypesPanel adminFetch={adminFetch} act={act} />

      <div className="card adm-forum-block adm-kb-panel">
        <div className="adm-kb-panel-head">
          <h3>Разблокировка БЗ</h3>
          <p className="adm-kb-panel-sub">
            Порог форума: ≥ {kbForumThreshold} из 7 точек осмысления за день
          </p>
        </div>
        <div className="adm-kb-toolbar">
          <input
            type="number"
            className="adm-input"
            value={kbUnlockForm.participantId}
            onChange={e => setKbUnlockForm({ ...kbUnlockForm, participantId: e.target.value })}
            placeholder="ID участника"
          />
          <select
            className="adm-input adm-kb-control-sm"
            value={kbUnlockForm.dayNumber}
            onChange={e => setKbUnlockForm({ ...kbUnlockForm, dayNumber: Number(e.target.value) })}
            title="День смены"
          >
            {dayOptions.map(d => (
              <option key={d} value={d}>День {d}</option>
            ))}
          </select>
          <button type="button" className="adm-kb-btn adm-kb-btn-secondary" onClick={() => {
            const id = Number(kbUnlockForm.participantId);
            if (id) openCard(id);
          }}>Карточка</button>
          <button type="button" className="adm-kb-btn adm-kb-btn-primary" onClick={() => act(async () => {
            await adminFetch('/kb-unlocks', {
              method: 'POST',
              body: JSON.stringify({
                participantId: Number(kbUnlockForm.participantId),
                dayNumber: kbUnlockForm.dayNumber,
              }),
            });
            await refreshUnlocks();
          }, 'БЗ разблокирована')}>Разблокировать</button>
        </div>
        {kbUnlocks.length > 0 && (
          <div className="adm-table-scroll adm-kb-mini-scroll">
            <table className="adm-table adm-kb-mini-table">
              <thead><tr><th>Участник</th><th>День</th><th>Когда</th><th /></tr></thead>
              <tbody>
                {kbUnlocks.slice(0, 30).map(u => (
                  <tr key={u.id}>
                    <td>{u.participantId}</td>
                    <td>{u.dayNumber}</td>
                    <td>{u.unlockedAt ? new Date(u.unlockedAt).toLocaleString('ru-RU') : '—'}</td>
                    <td>
                      <button type="button" className="adm-kb-btn adm-kb-btn-danger" onClick={() => {
                        if (!confirmDelete('Отозвать разблокировку БЗ?')) return;
                        act(async () => {
                          await adminFetch(`/kb-unlocks/${u.participantId}/${u.dayNumber}`, { method: 'DELETE' });
                          await refreshUnlocks();
                        }, 'Отозвано');
                      }}>Отозвать</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card adm-forum-block adm-kb-panel">
        <div className="adm-kb-panel-head">
          <h3>Материалы</h3>
          <p className="adm-kb-panel-sub">
            Фильтры · предпросмотр · создание · правка в таблице
          </p>
        </div>
        <div className="adm-kb-toolbar">
          <input className="adm-input adm-kb-search" placeholder="Поиск" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="adm-input" value={dayFilter} onChange={e => setDayFilter(e.target.value)}>
            <option value="">Все дни</option>
            {dayOptions.map(d => (
              <option key={d} value={String(d)}>День {d}</option>
            ))}
          </select>
          <select className="adm-input" value={sectionFilter} onChange={e => setSectionFilter(e.target.value)}>
            <option value="">Все разделы</option>
            {KB_SECTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select className="adm-input" value={directionFilter} onChange={e => setDirectionFilter(e.target.value)}>
            <option value="">Все направления</option>
            {directions.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
          <select className="adm-input" value={eventFilter} onChange={e => setEventFilter(e.target.value)}>
            <option value="">Все события</option>
            <option value="general">Общие (без события)</option>
            {events.map(ev => (
              <option key={ev.id} value={String(ev.id)}>Д{ev.dayNumber} · {ev.title}</option>
            ))}
          </select>
          <select className="adm-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Все статусы</option>
            <option value="draft">Черновик</option>
            <option value="published">Опубликован</option>
            <option value="archived">Архив</option>
          </select>
          <select
            className="adm-input adm-kb-control-sm"
            value={previewDay}
            onChange={e => setPreviewDay(Number(e.target.value))}
            title="День для предпросмотра"
          >
            {dayOptions.map(d => (
              <option key={d} value={d}>День {d}</option>
            ))}
          </select>
          <button
            type="button"
            className="adm-kb-btn adm-kb-btn-secondary"
            onClick={() => {
              if (previewOpen) setPreviewOpen(false);
              else openDayPreview(previewDay);
            }}
          >
            {previewOpen ? 'Скрыть превью' : 'Превью'}
          </button>
          <button type="button" className="adm-kb-btn adm-kb-btn-secondary" onClick={() => load()}>Обновить</button>
        </div>

        {previewOpen && (
          <div id="kb-participant-preview">
            <KnowledgeBaseParticipantPreview
              day={previewDay}
              dayOptions={dayOptions}
              materials={materials}
              typeOptions={materialTypes}
              speakers={speakers}
              kbThreshold={kbForumThreshold}
              onDayChange={setPreviewDay}
            />
          </div>
        )}

        <div className="adm-kb-create">
          <div className="adm-kb-panel-head">
            <h4>Новый материал</h4>
            <p className="adm-kb-panel-sub">
              Одна «Тема» для презентации, видео и конспекта — материалы одного спикера идут рядом
            </p>
          </div>
          <div className="adm-kb-section-legend">
            {KB_SECTIONS.map(s => (
              <span
                key={s.key}
                className="adm-kb-section-chip"
                style={{ background: s.tint, color: s.color, borderColor: s.color }}
              >
                {s.label}
              </span>
            ))}
          </div>
          <div className="adm-forum-grid-2">
            <label className="adm-field">
              <span className="adm-label">Раздел *</span>
              <select
                className="adm-input"
                value={newMaterial.kbSection}
                onChange={e => {
                  const kbSection = e.target.value;
                  setNewMaterial({
                    ...newMaterial,
                    kbSection,
                    kbSubsection: kbSection === 'open_lessons' ? newMaterial.kbSubsection : '',
                  });
                }}
              >
                {KB_SECTIONS.map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </label>
            {newMaterial.kbSection === 'open_lessons' ? (
              <label className="adm-field">
                <span className="adm-label">Подраздел *</span>
                <select
                  className="adm-input"
                  value={newMaterial.kbSubsection}
                  onChange={e => setNewMaterial({ ...newMaterial, kbSubsection: e.target.value })}
                >
                  <option value="">— выберите —</option>
                  {kbSubsectionOptions('open_lessons').map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="adm-field">
                <span className="adm-label">Тема (группировка)</span>
                <input
                  className="adm-input"
                  value={newMaterial.topicTitle}
                  onChange={e => setNewMaterial({ ...newMaterial, topicTitle: e.target.value })}
                  placeholder="Напр. «Урок о дружбе» — одна тема для нескольких типов"
                />
              </label>
            )}
            {newMaterial.kbSection === 'open_lessons' && (
              <label className="adm-field">
                <span className="adm-label">Тема (группировка)</span>
                <input
                  className="adm-input"
                  value={newMaterial.topicTitle}
                  onChange={e => setNewMaterial({ ...newMaterial, topicTitle: e.target.value })}
                  placeholder="Одинаковая тема = артефакты подряд"
                />
              </label>
            )}
            <label className="adm-field">
              <span className="adm-label">Название материала *</span>
              <input
                className="adm-input"
                value={newMaterial.title}
                onChange={e => setNewMaterial({ ...newMaterial, title: e.target.value })}
                placeholder="Презентация / Видео / Конспект…"
              />
            </label>
            <label className="adm-field">
              <span className="adm-label">Ссылка</span>
              <input
                className="adm-input"
                value={newMaterial.url}
                onChange={e => setNewMaterial({ ...newMaterial, url: e.target.value })}
                placeholder="https://…"
              />
            </label>
            <label className="adm-field">
              <span className="adm-label">День смены</span>
              <select
                className="adm-input"
                value={newMaterial.dayNumber}
                onChange={e => setNewMaterial({
                  ...newMaterial,
                  dayNumber: Number(e.target.value),
                  eventId: '',
                })}
              >
                {dayOptions.map(d => (
                  <option key={d} value={d}>День {d}</option>
                ))}
              </select>
            </label>
            <label className="adm-field">
              <span className="adm-label">Событие программы</span>
              <select
                className="adm-input"
                value={newMaterial.eventId}
                disabled={newMaterial.isGeneral}
                onChange={e => {
                  const eventId = e.target.value;
                  const ev = events.find(x => String(x.id) === eventId);
                  setNewMaterial({
                    ...newMaterial,
                    eventId,
                    ...(ev ? { dayNumber: ev.dayNumber } : {}),
                  });
                }}
              >
                <option value="">— без события —</option>
                {events
                  .filter(ev =>
                    !newMaterial.dayNumber
                    || ev.dayNumber === newMaterial.dayNumber
                    || String(ev.id) === newMaterial.eventId,
                  )
                  .map(ev => (
                    <option key={ev.id} value={String(ev.id)}>Д{ev.dayNumber} · {ev.title}</option>
                  ))}
              </select>
            </label>
            <label className="adm-field">
              <span className="adm-label">Тип артефакта</span>
              <select className="adm-input" value={newMaterial.type} onChange={e => setNewMaterial({ ...newMaterial, type: e.target.value })}>
                <option value="">—</option>
                {materialTypes.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
              </select>
            </label>
            <div className="adm-field">
              <span className="adm-label">Спикеры</span>
              <SpeakerMultiPick
                speakers={speakers}
                selectedIds={newMaterial.speakerIds}
                onChange={ids => setNewMaterial({ ...newMaterial, speakerIds: ids })}
              />
            </div>
            <div className="adm-field">
              <span className="adm-label">Направление</span>
              <label className="adm-forum-check adm-kb-audience-all">
                <input
                  type="checkbox"
                  checked={newMaterial.audienceAll}
                  onChange={e => setNewMaterial({
                    ...newMaterial,
                    audienceAll: e.target.checked,
                    direction: e.target.checked ? '' : newMaterial.direction,
                  })}
                />
                Для всех направлений
              </label>
              <select
                className="adm-input"
                value={newMaterial.direction}
                onChange={e => setNewMaterial({ ...newMaterial, direction: e.target.value, audienceAll: false })}
                disabled={newMaterial.audienceAll}
              >
                <option value="">У какого направления показывать</option>
                {directions.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div className="adm-field">
              <span className="adm-label">Открытие для участника</span>
              <select
                className="adm-input"
                value={newMaterial.kbUnlockMode}
                onChange={e => setNewMaterial({ ...newMaterial, kbUnlockMode: e.target.value as 'immediate' | 'touchpoints' })}
              >
                <option value="touchpoints">После ≥ N точек осмысления</option>
                <option value="immediate">Сразу</option>
              </select>
              {newMaterial.kbUnlockMode === 'touchpoints' && (
                <input
                  type="number"
                  min={1}
                  max={7}
                  className="adm-input"
                  style={{ width: 72, marginTop: 6 }}
                  placeholder={String(kbForumThreshold)}
                  value={newMaterial.kbUnlockMinTouchpoints === '' ? '' : newMaterial.kbUnlockMinTouchpoints}
                  onChange={e => setNewMaterial({
                    ...newMaterial,
                    kbUnlockMinTouchpoints: e.target.value === '' ? '' : Number(e.target.value),
                  })}
                />
              )}
            </div>
          </div>
          <div className="adm-kb-create-extra">
            <label className="adm-forum-check">
              <input
                type="checkbox"
                checked={newMaterial.isGeneral}
                onChange={e => setNewMaterial({ ...newMaterial, isGeneral: e.target.checked, eventId: e.target.checked ? '' : newMaterial.eventId })}
              />
              Общий материал (без привязки к событию)
            </label>
            <label className="adm-field adm-kb-file-field">
              <span className="adm-label">Или загрузить файл</span>
              <input
                type="file"
                className="adm-input"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  createWithFile(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <div className="adm-kb-actions">
            <button type="button" className="adm-kb-btn adm-kb-btn-secondary" onClick={() => createMaterial('draft')}>
              Черновик
            </button>
            <button type="button" className="adm-kb-btn adm-kb-btn-primary" onClick={() => createMaterial('published')}>
              Опубликовать
            </button>
            <button type="button" className="adm-kb-btn adm-kb-btn-ghost" onClick={() => setNewMaterial(emptyMaterial())}>
              Очистить
            </button>
          </div>
        </div>

        <p className="adm-kb-table-hint">
          Правка в таблице · клик по спикеру открывает карточку · внутри раздела — по фамилии, преза и материалы рядом
        </p>
        <div className="adm-table-scroll adm-kb-table-scroll">
          <table className="adm-table adm-kb-inline-table">
            <thead>
              <tr>
                <th>Раздел / тема</th>
                <th>День</th>
                <th>Спикер</th>
                <th>Название / ссылка</th>
                <th>Тип</th>
                <th>Аудитория</th>
                <th>Привязка</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <MaterialCard
                  key={m.id}
                  material={m}
                  typeOptions={materialTypes}
                  speakers={speakers}
                  events={events}
                  directions={directions}
                  dayOptions={dayOptions}
                  onPreview={() => openDayPreview(m.dayNumber ?? 1)}
                  onSave={body => act(async () => {
                    const res = await adminFetch(`/materials/${m.id}`, { method: 'PATCH', body: JSON.stringify(body) });
                    if (res?.material) {
                      setMaterials(prev => prev.map(x => (x.id === m.id ? { ...x, ...res.material } : x)));
                    } else {
                      await refreshMaterials();
                    }
                  }, 'Сохранено', { reload: false })}
                  onDelete={() => act(async () => {
                    await adminFetch(`/materials/${m.id}`, { method: 'DELETE' });
                    setMaterials(prev => prev.filter(x => x.id !== m.id));
                  }, 'Удалено', { reload: false })}
                />
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <p className="adm-muted">Нет материалов по фильтрам</p>}
      </div>
    </div>
  );
}
