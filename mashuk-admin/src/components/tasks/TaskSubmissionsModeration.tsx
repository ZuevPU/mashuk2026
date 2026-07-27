import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { label } from '../../labels/ru';
import type { AdminTabProps } from '../admin/types';

export type TaskSubmissionRow = {
  id: number;
  participantId: number;
  participantName?: string;
  taskId: number;
  taskTitle?: string;
  status: string;
  answerText?: string | null;
  photoUrl?: string | null;
  postUrl?: string | null;
  pointsAwarded?: number | null;
  submittedAt?: string | null;
  moderatorComment?: string | null;
  teamConfirmations?: { participantId: number; name: string; status: string }[];
};

type SortKey = 'submittedAt' | 'participant' | 'status' | 'points';

type Props = Pick<AdminTabProps, 'adminFetch' | 'act'> & {
  taskId: number;
  taskTitle: string;
  onClose: () => void;
};

function answerCell(row: TaskSubmissionRow) {
  const parts: ReactNode[] = [];
  if (row.answerText?.trim()) {
    parts.push(<div key="t">{row.answerText}</div>);
  }
  if (row.postUrl) {
    parts.push(
      <div key="p">
        <a href={row.postUrl} target="_blank" rel="noreferrer">Ссылка на пост</a>
      </div>,
    );
  }
  if (row.photoUrl) {
    parts.push(
      <div key="ph">
        <a href={row.photoUrl} target="_blank" rel="noreferrer">Фото</a>
        {' · '}
        <img src={row.photoUrl} alt="" style={{ maxWidth: 80, maxHeight: 60, verticalAlign: 'middle', marginLeft: 4 }} />
      </div>,
    );
  }
  if (parts.length === 0) return <span className="adm-muted">—</span>;
  return <>{parts}</>;
}

