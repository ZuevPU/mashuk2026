import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminDownloadBinary } from '../../admin/client';
import { CONFIRM_BLOCK_PARTICIPANT, CONFIRM_DELETE_PARTICIPANT, CONFIRM_REMOVE_FROM_PROGRAM } from '../../admin/confirmDelete';
import { label } from '../../labels/ru';
import { ROLE_OPTIONS } from '../onboarding/roleOptions';
import { AdminPageHero } from '../admin/AdminPageHero';
import { Pagination } from '../admin/Pagination';
import type { AdminTabProps } from '../admin/types';
import { VkProfileLink } from '../VkProfileLink';
import { RowActionsMenu, formatParticipantActivity } from './RowActionsMenu';
import { ParticipantAvatar } from './ParticipantAvatar';

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
  region?: string | null;
  pedagogicalRole?: string | null;
  pathPoints?: number;
  experiencePoints?: number;
  totalRating?: number;
  lastActiveAt?: string | null;
  isBlocked?: boolean | null;
  selfDeletedAt?: string | null;
  avatarUrl?: string | null;
};

type ParticipantListMode = 'active' | 'hidden';
type ShiftOption = { id: number; name: string; code: string; status: string };

function buildListQuery(params: {
  page: number;
  q: string;
  directionIds: number[];
  groupId: string;
  pedagogicalRole: string;
  strongRole: string;
  activity: string;
  listMode: ParticipantListMode;
}): string {
  const sp = new URLSearchParams({ page: String(params.page), limit: '50' });
  if (params.listMode === 'hidden') sp.set('onlySelfDeleted', 'true');
  if (params.q.trim()) sp.set('q', params.q.trim());
  for (const id of params.directionIds) sp.append('directionId', String(id));
  if (params.groupId) sp.set('groupId', params.groupId);
  if (params.pedagogicalRole) sp.set('pedagogicalRole', params.pedagogicalRole);
  if (params.strongRole) sp.set('strongRole', params.strongRole);
  if (params.activity) sp.set('activity', params.activity);
  return sp.toString();
}

