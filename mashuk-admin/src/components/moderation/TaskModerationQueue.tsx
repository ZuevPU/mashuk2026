import { useCallback, useEffect, useMemo, useState } from 'react';
import { label } from '../../labels/ru';
import type { AdminTabProps } from '../admin/types';
import { CONFIRMATION_METHOD_OPTIONS } from '../tasks/types';
import {
  taskSubmissionAnswerCell,
  submissionLifecycleCell,
  submissionMetaCell,
  taskDayLabel,
  teamBlocked,
  type TaskSubmissionRow,
} from '../tasks/taskSubmissionShared';

type Props = Pick<AdminTabProps, 'adminFetch' | 'act' | 'reloadKey'>;

type SortKey = 'submittedAt' | 'checkedAt' | 'participant' | 'task' | 'status' | 'points' | 'day';
type SortState = { key: SortKey; dir: 'asc' | 'desc' };

function sortMark(sort: SortState, key: SortKey): string {
  if (sort.key !== key) return ' ↕';
  return sort.dir === 'asc' ? ' ↑' : ' ↓';
}

function SortTh({
  label: text,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  return (
    <th>
      <button
        type="button"
        className="adm-link"
        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', fontWeight: 700 }}
        onClick={() => onSort(sortKey)}
      >
        {text}{sortMark(sort, sortKey)}
      </button>
    </th>
  );
}

export function TaskModerationQueue({ adminFetch, act, reloadKey }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TaskSubmissionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [reviewedLoading, setReviewedLoading] = useState(true);
  const [reviewedRows, setReviewedRows] = useState<TaskSubmissionRow[]>([]);
  const [reviewedTotal, setReviewedTotal] = useState(0);
  const [reviewedPage, setReviewedPage] = useState(1);
  const [reviewedOpen, setReviewedOpen] = useState(true);

  const [taskFilter, setTaskFilter] = useState('');
  const [confirmationFilter, setConfirmationFilter] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [dayFilter, setDayFilter] = useState('');
  const [reviewedDayFilter, setReviewedDayFilter] = useState('');
  const [reviewedStatusFilter, setReviewedStatusFilter] = useState('approved,rejected');

  const [sort, setSort] = useState<SortState>({ key: 'submittedAt', dir: 'desc' });
  const [reviewedSort, setReviewedSort] = useState<SortState>({ key: 'checkedAt', dir: 'desc' });

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rejectComment, setRejectComment] = useState<Record<number, string>>({});
  const [bulkRejectComment, setBulkRejectComment] = useState('Не принято');
  const [directions, setDirections] = useState<{ id: number; name: string }[]>([]);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [tasks, setTasks] = useState<{ id: number; title: string }[]>([]);
  const [totalDays, setTotalDays] = useState(8);

  const limit = 50;

  const dayOptions = useMemo(
    () => Array.from({ length: Math.max(1, totalDays) }, (_, i) => i + 1),
    [totalDays],
  );

  useEffect(() => {
    Promise.all([
      adminFetch('/directions'),
      adminFetch('/participants/groups'),
      adminFetch('/tasks'),
      adminFetch('/forum-settings').catch(() => ({ settings: {} })),
    ]).then(([d, g, t, fs]) => {
      setDirections(d.directions || []);
      setGroups(g.groups || []);
      setTasks((t.tasks || []).map((x: { id: number; title: string }) => ({ id: x.id, title: x.title })));
      setTotalDays(fs.settings?.totalDays ?? 8);
    }).catch(() => {});
  }, [adminFetch]);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        status: 'pending,pending_team',
        page: String(page),
        limit: String(limit),
        sortBy: sort.key,
        sortDir: sort.dir,
      });
      if (taskFilter) q.set('taskId', taskFilter);
      if (confirmationFilter) q.set('confirmationType', confirmationFilter);
      if (directionFilter) q.set('direction', directionFilter);
      if (groupFilter) q.set('groupId', groupFilter);
      if (dayFilter) q.set('day', dayFilter);
      const res = await adminFetch(`/task-submissions?${q.toString()}`);
      setRows(res.submissions || []);
      setTotal(res.totalCount ?? res.submissions?.length ?? 0);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, taskFilter, confirmationFilter, directionFilter, groupFilter, dayFilter, page, sort]);

  const loadReviewed = useCallback(async () => {
    setReviewedLoading(true);
    try {
      const q = new URLSearchParams({
        status: reviewedStatusFilter,
        verifiedByMe: '1',
        page: String(reviewedPage),
        limit: String(limit),
        sortBy: reviewedSort.key,
        sortDir: reviewedSort.dir,
      });
      if (taskFilter) q.set('taskId', taskFilter);
      if (confirmationFilter) q.set('confirmationType', confirmationFilter);
      if (directionFilter) q.set('direction', directionFilter);
      if (groupFilter) q.set('groupId', groupFilter);
      if (reviewedDayFilter) q.set('day', reviewedDayFilter);
      const res = await adminFetch(`/task-submissions?${q.toString()}`);
      setReviewedRows(res.submissions || []);
      setReviewedTotal(res.totalCount ?? res.submissions?.length ?? 0);
    } finally {
      setReviewedLoading(false);
    }
  }, [
    adminFetch, reviewedStatusFilter, reviewedPage, reviewedSort,
    taskFilter, confirmationFilter, directionFilter, groupFilter, reviewedDayFilter,
  ]);

  useEffect(() => {
    loadQueue().catch(() => setLoading(false));
  }, [loadQueue, reloadKey]);

  useEffect(() => {
    loadReviewed().catch(() => setReviewedLoading(false));
  }, [loadReviewed, reloadKey]);

  const toggleSort = (key: SortKey, target: 'queue' | 'reviewed') => {
    const setter = target === 'queue' ? setSort : setReviewedSort;
    const pageReset = target === 'queue' ? setPage : setReviewedPage;
    setter(prev => (
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'participant' || key === 'task' ? 'asc' : 'desc' }
    ));
    pageReset(1);
  };

  const toggle = (id: number) => setSelected(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const reloadBoth = async () => {
    await Promise.all([loadQueue(), loadReviewed()]);
  };

  const moderate = (id: number, status: 'approved' | 'rejected') =>
    act(async () => {
      await adminFetch(`/task-submissions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          moderatorComment: status === 'rejected' ? (rejectComment[id] || 'Не принято') : undefined,
        }),
      });
      await reloadBoth();
    }, status === 'approved' ? 'Одобрено' : 'Отклонено');

  const bulkModerate = (status: 'approved' | 'rejected') => {
    const ids = [...selected];
    if (!ids.length) return;
    act(async () => {
      await adminFetch('/task-submissions/bulk-moderate', {
        method: 'POST',
        body: JSON.stringify({
          ids,
          status,
          moderatorComment: status === 'rejected' ? (bulkRejectComment.trim() || 'Не принято') : undefined,
        }),
      });
      setSelected(new Set());
      await reloadBoth();
    }, status === 'approved' ? `Одобрено: ${ids.length}` : `Отклонено: ${ids.length}`);
  };

  if (loading && rows.length === 0 && reviewedLoading && reviewedRows.length === 0) {
    return <p className="adm-muted">Загрузка заданий на проверке…</p>;
  }

  return (
    <>
      <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <select className="adm-input" value={dayFilter} onChange={e => { setDayFilter(e.target.value); setPage(1); }}>
          <option value="">Все дни (очередь)</option>
          {dayOptions.map(d => <option key={d} value={String(d)}>День {d}</option>)}
        </select>
        <select className="adm-input" value={taskFilter} onChange={e => { setTaskFilter(e.target.value); setPage(1); setReviewedPage(1); }}>
          <option value="">Все задания</option>
          {tasks.map(t => <option key={t.id} value={String(t.id)}>{t.title}</option>)}
        </select>
        <select className="adm-input" value={confirmationFilter} onChange={e => { setConfirmationFilter(e.target.value); setPage(1); setReviewedPage(1); }}>
          <option value="">Способ подтверждения</option>
          {CONFIRMATION_METHOD_OPTIONS.map(m => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
        <select className="adm-input" value={directionFilter} onChange={e => { setDirectionFilter(e.target.value); setPage(1); setReviewedPage(1); }}>
          <option value="">Все направления</option>
          {directions.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
        <select className="adm-input" value={groupFilter} onChange={e => { setGroupFilter(e.target.value); setPage(1); setReviewedPage(1); }}>
          <option value="">Все группы</option>
          {groups.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
        </select>
        <span className="adm-muted">В очереди: {total}</span>
      </div>

      <div className="card adm-forum-block" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Очередь на проверку</h3>
        <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <input
            className="adm-input"
            placeholder="Комментарий для массового отклонения"
            value={bulkRejectComment}
            onChange={e => setBulkRejectComment(e.target.value)}
            style={{ minWidth: 220 }}
          />
          <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" disabled={selected.size === 0} onClick={() => bulkModerate('approved')}>
            Подтвердить выбранных ({selected.size})
          </button>
          <button type="button" className="adm-btn adm-btn-sm btn-danger" disabled={selected.size === 0} onClick={() => bulkModerate('rejected')}>
            Отклонить выбранных ({selected.size})
          </button>
        </div>
        <table className="adm-table">
          <thead>
            <tr>
              <th />
              <SortTh label="Участник" sortKey="participant" sort={sort} onSort={k => toggleSort(k, 'queue')} />
              <SortTh label="Задание" sortKey="task" sort={sort} onSort={k => toggleSort(k, 'queue')} />
              <SortTh label="День" sortKey="day" sort={sort} onSort={k => toggleSort(k, 'queue')} />
              <th>Ответ</th>
              <SortTh label="Статус" sortKey="status" sort={sort} onSort={k => toggleSort(k, 'queue')} />
              <th>Цепочка</th>
              <th>Тип</th>
              <SortTh label="Отправлено" sortKey="submittedAt" sort={sort} onSort={k => toggleSort(k, 'queue')} />
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} disabled={teamBlocked(r)} /></td>
                <td>{r.participantName || r.participantId}</td>
                <td>{r.taskTitle || '—'}</td>
                <td>{taskDayLabel(r)}</td>
                <td style={{ maxWidth: 220, fontSize: 12 }}>{taskSubmissionAnswerCell(r)}</td>
                <td>{label(r.status || 'pending')}</td>
                <td style={{ maxWidth: 200 }}>{submissionLifecycleCell(r)}</td>
                <td>{submissionMetaCell(r)}</td>
                <td style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
                  {r.submittedAt ? new Date(r.submittedAt).toLocaleString('ru-RU') : '—'}
                </td>
                <td>
                  <input
                    className="adm-input adm-input-narrow"
                    placeholder="Коммент. отклон."
                    value={rejectComment[r.id] || ''}
                    onChange={e => setRejectComment(prev => ({ ...prev, [r.id]: e.target.value }))}
                    style={{ maxWidth: 100, marginRight: 4 }}
                  />
                  <button type="button" className="adm-btn adm-btn-sm" disabled={teamBlocked(r)} onClick={() => moderate(r.id, 'approved')}>✓</button>
                  <button type="button" className="adm-btn adm-btn-sm btn-danger" disabled={teamBlocked(r)} onClick={() => moderate(r.id, 'rejected')}>✕</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={10} className="adm-muted">Нет заявок в очереди</td></tr>
            )}
          </tbody>
        </table>
        {total > limit && (
          <div className="adm-forum-toolbar" style={{ marginTop: 8 }}>
            <button type="button" className="adm-btn adm-btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Назад</button>
            <span className="adm-muted">Стр. {page}</span>
            <button type="button" className="adm-btn adm-btn-sm" disabled={page * limit >= total} onClick={() => setPage(p => p + 1)}>Далее</button>
          </div>
        )}
      </div>

      <div
        className="card adm-forum-block"
        style={{
          marginBottom: 16,
          border: '1px solid #C4D4C0',
          background: 'linear-gradient(180deg, #F3F8F2 0%, #fff 48px)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0 }}>Уже проверено мной</h3>
            <p className="adm-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
              Заявки, которые вы одобрили или отклонили в админке. Можно изменить решение.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                background: '#2D6A4F',
                color: '#fff',
                borderRadius: 999,
                padding: '4px 10px',
              }}
            >
              {reviewedTotal}
            </span>
            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setReviewedOpen(v => !v)}>
              {reviewedOpen ? 'Свернуть' : 'Развернуть'}
            </button>
          </div>
        </div>

        {reviewedOpen && (
          <>
            <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 12 }}>
              <select
                className="adm-input"
                value={reviewedDayFilter}
                onChange={e => { setReviewedDayFilter(e.target.value); setReviewedPage(1); }}
              >
                <option value="">Все дни</option>
                {dayOptions.map(d => <option key={d} value={String(d)}>День {d}</option>)}
              </select>
              <select
                className="adm-input"
                value={reviewedStatusFilter}
                onChange={e => { setReviewedStatusFilter(e.target.value); setReviewedPage(1); }}
              >
                <option value="approved,rejected">Одобрено и отклонено</option>
                <option value="approved">Только одобрено</option>
                <option value="rejected">Только отклонено</option>
              </select>
            </div>

            {reviewedLoading && reviewedRows.length === 0 ? (
              <p className="adm-muted">Загрузка проверенных…</p>
            ) : (
              <table className="adm-table">
                <thead>
                  <tr>
                    <SortTh label="Участник" sortKey="participant" sort={reviewedSort} onSort={k => toggleSort(k, 'reviewed')} />
                    <SortTh label="Задание" sortKey="task" sort={reviewedSort} onSort={k => toggleSort(k, 'reviewed')} />
                    <SortTh label="День" sortKey="day" sort={reviewedSort} onSort={k => toggleSort(k, 'reviewed')} />
                    <th>Ответ</th>
                    <SortTh label="Решение" sortKey="status" sort={reviewedSort} onSort={k => toggleSort(k, 'reviewed')} />
                    <SortTh label="Баллы" sortKey="points" sort={reviewedSort} onSort={k => toggleSort(k, 'reviewed')} />
                    <th>Комментарий</th>
                    <SortTh label="Проверено" sortKey="checkedAt" sort={reviewedSort} onSort={k => toggleSort(k, 'reviewed')} />
                    <th>Изменить решение</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewedRows.map(r => (
                    <tr key={r.id}>
                      <td>{r.participantName || r.participantId}</td>
                      <td>{r.taskTitle || '—'}</td>
                      <td>{taskDayLabel(r)}</td>
                      <td style={{ maxWidth: 220, fontSize: 12 }}>{taskSubmissionAnswerCell(r)}</td>
                      <td>
                        <span style={{ color: r.status === 'approved' ? '#2D6A4F' : '#C53030', fontWeight: 700 }}>
                          {label(r.status || '')}
                        </span>
                      </td>
                      <td>{r.pointsAwarded ?? 0}</td>
                      <td style={{ maxWidth: 180, fontSize: 12 }}>{r.moderatorComment || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
                        {(r.checkedAt || r.verifiedAt)
                          ? new Date(r.checkedAt || r.verifiedAt || '').toLocaleString('ru-RU')
                          : '—'}
                      </td>
                      <td>
                        <input
                          className="adm-input adm-input-narrow"
                          placeholder="Коммент."
                          value={rejectComment[r.id] ?? r.moderatorComment ?? ''}
                          onChange={e => setRejectComment(prev => ({ ...prev, [r.id]: e.target.value }))}
                          style={{ maxWidth: 120, marginRight: 4, marginBottom: 4 }}
                        />
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="adm-btn adm-btn-sm"
                            disabled={teamBlocked(r) || r.status === 'approved'}
                            onClick={() => moderate(r.id, 'approved')}
                            title="Одобрить заново"
                          >
                            Одобрить
                          </button>
                          <button
                            type="button"
                            className="adm-btn adm-btn-sm btn-danger"
                            disabled={teamBlocked(r)}
                            onClick={() => moderate(r.id, 'rejected')}
                            title={r.status === 'rejected' ? 'Обновить отклонение' : 'Отклонить'}
                          >
                            {r.status === 'rejected' ? 'Обновить ✕' : 'Отклонить'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {reviewedRows.length === 0 && (
                    <tr><td colSpan={9} className="adm-muted">Вы ещё не проверяли заявки в этой выборке</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {reviewedTotal > limit && (
              <div className="adm-forum-toolbar" style={{ marginTop: 8 }}>
                <button type="button" className="adm-btn adm-btn-sm" disabled={reviewedPage <= 1} onClick={() => setReviewedPage(p => p - 1)}>Назад</button>
                <span className="adm-muted">Стр. {reviewedPage}</span>
                <button type="button" className="adm-btn adm-btn-sm" disabled={reviewedPage * limit >= reviewedTotal} onClick={() => setReviewedPage(p => p + 1)}>Далее</button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
