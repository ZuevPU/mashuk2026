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
  const [statusFilter, setStatusFilter] = useState('');
  const [speakers, setSpeakers] = useState<ProgramSpeaker[]>([]);
  const [previewMat, setPreviewMat] = useState<MaterialRow | null>(null);
  const [kbForumThreshold, setKbForumThreshold] = useState(4);

  const refreshUnlocks = async () => {
    setKbUnlocks((await adminFetch('/kb-unlocks')).unlocks || []);
  };

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
      if (q && !(m.title || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [materials, search, dayFilter, directionFilter]);

  const createMaterial = () =>
    act(async () => {
      const tags = newMaterial.tags.split(',').map(s => s.trim()).filter(Boolean);
      await adminFetch('/materials', {
        method: 'POST',
        body: JSON.stringify({
          ...newMaterial,
          dayNumber: Number(newMaterial.dayNumber),
          eventId: newMaterial.isGeneral ? null : (newMaterial.eventId ? Number(newMaterial.eventId) : null),
          direction: newMaterial.audienceAll ? null : (newMaterial.direction || null),
          tags,
          type: newMaterial.type || null,
          speakerIds: newMaterial.speakerIds,
          isGeneral: !!newMaterial.isGeneral,
          kbUnlockMode: newMaterial.kbUnlockMode,
          kbUnlockMinTouchpoints: newMaterial.kbUnlockMode === 'touchpoints' && newMaterial.kbUnlockMinTouchpoints !== ''
            ? newMaterial.kbUnlockMinTouchpoints
            : null,
          status: 'draft',
        }),
      });
      setNewMaterial(emptyMaterial());
      await load();
    });

  const uploadFile = async (file: File) => {
    const dataUrl = await readFileAsDataUrl(file);
    const res = await adminFetch('/upload-file', {
      method: 'POST',
      body: JSON.stringify({ dataUrl, filename: file.name }),
    });
    return res.fileUrl || res.url;
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
        title={`База знаний · ${materials.length} материалов`}
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
          <input
            type="number"
            className="adm-input"
            value={kbUnlockForm.dayNumber}
            onChange={e => setKbUnlockForm({ ...kbUnlockForm, dayNumber: Number(e.target.value) })}
            placeholder="День"
            style={{ width: 70 }}
          />
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
            {[...new Set(materials.map(m => m.dayNumber).filter(Boolean))].sort((a, b) => (a as number) - (b as number)).map(d => (
              <option key={d} value={String(d)}>День {d}</option>
            ))}
          </select>
          <select className="adm-input" value={directionFilter} onChange={e => setDirectionFilter(e.target.value)}>
            <option value="">Все направления</option>
            {directions.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
          <select className="adm-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Все статусы</option>
            <option value="draft">Черновик</option>
            <option value="published">Опубликован</option>
            <option value="archived">Архив</option>
          </select>
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => load()}>Обновить</button>
        </div>

        <div className="form-row" style={{ marginBottom: 12 }}>
          <input type="number" className="adm-input" value={newMaterial.dayNumber} onChange={e => setNewMaterial({ ...newMaterial, dayNumber: Number(e.target.value) })} placeholder="День" />
          <select className="adm-input" value={newMaterial.eventId} onChange={e => setNewMaterial({ ...newMaterial, eventId: e.target.value })}>
            <option value="">— событие —</option>
            {events.map(ev => <option key={ev.id} value={String(ev.id)}>Д{ev.dayNumber} · {ev.title}</option>)}
          </select>
          <select className="adm-input" value={newMaterial.direction} onChange={e => setNewMaterial({ ...newMaterial, direction: e.target.value, audienceAll: false })} disabled={newMaterial.audienceAll}>
            <option value="">Направление</option>
            {directions.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
          <label className="adm-forum-check">
            <input type="checkbox" checked={newMaterial.audienceAll} onChange={e => setNewMaterial({ ...newMaterial, audienceAll: e.target.checked, direction: e.target.checked ? '' : newMaterial.direction })} />
            Аудитория: для всех
          </label>
          <select className="adm-input" value={newMaterial.type} onChange={e => setNewMaterial({ ...newMaterial, type: e.target.value })}>
            <option value="">Тип</option>
            {materialTypes.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
          </select>
          <div className="adm-field" style={{ minWidth: 200 }}>
            <span className="adm-label">Спикеры</span>
            <SpeakerMultiPick
              speakers={speakers}
              selectedIds={newMaterial.speakerIds}
              onChange={ids => setNewMaterial({ ...newMaterial, speakerIds: ids })}
            />
          </div>
          <input className="adm-input" value={newMaterial.title} onChange={e => setNewMaterial({ ...newMaterial, title: e.target.value })} placeholder="Название" />
          <input className="adm-input" value={newMaterial.url} onChange={e => setNewMaterial({ ...newMaterial, url: e.target.value })} placeholder="Ссылка" />
          <label className="adm-forum-check">
            <input type="checkbox" checked={newMaterial.isGeneral} onChange={e => setNewMaterial({ ...newMaterial, isGeneral: e.target.checked })} />
            Общий
          </label>
          <select className="adm-input" value={newMaterial.kbUnlockMode} onChange={e => setNewMaterial({ ...newMaterial, kbUnlockMode: e.target.value as 'immediate' | 'touchpoints' })}>
            <option value="touchpoints">Открытие: ≥ N точек</option>
            <option value="immediate">Открытие: сразу</option>
          </select>
          {newMaterial.kbUnlockMode === 'touchpoints' && (
            <input
              type="number"
              min={1}
              max={7}
              className="adm-input"
              style={{ width: 56 }}
              placeholder={String(kbForumThreshold)}
              value={newMaterial.kbUnlockMinTouchpoints === '' ? '' : newMaterial.kbUnlockMinTouchpoints}
              onChange={e => setNewMaterial({ ...newMaterial, kbUnlockMinTouchpoints: e.target.value === '' ? '' : Number(e.target.value) })}
            />
          )}
          <input type="file" className="adm-input" onChange={e => {
            const f = e.target.files?.[0];
            if (!f) return;
            act(async () => {
              const fileUrl = await uploadFile(f);
              await adminFetch('/materials', {
                method: 'POST',
                body: JSON.stringify({
                  ...newMaterial,
                  dayNumber: Number(newMaterial.dayNumber),
                  eventId: newMaterial.isGeneral ? null : (newMaterial.eventId ? Number(newMaterial.eventId) : null),
                  direction: newMaterial.audienceAll ? null : (newMaterial.direction || null),
                  tags: newMaterial.tags.split(',').map(s => s.trim()).filter(Boolean),
                  type: newMaterial.type || null,
                  speakerIds: newMaterial.speakerIds,
                  fileUrl,
                  url: newMaterial.url || fileUrl,
                  isGeneral: !!newMaterial.isGeneral,
                  kbUnlockMode: newMaterial.kbUnlockMode,
                  kbUnlockMinTouchpoints: newMaterial.kbUnlockMode === 'touchpoints' && newMaterial.kbUnlockMinTouchpoints !== ''
                    ? newMaterial.kbUnlockMinTouchpoints
                    : null,
                  status: 'draft',
                }),
              });
              setNewMaterial(emptyMaterial());
              await load();
            }, 'Файл загружен');
            e.target.value = '';
          }} />
          <button type="button" className="adm-btn" onClick={createMaterial}>Добавить черновик</button>
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
