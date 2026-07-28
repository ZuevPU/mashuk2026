import { useCallback, useEffect, useState } from 'react';
import { label } from '../../labels/ru';
import type { AdminTabProps } from '../admin/types';
import { CONFIRMATION_METHOD_OPTIONS } from '../tasks/types';
import {
  taskSubmissionAnswerCell,
  teamBlocked,
  type TaskSubmissionRow,
} from '../tasks/taskSubmissionShared';

type Props = Pick<AdminTabProps, 'adminFetch' | 'act' | 'reloadKey'>;

export function TaskModerationQueue({ adminFetch, act, reloadKey }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TaskSubmissionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('pending,pending_team');
  const [taskFilter, setTaskFilter] = useState('');
  const [confirmationFilter, setConfirmationFilter] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rejectComment, setRejectComment] = useState<Record<number, string>>({});
  const [bulkRejectComment, setBulkRejectComment] = useState('Не принято');
  const [directions, setDirections] = useState<{ id: number; name: string }[]>([]);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [tasks, setTasks] = useState<{ id: number; title: string }[]>([]);

  const limit = 50;

  useEffect(() => {
    Promise.all([
      adminFetch('/directions'),
      adminFetch('/participants/groups'),
      adminFetch('/tasks'),
    ]).then(([d, g, t]) => {
      setDirections(d.directions || []);
      setGroups(g.groups || []);
      setTasks((t.tasks || []).map((x: { id: number; title: string }) => ({ id: x.id, title: x.title })));
    }).catch(() => {});
  }, [adminFetch]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        status: statusFilter,
        page: String(page),
        limit: String(limit),
        sortBy: 'submittedAt',
        sortDir: 'desc',
      });
      if (taskFilter) q.set('taskId', taskFilter);
      if (confirmationFilter) q.set('confirmationType', confirmationFilter);
      if (directionFilter) q.set('direction', directionFilter);
      if (groupFilter) q.set('groupId', groupFilter);
      const res = await adminFetch(`/task-submissions?${q.toString()}`);
      setRows(res.submissions || []);
      setTotal(res.totalCount ?? res.submissions?.length ?? 0);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, statusFilter, taskFilter, confirmationFilter, directionFilter, groupFilter, page]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const toggle = (id: number) => setSelected(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const moderate = (id: number, status: 'approved' | 'rejected') =>
    act(async () => {
      await adminFetch(`/task-submissions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          moderatorComment: status === 'rejected' ? (rejectComment[id] || 'Не принято') : undefined,
        }),
      });
      await load();
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
      await load();
    }, status === 'approved' ? `Одобрено: ${ids.length}` : `Отклонено: ${ids.length}`);
  };

  if (loading && rows.length === 0) return <p className="adm-muted">Загрузка заданий на проверке…</p>;

  return (
    <>
      <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <select className="adm-input" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="pending,pending_team">На проверке + команда</option>
          <option value="pending">Только pending</option>
          <option value="pending_team">Только pending_team</option>
        </select>
        <select className="adm-input" value={taskFilter} onChange={e => { setTaskFilter(e.target.value); setPage(1); }}>
          <option value="">Все задания</option>
          {tasks.map(t => <option key={t.id} value={String(t.id)}>{t.title}</option>)}
        </select>
        <select className="adm-input" value={confirmationFilter} onChange={e => { setConfirmationFilter(e.target.value); setPage(1); }}>
          <option value="">Способ подтверждения</option>
          {CONFIRMATION_METHOD_OPTIONS.map(m => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
        <select className="adm-input" value={directionFilter} onChange={e => { setDirectionFilter(e.target.value); setPage(1); }}>
          <option value="">Все направления</option>
          {directions.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
        <select className="adm-input" value={groupFilter} onChange={e => { setGroupFilter(e.target.value); setPage(1); }}>
          <option value="">Все группы</option>
          {groups.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
        </select>
        <span className="adm-muted">Всего: {total}</span>
      </div>
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
            <th>Участник</th>
            <th>Задание</th>
            <th>Ответ</th>
            <th>Статус</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} disabled={teamBlocked(r)} /></td>
              <td>{r.participantName || r.participantId}</td>
              <td>{r.taskTitle || '—'}</td>
              <td style={{ maxWidth: 220, fontSize: 12 }}>{taskSubmissionAnswerCell(r)}</td>
              <td>{label(r.status || 'pending')}</td>
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
        </tbody>
      </table>
      {total > limit && (
        <div className="adm-forum-toolbar" style={{ marginTop: 8 }}>
          <button type="button" className="adm-btn adm-btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Назад</button>
          <span className="adm-muted">Стр. {page}</span>
          <button type="button" className="adm-btn adm-btn-sm" disabled={page * limit >= total} onClick={() => setPage(p => p + 1)}>Далее</button>
        </div>
      )}
    </>
  );
}
