import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminDownloadBinary } from '../../admin/client';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';
import { RowActionsMenu } from '../participants/RowActionsMenu';

const PIGGY_TAGS = ['идея', 'мысль', 'вопрос', 'контакт', 'на будущее', 'в работу'];
const PIGGY_SOURCES = ['Направление', 'Урок о важном', 'Открытый урок', 'Клуб', 'Разговор с участником', 'Своя мысль'];

type Entry = {
  id: number;
  createdAt: string;
  participantId: number;
  participantName: string;
  directionName: string | null;
  text: string;
  tags: string[];
  source: string | null;
  forumDay: number | null;
  isHidden: boolean | null;
  isViolation: boolean | null;
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
  const [search, setSearch] = useState('');
  const [participantId, setParticipantId] = useState('');
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

  const filters = useMemo(() => ({
    q: search.trim(),
    participantId: participantId ? Number(participantId) : undefined,
    directionId: directionId ? Number(directionId) : undefined,
    groupId: groupId ? Number(groupId) : undefined,
    forumDay: forumDay ? Number(forumDay) : undefined,
    tag,
    source,
    limit: 100,
  }), [search, participantId, directionId, groupId, forumDay, tag, source]);

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
    } finally {
      setLoading(false);
    }
  }, [adminFetch, filters]);

  useEffect(() => {
    loadMeta().catch(() => {});
  }, [loadMeta, reloadKey]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const searchParticipants = (q: string) => {
    if (!q.trim()) {
      setParticipantOptions([]);
      return;
    }
    adminFetch(`/participants?q=${encodeURIComponent(q.trim())}&limit=15`)
      .then(res => {
        const list = res.participants || [];
        setParticipantOptions(list.map((p: { id: number; firstName?: string; lastName?: string; vkId?: string }) => ({
          id: p.id,
          label: [p.firstName, p.lastName].filter(Boolean).join(' ') || String(p.vkId),
        })));
      })
      .catch(() => setParticipantOptions([]));
  };

  const patchEntry = (id: number, body: Record<string, boolean>) =>
    act(async () => {
      await adminFetch(`/piggybank-entries/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      await load();
    }, 'Сохранено');

  const deleteEntry = (id: number) =>
    act(async () => {
      await adminFetch(`/piggybank-entries/${id}`, { method: 'DELETE' });
      setOpenEntry(null);
      await load();
    }, 'Запись удалена');

  const exportXlsx = () => {
    const sp = buildQuery({ ...filters, format: 'xlsx' });
    act(() => adminDownloadBinary(`/exports/piggybank?${sp}`, 'piggybank.xlsx'), 'Экспорт');
  };

  return (
    <div className="adm-forum">
      <AdminPageHero title={`Записи копилки · ${totalCount} всего`} hint="Модерация записей участников. Удаление логируется в журнале.">
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
            placeholder="Участник (поиск)"
            onChange={e => searchParticipants(e.target.value)}
            list="piggy-participants"
            style={{ minWidth: 140 }}
          />
          <datalist id="piggy-participants">
            {participantOptions.map(p => (
              <option key={p.id} value={p.label} onClick={() => setParticipantId(String(p.id))} />
            ))}
          </datalist>
          <select className="adm-input" value={participantId} onChange={e => setParticipantId(e.target.value)}>
            <option value="">Участник ID</option>
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
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => load()}>
            Применить
          </button>
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
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Дата</th>
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
                  <tr key={e.id}>
                    <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                      {e.createdAt ? new Date(e.createdAt).toLocaleString('ru-RU') : '—'}
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
                        actions={[
                          { label: 'Открыть', onClick: () => setOpenEntry(e) },
                          {
                            label: e.isViolation ? 'Снять нарушение' : 'Пометить как нарушение',
                            onClick: () => patchEntry(e.id, { isViolation: !e.isViolation }),
                          },
                          {
                            label: e.isHidden ? 'Показать' : 'Скрыть',
                            onClick: () => patchEntry(e.id, { isHidden: !e.isHidden }),
                          },
                          { label: 'Удалить (лог)', onClick: () => deleteEntry(e.id), danger: true },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            {openEntry.participantName} · {openEntry.createdAt ? new Date(openEntry.createdAt).toLocaleString('ru-RU') : ''}
          </p>
          <p style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{openEntry.text}</p>
          <p className="adm-muted" style={{ fontSize: 11, marginTop: 8 }}>
            Теги: {(openEntry.tags || []).join(', ') || '—'} · Источник: {openEntry.source || '—'}
          </p>
        </div>
      )}
    </div>
  );
}
