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
  if (sort.key !== key) return '';
  return sort.dir === 'asc' ? ' ↑' : ' ↓';
}

function statusClass(status?: string | null): string {
  if (status === 'approved') return 'adm-tasks-status is-ok';
  if (status === 'rejected') return 'adm-tasks-status is-bad';
  return 'adm-tasks-status is-wait';
}

function SortBar({
  sort,
  keys,
  onSort,
}: {
  sort: SortState;
  keys: { key: SortKey; label: string }[];
  onSort: (key: SortKey) => void;
}) {
  return (
    <div className="adm-mod-sort" aria-label="Сортировка">
      <span className="adm-muted" style={{ fontSize: 12, marginRight: 4 }}>Сорт.</span>
      {keys.map(k => (
        <button
          key={k.key}
          type="button"
          className={sort.key === k.key ? 'on' : ''}
          onClick={() => onSort(k.key)}
        >
          {k.label}{sortMark(sort, k.key)}
        </button>
      ))}
    </div>
  );
}

function SubmissionCard({
  row,
  mode,
  selected,
  onToggle,
  rejectValue,
  onRejectChange,
  onApprove,
  onReject,
}: {
  row: TaskSubmissionRow;
  mode: 'queue' | 'reviewed';
  selected?: boolean;
  onToggle?: () => void;
  rejectValue: string;
  onRejectChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const blocked = teamBlocked(row);
  const when = mode === 'queue'
    ? (row.submittedAt ? new Date(row.submittedAt).toLocaleString('ru-RU') : '—')
    : ((row.checkedAt || row.verifiedAt)
      ? new Date(row.checkedAt || row.verifiedAt || '').toLocaleString('ru-RU')
      : '—');

  return (
    <article className={`adm-mod-item${selected ? ' is-selected' : ''}`}>
      <div className="adm-mod-item-row1">
        <div className="adm-mod-item-main">
          {mode === 'queue' && onToggle && (
            <label className="adm-tasks-check" style={{ marginBottom: 6 }}>
              <input type="checkbox" checked={!!selected} onChange={onToggle} disabled={blocked} />
              <span>Выбрать</span>
            </label>
          )}
          <div className="adm-mod-item-title-line">
            <strong>{row.participantName || `Участник #${row.participantId}`}</strong>
            <span className={statusClass(row.status)}>{label(row.status || 'pending')}</span>
          </div>
          <p className="adm-kb-panel-sub" style={{ marginTop: 4 }}>
            {[row.taskTitle || 'Задание', taskDayLabel(row), row.participantDirection, row.participantGroupName]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="adm-mod-item-kpis" aria-label="Мета">
          <span>
            <em>{mode === 'queue' ? 'Отправлено' : 'Проверено'}</em>
            {when}
          </span>
          {mode === 'reviewed' && (
            <span>
              <em>Баллы</em>
              {row.pointsAwarded ?? 0}
            </span>
          )}
        </div>
      </div>

      <div className="adm-mod-item-text">{taskSubmissionAnswerCell(row)}</div>

      <div className="adm-mod-item-meta">
        <div className="adm-mod-meta-block">{submissionMetaCell(row)}</div>
        <div className="adm-mod-meta-block">{submissionLifecycleCell(row)}</div>
      </div>

      {row.moderatorComment && mode === 'reviewed' && (
        <p className="adm-mod-reject-note" style={{ background: 'rgba(120,120,128,0.08)', color: 'var(--m-text)' }}>
          Комментарий: {row.moderatorComment}
        </p>
      )}

      <div className="adm-mod-item-actions">
        <input
          className="adm-input"
          placeholder={mode === 'queue' ? 'Комментарий при отклонении' : 'Комментарий'}
          value={rejectValue}
          onChange={e => onRejectChange(e.target.value)}
          style={{ flex: '1 1 180px', minWidth: 140, maxWidth: 320 }}
        />
        <button
          type="button"
          className="adm-btn adm-btn-primary adm-btn-sm"
          disabled={blocked || (mode === 'reviewed' && row.status === 'approved')}
          onClick={onApprove}
        >
          Одобрить
        </button>
        <button
          type="button"
          className="adm-btn adm-btn-danger adm-btn-sm"
          disabled={blocked}
          onClick={onReject}
        >
          {mode === 'reviewed' && row.status === 'rejected' ? 'Обновить ✕' : 'Отклонить'}
        </button>
      </div>
    </article>
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

  const reloadBoth = async () => {
    await Promise.all([loadQueue(), loadReviewed()]);
  };

  const toggleSort = (key: SortKey, target: 'queue' | 'reviewed') => {
    const setter = target === 'queue' ? setSort : setReviewedSort;
    setter(prev => (
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'participant' || key === 'task' ? 'asc' : 'desc' }
    ));
    if (target === 'queue') setPage(1);
    else setReviewedPage(1);
  };

  const toggle = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      <div className="adm-mod-filters">
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
        <span className="adm-muted" style={{ fontSize: 12 }}>В очереди: {total}</span>
      </div>

      <section id="mod-tasks-queue" className="adm-forum-anchor">
        <div className="card adm-forum-block adm-kb-panel">
          <div className="adm-kb-panel-head">
            <h3>Очередь на проверку</h3>
            <p className="adm-kb-panel-sub">Одобрите или отклоните ответы участников. Можно массово.</p>
          </div>

          {selected.size > 0 && (
            <div className="adm-kb-bulk" style={{ marginTop: 0, marginBottom: 12 }}>
              <span className="adm-kb-bulk-count">Выбрано: {selected.size}</span>
              <input
                className="adm-input"
                placeholder="Комментарий для массового отклонения"
                value={bulkRejectComment}
                onChange={e => setBulkRejectComment(e.target.value)}
                style={{ minWidth: 200, flex: '1 1 200px' }}
              />
              <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={() => bulkModerate('approved')}>
                Подтвердить
              </button>
              <button type="button" className="adm-btn adm-btn-danger adm-btn-sm" onClick={() => bulkModerate('rejected')}>
                Отклонить
              </button>
            </div>
          )}

          <SortBar
            sort={sort}
            onSort={k => toggleSort(k, 'queue')}
            keys={[
              { key: 'submittedAt', label: 'Время' },
              { key: 'participant', label: 'Участник' },
              { key: 'task', label: 'Задание' },
              { key: 'day', label: 'День' },
              { key: 'status', label: 'Статус' },
            ]}
          />

          <div className="adm-mod-list" style={{ marginTop: 10 }}>
            {rows.map(r => (
              <SubmissionCard
                key={r.id}
                row={r}
                mode="queue"
                selected={selected.has(r.id)}
                onToggle={() => toggle(r.id)}
                rejectValue={rejectComment[r.id] || ''}
                onRejectChange={value => setRejectComment(prev => ({ ...prev, [r.id]: value }))}
                onApprove={() => moderate(r.id, 'approved')}
                onReject={() => moderate(r.id, 'rejected')}
              />
            ))}
            {rows.length === 0 && <p className="adm-muted">Нет заявок в очереди</p>}
          </div>

          {total > limit && (
            <div className="adm-forum-toolbar" style={{ marginTop: 12 }}>
              <button type="button" className="adm-btn adm-btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Назад</button>
              <span className="adm-muted">Стр. {page}</span>
              <button type="button" className="adm-btn adm-btn-sm" disabled={page * limit >= total} onClick={() => setPage(p => p + 1)}>Далее</button>
            </div>
          )}
        </div>
      </section>

      <section id="mod-tasks-done" className="adm-forum-anchor">
        <div className="card adm-forum-block adm-kb-panel">
          <div className="adm-kb-panel-head" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <h3>Проверено мной · {reviewedTotal}</h3>
              <p className="adm-kb-panel-sub">Можно изменить решение по заявкам, которые вы уже проверили.</p>
            </div>
            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setReviewedOpen(v => !v)}>
              {reviewedOpen ? 'Свернуть' : 'Развернуть'}
            </button>
          </div>

          {reviewedOpen && (
            <>
              <div className="adm-mod-filters" style={{ marginTop: 4 }}>
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

              <SortBar
                sort={reviewedSort}
                onSort={k => toggleSort(k, 'reviewed')}
                keys={[
                  { key: 'checkedAt', label: 'Проверено' },
                  { key: 'participant', label: 'Участник' },
                  { key: 'task', label: 'Задание' },
                  { key: 'day', label: 'День' },
                  { key: 'status', label: 'Решение' },
                  { key: 'points', label: 'Баллы' },
                ]}
              />

              {reviewedLoading && reviewedRows.length === 0 ? (
                <p className="adm-muted" style={{ marginTop: 10 }}>Загрузка проверенных…</p>
              ) : (
                <div className="adm-mod-list" style={{ marginTop: 10 }}>
                  {reviewedRows.map(r => (
                    <SubmissionCard
                      key={r.id}
                      row={r}
                      mode="reviewed"
                      rejectValue={rejectComment[r.id] ?? r.moderatorComment ?? ''}
                      onRejectChange={value => setRejectComment(prev => ({ ...prev, [r.id]: value }))}
                      onApprove={() => moderate(r.id, 'approved')}
                      onReject={() => moderate(r.id, 'rejected')}
                    />
                  ))}
                  {reviewedRows.length === 0 && (
                    <p className="adm-muted">Вы ещё не проверяли заявки в этой выборке</p>
                  )}
                </div>
              )}

              {reviewedTotal > limit && (
                <div className="adm-forum-toolbar" style={{ marginTop: 12 }}>
                  <button type="button" className="adm-btn adm-btn-sm" disabled={reviewedPage <= 1} onClick={() => setReviewedPage(p => p - 1)}>Назад</button>
                  <span className="adm-muted">Стр. {reviewedPage}</span>
                  <button type="button" className="adm-btn adm-btn-sm" disabled={reviewedPage * limit >= reviewedTotal} onClick={() => setReviewedPage(p => p + 1)}>Далее</button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}
