import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminDownloadBinary } from '../../admin/client';
import { label } from '../../labels/ru';
import { ROLE_OPTIONS } from '../onboarding/roleOptions';
import { AdminPageHero } from '../admin/AdminPageHero';
import { Pagination } from '../admin/Pagination';
import type { AdminTabProps } from '../admin/types';
import { VkProfileLink } from '../VkProfileLink';

type ParticipantCardTab = 'profile' | 'answers' | 'tasks' | 'medals' | 'points' | 'piggybank';

export type ParticipantsTabProps = AdminTabProps & {
  onOpenCard: (id: number, tab?: ParticipantCardTab) => void;
};

type ParticipantRow = {
  id: number;
  vkId: number;
  firstName: string;
  lastName: string;
  direction?: string;
  pedagogicalRole?: string | null;
  pathPoints?: number;
  experiencePoints?: number;
  selfDeletedAt?: string | null;
};

export function ParticipantsTab({ adminFetch, act, reloadKey, onOpenCard }: ParticipantsTabProps) {
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [participantsPage, setParticipantsPage] = useState(1);
  const [participantsTotal, setParticipantsTotal] = useState(0);
  const [participantSearch, setParticipantSearch] = useState('');
  const [directions, setDirections] = useState<{ id: number; name: string }[]>([]);
  const [pdfWhitelist, setPdfWhitelist] = useState<{ enabled?: boolean }[]>([]);
  const [newParticipant, setNewParticipant] = useState({ vkId: '', firstName: '', lastName: '', directionId: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch(`/participants?page=${participantsPage}`);
      setParticipants(res.participants || []);
      setParticipantsTotal(res.totalCount || 0);
      setDirections((await adminFetch('/directions')).directions || []);
      await adminFetch('/roles');
      setPdfWhitelist((await adminFetch('/pdf-whitelist')).entries || []);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, participantsPage]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const filteredParticipants = useMemo(() => {
    const q = participantSearch.toLowerCase();
    if (!q) return participants;
    return participants.filter(p =>
      `${p.firstName} ${p.lastName} ${p.direction} ${p.vkId}`.toLowerCase().includes(q),
    );
  }, [participants, participantSearch]);

  const createParticipant = () =>
    act(async () => {
      await adminFetch('/participants', {
        method: 'POST',
        body: JSON.stringify({
          vkId: Number(newParticipant.vkId),
          firstName: newParticipant.firstName,
          lastName: newParticipant.lastName,
          directionId: newParticipant.directionId ? Number(newParticipant.directionId) : undefined,
        }),
      });
      setNewParticipant({ vkId: '', firstName: '', lastName: '', directionId: '' });
    });

  const reloadPage = () => load().catch(() => {});

  if (loading && participants.length === 0) {
    return <p className="adm-muted">Загрузка участников…</p>;
  }

  return (
    <div className="adm-forum">
      <AdminPageHero title="Участники" hint="Поиск, создание, направления и быстрые действия (QR, PDF, сброс регистрации)." />

      <div className="form-row adm-forum-block">
        <input className="adm-input" value={participantSearch} onChange={e => setParticipantSearch(e.target.value)} placeholder="Поиск..." />
        <input className="adm-input" value={newParticipant.vkId} onChange={e => setNewParticipant({ ...newParticipant, vkId: e.target.value })} placeholder="ID ВКонтакте" />
        <input className="adm-input" value={newParticipant.firstName} onChange={e => setNewParticipant({ ...newParticipant, firstName: e.target.value })} placeholder="Имя" />
        <input className="adm-input" value={newParticipant.lastName} onChange={e => setNewParticipant({ ...newParticipant, lastName: e.target.value })} placeholder="Фамилия" />
        <select className="adm-input" value={newParticipant.directionId} onChange={e => setNewParticipant({ ...newParticipant, directionId: e.target.value })}>
          <option value="">Направление</option>
          {directions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button type="button" className="adm-btn" onClick={createParticipant}>Добавить</button>
      </div>

      <table className="adm-table">
        <thead>
          <tr>
            <th>№</th><th>ВКонтакте</th><th>Имя</th><th>Направление</th><th>Стартовая роль</th><th>Путь</th><th>Опыт</th><th>В программе</th><th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {filteredParticipants.map(p => (
            <tr key={p.id} style={p.selfDeletedAt ? { opacity: 0.75, background: '#FFF5F5' } : undefined}>
              <td>{p.id}</td>
              <td><VkProfileLink vkId={p.vkId} /></td>
              <td>
                <button type="button" className="adm-link" onClick={() => onOpenCard(p.id)}>
                  {p.firstName} {p.lastName}
                </button>
              </td>
              <td>
                <select
                  className="adm-input"
                  value={directions.find(d => d.name === p.direction)?.id || ''}
                  onChange={e => adminFetch(`/participants/${p.id}/direction`, {
                    method: 'PATCH', body: JSON.stringify({ directionId: Number(e.target.value) }),
                  }).then(reloadPage)}
                >
                  {directions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </td>
              <td>
                <select
                  className="adm-input"
                  value={p.pedagogicalRole || ''}
                  onChange={e => act(() => adminFetch(`/participants/${p.id}/role`, {
                    method: 'PATCH',
                    body: JSON.stringify({ pedagogicalRole: e.target.value || null }),
                  }), 'Роль обновлена')}
                >
                  <option value="">—</option>
                  {ROLE_OPTIONS.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
                </select>
              </td>
              <td>{p.pathPoints}</td>
              <td>{p.experiencePoints}</td>
              <td>
                {p.selfDeletedAt ? (
                  <span style={{ color: '#C53030', fontSize: 12, fontWeight: 600 }} title={p.selfDeletedAt}>
                    Удалил из программы
                  </span>
                ) : (
                  <span style={{ color: '#276749', fontSize: 12 }}>Активен</span>
                )}
              </td>
              <td>
                {p.selfDeletedAt && (
                  <button
                    type="button"
                    className="adm-btn adm-btn-secondary"
                    onClick={() => {
                      if (!confirm(`Восстановить доступ для ${p.firstName} ${p.lastName}?`)) return;
                      act(() => adminFetch(`/participants/${p.id}/restore`, { method: 'POST' }), 'Аккаунт восстановлен');
                    }}
                  >
                    Восстановить
                  </button>
                )}
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary"
                  onClick={() => act(async () => {
                    const r = await adminFetch('/qr/download', {
                      method: 'POST', body: JSON.stringify({ type: 'participant', id: p.id }),
                    });
                    if (r.qrImageUrl) window.open(r.qrImageUrl, '_blank');
                  }, `QR готов`)}
                >
                  QR
                </button>
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary"
                  onClick={() => act(() => adminFetch('/pdf-whitelist', {
                    method: 'POST',
                    body: JSON.stringify({ participantId: p.id, enabled: true }),
                  }), 'PDF whitelist OK')}
                >
                  PDF+
                </button>
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary"
                  onClick={() => act(() => adminDownloadBinary(`/participants/${p.id}/pdf`, `profile_${p.id}.pdf`), 'PDF скачан')}
                >
                  PDF
                </button>
                <button
                  type="button"
                  className="adm-btn btn-danger"
                  onClick={() => {
                    if (confirm('Сбросить регистрацию?')) {
                      adminFetch(`/participants/${p.id}/registration`, { method: 'DELETE' }).then(reloadPage);
                    }
                  }}
                >
                  Сброс
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Pagination page={participantsPage} total={participantsTotal} setPage={setParticipantsPage} />

      {pdfWhitelist.length > 0 && (
        <p className="adm-muted" style={{ fontSize: 12, marginTop: 8 }}>
          PDF whitelist: {pdfWhitelist.filter(e => e.enabled).length} участник(ов)
        </p>
      )}
    </div>
  );
}