function formatHiddenAt(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
  const [strongRoleFilter, setStrongRoleFilter] = useState('');
  const [showIdColumn, setShowIdColumn] = useState(true);
  const [activityFilter, setActivityFilter] = useState('');
  const [listMode, setListMode] = useState<ParticipantListMode>('active');
  const [hiddenTotal, setHiddenTotal] = useState(0);
  const [directions, setDirections] = useState<{ id: number; name: string }[]>([]);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [shiftOptions, setShiftOptions] = useState<ShiftOption[]>([]);
  const [currentShiftId, setCurrentShiftId] = useState<number | null>(null);
  const [transferTargetId, setTransferTargetId] = useState<number | null>(null);
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
  }, [debouncedQ, directionFilter, groupFilter, roleFilter, strongRoleFilter, activityFilter, listMode]);

  const listQuery = useMemo(() => buildListQuery({
    page: participantsPage,
    q: debouncedQ,
    directionIds: directionFilter,
    groupId: groupFilter,
    pedagogicalRole: roleFilter,
    strongRole: strongRoleFilter,
    activity: activityFilter,
    listMode,
  }), [participantsPage, debouncedQ, directionFilter, groupFilter, roleFilter, strongRoleFilter, activityFilter, listMode]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch(`/participants?${listQuery}`);
      setParticipants(res.participants || []);
      setParticipantsTotal(res.totalCount || 0);
      setCurrentShiftId(res.shiftId ?? null);
      if (listMode === 'active') {
        const hiddenRes = await adminFetch('/participants?onlySelfDeleted=true&limit=1&page=1');
        setHiddenTotal(hiddenRes.totalCount || 0);
      } else {
        setHiddenTotal(res.totalCount || 0);
      }
      setDirections((await adminFetch('/directions')).directions || []);
      setGroups((await adminFetch('/participants/groups')).groups || []);
      setShiftOptions((await adminFetch('/shifts')).shifts || []);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, listQuery, listMode]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const reloadPage = () => load().catch(() => {});

  const exportList = (ids?: number[]) => {
    const sp = new URLSearchParams(listQuery);
    sp.set('format', 'xlsx');
    sp.delete('limit');
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

  const openTransfer = () => {
    const target = shiftOptions.find(s => s.id !== currentShiftId);
    if (!target) {
      alert('Нет другой смены для переноса участников');
      return;
    }
    setTransferTargetId(target.id);
  };

  const copyParticipantsToShift = () => {
    if (transferTargetId == null || selected.size === 0) return;
    const target = shiftOptions.find(s => s.id === transferTargetId);
    if (!target) return;
    if (!confirm(
      `Добавить выбранных участников (${selected.size}) в смену «${target.name}»?\n\n` +
      'В исходной смене участники и их история останутся. В целевой смене прогресс начнётся с нуля, ' +
      'а при первом входе участники завершат регистрацию.',
    )) return;
    act(async () => {
      const res = await adminFetch('/participants/copy-to-shift', {
        method: 'POST',
        body: JSON.stringify({
          participantIds: [...selected],
          targetShiftId: transferTargetId,
        }),
      });
      setTransferTargetId(null);
      setSelected(new Set());
      return res.message || `Перенесено: ${res.copied || 0}`;
    }, 'Участники добавлены в смену');
  };

  const isHiddenList = listMode === 'hidden';

  if (loading && participants.length === 0) {
    return <p className="adm-muted">Загрузка участников…</p>;
  }

  return (
    <div className="adm-forum">
      <AdminPageHero
        title={isHiddenList
          ? `Удалили профиль · ${participantsTotal}`
          : `Участники · ${participantsTotal} в программе`}
        hint={isHiddenList
          ? 'Участники, которые нажали «Удалить профиль» или были исключены организатором. Данные сохранены — можно восстановить в основной список.'
          : 'Поиск и фильтры по активным участникам. Клик по строке — карточка. Действия — меню ⋮.'}
      />

      <div className="adm-seg" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className={listMode === 'active' ? 'on' : ''}
          onClick={() => { setListMode('active'); setParticipantsPage(1); setSelected(new Set()); }}
        >
          В программе
        </button>
        <button
          type="button"
          className={listMode === 'hidden' ? 'on' : ''}
          onClick={() => { setListMode('hidden'); setParticipantsPage(1); setSelected(new Set()); }}
        >
          Удалили профиль{hiddenTotal > 0 ? ` (${hiddenTotal})` : ''}
        </button>
      </div>

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
            <option value="">Все роли (ручная)</option>
            {ROLE_OPTIONS.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
          </select>
          <select className="adm-input" value={strongRoleFilter} onChange={e => setStrongRoleFilter(e.target.value)} title="Ведущая роль по диагностике">
            <option value="">Все роли (диагностика)</option>
            {ROLE_OPTIONS.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
          </select>
          <select className="adm-input" value={activityFilter} onChange={e => setActivityFilter(e.target.value)} disabled={isHiddenList}>
            <option value="">Любая активность</option>
            <option value="active_today">Активен сегодня</option>
            <option value="inactive_1d">Неактивен ≥ 1 дня</option>
            <option value="inactive_3d">Неактивен ≥ 3 дней</option>
          </select>
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setShowIdColumn(v => !v)}>
            {showIdColumn ? 'Скрыть ID' : 'Показать ID'}
          </button>
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => exportList()}>
            Выгрузить список (XLSX)
          </button>
          {!isHiddenList && (
            <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={() => setShowAdd(v => !v)}>
              + Добавить участника
            </button>
          )}
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
        {selected.size > 0 && !isHiddenList && (
          <div className="adm-forum-toolbar" style={{ marginTop: 10 }}>
            <span className="adm-muted">Выбрано: {selected.size}</span>
            <button type="button" className="adm-btn adm-btn-sm" onClick={() => exportList([...selected])}>Выгрузить выбранных</button>
            <button type="button" className="adm-btn adm-btn-sm" onClick={() => setPushModal({ ids: [...selected] })}>Отправить пуш выбранным</button>
            <button type="button" className="adm-btn adm-btn-sm adm-btn-primary" onClick={openTransfer}>Перенести в смену…</button>
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
            {showIdColumn && <th>ID</th>}
            <th aria-label="Аватар" />
            <th>VK ID</th>
            <th>ФИО</th>
            <th>Направление</th>
            <th>Группа</th>
            <th>Регион</th>
            <th>Роль</th>
            <th>Путь</th>
            <th>Опыт</th>
            <th>Рейтинг</th>
            <th>{isHiddenList ? 'Скрыт с' : 'Активность'}</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {participants.length === 0 && (
            <tr>
              <td colSpan={showIdColumn ? 14 : 13} className="adm-muted" style={{ padding: 24, textAlign: 'center' }}>
                {isHiddenList ? 'Никто не удалял профиль' : 'Участники не найдены'}
              </td>
            </tr>
          )}
          {participants.map(p => (
            <tr
              key={p.id}
              className="adm-table-row-click"
              style={!isHiddenList && p.isBlocked ? { opacity: 0.85, background: '#FFF5F5' } : isHiddenList ? { opacity: 0.92 } : undefined}
              onClick={e => {
                const t = e.target as HTMLElement;
                if (t.closest('button, select, input, a, .adm-row-menu')) return;
                onOpenCard(p.id);
              }}
            >
              <td onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
              </td>
              {showIdColumn && <td className="adm-muted">{p.id}</td>}
              <td>
                <ParticipantAvatar
                  firstName={p.firstName}
                  lastName={p.lastName}
                  avatarUrl={p.avatarUrl}
                  size="sm"
                />
              </td>
              <td><VkProfileLink vkId={p.vkId} /></td>
              <td>{p.firstName} {p.lastName}{!isHiddenList && p.isBlocked ? ' · заблок.' : ''}</td>
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
              <td>{p.region || '—'}</td>
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
              <td>{isHiddenList ? formatHiddenAt(p.selfDeletedAt) : formatParticipantActivity(p.lastActiveAt)}</td>
              <td onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  {isHiddenList && (
                    <button
                      type="button"
                      className="adm-btn adm-btn-sm adm-btn-primary"
                      onClick={() => act(() => adminFetch(`/participants/${p.id}/restore`, { method: 'POST' }).then(reloadPage), 'Восстановлен в программу')}
                    >
                      Восстановить
                    </button>
                  )}
                  <RowActionsMenu actions={isHiddenList ? [
                    { label: 'Открыть карточку', onClick: () => onOpenCard(p.id) },
                    { label: 'Выгрузить данные (PDF)', onClick: () => act(() => adminDownloadBinary(`/participants/${p.id}/pdf`, `profile_${p.id}.pdf`), 'PDF') },
                    {
                      label: 'Удалить безвозвратно',
                      confirmMessage: CONFIRM_DELETE_PARTICIPANT,
                      onClick: () => act(() => adminFetch(`/participants/${p.id}/registration`, { method: 'DELETE' }).then(reloadPage), 'Удалён'),
                      danger: true,
                    },
                  ] : [
                  { label: 'Открыть карточку', onClick: () => onOpenCard(p.id) },
                  { label: 'Скорректировать роль', onClick: () => onOpenCard(p.id, 'profile') },
                  { label: 'Выгрузить данные (PDF)', onClick: () => act(() => adminDownloadBinary(`/participants/${p.id}/pdf`, `profile_${p.id}.pdf`), 'PDF') },
                  { label: 'Отправить пуш', onClick: () => setPushModal({ ids: [p.id] }) },
                  ...(p.isBlocked
                    ? [{ label: 'Разблокировать', onClick: () => act(() => adminFetch(`/participants/${p.id}/unblock`, { method: 'POST' }).then(reloadPage), 'Разблокирован') }]
                    : [{
                      label: 'Заблокировать',
                      confirmMessage: CONFIRM_BLOCK_PARTICIPANT,
                      onClick: () => act(() => adminFetch(`/participants/${p.id}/block`, { method: 'POST', body: '{}' }).then(reloadPage), 'Заблокирован'),
                      danger: true,
                    }]),
                  {
                    label: 'Исключить из программы',
                    confirmMessage: CONFIRM_REMOVE_FROM_PROGRAM,
                    onClick: () => act(() => adminFetch(`/participants/${p.id}/remove-from-program`, { method: 'POST', body: '{}' }).then(reloadPage), 'Исключён из программы'),
                    danger: true,
                  },
                  {
                    label: 'Удалить безвозвратно',
                    confirmMessage: CONFIRM_DELETE_PARTICIPANT,
                    onClick: () => act(() => adminFetch(`/participants/${p.id}/registration`, { method: 'DELETE' }).then(reloadPage), 'Удалён'),
                    danger: true,
                  },
                ]} />
                </div>
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

      {transferTargetId != null && (
        <div className="adm-modal-backdrop" onClick={() => setTransferTargetId(null)}>
          <div className="card" style={{ maxWidth: 460, width: '100%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Перенести участников в смену</h3>
            <p className="adm-muted">
              Будет создана предварительная запись с теми же персональными данными. При первом входе
              участник завершит регистрацию в новой смене. История исходной смены сохранится.
            </p>
            <p className="adm-forum-hint">
              Ответы, баллы, задания, награды, направление, группа и роль не переносятся.
            </p>
            <label className="adm-field">
              <span className="adm-label">Целевая смена</span>
              <select
                className="adm-input"
                value={transferTargetId}
                onChange={e => setTransferTargetId(Number(e.target.value))}
              >
                {shiftOptions
                  .filter(s => s.id !== currentShiftId)
                  .map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code}){s.status === 'active' ? ' · активная' : ''}
                    </option>
                  ))}
              </select>
            </label>
            <p className="adm-forum-hint">
              Если участник уже есть в выбранной смене, он будет пропущен.
            </p>
            <div className="form-row" style={{ marginTop: 12 }}>
              <button type="button" className="adm-btn adm-btn-primary" onClick={copyParticipantsToShift}>
                Перенести {selected.size}
              </button>
              <button type="button" className="adm-btn adm-btn-secondary" onClick={() => setTransferTargetId(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
