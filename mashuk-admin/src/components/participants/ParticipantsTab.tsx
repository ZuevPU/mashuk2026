import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminDownloadBinary } from '../../admin/client';
import { label } from '../../labels/ru';
import { ROLE_OPTIONS } from '../onboarding/roleOptions';
import { AdminPageHero } from '../admin/AdminPageHero';
import { Pagination } from '../admin/Pagination';
import type { AdminTabProps } from '../admin/types';
import { VkProfileLink } from '../VkProfileLink';
import { RowActionsMenu, formatParticipantActivity } from './RowActionsMenu';

type ParticipantCardTab = 'profile' | 'answers' | 'tasks' | 'medals' | 'points' | 'piggybank' | 'activity' | 'logs';

export type ParticipantsTabProps = AdminTabProps & {
  onOpenCard: (id: number, tab?: ParticipantCardTab) => void;
};

type ParticipantRow = {
  id: number;
  vkId: number;
  firstName: string;
  lastName: string;
  direction?: string;
  groupName?: string | null;
  pedagogicalRole?: string | null;
  pathPoints?: number;
  experiencePoints?: number;
  totalRating?: number;
  lastActiveAt?: string | null;
  isBlocked?: boolean | null;
  selfDeletedAt?: string | null;
};

function buildListQuery(params: {
  page: number;
  q: string;
  directionIds: number[];
  groupId: string;
  pedagogicalRole: string;
  activity: string;
}): string {
  const sp = new URLSearchParams({ page: String(params.page), limit: '50' });
  if (params.q.trim()) sp.set('q', params.q.trim());
  for (const id of params.directionIds) sp.append('directionId', String(id));
  if (params.groupId) sp.set('groupId', params.groupId);
  if (params.pedagogicalRole) sp.set('pedagogicalRole', params.pedagogicalRole);
  if (params.activity) sp.set('activity', params.activity);
  return sp.toString();
}