export function TaskSubmissionsModeration({ taskId, taskTitle, adminFetch, act, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TaskSubmissionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [participantFilter, setParticipantFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('submittedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [rejectComment, setRejectComment] = useState<Record<number, string>>({});
  const [participantOptions, setParticipantOptions] = useState<[number, string][]>([]);

  const limit = 100;

  useEffect(() => {
    adminFetch('/participants?limit=100')
      .then((res: { participants?: { id: number; firstName?: string; lastName?: string }[] }) => {
        const list = (res.participants || []).map(p => [
          p.id,
          `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || `#${p.id}`,
        ] as [number, string]);
        list.sort((a, b) => a[1].localeCompare(b[1], 'ru'));
        setParticipantOptions(list);
      })
      .catch(() => {});
  }, [adminFetch]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        taskId: String(taskId),
        page: String(page),
        limit: String(limit),
        sortBy,
        sortDir,
      });
      if (statusFilter) q.set('status', statusFilter);
      if (participantFilter) q.set('participantId', participantFilter);
      const res = await adminFetch(`/task-submissions?${q.toString()}`) as {
        submissions: TaskSubmissionRow[];
        totalCount: number;
      };
      setRows(res.submissions || []);
      setTotal(res.totalCount || 0);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, taskId, page, statusFilter, participantFilter, sortBy, sortDir]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(key);
      setSortDir(key === 'participant' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const sortMark = (key: SortKey) => (sortBy === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

  const moderate = (id: number, status: 'approved' | 'rejected', teamBlocked?: boolean) => {
    if (status === 'approved' && teamBlocked) return;
    act(async () => {
      await adminFetch(`/task-submissions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          moderatorComment: status === 'rejected' ? (rejectComment[id] || 'Не принято') : undefined,
        }),
      });
      await load();
    }, status === 'approved' ? 'Принято' : 'Отклонено');
  };

  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="adm-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card adm-task-moderation-panel"
        role="dialog"
        aria-labelledby="task-mod-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="adm-forum-toolbar" style={{ marginBottom: 12 }}>
          <div>
            <h2 id="task-mod-title" style={{ margin: 0, fontSize: 18 }}>Модерация ответов</h2>
            <p className="adm-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>{taskTitle} · id {taskId}</p>
          </div>
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={onClose}>Закрыть</button>
        </div>

        <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <select
            className="adm-input"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            aria-label="Фильтр по статусу"
          >
            <option value="">Все статусы</option>
            <option value="pending">На проверке</option>
            <option value="pending_team">Ожидает команду</option>
            <option value="approved">Принято</option>
            <option value="rejected">Отклонено</option>
            <option value="expired">Истекло</option>
          </select>
          <select
            className="adm-input"
            value={participantFilter}
            onChange={e => { setParticipantFilter(e.target.value); setPage(1); }}
            aria-label="Фильтр по участнику"
            style={{ minWidth: 180 }}
          >
            <option value="">Все участники</option>
            {participantOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
          <span className="adm-muted" style={{ fontSize: 12 }}>Всего: {total}</span>
        </div>

        {loading ? (
          <p className="adm-muted">Загрузка…</p>
        ) : rows.length === 0 ? (
          <p className="adm-muted">Пока нет ответов по этому заданию</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" className="adm-link" onClick={() => toggleSort('participant')}>
                      Участник{sortMark('participant')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="adm-link" onClick={() => toggleSort('status')}>
                      Статус{sortMark('status')}
                    </button>
                  </th>
                  <th>Ответ</th>
                  <th>
                    <button type="button" className="adm-link" onClick={() => toggleSort('points')}>
                      XP{sortMark('points')}
                    </button>
                  </th>
                  <th>Команда</th>
                  <th>
                    <button type="button" className="adm-link" onClick={() => toggleSort('submittedAt')}>
                      Дата{sortMark('submittedAt')}
                    </button>
                  </th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(s => {
                  const teamBlocked = (s.teamConfirmations?.length ?? 0) > 0
                    && !s.teamConfirmations!.every(c => c.status === 'confirmed');
                  return (
                    <tr key={s.id}>
                      <td>{s.participantName || `#${s.participantId}`}</td>
                      <td>{label(s.status)}</td>
                      <td style={{ maxWidth: 280 }}>{answerCell(s)}</td>
                      <td>{s.pointsAwarded ?? '—'}</td>
                      <td style={{ fontSize: 11 }}>
                        {s.teamConfirmations?.length
                          ? s.teamConfirmations.map(c => (
                            <div key={c.participantId}>{c.name} ({label(c.status)})</div>
                          ))
                          : '—'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                        {s.submittedAt ? new Date(s.submittedAt).toLocaleString('ru-RU') : '—'}
                      </td>
                      <td>
                        {(s.status === 'pending' || s.status === 'pending_team') && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
                            <input
                              className="adm-input"
                              style={{ fontSize: 11 }}
                              value={rejectComment[s.id] || ''}
                              onChange={e => setRejectComment({ ...rejectComment, [s.id]: e.target.value })}
                              placeholder="Коммент. при отклонении"
                            />
                            <div className="form-row" style={{ gap: 4 }}>
                              <button
                                type="button"
                                className="adm-btn adm-btn-sm"
                                disabled={teamBlocked}
                                title={teamBlocked ? 'Дождитесь подтверждения команды' : undefined}
                                onClick={() => moderate(s.id, 'approved', teamBlocked)}
                              >
                                Принять
                              </button>
                              <button
                                type="button"
                                className="adm-btn adm-btn-sm btn-danger"
                                onClick={() => moderate(s.id, 'rejected')}
                              >
                                Отклонить
                              </button>
                            </div>
                          </div>
                        )}
                        {s.moderatorComment && s.status === 'rejected' && (
                          <span style={{ fontSize: 11, color: '#C53030' }}>{s.moderatorComment}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pageCount > 1 && (
          <div className="form-row" style={{ marginTop: 12 }}>
            <button type="button" className="adm-btn adm-btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Назад</button>
            <span className="adm-muted" style={{ fontSize: 12 }}>{page} / {pageCount}</span>
            <button type="button" className="adm-btn adm-btn-sm" disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>Вперёд</button>
          </div>
        )}
      </div>
    </div>
  );
}
