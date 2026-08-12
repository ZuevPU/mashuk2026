import { useCallback, useEffect, useMemo, useState } from 'react';
import { confirmDelete } from '../../admin/confirmDelete';

type OrgMessage = {
  id: number;
  senderType?: string | null;
  text: string;
  createdAt?: string | null;
};

export type OrgThread = {
  id: number;
  participantId?: number;
  participantName?: string | null;
  direction?: string | null;
  groupName?: string | null;
  subject?: string | null;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  messages?: OrgMessage[];
};

type StatusFilter = 'all' | 'waiting' | 'answered';
type SortKey = 'id' | 'participant' | 'direction' | 'subject' | 'question' | 'status' | 'createdAt' | 'updatedAt' | 'messages';
type SortState = { key: SortKey; dir: 'asc' | 'desc' };

type Props = {
  adminFetch: (path: string, opts?: RequestInit) => Promise<any>;
  act: (fn: () => Promise<unknown>, msg?: string) => void;
  reloadKey: number;
  search?: string;
  onOpenCard?: (id: number) => void;
};

function sortMark(sort: SortState, key: SortKey): string {
  if (sort.key !== key) return ' ↕';
  return sort.dir === 'asc' ? ' ↑' : ' ↓';
}

function formatWhen(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU');
}

function statusLabel(status?: string | null): string {
  if (status === 'answered') return 'Отвечено';
  if (status === 'closed') return 'Закрыто';
  return 'Ожидает ответа';
}

function statusColor(status?: string | null): string {
  if (status === 'answered') return '#2F855A';
  if (status === 'closed') return '#718096';
  return '#B8621A';
}

function firstParticipantQuestion(thread: OrgThread): string {
  const msg = (thread.messages || []).find(m => m.senderType === 'participant');
  return (msg?.text || '').trim();
}

function clip(text: string, max = 140): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
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