export function ParticipantsTab({ adminFetch, act, reloadKey, onOpenCard }: ParticipantsTabProps) {
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [participantsPage, setParticipantsPage] = useState(1);
  const [participantsTotal, setParticipantsTotal] = useState(0);
  const [participantSearch, setParticipantSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [directionFilter, setDirectionFilter] = useState<number[]>([]);
  const [groupFilter, setGroupFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [activityFilter, setActivityFilter] = useState('');
  const [directions, setDirections] = useState<{ id: number; name: string }[]>([]);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [pushModal, setPushModal] = useState<{ ids: number[] } | null>(null);
  const [pushText, setPushText] = useState('');
  const [newParticipant, setNewParticipant] = useState({ vkId: '', firstName: '', lastName: '', directionId: '' });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(participantSearch), 350);
    return () => clearTimeout(t);
  }, [participantSearch]);

  useEffect(() => {
    setParticipantsPage(1);
  }, [debouncedQ, directionFilter, groupFilter, roleFilter, activityFilter]);

  const listQuery = useMemo(() => buildListQuery({
    page: participantsPage,
    q: debouncedQ,
    directionIds: directionFilter,
    groupId: groupFilter,
    pedagogicalRole: roleFilter,
    activity: activityFilter,
  }), [participantsPage, debouncedQ, directionFilter, groupFilter, roleFilter, activityFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch(`/participants?${listQuery}`);
      setParticipants(res.participants || []);
      setParticipantsTotal(res.totalCount || 0);
      setDirections((await adminFetch('/directions')).directions || []);
      setGroups((await adminFetch('/participants/groups')).groups || []);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, listQuery]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const reloadPage = () => load().catch(() => {});

  const exportList = (ids?: number[]) => {
    const sp = new URLSearchParams(listQuery);
    sp.set('format', 'xlsx');
    sp.set('limit', '5000');
    sp.delete('page');
    if (ids?.length) sp.set('ids', ids.join(','));
    act(() => adminDownloadBinary(`/exports/participants?${sp.toString()}`, 'participants.xlsx'), 'Выгрузка');
  };

  const toggleDir = (id: number) => {
    setDirectionFilter(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = participants.length > 0 && participants.every(p => selected.has(p.id));

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
      setShowAdd(false);
      await load();
    }, 'Участник добавлен');

  const sendPush = () => {
    if (!pushModal || !pushText.trim()) return;
    const body = pushModal.ids.length === 1
      ? { text: pushText.trim() }
      : { text: pushText.trim(), participantIds: pushModal.ids };
    const path = pushModal.ids.length === 1
      ? `/participants/${pushModal.ids[0]}/push`
      : '/participants/bulk-push';
    act(async () => {
      await adminFetch(path, { method: 'POST', body: JSON.stringify(body) });
      setPushModal(null);
      setPushText('');
    }, 'Пуш отправлен');
  };

  if (loading && participants.length === 0) {
    return <p className="adm-muted">Загрузка участников…</p>;
  }

  return (
    <div className="adm-forum">
      <AdminPageHero
        title={`Участники · ${participantsTotal} всего`}
        hint="Поиск и фильтры по всей базе. Клик по строке — карточка. Действия — меню ⋮."
      />

      <div className="card adm-forum-block">
        <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input
            className="adm-input"
            style={{ minWidth: 200 }}
            value={participantSearch}
            onChange={e => setParticipantSearch(e.target.value)}
            placeholder="Поиск: ФИО или VK ID"
          />
          <select className="adm-input" value={groupFilter} onChange={e => setGroupFilter(e.target.value)}>
            <option value="">Все группы</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select className="adm-input" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="">Все роли</option>
            {ROLE_OPTIONS.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
          </select>
          <select className="adm-input" value={activityFilter} onChange={e => setActivityFilter(e.target.value)}>
            <option value="">Любая активность</option>
            <option value="active_today">Активен сегодня</option>
            <option value="inactive_1d">Неактивен ≥ 1 дня</option>
            <option value="inactive_3d">Неактивен ≥ 3 дней</option>
          </select>
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => exportList()}>
            Выгрузить список (XLSX)
          </button>
          <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={() => setShowAdd(v => !v)}>
            + Добавить участника
          </button>
        </div>
        <div className="adm-program-tag-pick" style={{ marginTop: 10 }}>
          <span className="adm-muted" style={{ fontSize: 12, marginRight: 8 }}>Направления:</span>
          {directions.map(d => (
            <button
              key={d.id}
              type="button"
              className={`adm-chip-btn ${directionFilter.includes(d.id) ? 'on' : ''}`}
              onClick={() => toggleDir(d.id)}
            >
              {d.name}
            </button>
          ))}
        </div>
        {selected.size > 0 && (
          <div className="adm-forum-toolbar" style={{ marginTop: 10 }}>
            <span className="adm-muted">Выбрано: {selected.size}</span>
            <button type="button" className="adm-btn adm-btn-sm" onClick={() => exportList([...selected])}>Выгрузить выбранных</button>
            <button type="button" className="adm-btn adm-btn-sm" onClick={() => setPushModal({ ids: [...selected] })}>Отправить пуш выбранным</button>
            <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => setSelected(new Set())}>Снять выбор</button>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="card adm-forum-block">
          <h3 style={{ marginTop: 0 }}>Новый участник</h3>
          <div className="adm-forum-grid-2">
            <input className="adm-input" value={newParticipant.vkId} onChange={e => setNewParticipant({ ...newParticipant, vkId: e.target.value })} placeholder="VK ID" />
            <select className="adm-input" value={newParticipant.directionId} onChange={e => setNewParticipant({ ...newParticipant, directionId: e.target.value })}>
              <option value="">Направление</option>
              {directions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <input className="adm-input" value={newParticipant.firstName} onChange={e => setNewParticipant({ ...newParticipant, firstName: e.target.value })} placeholder="Имя" />
            <input className="adm-input" value={newParticipant.lastName} onChange={e => setNewParticipant({ ...newParticipant, lastName: e.target.value })} placeholder="Фамилия" />
          </div>
          <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" style={{ marginTop: 8 }} onClick={createParticipant}>Сохранить</button>
        </div>
      )}

      <table className="adm-table">
        <thead>
          <tr>
            <th>
              <input type="checkbox" checked={allSelected} onChange={() => {
                if (allSelected) setSelected(new Set());
                else setSelected(new Set(participants.map(p => p.id)));
              }} aria-label="Выбрать все" />
            </th>
            <th>VK ID</th>
            <th>ФИО</th>
            <th>Направление</th>
            <th>Группа</th>
            <th>Роль</th>
            <th>Путь</th>
            <th>Опыт</th>
            <th>Рейтинг</th>
            <th>Активность</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {participants.map(p => (
            <tr
              key={p.id}
              className="adm-table-row-click"
              style={p.selfDeletedAt || p.isBlocked ? { opacity: 0.85, background: p.isBlocked ? '#FFF5F5' : undefined } : undefined}
              onClick={e => {
                const t = e.target as HTMLElement;
                if (t.closest('button, select, input, a, .adm-row-menu')) return;
                onOpenCard(p.id);
              }}
            >
              <td onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
              </td>
              <td><VkProfileLink vkId={p.vkId} /></td>
              <td>{p.firstName} {p.lastName}{p.isBlocked ? ' · заблок.' : ''}</td>
              <td onClick={e => e.stopPropagation()}>
                <select
                  className="adm-input adm-input-narrow"
                  value={directions.find(d => d.name === p.direction)?.id || ''}
                  onChange={e => adminFetch(`/participants/${p.id}/direction`, {
                    method: 'PATCH', body: JSON.stringify({ directionId: Number(e.target.value) }),
                  }).then(reloadPage)}
                >
                  {directions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </td>
              <td>{p.groupName || '—'}</td>
              <td onClick={e => e.stopPropagation()}>
                <select
                  className="adm-input adm-input-narrow"
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
              <td>{p.pathPoints ?? 0}</td>
              <td>{p.experiencePoints ?? 0}</td>
              <td>{p.totalRating ?? ((p.pathPoints ?? 0) + (p.experiencePoints ?? 0))}</td>
              <td>{p.selfDeletedAt ? 'Вышел' : formatParticipantActivity(p.lastActiveAt)}</td>
              <td onClick={e => e.stopPropagation()}>
                <RowActionsMenu actions={[
                  { label: 'Открыть карточку', onClick: () => onOpenCard(p.id) },
                  { label: 'Скорректировать роль', onClick: () => onOpenCard(p.id, 'profile') },
                  { label: 'Выгрузить данные (PDF)', onClick: () => act(() => adminDownloadBinary(`/participants/${p.id}/pdf`, `profile_${p.id}.pdf`), 'PDF') },
                  { label: 'Отправить пуш', onClick: () => setPushModal({ ids: [p.id] }) },
                  p.isBlocked
                    ? { label: 'Разблокировать', onClick: () => act(() => adminFetch(`/participants/${p.id}/unblock`, { method: 'POST' }).then(reloadPage), 'Разблокирован') }
                    : { label: 'Заблокировать', onClick: () => {
                      const reason = prompt('Причина блокировки (необязательно)') || undefined;
                      act(() => adminFetch(`/participants/${p.id}/block`, { method: 'POST', body: JSON.stringify({ reason }) }).then(reloadPage), 'Заблокирован');
                    }, danger: true },
                  p.selfDeletedAt
                    ? { label: 'Восстановить', onClick: () => act(() => adminFetch(`/participants/${p.id}/restore`, { method: 'POST' }).then(reloadPage), 'Восстановлен') }
                    : { label: 'Сброс регистрации', onClick: () => {
                      if (confirm('Сбросить регистрацию участника?')) {
                        adminFetch(`/participants/${p.id}/registration`, { method: 'DELETE' }).then(reloadPage);
                      }
                    }, danger: true },
                ]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Pagination page={participantsPage} total={participantsTotal} setPage={setParticipantsPage} />

      {pushModal && (
        <div className="adm-modal-backdrop" onClick={() => setPushModal(null)}>
          <div className="card" style={{ maxWidth: 420, width: '100%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Отправить пуш ({pushModal.ids.length})</h3>
            <textarea className="adm-input" rows={3} value={pushText} onChange={e => setPushText(e.target.value)} placeholder="Текст уведомления" />
            <div className="form-row" style={{ marginTop: 12 }}>
              <button type="button" className="adm-btn adm-btn-primary" onClick={sendPush}>Отправить</button>
              <button type="button" className="adm-btn adm-btn-secondary" onClick={() => setPushModal(null)}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
