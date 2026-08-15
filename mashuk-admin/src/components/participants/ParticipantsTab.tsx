import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminDownloadBinary } from '../../admin/client';
import { CONFIRM_BLOCK_PARTICIPANT, CONFIRM_DELETE_PARTICIPANT, CONFIRM_REMOVE_FROM_PROGRAM } from '../../admin/confirmDelete';
import { ROLE_OPTIONS } from '../onboarding/roleOptions';
import { AdminPageHero } from '../admin/AdminPageHero';
import { Pagination } from '../admin/Pagination';
import type { AdminTabProps } from '../admin/types';
import { HubLensLayout, type HubNavItem } from '../hub/HubSideNav';
import { VkProfileLink } from '../VkProfileLink';
import { RowActionsMenu, formatParticipantActivity } from './RowActionsMenu';
import { ParticipantAvatar } from './ParticipantAvatar';

type ParticipantCardTab = 'profile' | 'answers' | 'tasks' | 'medals' | 'points' | 'piggybank' | 'activity' | 'logs';

const PARTICIPANTS_NAV: HubNavItem[] = [
  { id: 'participants-hero', label: 'Обзор' },
  { id: 'participants-filters', label: 'Фильтры' },
  { id: 'participants-list', label: 'Список' },
];

export type ParticipantsTabProps = AdminTabProps & {
  onOpenCard: (id: number, tab?: ParticipantCardTab) => void;
};

type ParticipantRow = {
  id: number;
  vkId: number;
  firstName: string;
  lastName: string;
  directionId?: number | null;
  direction?: string;
  groupId?: number | null;
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
  onboardingCompletedAt?: string | null;
  profileAiConsent?: boolean | null;
};

type ListSortKey = 'id' | 'vkId' | 'name' | 'direction' | 'group' | 'region' | 'role' | 'path' | 'experience' | 'rating' | 'activity' | 'consent';
type ListSort = { key: ListSortKey; dir: 'asc' | 'desc' };

const TEXT_SORT_KEYS: ListSortKey[] = ['name', 'direction', 'group', 'region', 'role'];
const CONSENT_QUESTION = 'Я даю согласие на автоматизированную обработку моих текстовых ответов (включая использование технологий искусственного интеллекта) для формирования моего итогового профиля участия в форуме';

function sortMark(sort: ListSort | null, key: ListSortKey): string {
  if (!sort || sort.key !== key) return '';
  return sort.dir === 'asc' ? ' ↑' : ' ↓';
}

function SortTh({
  label,
  sortKey,
  sort,
  onSort,
  title,
}: {
  label: string;
  sortKey: ListSortKey;
  sort: ListSort | null;
  onSort: (key: ListSortKey) => void;
  title?: string;
}) {
  return (
    <th title={title}>
      <button
        type="button"
        className="adm-link"
        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', fontWeight: 650 }}
        onClick={() => onSort(sortKey)}
      >
        {label}{sortMark(sort, sortKey)}
      </button>
    </th>
  );
}

type ParticipantListMode = 'active' | 'hidden';
type ShiftOption = { id: number; name: string; code: string; status: string; isPublished?: boolean };

function pickCopyTargetShift(options: ShiftOption[], currentId: number | null): ShiftOption | undefined {
  const others = options.filter(s => s.id !== currentId);
  return others.find(s => s.status === 'active')
    ?? others.find(s => s.isPublished)
    ?? others.find(s => s.status !== 'draft' && s.status !== 'archived')
    ?? others[0];
}