export function OrgDirectorPanel({ adminFetch, act, reloadKey, search = '', onOpenCard }: Props) {
  const [threads, setThreads] = useState<OrgThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortState>({ key: 'updatedAt', dir: 'desc' });
  const [replyDraft, setReplyDraft] = useState<Record<number, string>>({});
  const [modalId, setModalId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch('/org/threads');
      setThreads((res.threads || []) as OrgThread[]);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const toggleSort = (key: SortKey) => {
    setSort(prev => (prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'createdAt' || key === 'updatedAt' || key === 'id' || key === 'messages' ? 'desc' : 'asc' }));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = threads;
    if (statusFilter !== 'all') {
      rows = rows.filter(t => (t.status || 'waiting') === statusFilter);
    }
    if (q) {
      rows = rows.filter(t => {
        const question = firstParticipantQuestion(t).toLowerCase();
        const hay = [
          String(t.id),
          t.participantName || '',
          t.direction || '',
          t.groupName || '',
          t.subject || '',
          question,
          ...(t.messages || []).map(m => m.text || ''),
        ].join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    const sorted = [...rows];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sort.key === 'id') cmp = a.id - b.id;
      else if (sort.key === 'participant') cmp = String(a.participantName || '').localeCompare(String(b.participantName || ''), 'ru');
      else if (sort.key === 'direction') cmp = String(a.direction || a.groupName || '').localeCompare(String(b.direction || b.groupName || ''), 'ru');
      else if (sort.key === 'subject') cmp = String(a.subject || '').localeCompare(String(b.subject || ''), 'ru');
      else if (sort.key === 'question') cmp = firstParticipantQuestion(a).localeCompare(firstParticipantQuestion(b), 'ru');
      else if (sort.key === 'status') cmp = statusLabel(a.status).localeCompare(statusLabel(b.status), 'ru');
      else if (sort.key === 'messages') cmp = (a.messages?.length || 0) - (b.messages?.length || 0);
      else if (sort.key === 'createdAt') cmp = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      else cmp = new Date(a.updatedAt || 0).getTime() - new Date(b.updatedAt || 0).getTime();
      if (cmp === 0) cmp = a.id - b.id;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [threads, statusFilter, search, sort]);

  const modalThread = modalId != null ? threads.find(t => t.id === modalId) || null : null;

  const sendReply = (threadId: number, closeModal = false) => {
    const text = (replyDraft[threadId] || '').trim();
    if (!text) {
      alert('Введите текст ответа');
      return;
    }
    act(async () => {
      await adminFetch(`/org/threads/${threadId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ text, sendPush: true }),
      });
      setReplyDraft(prev => ({ ...prev, [threadId]: '' }));
      if (closeModal) setModalId(null);
      await load();
    }, 'Ответ отправлен, участник уведомлён');
  };

  const deleteThread = (threadId: number) => {
    if (!confirmDelete('Удалить обращение целиком? Сообщения тоже будут удалены. Действие необратимо.')) return;
    act(async () => {
      await adminFetch(`/org/threads/${threadId}`, { method: 'DELETE' });
      if (modalId === threadId) setModalId(null);
      await load();
    }, 'Обращение удалено');
  };

  const replyBlock = (thread: OrgThread, compact = false) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: compact ? 220 : 280 }}>
      <textarea
        className="adm-input"
        rows={compact ? 2 : 3}
        value={replyDraft[thread.id] || ''}
        onChange={e => setReplyDraft(prev => ({ ...prev, [thread.id]: e.target.value }))}
        placeholder="Ответ дирекции…"
        style={{ width: '100%', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="adm-btn adm-btn-primary adm-btn-sm"
          onClick={() => sendReply(thread.id, !compact)}
        >
          Ответить и уведомить
        </button>
        <button
          type="button"
          className="adm-btn btn-danger adm-btn-sm"
          onClick={() => deleteThread(thread.id)}
        >
          Удалить
        </button>
      </div>
    </div>
  );

  if (loading) return <p className="adm-muted">Загрузка обращений…</p>;

  return (
    <div className="adm-stack">
      <div className="adm-forum-seg" style={{ marginBottom: 12 }}>
        {([
          ['all', 'Все'],
          ['waiting', 'Ожидают ответа'],
          ['answered', 'Отвечено'],
        ] as const).map(([key, title]) => (
          <button
            key={key}
            type="button"
            className={statusFilter === key ? 'on' : ''}
            onClick={() => setStatusFilter(key)}
          >
            {title}
            <span style={{ marginLeft: 6, opacity: 0.75 }}>
              {key === 'all'
                ? threads.length
                : threads.filter(t => (t.status || 'waiting') === key).length}
            </span>
          </button>
        ))}
      </div>

      <p className="adm-kb-panel-sub" style={{ marginTop: 0, marginBottom: 12 }}>
        Показаны все обращения: и ожидающие, и уже отвеченные. Нажмите на текст вопроса, чтобы открыть карточку.
      </p>

      <div className="adm-kb-table-scroll">
        <table className="adm-table">
          <thead>
            <tr>
              <SortTh label="№" sortKey="id" sort={sort} onSort={toggleSort} />
              <SortTh label="Участник" sortKey="participant" sort={sort} onSort={toggleSort} />
              <SortTh label="Направление" sortKey="direction" sort={sort} onSort={toggleSort} />
              <SortTh label="Обращение" sortKey="subject" sort={sort} onSort={toggleSort} />
              <SortTh label="Вопрос" sortKey="question" sort={sort} onSort={toggleSort} />
              <SortTh label="Статус" sortKey="status" sort={sort} onSort={toggleSort} />
              <SortTh label="Созд." sortKey="createdAt" sort={sort} onSort={toggleSort} />
              <SortTh label="Обновл." sortKey="updatedAt" sort={sort} onSort={toggleSort} />
              <SortTh label="Сообщ." sortKey="messages" sort={sort} onSort={toggleSort} />
              <th>Ответ / действия</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="adm-muted">Нет обращений по фильтру</td>
              </tr>
            )}
            {filtered.map(thread => {
              const question = firstParticipantQuestion(thread);
              return (
                <tr key={thread.id}>
                  <td>#{thread.id}</td>
                  <td>
                    {thread.participantId && onOpenCard ? (
                      <button
                        type="button"
                        className="adm-link"
                        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', textAlign: 'left' }}
                        onClick={() => onOpenCard(thread.participantId!)}
                      >
                        {thread.participantName || `Участник #${thread.participantId}`}
                      </button>
                    ) : (
                      thread.participantName || '—'
                    )}
                    {thread.groupName ? (
                      <div className="adm-muted" style={{ fontSize: 11 }}>{thread.groupName}</div>
                    ) : null}
                  </td>
                  <td>{thread.direction || '—'}</td>
                  <td style={{ maxWidth: 160, fontSize: 12 }}>
                    <div style={{ fontWeight: 600 }}>{thread.subject || 'Обращение'}</div>
                    <div className="adm-muted" style={{ fontSize: 11 }}>Нить #{thread.id}</div>
                  </td>
                  <td style={{ maxWidth: 280, fontSize: 12 }}>
                    {question ? (
                      <button
                        type="button"
                        className="adm-link"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          font: 'inherit',
                          cursor: 'pointer',
                          textAlign: 'left',
                          whiteSpace: 'pre-wrap',
                          lineHeight: 1.35,
                          color: 'inherit',
                          textDecoration: 'underline',
                          textDecorationStyle: 'dotted',
                        }}
                        title="Открыть карточку обращения"
                        onClick={() => setModalId(thread.id)}
                      >
                        {clip(question)}
                      </button>
                    ) : (
                      <span className="adm-muted">Нет текста</span>
                    )}
                  </td>
                  <td style={{ color: statusColor(thread.status), fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {statusLabel(thread.status)}
                  </td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatWhen(thread.createdAt)}</td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatWhen(thread.updatedAt)}</td>
                  <td>{thread.messages?.length || 0}</td>
                  <td>{replyBlock(thread, true)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalThread && (
        <div className="adm-modal-backdrop" onClick={() => setModalId(null)}>
          <div
            className="card"
            style={{ maxWidth: 640, width: '100%', maxHeight: '90vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ marginTop: 0, marginBottom: 6 }}>
                  {modalThread.subject || 'Обращение'} · нить #{modalThread.id}
                </h3>
                <div className="adm-muted" style={{ fontSize: 13 }}>
                  {modalThread.participantId && onOpenCard ? (
                    <button
                      type="button"
                      className="adm-link"
                      style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}
                      onClick={() => onOpenCard(modalThread.participantId!)}
                    >
                      {modalThread.participantName || `Участник #${modalThread.participantId}`}
                    </button>
                  ) : (
                    modalThread.participantName || 'Участник'
                  )}
                  {modalThread.groupName ? ` · ${modalThread.groupName}` : ''}
                  {modalThread.direction ? ` · ${modalThread.direction}` : ''}
                  {' · '}
                  <span style={{ color: statusColor(modalThread.status), fontWeight: 700 }}>
                    {statusLabel(modalThread.status)}
                  </span>
                </div>
                <div className="adm-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Создано: {formatWhen(modalThread.createdAt) || '—'}
                  {' · '}
                  Обновлено: {formatWhen(modalThread.updatedAt) || '—'}
                </div>
              </div>
              <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setModalId(null)}>
                Закрыть
              </button>
            </div>

            <div style={{ marginTop: 14 }}>
              {(modalThread.messages || []).length === 0 && (
                <p className="adm-muted">Сообщений нет</p>
              )}
              {(modalThread.messages || []).map(m => (
                <div
                  key={m.id}
                  style={{
                    marginTop: 8,
                    padding: 10,
                    borderRadius: 8,
                    fontSize: 13,
                    background: m.senderType === 'admin' ? '#F0FFF4' : '#F7F7F7',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.4,
                  }}
                >
                  <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>
                    {m.senderType === 'admin' ? 'Дирекция / организаторы' : 'Участник'}
                    {m.createdAt ? ` · ${formatWhen(m.createdAt)}` : ''}
                  </div>
                  {m.text}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="adm-label" style={{ marginBottom: 6 }}>Ответ</div>
              {replyBlock(modalThread, false)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
