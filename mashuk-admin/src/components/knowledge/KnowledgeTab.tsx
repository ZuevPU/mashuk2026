import { useCallback, useEffect, useState } from 'react';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';
import { MaterialCard, type MaterialRow } from './MaterialCard';

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
  tags: '',
  title: '',
  url: '',
  isGeneral: false,
});

export function KnowledgeTab({ adminFetch, act, reloadKey, setTab, onOpenCard }: AdminTabProps & {
  onOpenCard?: (id: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [events, setEvents] = useState<{ id: number; dayNumber: number; title: string }[]>([]);
  const [kbUnlocks, setKbUnlocks] = useState<KbUnlock[]>([]);
  const [kbUnlockForm, setKbUnlockForm] = useState({ participantId: '', dayNumber: 1 });
  const [newMaterial, setNewMaterial] = useState(emptyMaterial);

  const refreshUnlocks = async () => {
    setKbUnlocks((await adminFetch('/kb-unlocks')).unlocks || []);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMaterials((await adminFetch('/materials')).materials || []);
      await adminFetch('/thematic-tags');
      setEvents((await adminFetch('/events')).events || []);
      setKbUnlocks((await adminFetch('/kb-unlocks')).unlocks || []);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const createMaterial = () =>
    act(async () => {
      const tags = newMaterial.tags.split(',').map(s => s.trim()).filter(Boolean);
      await adminFetch('/materials', {
        method: 'POST',
        body: JSON.stringify({
          ...newMaterial,
          dayNumber: Number(newMaterial.dayNumber),
          eventId: newMaterial.eventId ? Number(newMaterial.eventId) : null,
          tags,
          isGeneral: !!newMaterial.isGeneral,
        }),
      });
      setNewMaterial(emptyMaterial());
    });

  const openCard = (id: number) => {
    if (onOpenCard) onOpenCard(id);
  };

  if (loading) return <p className="adm-muted">Загрузка базы знаний…</p>;

  return (
    <div className="adm-forum">
      <AdminPageHero
        title="База знаний"
        hint="Материалы по дням и событиям программы. Разблокировки — для ручного доступа участника к дню БЗ."
      >
        {setTab && (
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => setTab('events')}>
            Перейти к программе (события)
          </button>
        )}
      </AdminPageHero>

      <div className="card adm-forum-block">
        <h3>Разблокировка БЗ (участник + день)</h3>
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
          <button
            type="button"
            className="adm-btn adm-btn-secondary"
            onClick={() => {
              const id = Number(kbUnlockForm.participantId);
              if (id) openCard(id);
            }}
          >
            Открыть карточку
          </button>
          <button
            type="button"
            className="adm-btn"
            onClick={() => act(async () => {
              await adminFetch('/kb-unlocks', {
                method: 'POST',
                body: JSON.stringify({
                  participantId: Number(kbUnlockForm.participantId),
                  dayNumber: kbUnlockForm.dayNumber,
                }),
              });
              await refreshUnlocks();
            }, 'БЗ разблокирована')}
          >
            Разблокировать
          </button>
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
                    <button
                      type="button"
                      className="adm-btn btn-danger"
                      onClick={() => act(async () => {
                        await adminFetch(`/kb-unlocks/${u.participantId}/${u.dayNumber}`, { method: 'DELETE' });
                        await refreshUnlocks();
                      }, 'Отозвано')}
                    >
                      Отозвать
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card adm-forum-block">
        <h3>Материалы базы знаний</h3>
        <div className="form-row">
          <input
            type="number"
            className="adm-input"
            value={newMaterial.dayNumber}
            onChange={e => setNewMaterial({ ...newMaterial, dayNumber: Number(e.target.value) })}
            placeholder="День"
          />
          <select
            className="adm-input"
            value={newMaterial.eventId}
            onChange={e => setNewMaterial({ ...newMaterial, eventId: e.target.value })}
          >
            <option value="">— событие —</option>
            {events.map(ev => (
              <option key={ev.id} value={String(ev.id)}>Д{ev.dayNumber} · {ev.title}</option>
            ))}
          </select>
          <input
            className="adm-input"
            value={newMaterial.direction}
            onChange={e => setNewMaterial({ ...newMaterial, direction: e.target.value })}
            placeholder="Направление"
          />
          <input
            className="adm-input"
            value={newMaterial.tags}
            onChange={e => setNewMaterial({ ...newMaterial, tags: e.target.value })}
            placeholder="Теги через запятую"
          />
        </div>
        <div className="form-row">
          <input
            className="adm-input"
            value={newMaterial.speakerName}
            onChange={e => setNewMaterial({ ...newMaterial, speakerName: e.target.value })}
            placeholder="Спикер"
          />
          <input
            className="adm-input"
            value={newMaterial.title}
            onChange={e => setNewMaterial({ ...newMaterial, title: e.target.value })}
            placeholder="Название"
          />
          <input
            className="adm-input"
            value={newMaterial.url}
            onChange={e => setNewMaterial({ ...newMaterial, url: e.target.value })}
            placeholder="Ссылка"
          />
          <label className="adm-forum-check">
            <input
              type="checkbox"
              checked={newMaterial.isGeneral}
              onChange={e => setNewMaterial({ ...newMaterial, isGeneral: e.target.checked })}
            />
            Общий
          </label>
          <button type="button" className="adm-btn" onClick={createMaterial}>Добавить</button>
        </div>
        {materials.map(m => (
          <MaterialCard
            key={m.id}
            material={m}
            onSave={body => act(() => adminFetch(`/materials/${m.id}`, {
              method: 'PATCH',
              body: JSON.stringify(body),
            }))}
            onDelete={() => {
              if (!confirm('Удалить материал?')) return;
              act(() => adminFetch(`/materials/${m.id}`, { method: 'DELETE' }));
            }}
          />
        ))}
      </div>
    </div>
  );
}