function buildListQuery(params: {
  page: number;
  q: string;
  directionIds: number[];
  groupId: string;
  pedagogicalRole: string;
  strongRole: string;
  activity: string;
  listMode: ParticipantListMode;
  allShifts: boolean;
  sort: ListSort | null;
}): string {
  const sp = new URLSearchParams({ page: String(params.page), limit: '50' });
  if (params.listMode === 'hidden') {
    sp.set('onlySelfDeleted', 'true');
    // По умолчанию показываем удаливших профиль со всех смен — иначе легко «потерять» человека.
    if (params.allShifts) sp.set('allShifts', 'true');
  }
  if (params.q.trim()) sp.set('q', params.q.trim());
  for (const id of params.directionIds) sp.append('directionId', String(id));
  if (params.groupId) sp.set('groupId', params.groupId);
  if (params.pedagogicalRole) sp.set('pedagogicalRole', params.pedagogicalRole);
  if (params.strongRole) sp.set('strongRole', params.strongRole);
  // activity не шлём для hidden — бэкенд тоже игнорирует
  if (params.listMode !== 'hidden' && params.activity) sp.set('activity', params.activity);
  if (params.sort) {
    sp.set('sort', params.sort.key);
    sp.set('dir', params.sort.dir);
  }
  return sp.toString();
}

