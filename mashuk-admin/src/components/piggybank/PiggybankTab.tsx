import { useCallback, useEffect, useMemo, useState } from 'react';
import { confirmDelete } from '../../admin/confirmDelete';
import { adminDownloadBinary } from '../../admin/client';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';
import { RowActionsMenu } from '../participants/RowActionsMenu';

const PIGGY_TAGS = ['идея', 'мысль', 'вопрос', 'контакт', 'на будущее', 'в работу'];
const PIGGY_SOURCES = ['Направление', 'Урок о важном', 'Открытый урок', 'Клуб', 'Разговор с участником', 'Своя мысль'];
const PAGE_SIZE = 100;

type ListMode = 'active' | 'deleted';

type Entry = {
  id: number;
  createdAt: string;
  deletedAt?: string | null;
  participantId: number;
  participantName: string;
  directionName: string | null;
  text: string;
  tags: string[];
  source: string | null;
  forumDay: number | null;
  isHidden: boolean | null;
  isViolation: boolean | null;
  pointsLogId?: number | null;
};

export type PiggybankTabProps = AdminTabProps & {
  onOpenCard: (id: number, tab?: 'piggybank') => void;
};

function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  return `${s.slice(0, n)}…`;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  });
  return sp.toString();
}

export function PiggybankTab({ adminFetch, act, reloadKey, onOpenCard }: PiggybankTabProps) {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [deletedTotal, setDeletedTotal] = useState(0);
  const [listMode, setListMode] = useState<ListMode>('active');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [participantSearch, setParticipantSearch] = useState('');
  const [debouncedParticipantQ, setDebouncedParticipantQ] = useState('');
  const [directionId, setDirectionId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [forumDay, setForumDay] = useState('');
  const [tag, setTag] = useState('');
  const [source, setSource] = useState('');
  const [directions, setDirections] = useState<{ id: number; name: string }[]>([]);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [totalDays, setTotalDays] = useState(8);
  const [openEntry, setOpenEntry] = useState<Entry | null>(null);
  const [participantOptions, setParticipantOptions] = useState<{ id: number; label: string }[]>([]);
  const [selectedParticipantLabel, setSelectedParticipantLabel] = useState('');
  const isDeletedList = listMode === 'deleted';

  useEffect(() => {
    const t = setTimeout(() => setDebouncedParticipantQ(participantSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [participantSearch]);

  const hasFilters = Boolean(
    search.trim() || participantId || debouncedParticipantQ || directionId || groupId || forumDay || tag || source,
  );

  const filters = useMemo(() => ({
    q: search.trim(),
    participantId: participantId ? Number(participantId) : undefined,
    // Пока не выбран конкретный id — фильтруем записи по ФИО напрямую
    participantQ: !participantId && debouncedParticipantQ.length >= 2
      ? debouncedParticipantQ
      : undefined,
    directionId: directionId ? Number(directionId) : undefined,
    groupId: groupId ? Number(groupId) : undefined,
    forumDay: forumDay ? Number(forumDay) : undefined,
    tag,
    source,
    page,
    limit: PAGE_SIZE,
    onlyDeleted: isDeletedList ? 'true' : undefined,
  }), [search, participantId, debouncedParticipantQ, directionId, groupId, forumDay, tag, source, page, isDeletedList]);

  const loadMeta = useCallback(async () => {
    const [dirs, gr, fs] = await Promise.all([
      adminFetch('/directions'),
      adminFetch('/groups'),
      adminFetch('/forum-settings'),
    ]);
    setDirections(dirs.directions || []);
    setGroups(gr.groups || []);
    setTotalDays(fs.settings?.totalDays ?? 8);
  }, [adminFetch]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch(`/piggybank-entries?${buildQuery(filters)}`);
      setEntries(res.entries || []);
      setTotalCount(res.totalCount ?? 0);
      if (!isDeletedList) {
        const del = await adminFetch('/piggybank-entries?onlyDeleted=true&limit=1&page=1');
        setDeletedTotal(del.totalCount ?? 0);
      } else {
        setDeletedTotal(res.totalCount ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [adminFetch, filters, isDeletedList]);

  useEffect(() => {
    loadMeta().catch(() => {});
  }, [loadMeta, reloadKey]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  useEffect(() => {
    setPage(1);
  }, [search, participantId, debouncedParticipantQ, directionId, groupId, forumDay, tag, source, listMode]);

  useEffect(() => {
    if (participantSearch.trim().length < 2) {
      setParticipantOptions(prev => {
        if (participantId && selectedParticipantLabel) {
          const keep = prev.find(p => String(p.id) === participantId);
          return keep ? [keep] : [{ id: Number(participantId), label: selectedParticipantLabel }];
        }
        return [];
      });
      return;
    }
    const t = setTimeout(() => {
      adminFetch(`/participants?q=${encodeURIComponent(participantSearch.trim())}&limit=15`)
        .then(res => {
          const list = res.participants || [];
          const mapped = list.map((p: { id: number; firstName?: string; lastName?: string; vkId?: string }) => ({
            id: p.id,
            label: [p.firstName, p.lastName].filter(Boolean).join(' ') || String(p.vkId),
          }));
          if (participantId && selectedParticipantLabel && !mapped.some((p: { id: number }) => String(p.id) === participantId)) {
            mapped.unshift({ id: Number(participantId), label: selectedParticipantLabel });
          }
          setParticipantOptions(mapped);
        })
        .catch(() => setParticipantOptions([]));
    }, 300);
    return () => clearTimeout(t);
  }, [participantSearch, adminFetch, participantId, selectedParticipantLabel]);

  const patchEntry = (id: number, body: Record<string, boolean>) =>
    act(async () => {
      await adminFetch(`/piggybank-entries/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      await load();
    }, 'Сохранено');

  const deleteEntry = (id: number) => {
    if (!confirmDelete(
      'Удалить запись в архив? У участника снимутся начисленные за неё баллы. Цифровой след сохранится во вкладке «Удалённые копилки».',
    )) return;
    act(async () => {
      const res = await adminFetch(`/piggybank-entries/${id}`, { method: 'DELETE' });
      setOpenEntry(null);
      await load();
      return res?.pointsRevoked
        ? 'Запись в архиве, баллы сняты'
        : 'Запись в архиве (баллы не найдены или уже сняты)';
    });
  };

  const restoreEntry = (id: number) => {
    act(async () => {
      await adminFetch(`/piggybank-entries/${id}/restore`, { method: 'POST', body: '{}' });
      setOpenEntry(null);
      await load();
    }, 'Запись восстановлена (баллы не возвращаются автоматически)');
  };

  const exportXlsx = () => {
    const { page: _p, limit: _l, ...rest } = filters;
    const sp = buildQuery({ ...rest, format: 'xlsx' });
    act(() => adminDownloadBinary(`/piggybank-entries/export?${sp}`, 'piggybank.xlsx'), 'Экспорт');
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const listLabel = hasFilters || page > 1
    ? `${entries.length} в списке · ${totalCount} всего`
    : `${totalCount} всего`;
  const heroHint = isDeletedList
    ? 'Архив удалённых записей. Баллы за эти записи уже сняты. Можно восстановить текст в активный список (баллы не возвращаются автоматически).'
    : 'Модерация записей участников. Удаление переносит в архив и снимает баллы.';

  return (
    <div className="adm-forum">
      <AdminPageHero
        title={isDeletedList ? `Удалённые копилки · ${listLabel}` : `Записи копилки · ${listLabel}`}
        hint={heroHint}
      >
        <div className="adm-seg" style={{ marginBottom: 10 }}>
          <button
            type="button"
            className={listMode === 'active' ? 'on' : ''}
            onClick={() => { setListMode('active'); setPage(1); setOpenEntry(null); }}
          >
            Копилка
          </button>
          <button
            type="button"
            className={listMode === 'deleted' ? 'on' : ''}
            onClick={() => { setListMode('deleted'); setPage(1); setOpenEntry(null); }}
          >
            Удалённые копилки{deletedTotal > 0 ? ` (${deletedTotal})` : ''}
          </button>
        </div>
        <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input
            className="adm-input"
            placeholder="Поиск по тексту"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ minWidth: 160, flex: 1 }}
          />
          <input
            className="adm-input"
            placeholder="Участник (ФИО)"
            value={participantSearch}
            onChange={e => {
              const next = e.target.value;
              setParticipantSearch(next);
              // Сброс точного выбора при правке текста — дальше фильтр по ФИО
              if (participantId && next.trim() !== selectedParticipantLabel.trim()) {
                setParticipantId('');
                setSelectedParticipantLabel('');
              }
              if (!next.trim()) {
                setParticipantId('');
                setSelectedParticipantLabel('');
              }
            }}
            style={{ minWidth: 160 }}
            title="Введите ФИО — список отфильтруется. Можно уточнить выбор в списке справа."
          />
          <select
            className="adm-input"
            value={participantId}
            onChange={e => {
              const id = e.target.value;
              setParticipantId(id);
              if (!id) {
                setSelectedParticipantLabel('');
                return;
              }
              const hit = participantOptions.find(p => String(p.id) === id);
              if (hit) {
                setSelectedParticipantLabel(hit.label);
                setParticipantSearch(hit.label);
              }
            }}
            style={{ minWidth: 160 }}
            title="Уточнить участника из найденных"
          >
            <option value="">
              {debouncedParticipantQ.length >= 2 && !participantId
                ? 'Уточнить участника…'
                : 'Все участники'}
            </option>
            {participantOptions.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <select className="adm-input" value={directionId} onChange={e => setDirectionId(e.target.value)}>
            <option value="">Направление</option>
            {directions.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select className="adm-input" value={groupId} onChange={e => setGroupId(e.target.value)}>
            <option value="">Группа</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <select className="adm-input" value={forumDay} onChange={e => setForumDay(e.target.value)}>
            <option value="">День</option>
            {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => (
              <option key={d} value={d}>День {d}</option>
            ))}
          </select>
          <select className="adm-input" value={tag} onChange={e => setTag(e.target.value)}>
            <option value="">Тег</option>
            {PIGGY_TAGS.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select className="adm-input" value={source} onChange={e => setSource(e.target.value)}>
            <option value="">Источник</option>
            {PIGGY_SOURCES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={exportXlsx}>
            Экспорт в XLSX
          </button>
        </div>
      </AdminPageHero>

      {loading ? (
        <p className="adm-muted">Загрузка…</p>
      ) : (
        <div className="card">
          {entries.length === 0 ? (
            <p className="adm-muted">Записей не найдено</p>
          ) : (
            <>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>{isDeletedList ? 'Удалено' : 'Дата'}</th>
                  <th>Участник</th>
                  <th>Направление</th>
                  <th>Текст</th>
                  <th>Теги</th>
                  <th>Источник</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} style={isDeletedList ? { opacity: 0.85, background: '#f7f5f0' } : undefined}>
                    <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                      {isDeletedList
                        ? (e.deletedAt ? new Date(e.deletedAt).toLocaleString('ru-RU') : '—')
                        : (e.createdAt ? new Date(e.createdAt).toLocaleString('ru-RU') : '—')}
                    </td>
                    <td>
                      <button type="button" className="adm-link-btn" onClick={() => onOpenCard(e.participantId, 'piggybank')}>
                        {e.participantName}
                      </button>
                    </td>
                    <td>{e.directionName || '—'}</td>
                    <td>{truncate(e.text, 150)}</td>
                    <td style={{ fontSize: 11 }}>{(e.tags || []).join(', ') || '—'}</td>
                    <td>{e.source || '—'}</td>
                    <td>
                      <RowActionsMenu
                        actions={isDeletedList
                          ? [
                            { label: 'Открыть', onClick: () => setOpenEntry(e) },
                            { label: 'Восстановить в копилку', onClick: () => restoreEntry(e.id) },
                          ]
                          : [
                            { label: 'Открыть', onClick: () => setOpenEntry(e) },
                            {
                              label: e.isViolation ? 'Снять нарушение' : 'Пометить как нарушение',
                              onClick: () => patchEntry(e.id, { isViolation: !e.isViolation }),
                            },
                            {
                              label: e.isHidden ? 'Показать' : 'Скрыть',
                              onClick: () => patchEntry(e.id, { isHidden: !e.isHidden }),
                            },
                            { label: 'Удалить (архив + снять баллы)', onClick: () => deleteEntry(e.id), danger: true },
                          ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="adm-forum-toolbar" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary adm-btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  ← Назад
                </button>
                <span className="adm-muted" style={{ fontSize: 12 }}>
                  Страница {page} из {totalPages}
                </span>
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary adm-btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  Вперёд →
                </button>
              </div>
            )}
            </>
          )}
        </div>
      )}

      {openEntry && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="adm-forum-toolbar">
            <strong>Запись #{openEntry.id}</strong>
            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setOpenEntry(null)}>Закрыть</button>
          </div>
          <p style={{ fontSize: 12, color: '#666' }}>
            {openEntry.participantName} · создано{' '}
            {openEntry.createdAt ? new Date(openEntry.createdAt).toLocaleString('ru-RU') : '—'}
            {openEntry.deletedAt
              ? ` · удалено ${new Date(openEntry.deletedAt).toLocaleString('ru-RU')}`
              : ''}
          </p>
          <p style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{openEntry.text}</p>
          <p className="adm-muted" style={{ fontSize: 11, marginTop: 8 }}>
            Теги: {(openEntry.tags || []).join(', ') || '—'} · Источник: {openEntry.source || '—'}
            {openEntry.pointsLogId ? ` · points_log #${openEntry.pointsLogId}` : ''}
          </p>
          {isDeletedList && (
            <button
              type="button"
              className="adm-btn adm-btn-sm"
              style={{ marginTop: 10 }}
              onClick={() => restoreEntry(openEntry.id)}
            >
              Восстановить в копилку
            </button>
          )}
        </div>
      )}
    </div>
  );
}
