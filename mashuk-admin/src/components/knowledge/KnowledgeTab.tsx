import { useCallback, useEffect, useMemo, useState } from 'react';
import { confirmDelete } from '../../admin/confirmDelete';
import { AdminPageHero } from '../admin/AdminPageHero';
import { ParticipantPreviewHtml, ParticipantPreviewModal } from '../admin/ParticipantPreviewModal';
import type { AdminTabProps } from '../admin/types';
import { SpeakerMultiPick } from '../program/ProgramCatalogs';
import type { ProgramSpeaker } from '../program/types';
import { MaterialCard, type MaterialRow } from './MaterialCard';
import { MaterialTypesPanel } from './MaterialTypesPanel';

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
  const [speakers, setSpeakers] = useState<ProgramSpeaker[]>([]);
  const [previewMat, setPreviewMat] = useState<MaterialRow | null>(null);
  const [kbForumThreshold, setKbForumThreshold] = useState(4);
  const [totalDays, setTotalDays] = useState(8);

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const matPath = statusFilter ? `/materials?status=${encodeURIComponent(statusFilter)}` : '/materials';
      const [matRes, typesRes, evRes, dirRes, spRes, fsRes] = await Promise.all([
        adminFetch(matPath),
        adminFetch('/material-types').catch(() => ({ types: [] })),
        adminFetch('/events'),
        adminFetch('/directions'),
        adminFetch('/program-speakers').catch(() => ({ speakers: [] })),
        adminFetch('/forum-settings').catch(() => ({ settings: {} })),
      ]);
      setKbForumThreshold(fsRes.settings?.kbUnlockThreshold ?? 4);
      setTotalDays(fsRes.settings?.totalDays ?? 8);
      setMaterials(matRes.materials || []);
      setMaterialTypes((typesRes.types || []).map((t: { key: string; name: string }) => ({ key: t.key, name: t.name })));
      setEvents(evRes.events || []);
      setDirections(dirRes.directions || []);
      setSpeakers(spRes.speakers || []);
      setKbUnlocks((await adminFetch('/kb-unlocks')).unlocks || []);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, statusFilter]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter(m => {
      if (dayFilter && String(m.dayNumber ?? '') !== dayFilter) return false;
      if (directionFilter && (m.direction || '') !== directionFilter) return false;
      if (eventFilter === 'general') {
        if (m.eventId != null || m.isGeneral !== true) return false;
      } else if (eventFilter && String(m.eventId ?? '') !== eventFilter) return false;
      if (q && !(m.title || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [materials, search, dayFilter, directionFilter, eventFilter]);

  const buildCreateBody = (status: 'draft' | 'published', extra: Record<string, unknown> = {}) => {
    const tags = newMaterial.tags.split(',').map(s => s.trim()).filter(Boolean);
    return {
      dayNumber: Number(newMaterial.dayNumber),
      eventId: newMaterial.isGeneral ? null : (newMaterial.eventId ? Number(newMaterial.eventId) : null),
      direction: newMaterial.audienceAll ? null : (newMaterial.direction || null),
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
    act(async () => {
      await adminFetch('/materials', {
        method: 'POST',
        body: JSON.stringify(buildCreateBody(status)),
      });
      setNewMaterial(emptyMaterial());
      await load();
    }, status === 'published' ? 'Материал опубликован' : 'Черновик сохранён');
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
    act(async () => {
      const fileUrl = await uploadFile(file);
      await adminFetch('/materials', {
        method: 'POST',
        body: JSON.stringify(buildCreateBody('draft', {
          fileUrl,
          url: newMaterial.url.trim() || fileUrl,
        })),
      });
      setNewMaterial(emptyMaterial());
      await load();
    }, 'Файл загружен, черновик сохранён');
  };

  const openCard = (id: number) => {
    if (onOpenCard) onOpenCard(id);
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url).catch(() => {});
  };

  if (loading && materials.length === 0) return <p className="adm-muted">Загрузка базы знаний…</p>;

  return (
    <div className="adm-forum">
      <AdminPageHero
        title={
          filtered.length === materials.length
            ? `База знаний · ${materials.length} материалов`
            : `База знаний · ${filtered.length} из ${materials.length} материалов`
        }
        hint="В аналитику и приложение участника попадают только материалы со статусом «Опубликован»."
      >
        {setTab && (
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => setTab('events')}>
            Перейти к программе
          </button>
        )}
      </AdminPageHero>

      <MaterialTypesPanel adminFetch={adminFetch} act={act} />

      <div className="card adm-forum-block">
        <h3>Разблокировка БЗ (участник + день)</h3>
        <p className="adm-muted" style={{ fontSize: 12, marginBottom: 8 }}>
          Порог форума по умолчанию: ≥ {kbForumThreshold} из 7 точек осмысления за день (настройка «Форум»).
        </p>
        <div className="form-row">
          <input
            type="number"
            className="adm-input"
            value={kbUnlockForm.participantId}
            onChange={e => setKbUnlockForm({ ...kbUnlockForm, participantId: e.target.value })}
            placeholder="ID участника"
          />
          <select
            className="adm-input"
            value={kbUnlockForm.dayNumber}
            onChange={e => setKbUnlockForm({ ...kbUnlockForm, dayNumber: Number(e.target.value) })}
            style={{ width: 110 }}
            title="День смены"
          >
            {dayOptions.map(d => (
              <option key={d} value={d}>День {d}</option>
            ))}
          </select>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => {
            const id = Number(kbUnlockForm.participantId);
            if (id) openCard(id);
          }}>Открыть карточку</button>
          <button type="button" className="adm-btn" onClick={() => act(async () => {
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
          <table className="adm-table" style={{ marginTop: 8 }}>
            <thead><tr><th>Участник</th><th>День</th><th>Когда</th><th /></tr></thead>
            <tbody>
              {kbUnlocks.slice(0, 30).map(u => (
                <tr key={u.id}>
                  <td>{u.participantId}</td>
                  <td>{u.dayNumber}</td>
                  <td>{u.unlockedAt ? new Date(u.unlockedAt).toLocaleString('ru-RU') : '—'}</td>
                  <td>
                    <button type="button" className="adm-btn btn-danger" onClick={() => {
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
        )}
      </div>

      <div className="card adm-forum-block">
        <h3>Материалы</h3>
        <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <input className="adm-input" placeholder="Поиск по названию" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="adm-input" value={dayFilter} onChange={e => setDayFilter(e.target.value)}>
            <option value="">Все дни</option>
            {dayOptions.map(d => (
              <option key={d} value={String(d)}>День {d}</option>
            ))}
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
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => load()}>Обновить</button>
        </div>

        <div className="adm-kb-create card" style={{ marginBottom: 16, padding: 16, background: '#FAFAF8' }}>
          <h4 style={{ margin: '0 0 12px' }}>Новый материал</h4>
          <div className="adm-forum-grid-2">
            <label className="adm-field">
              <span className="adm-label">Название *</span>
              <input
                className="adm-input"
                value={newMaterial.title}
                onChange={e => setNewMaterial({ ...newMaterial, title: e.target.value })}
                placeholder="Название материала"
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
              <span className="adm-label">Тип</span>
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
              <span className="adm-label">Аудитория</span>
              <label className="adm-forum-check" style={{ display: 'block', marginBottom: 6 }}>
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
                <option value="">Направление</option>
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
          <div className="form-row" style={{ marginTop: 12, marginBottom: 0 }}>
            <label className="adm-forum-check">
              <input
                type="checkbox"
                checked={newMaterial.isGeneral}
                onChange={e => setNewMaterial({ ...newMaterial, isGeneral: e.target.checked, eventId: e.target.checked ? '' : newMaterial.eventId })}
              />
              Общий материал (без привязки к событию)
            </label>
            <label className="adm-field" style={{ minWidth: 220 }}>
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
          <div className="adm-forum-actions">
            <button type="button" className="adm-btn adm-btn-secondary" onClick={() => createMaterial('draft')}>
              Сохранить черновик
            </button>
            <button type="button" className="adm-btn adm-btn-primary" onClick={() => createMaterial('published')}>
              Опубликовать
            </button>
            <button type="button" className="adm-btn adm-btn-secondary" onClick={() => setNewMaterial(emptyMaterial())}>
              Очистить форму
            </button>
          </div>
        </div>

        <table className="adm-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Спикер</th>
              <th>Название материала</th>
              <th>Тип материала</th>
              <th>Аудитория</th>
              <th>Привязка</th>
              <th>Статус</th>
              <th>Действия</th>
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
                onCopyLink={copyLink}
                onPreview={() => setPreviewMat(m)}
                onSave={body => act(async () => {
                  await adminFetch(`/materials/${m.id}`, { method: 'PATCH', body: JSON.stringify(body) });
                  await load();
                }, 'Сохранено')}
                onDelete={() => act(async () => {
                  await adminFetch(`/materials/${m.id}`, { method: 'DELETE' });
                  await load();
                }, 'Удалено')}
              />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="adm-muted">Нет материалов по фильтрам</p>}
      </div>

      <ParticipantPreviewModal
        open={!!previewMat}
        onClose={() => setPreviewMat(null)}
        title={previewMat?.title || 'Материал'}
      >
        {previewMat && (
          <ParticipantPreviewHtml
            title={previewMat.title}
            subtitle={previewMat.direction ? `Направление: ${previewMat.direction}` : undefined}
            html={previewMat.url
              ? `<p><a href="${previewMat.url}" target="_blank" rel="noreferrer">Открыть материал</a></p>`
              : (previewMat.fileUrl ? `<p><a href="${previewMat.fileUrl}">Скачать файл</a></p>` : '<p>Нет ссылки</p>')}
          />
        )}
      </ParticipantPreviewModal>
    </div>
  );
}