function formatHiddenAt(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function canEditSettings(role?: string) {
  return role === 'admin' || role === 'superadmin';
}

export function ParticipantsTab({ adminFetch, act, reloadKey, onOpenCard, adminRole }: ParticipantsTabProps) {
  const canSettings = canEditSettings(adminRole);
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [participantsPage, setParticipantsPage] = useState(1);
  const [participantsTotal, setParticipantsTotal] = useState(0);
  const [incompleteCount, setIncompleteCount] = useState(0);
  const [participantSearch, setParticipantSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [directionFilter, setDirectionFilter] = useState<number[]>([]);
  const [groupFilter, setGroupFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [strongRoleFilter, setStrongRoleFilter] = useState('');
  const [showIdColumn, setShowIdColumn] = useState(true);
  const [activityFilter, setActivityFilter] = useState('');
  const [listMode, setListMode] = useState<ParticipantListMode>('active');
  const [hiddenAllShifts, setHiddenAllShifts] = useState(true);
  const [hiddenTotal, setHiddenTotal] = useState(0);
  const [hiddenUnfilteredTotal, setHiddenUnfilteredTotal] = useState(0);
  const [hardDeleteCount, setHardDeleteCount] = useState(0);
  const [selfDeleteLogCount, setSelfDeleteLogCount] = useState(0);
  const [directions, setDirections] = useState<{ id: number; name: string }[]>([]);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [shiftOptions, setShiftOptions] = useState<ShiftOption[]>([]);
  const [currentShiftId, setCurrentShiftId] = useState<number | null>(null);
  const [transferTargetId, setTransferTargetId] = useState<number | null>(null);
  const [transferIds, setTransferIds] = useState<number[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [pushModal, setPushModal] = useState<{ ids: number[] } | null>(null);
  const [pushText, setPushText] = useState('');
  const [newParticipant, setNewParticipant] = useState({ vkId: '', firstName: '', lastName: '', directionId: '' });
  const [listSort, setListSort] = useState<ListSort | null>(null);

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
    allShifts: hiddenAllShifts,
    sort: listSort,
  }), [participantsPage, debouncedQ, directionFilter, groupFilter, roleFilter, strongRoleFilter, activityFilter, listMode, hiddenAllShifts, listSort]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch(`/participants?${listQuery}`);
      setParticipants(res.participants || []);
      setParticipantsTotal(res.totalCount || 0);
      setIncompleteCount(Number(res.incompleteCount) || 0);
      setCurrentShiftId(res.shiftId ?? null);
      if (listMode === 'hidden') {
        setHardDeleteCount(Number(res.hardDeleteCount) || 0);
        setSelfDeleteLogCount(Number(res.selfDeleteLogCount) || 0);
      }
      // Счётчик бейджа — всегда «все смены», чтобы не путать с пустым фильтром текущей смены
      const hiddenBadge = await adminFetch('/participants?onlySelfDeleted=true&allShifts=true&limit=1&page=1');
      setHiddenTotal(hiddenBadge.totalCount || 0);
      if (listMode !== 'hidden') {
        setHardDeleteCount(Number(hiddenBadge.hardDeleteCount) || 0);
        setSelfDeleteLogCount(Number(hiddenBadge.selfDeleteLogCount) || 0);
      }
      if (listMode === 'hidden') {
        const hasExtraFilters = Boolean(
          debouncedQ.trim()
          || directionFilter.length
          || groupFilter
          || roleFilter
          || strongRoleFilter,
        );
        if (hasExtraFilters) {
          const unfiltered = await adminFetch(
            `/participants?onlySelfDeleted=true&limit=1&page=1${hiddenAllShifts ? '&allShifts=true' : ''}`,
          );
          setHiddenUnfilteredTotal(unfiltered.totalCount || 0);
        } else {
          setHiddenUnfilteredTotal(res.totalCount || 0);
        }
      } else {
        setHiddenUnfilteredTotal(hiddenBadge.totalCount || 0);
      }
      setDirections((await adminFetch('/directions')).directions || []);
      // Full shift catalog (not only groups that already have members)
      setGroups((await adminFetch('/groups')).groups || []);
      setShiftOptions((await adminFetch('/shifts')).shifts || []);
    } finally {
      setLoading(false);
    }
  }, [
    adminFetch,
    listQuery,
    listMode,
    debouncedQ,
    directionFilter,
    groupFilter,
    roleFilter,
    strongRoleFilter,
    hiddenAllShifts,
  ]);

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

  const toggleSort = (key: ListSortKey) => {
    setParticipantsPage(1);
    setListSort(prev => {
      if (prev?.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key, dir: TEXT_SORT_KEYS.includes(key) ? 'asc' : 'desc' };
    });
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
      const res = await adminFetch(path, { method: 'POST', body: JSON.stringify(body) }) as {
        deliveryStatusHint?: string;
        deliveryStatus?: string;
      };
      setPushModal(null);
      setPushText('');
      return res.deliveryStatusHint || res.deliveryStatus || 'Пуш отправлен';
    }, 'Пуш отправлен');
  };

  const openTransfer = (ids?: number[]) => {
    const participantIds = ids?.length ? ids : [...selected];
    if (!participantIds.length) return;
    const target = pickCopyTargetShift(shiftOptions, currentShiftId);
    if (!target) {
      alert('Нет другой смены для переноса участников');
      return;
    }
    setTransferIds(participantIds);
    setTransferTargetId(target.id);
  };

  const copyParticipantsToShift = () => {
    if (transferTargetId == null || transferIds.length === 0) return;
    const target = shiftOptions.find(s => s.id === transferTargetId);
    if (!target) return;
    if (!confirm(
      `Добавить выбранных участников (${transferIds.length}) в смену «${target.name}»?\n\n` +
      'Копируется только карточка участника без прогресса и анкеты. ' +
      'При первом входе участник выберет смену, затем сможет сменить её в профиле.',
    )) return;
    act(async () => {
      const res = await adminFetch('/participants/copy-to-shift', {
        method: 'POST',
        body: JSON.stringify({
          participantIds: transferIds,
          targetShiftId: transferTargetId,
        }),
      });
      setTransferTargetId(null);
      setTransferIds([]);
      setSelected(new Set());
      return res.message || `Скопировано: ${res.copied || 0}`;
    }, 'Участники добавлены в смену');
  };

  const isHiddenList = listMode === 'hidden';

  if (loading && participants.length === 0) {
    return <p className="adm-muted">Загрузка участников…</p>;
  }

  return (
    <HubLensLayout className="adm-forum adm-kb" items={PARTICIPANTS_NAV} navLabel="Разделы участников">
      <section id="participants-hero" className="adm-forum-anchor">
        <AdminPageHero
          title={isHiddenList
            ? `Удалили профиль · ${participantsTotal}`
            : `Участники · ${participantsTotal} в программе${incompleteCount > 0 ? ` · ${incompleteCount} без регистрации` : ''}`}
          hint={isHiddenList
            ? 'Мягкое удаление: данные сохранены, можно восстановить.'
            : 'Поиск, фильтры и сортировка по заголовкам. Зелёная строка — согласие на ИИ-профиль, красная — отказ.'}
        >
          <div className="adm-forum-seg">
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
              onClick={() => {
                setListMode('hidden');
                setParticipantsPage(1);
                setSelected(new Set());
                setActivityFilter('');
                setHiddenAllShifts(true);
              }}
            >
              Удалили профиль{hiddenTotal > 0 ? ` · ${hiddenTotal}` : ''}
            </button>
          </div>
        </AdminPageHero>
      </section>

      {isHiddenList && (
        <div className="card adm-forum-block adm-kb-panel" style={{ marginBottom: 12 }}>
          <p className="adm-kb-panel-sub" style={{ margin: 0 }}>
            Здесь только <b>мягкое</b> удаление: участник нажал «Удалить мой профиль» или админ выбрал «Исключить из программы».
            Данные сохраняются, человека можно восстановить. «Удалить безвозвратно» стирает запись — в этом списке его не будет.
          </p>
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <label className="adm-tasks-check">
              <input
                type="checkbox"
                checked={hiddenAllShifts}
                onChange={e => {
                  setHiddenAllShifts(e.target.checked);
                  setParticipantsPage(1);
                }}
              />
              <span>Все смены</span>
            </label>
            {!hiddenAllShifts && currentShiftId != null && (
              <span className="adm-muted" style={{ fontSize: 12 }}>
                Фильтр по смене #{currentShiftId}
                {shiftOptions.find(s => s.id === currentShiftId)?.name
                  ? ` · ${shiftOptions.find(s => s.id === currentShiftId)?.name}`
                  : ''}
              </span>
            )}
            <span className="adm-muted" style={{ fontSize: 12 }}>
              Журнал: мягких выходов {selfDeleteLogCount} · безвозвратных удалений {hardDeleteCount}
            </span>
          </div>
          {participantsTotal === 0 && hiddenUnfilteredTotal > 0 && (
            <p style={{ margin: '8px 0 0', color: '#D70015' }}>
              С текущими фильтрами никого нет, но без фильтров найдено: {hiddenUnfilteredTotal}. Сбросьте поиск / направление / группу / роль.
            </p>
          )}
          {participantsTotal === 0 && hiddenUnfilteredTotal === 0 && (
            <p style={{ margin: '8px 0 0', color: hardDeleteCount > 0 ? '#D70015' : undefined }}>
              Сейчас нет ни одного мягко удалённого профиля
              {hiddenAllShifts ? '' : ' на этой смене'}.
              {hardDeleteCount > 0
                ? ` Зато в журнале ${hardDeleteCount} безвозвратных удалений — эти люди уже стёрты из базы и сюда не попадут.`
                : ' Если человек «пропал» — проверьте журнал действий админов или что удаление шло через «Исключить из программы», а не «безвозвратно».'}
            </p>
          )}
        </div>
      )}

      <section id="participants-filters" className="adm-forum-anchor">
        <div className="card adm-forum-block adm-kb-panel">
          <div className="adm-kb-panel-head">
            <h3>Фильтры</h3>
            <p className="adm-kb-panel-sub">Поиск, группа, роль, активность и направления.</p>
          </div>
          <div className="adm-kb-toolbar">
            <input
              className="adm-input adm-kb-search"
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
              Выгрузить XLSX
            </button>
            {!isHiddenList && (
              <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={() => setShowAdd(v => !v)}>
                + Добавить
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
            <div className="adm-kb-bulk" style={{ marginTop: 12 }}>
              <span className="adm-kb-bulk-count">Выбрано: {selected.size}</span>
              <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onClick={() => exportList([...selected])}>Выгрузить</button>
              {canSettings && (
                <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onClick={() => setPushModal({ ids: [...selected] })}>Пуш</button>
              )}
              {canSettings && (
                <button type="button" className="adm-btn adm-btn-sm adm-btn-primary" onClick={() => openTransfer()}>В смену…</button>
              )}
              <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => setSelected(new Set())}>Снять выбор</button>
            </div>
          )}
        </div>
      </section>

      {showAdd && (
        <div className="card adm-forum-block adm-kb-panel">
          <div className="adm-kb-panel-head">
            <h3>Новый участник</h3>
            <p className="adm-kb-panel-sub">VK ID и ФИО — обязательные поля для создания.</p>
          </div>
          <div className="adm-forum-grid-2">
            <input className="adm-input" value={newParticipant.vkId} onChange={e => setNewParticipant({ ...newParticipant, vkId: e.target.value })} placeholder="VK ID" />
            <select className="adm-input" value={newParticipant.directionId} onChange={e => setNewParticipant({ ...newParticipant, directionId: e.target.value })}>
              <option value="">Направление</option>
              {directions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <input className="adm-input" value={newParticipant.firstName} onChange={e => setNewParticipant({ ...newParticipant, firstName: e.target.value })} placeholder="Имя" />
            <input className="adm-input" value={newParticipant.lastName} onChange={e => setNewParticipant({ ...newParticipant, lastName: e.target.value })} placeholder="Фамилия" />
          </div>
          <div className="adm-mod-item-actions">
            <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={createParticipant}>Сохранить</button>
          </div>
        </div>
      )}

      <section id="participants-list" className="adm-forum-anchor">
        <div className="card adm-forum-block adm-kb-panel">
          <div className="adm-kb-panel-head">
            <h3>Список</h3>
            <p className="adm-kb-panel-sub">Клик по строке открывает карточку. Клик по заголовку сортирует весь список.</p>
          </div>
          <p className="adm-consent-legend">
            <span><span className="adm-consent-swatch adm-consent-swatch-yes" />Да — согласие на ИИ-профиль</span>
            <span><span className="adm-consent-swatch adm-consent-swatch-no" />Нет — отказ в итоговой анкете</span>
          </p>
          <div className="adm-kb-table-scroll">
            <table className="adm-table adm-kb-inline-table">
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" checked={allSelected} onChange={() => {
                      if (allSelected) setSelected(new Set());
                      else setSelected(new Set(participants.map(p => p.id)));
                    }} aria-label="Выбрать все" />
                  </th>
                  {showIdColumn && <SortTh label="ID" sortKey="id" sort={listSort} onSort={toggleSort} />}
                  <th aria-label="Аватар" />
                  <SortTh label="VK ID" sortKey="vkId" sort={listSort} onSort={toggleSort} />
                  <SortTh label="ФИО" sortKey="name" sort={listSort} onSort={toggleSort} />
                  <SortTh label="Направление" sortKey="direction" sort={listSort} onSort={toggleSort} />
                  <SortTh label="Группа" sortKey="group" sort={listSort} onSort={toggleSort} />
                  <SortTh label="Регион" sortKey="region" sort={listSort} onSort={toggleSort} />
                  <SortTh label="Роль" sortKey="role" sort={listSort} onSort={toggleSort} />
                  <SortTh label="Путь" sortKey="path" sort={listSort} onSort={toggleSort} />
                  <SortTh label="Опыт" sortKey="experience" sort={listSort} onSort={toggleSort} />
                  <SortTh label="Рейтинг" sortKey="rating" sort={listSort} onSort={toggleSort} />
                  <SortTh
                    label={isHiddenList ? 'Скрыт с' : 'Активность'}
                    sortKey="activity"
                    sort={listSort}
                    onSort={toggleSort}
                  />
                  <SortTh
                    label="ИИ-профиль"
                    sortKey="consent"
                    sort={listSort}
                    onSort={toggleSort}
                    title={CONSENT_QUESTION}
                  />
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {participants.length === 0 && (
                  <tr>
                    <td colSpan={showIdColumn ? 15 : 14} className="adm-muted" style={{ padding: 24, textAlign: 'center' }}>
                      {isHiddenList ? 'Никто не удалял профиль' : 'Участники не найдены'}
                    </td>
                  </tr>
                )}
                {participants.map(p => (
                  <tr
                    key={p.id}
                    className={[
                      'adm-table-row-click',
                      p.profileAiConsent === true ? 'adm-row-consent-yes' : '',
                      p.profileAiConsent === false ? 'adm-row-consent-no' : '',
                    ].filter(Boolean).join(' ')}
                    style={
                      p.profileAiConsent != null
                        ? undefined
                        : !isHiddenList && p.isBlocked
                          ? { opacity: 0.85, background: 'rgba(255, 59, 48, 0.06)' }
                          : isHiddenList ? { opacity: 0.92 } : undefined
                    }
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
                    <td>
                      {p.firstName} {p.lastName}
                      {!isHiddenList && p.isBlocked ? ' · заблок.' : ''}
                      {!isHiddenList && !p.onboardingCompletedAt ? ' · не завершил регистрацию' : ''}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <select
                        className="adm-input adm-input-narrow"
                        value={p.directionId ?? directions.find(d => d.name === p.direction)?.id ?? ''}
                        onChange={e => act(
                          () => adminFetch(`/participants/${p.id}/direction`, {
                            method: 'PATCH', body: JSON.stringify({ directionId: Number(e.target.value) }),
                          }).then(reloadPage),
                          'Направление сохранено',
                        )}
                      >
                        {directions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <select
                        className="adm-input adm-input-narrow"
                        value={p.groupId ?? ''}
                        onChange={e => {
                          const v = e.target.value;
                          act(() => adminFetch(`/participants/${p.id}/group`, {
                            method: 'PATCH',
                            body: JSON.stringify({ groupId: v ? Number(v) : null }),
                          }).then(reloadPage), 'Группа обновлена');
                        }}
                      >
                        <option value="">—</option>
                        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    </td>
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
                    <td title={CONSENT_QUESTION}>
                      {p.profileAiConsent === true ? 'Да' : p.profileAiConsent === false ? 'Нет' : '—'}
                    </td>
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
                          { label: 'Выгрузить всё (Excel)', onClick: () => act(() => adminDownloadBinary(`/exports/participant/${p.id}/answers?format=xlsx`, `participant_${p.id}.xlsx`), 'Excel') },
                          {
                            label: 'Удалить безвозвратно',
                            confirmMessage: CONFIRM_DELETE_PARTICIPANT,
                            onClick: () => act(() => adminFetch(`/participants/${p.id}/registration`, { method: 'DELETE' }).then(reloadPage), 'Удалён'),
                            danger: true,
                          },
                        ] : [
                        { label: 'Открыть карточку', onClick: () => onOpenCard(p.id) },
                        { label: 'Скорректировать роль', onClick: () => onOpenCard(p.id, 'profile') },
                        { label: 'Выгрузить всё (Excel)', onClick: () => act(() => adminDownloadBinary(`/exports/participant/${p.id}/answers?format=xlsx`, `participant_${p.id}.xlsx`), 'Excel') },
                        ...(canSettings ? [
                          { label: 'Отправить пуш', onClick: () => setPushModal({ ids: [p.id] }) },
                          { label: 'Копировать в смену', onClick: () => openTransfer([p.id]) },
                        ] : []),
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
          </div>
          <Pagination page={participantsPage} total={participantsTotal} setPage={setParticipantsPage} />
        </div>
      </section>

      {pushModal && (
        <div className="adm-modal-backdrop" onClick={() => setPushModal(null)}>
          <div className="card adm-kb-panel" style={{ maxWidth: 420, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div className="adm-kb-panel-head">
              <h3>Отправить пуш ({pushModal.ids.length})</h3>
            </div>
            <textarea className="adm-input" rows={3} value={pushText} onChange={e => setPushText(e.target.value)} placeholder="Текст уведомления" />
            <div className="adm-mod-item-actions">
              <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={sendPush}>Отправить</button>
              <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setPushModal(null)}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {transferTargetId != null && (
        <div className="adm-modal-backdrop" onClick={() => setTransferTargetId(null)}>
          <div className="card adm-kb-panel" style={{ maxWidth: 460, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div className="adm-kb-panel-head">
              <h3>Копировать в смену</h3>
              <p className="adm-kb-panel-sub">
                Создаётся пустая карточка в другой смене. Прогресс и анкета исходной смены не копируются.
              </p>
            </div>
            <p className="adm-muted" style={{ fontSize: 12 }}>
              При первом входе участник увидит выбор смены. Потом смену можно сменить в профиле.
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
            <p className="adm-muted" style={{ fontSize: 12 }}>
              Если участник уже есть в выбранной смене, он будет пропущен.
            </p>
            <div className="adm-mod-item-actions">
              <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={copyParticipantsToShift}>
                Копировать {transferIds.length}
              </button>
              <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setTransferTargetId(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </HubLensLayout>
  );
}
