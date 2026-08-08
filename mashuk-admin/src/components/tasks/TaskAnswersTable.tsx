import { useCallback, useEffect, useMemo, useState } from 'react';
import { label } from '../../labels/ru';
import type { AdminTabProps } from '../admin/types';
import {
  teamBlocked,
  type TaskSubmissionRow,
} from './taskSubmissionShared';

type Props = Pick<AdminTabProps, 'adminFetch' | 'act'> & {
  taskId: number;
  taskTitle: string;
};

type RowDraft = {
  answerText: string;
  postUrl: string;
  photoUrl: string;
  status: string;
  moderatorComment: string;
};

function draftFromRow(s: TaskSubmissionRow): RowDraft {
  return {
    answerText: s.answerText ?? '',
    postUrl: s.postUrl ?? '',
    photoUrl: s.photoUrl ?? '',
    status: s.status,
    moderatorComment: s.moderatorComment ?? '',
  };
}

function isDirty(s: TaskSubmissionRow, d: RowDraft): boolean {
  return (
    (s.answerText ?? '') !== d.answerText
    || (s.postUrl ?? '') !== d.postUrl
    || (s.photoUrl ?? '') !== d.photoUrl
    || s.status !== d.status
    || (s.moderatorComment ?? '') !== d.moderatorComment
  );
}

