import { useCallback, useEffect, useMemo, useState } from 'react';
import { confirmDelete } from '../../admin/confirmDelete';
import { adminDownloadBinary } from '../../admin/client';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';
import { HubLensLayout, type HubNavItem } from '../hub/HubSideNav';
import { RowActionsMenu } from '../participants/RowActionsMenu';

const PIGGY_TAGS = ['идея', 'мысль', 'вопрос', 'контакт', 'на будущее', 'в работу'];
const PIGGY_SOURCES = ['Направление', 'Урок о важном', 'Открытый урок', 'Клуб', 'Разговор с участником', 'Своя мысль'];
const PAGE_SIZE = 100;

const PIGGY_NAV: HubNavItem[] = [
  { id: 'piggy-hero', label: 'Обзор' },
  { id: 'piggy-list', label: 'Записи' },
  { id: 'piggy-detail', label: 'Карточка' },
];

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
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
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
    setSelectedIds([]);
  }, [search, participantId, debouncedParticipantQ, directionId, groupId, forumDay, tag, source, listMode]);

  useEffect(() => {
    setSelectedIds([]);
  }, [page, reloadKey]);

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
      'Отправить запись в архив и снять баллы? У участника запись останется с красной пометкой и минус-баллами (не пропадёт из копилки). В админке — вкладка «Удалённые копилки».',
    )) return;
    act(async () => {
      const res = await adminFetch(`/piggybank-entries/${id}`, { method: 'DELETE' });
      setOpenEntry(null);
      setSelectedIds(prev => prev.filter(x => x !== id));
      await load();
      return res?.pointsRevoked
        ? 'В архиве, баллы сняты — у участника запись с красной пометкой'
        : 'В архиве (баллы не найдены или уже сняты)';
    });
  };

  const toggleSelected = (id: number) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const allPageSelected = entries.length > 0 && entries.every(e => selectedIds.includes(e.id));
  const toggleSelectAllPage = () => {
    if (allPageSelected) {
      const pageIds = new Set(entries.map(e => e.id));
      setSelectedIds(prev => prev.filter(id => !pageIds.has(id)));
      return;
    }
    setSelectedIds(prev => [...new Set([...prev, ...entries.map(e => e.id)])]);
  };

  const bulkDeleteSelected = () => {
    if (!selectedIds.length) return;
    if (!confirmDelete(
      `Отправить в архив ${selectedIds.length} записей и снять баллы? У участников записи останутся с красной пометкой.`,
    )) return;
    act(async () => {
      const res = await adminFetch('/piggybank-entries/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds }),
      });
      setOpenEntry(null);
      setSelectedIds([]);
      await load();
      const failed = res?.failed?.length ?? 0;
      return failed
        ? `В архиве: ${res.deleted}, со снятием баллов: ${res.pointsRevoked}, ошибок: ${failed}`
        : `В архиве: ${res.deleted}${res.pointsRevoked ? `, баллов снято у ${res.pointsRevoked}` : ''}`;
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
    ? 'Архив удалённых записей. Баллы уже сняты; восстановление не возвращает баллы автоматически.'
    : 'Модерация записей участников. Удаление переносит в архив и снимает баллы.';

  const navItems = openEntry
    ? PIGGY_NAV
    : PIGGY_NAV.filter(i => i.id !== 'piggy-detail');

  return (
    <HubLensLayout className="adm-forum adm-kb" items={navItems} navLabel="Разделы копилки">
      <section id="piggy-hero" className="adm-forum-anchor">
        <AdminPageHero
          title={isDeletedList ? `Удалённые · ${listLabel}` : `Копилка · ${listLabel}`}
          hint={heroHint}
        >
          <div className="adm-forum-seg" style={{ marginBottom: 12 }}>
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
              Архив{deletedTotal > 0 ? ` · ${deletedTotal}` : ''}
            </button>
          </div>
          <div className="adm-kb-toolbar" style={{ marginBottom: 0 }}>
            <input
              className="adm-input adm-kb-search"
              placeholder="Поиск по тексту"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <input
              className="adm-input"
              placeholder="Участник (ФИО)"
              value={participantSearch}
              onChange={e => {
                const next = e.target.value;
                setParticipantSearch(next);
                if (participantId && next.trim() !== selectedParticipantLabel.trim()) {
                  setParticipantId('');
                  setSelectedParticipantLabel('');
                }
                if (!next.trim()) {
                  setParticipantId('');
                  setSelectedParticipantLabel('');
                }
              }}
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
            <select className="adm-input adm-kb-control-sm" value={forumDay} onChange={e => setForumDay(e.target.value)}>
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
              Экспорт XLSX
            </button>
          </div>
          {!isDeletedList && selectedIds.length > 0 && (
            <div className="adm-kb-bulk" style={{ marginTop: 12 }}>
              <span className="adm-kb-bulk-count">Выбрано: {selectedIds.length}</span>
              <button type="button" className="adm-btn adm-btn-danger adm-btn-sm" onClick={bulkDeleteSelected}>
                В архив
              </button>
              <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setSelectedIds([])}>
                Снять выбор
              </button>
            </div>
          )}
        </AdminPageHero>
      </section>

      <section id="piggy-list" className="adm-forum-anchor">
        <div className="card adm-forum-block adm-kb-panel">
          <div className="adm-kb-panel-head">
            <h3>{isDeletedList ? 'Архив записей' : 'Записи'}</h3>
            <p className="adm-kb-panel-sub">
              {isDeletedList
                ? 'Удалённые записи можно восстановить в копилку без возврата баллов.'
                : 'Откройте запись, пометьте нарушение или отправьте в архив.'}
            </p>
          </div>

          {loading ? (
            <p className="adm-muted">Загрузка…</p>
          ) : entries.length === 0 ? (
            <p className="adm-muted">Записей не найдено</p>
          ) : (
            <>
              {!isDeletedList && (
                <div className="adm-tasks-list-head">
                  <label className="adm-tasks-check">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAllPage}
                      title="Выбрать все на странице"
                    />
                    <span>Выбрать страницу</span>
                  </label>
                </div>
              )}
              <div className="adm-mod-list">
                {entries.map(e => {
                  const when = isDeletedList
                    ? (e.deletedAt ? new Date(e.deletedAt).toLocaleString('ru-RU') : '—')
                    : (e.createdAt ? new Date(e.createdAt).toLocaleString('ru-RU') : '—');
                  return (
                    <article
                      key={e.id}
                      className={`adm-mod-item${selectedIds.includes(e.id) ? ' is-selected' : ''}${isDeletedList ? ' is-archived' : ''}`}
                    >
                      <div className="adm-mod-item-row1">
                        <div className="adm-mod-item-main">
                          {!isDeletedList && (
                            <label className="adm-tasks-check" style={{ marginBottom: 6 }}>
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(e.id)}
                                onChange={() => toggleSelected(e.id)}
                              />
                              <span>Выбрать</span>
                            </label>
                          )}
                          <div className="adm-mod-item-title-line">
                            <button
                              type="button"
                              className="adm-tasks-title"
                              onClick={() => onOpenCard(e.participantId, 'piggybank')}
                            >
                              {e.participantName}
                            </button>
                            {e.isViolation ? <span className="adm-tasks-status is-bad">Нарушение</span> : null}
                            {e.isHidden ? <span className="adm-tasks-status">Скрыта</span> : null}
                            {e.forumDay != null ? <span className="adm-tasks-chip">День {e.forumDay}</span> : null}
                          </div>
                          <p className="adm-kb-panel-sub" style={{ marginTop: 4 }}>
                            {[when, e.directionName, e.source].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </div>
                      <p className="adm-mod-item-text">{truncate(e.text, 220)}</p>
                      {(e.tags || []).length > 0 && (
                        <div className="adm-mod-item-meta">
                          {(e.tags || []).map(t => (
                            <span key={t} className="adm-tasks-chip">{t}</span>
                          ))}
                        </div>
                      )}
                      <div className="adm-mod-item-actions">
                        <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setOpenEntry(e)}>
                          Открыть
                        </button>
                        <RowActionsMenu
                          actions={isDeletedList
                            ? [
                              { label: 'Восстановить в копилку', onClick: () => restoreEntry(e.id) },
                            ]
                            : [
                              {
                                label: e.isViolation ? 'Снять нарушение' : 'Пометить как нарушение',
                                onClick: () => patchEntry(e.id, { isViolation: !e.isViolation }),
                              },
                              {
                                label: e.isHidden ? 'Показать' : 'Скрыть',
                                onClick: () => patchEntry(e.id, { isHidden: !e.isHidden }),
                              },
                              { label: 'В архив (−баллы)', onClick: () => deleteEntry(e.id), danger: true },
                            ]}
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
              {totalPages > 1 && (
                <div className="adm-forum-toolbar" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="adm-btn adm-btn-secondary adm-btn-sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    Назад
                  </button>
                  <span className="adm-muted" style={{ fontSize: 12 }}>
                    Стр. {page} из {totalPages}
                  </span>
                  <button
                    type="button"
                    className="adm-btn adm-btn-secondary adm-btn-sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  >
                    Далее
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {openEntry && (
        <section id="piggy-detail" className="adm-forum-anchor">
          <div className="card adm-forum-block adm-kb-panel">
            <div className="adm-kb-panel-head" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h3>Запись #{openEntry.id}</h3>
                <p className="adm-kb-panel-sub">
                  {openEntry.participantName}
                  {' · создано '}
                  {openEntry.createdAt ? new Date(openEntry.createdAt).toLocaleString('ru-RU') : '—'}
                  {openEntry.deletedAt
                    ? ` · удалено ${new Date(openEntry.deletedAt).toLocaleString('ru-RU')}`
                    : ''}
                </p>
              </div>
              <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setOpenEntry(null)}>
                Закрыть
              </button>
            </div>
            <p className="adm-mod-item-text" style={{ marginTop: 0 }}>{openEntry.text}</p>
            <div className="adm-mod-item-meta">
              {(openEntry.tags || []).map(t => <span key={t} className="adm-tasks-chip">{t}</span>)}
              {openEntry.source ? <span className="adm-tasks-chip">{openEntry.source}</span> : null}
              {openEntry.pointsLogId ? <span className="adm-tasks-chip">points_log #{openEntry.pointsLogId}</span> : null}
            </div>
            {isDeletedList && (
              <div className="adm-mod-item-actions">
                <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={() => restoreEntry(openEntry.id)}>
                  Восстановить в копилку
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </HubLensLayout>
  );
}