export function TaskAnswersTable({ taskId, taskTitle, adminFetch, act }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TaskSubmissionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({});
  const limit = 100;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        taskId: String(taskId),
        page: String(page),
        limit: String(limit),
        sortBy: 'submittedAt',
        sortDir: 'desc',
      });
      if (statusFilter) q.set('status', statusFilter);
      const res = await adminFetch(`/task-submissions?${q.toString()}`) as {
        submissions: TaskSubmissionRow[];
        totalCount: number;
      };
      const list = res.submissions || [];
      setRows(list);
      setTotal(res.totalCount || 0);
      setDrafts(prev => {
        const next: Record<number, RowDraft> = {};
        for (const s of list) {
          const existing = prev[s.id];
          next[s.id] = existing && isDirty(s, existing) ? existing : draftFromRow(s);
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, [adminFetch, taskId, page, statusFilter]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  const patchDraft = (id: number, patch: Partial<RowDraft>) => {
    setDrafts(prev => {
      const base = prev[id] ?? (() => {
        const row = rows.find(r => r.id === id);
        return row ? draftFromRow(row) : {
          answerText: '',
          postUrl: '',
          photoUrl: '',
          status: 'pending',
          moderatorComment: '',
        };
      })();
      return { ...prev, [id]: { ...base, ...patch } };
    });
  };

  const saveRow = (s: TaskSubmissionRow) => {
    const d = drafts[s.id] ?? draftFromRow(s);
    if (!isDirty(s, d)) return;
    const statusChanging = d.status !== s.status;
    if (statusChanging && d.status !== 'approved' && d.status !== 'rejected') {
      window.alert('Статус можно менять только на «Принято» или «Отклонено»');
      return;
    }
    if (statusChanging && d.status === 'approved' && teamBlocked(s)) {
      window.alert('Дождитесь подтверждения команды');
      return;
    }
    act(async () => {
      const body: Record<string, unknown> = {
        answerText: d.answerText,
        postUrl: d.postUrl,
        photoUrl: d.photoUrl,
        moderatorComment: d.moderatorComment || null,
      };
      if (statusChanging) body.status = d.status;
      await adminFetch(`/task-submissions/${s.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      await load();
    }, 'Ответ сохранён');
  };

  const pageCount = Math.max(1, Math.ceil(total / limit));
  const dirtyCount = useMemo(
    () => rows.filter(s => isDirty(s, drafts[s.id] ?? draftFromRow(s))).length,
    [rows, drafts],
  );

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="adm-forum-toolbar" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Участники и ответы</h2>
          <p className="adm-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
            {taskTitle} · id {taskId}. Редактируйте поля в таблице и нажмите «Сохранить» в строке.
            {dirtyCount > 0 ? ` · несохранено: ${dirtyCount}` : ''}
          </p>
        </div>
        <div className="form-row" style={{ gap: 8 }}>
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
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => load()}>
            Обновить
          </button>
        </div>
      </div>

      {loading ? (
        <p className="adm-muted">Загрузка ответов…</p>
      ) : rows.length === 0 ? (
        <p className="adm-muted">Пока нет ответов по этому заданию</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Участник</th>
                <th>Статус</th>
                <th>Текст ответа</th>
                <th>Ссылка</th>
                <th>Фото (URL)</th>
                <th>Коммент. модератора</th>
                <th>XP</th>
                <th>Дата</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(s => {
                const d = drafts[s.id] ?? draftFromRow(s);
                const dirty = isDirty(s, d);
                const blocked = teamBlocked(s);
                return (
                  <tr key={s.id} className={dirty ? 'adm-speakers-table-dirty' : undefined}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div>{s.participantName || `#${s.participantId}`}</div>
                      <div className="adm-muted" style={{ fontSize: 11 }}>#{s.participantId}</div>
                    </td>
                    <td>
                      <select
                        className="adm-input adm-input-sm"
                        value={d.status}
                        onChange={e => patchDraft(s.id, { status: e.target.value })}
                        style={{ minWidth: 130 }}
                      >
                        <option value={s.status}>{label(s.status)}</option>
                        {s.status !== 'approved' && <option value="approved">→ Принято</option>}
                        {s.status !== 'rejected' && <option value="rejected">→ Отклонено</option>}
                      </select>
                      {blocked && d.status === 'approved' && d.status !== s.status && (
                        <div className="adm-muted" style={{ fontSize: 10, marginTop: 4 }}>нужно подтверждение команды</div>
                      )}
                    </td>
                    <td style={{ minWidth: 180 }}>
                      <textarea
                        className="adm-input adm-input-sm"
                        rows={2}
                        value={d.answerText}
                        onChange={e => patchDraft(s.id, { answerText: e.target.value })}
                      />
                    </td>
                    <td style={{ minWidth: 160 }}>
                      <input
                        className="adm-input adm-input-sm"
                        value={d.postUrl}
                        onChange={e => patchDraft(s.id, { postUrl: e.target.value })}
                        placeholder="https://…"
                      />
                    </td>
                    <td style={{ minWidth: 160 }}>
                      <input
                        className="adm-input adm-input-sm"
                        value={d.photoUrl}
                        onChange={e => patchDraft(s.id, { photoUrl: e.target.value })}
                        placeholder="/uploads/…"
                      />
                      {d.photoUrl ? (
                        <div style={{ marginTop: 4 }}>
                          <img src={d.photoUrl} alt="" style={{ maxWidth: 72, maxHeight: 48 }} />
                        </div>
                      ) : null}
                    </td>
                    <td style={{ minWidth: 140 }}>
                      <input
                        className="adm-input adm-input-sm"
                        value={d.moderatorComment}
                        onChange={e => patchDraft(s.id, { moderatorComment: e.target.value })}
                        placeholder="Комментарий"
                      />
                    </td>
                    <td>{s.pointsAwarded ?? '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                      {s.submittedAt ? new Date(s.submittedAt).toLocaleString('ru-RU') : '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="adm-btn adm-btn-primary adm-btn-sm"
                        disabled={!dirty || (d.status === 'approved' && blocked && d.status !== s.status)}
                        onClick={() => saveRow(s)}
                      >
                        Сохранить
                      </button>
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
          <span className="adm-muted" style={{ fontSize: 12 }}>{page} / {pageCount} · всего {total}</span>
          <button type="button" className="adm-btn adm-btn-sm" disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>Вперёд</button>
        </div>
      )}
    </div>
  );
}
