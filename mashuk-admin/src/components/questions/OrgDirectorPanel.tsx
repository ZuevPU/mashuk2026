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
  if (sort.key !== key) return '';
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

function statusClass(status?: string | null): string {
  if (status === 'answered') return 'adm-tasks-status is-ok';
  if (status === 'closed') return 'adm-tasks-status';
  return 'adm-tasks-status is-wait';
}

function firstParticipantQuestion(thread: OrgThread): string {
  const msg = (thread.messages || []).find(m => m.senderType === 'participant');
  return (msg?.text || '').trim();
}

function clip(text: string, max = 180): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function SortBar({
  sort,
  onSort,
}: {
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const keys: { key: SortKey; label: string }[] = [
    { key: 'updatedAt', label: 'Обновл.' },
    { key: 'createdAt', label: 'Созд.' },
    { key: 'participant', label: 'Участник' },
    { key: 'status', label: 'Статус' },
    { key: 'messages', label: 'Сообщ.' },
  ];
  return (
    <div className="adm-mod-sort" aria-label="Сортировка" style={{ marginBottom: 10 }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, width: '100%' }}>
      <textarea
        className="adm-input"
        rows={compact ? 2 : 3}
        value={replyDraft[thread.id] || ''}
        onChange={e => setReplyDraft(prev => ({ ...prev, [thread.id]: e.target.value }))}
        placeholder="Ответ дирекции…"
        style={{ width: '100%', resize: 'vertical' }}
      />
      <div className="adm-mod-item-actions" style={{ marginTop: 0 }}>
        <button
          type="button"
          className="adm-btn adm-btn-primary adm-btn-sm"
          onClick={() => sendReply(thread.id, !compact)}
        >
          Ответить и уведомить
        </button>
        <button
          type="button"
          className="adm-btn adm-btn-danger adm-btn-sm"
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

      <SortBar sort={sort} onSort={toggleSort} />

      <div className="adm-mod-list">
        {filtered.length === 0 && <p className="adm-muted">Нет обращений по фильтру</p>}
        {filtered.map(thread => {
          const question = firstParticipantQuestion(thread);
          return (
            <article key={thread.id} className="adm-mod-item">
              <div className="adm-mod-item-row1">
                <div className="adm-mod-item-main">
                  <div className="adm-mod-item-title-line">
                    {thread.participantId && onOpenCard ? (
                      <button
                        type="button"
                        className="adm-tasks-title"
                        onClick={() => onOpenCard(thread.participantId!)}
                      >
                        {thread.participantName || `Участник #${thread.participantId}`}
                      </button>
                    ) : (
                      <strong>{thread.participantName || 'Участник'}</strong>
                    )}
                    <span className={statusClass(thread.status)}>{statusLabel(thread.status)}</span>
                    <span className="adm-tasks-id">#{thread.id}</span>
                  </div>
                  <p className="adm-kb-panel-sub" style={{ marginTop: 4 }}>
                    {[
                      thread.subject || 'Обращение',
                      thread.direction,
                      thread.groupName,
                      `сообщ. ${thread.messages?.length || 0}`,
                      formatWhen(thread.updatedAt) ? `обн. ${formatWhen(thread.updatedAt)}` : '',
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>

              {question ? (
                <button
                  type="button"
                  className="adm-mod-item-text"
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    border: 0,
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                    color: 'inherit',
                    font: 'inherit',
                  }}
                  title="Открыть карточку обращения"
                  onClick={() => setModalId(thread.id)}
                >
                  {clip(question)}
                </button>
              ) : (
                <p className="adm-muted" style={{ marginTop: 8 }}>Нет текста</p>
              )}

              <div className="adm-mod-item-actions">
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary adm-btn-sm"
                  onClick={() => setModalId(thread.id)}
                >
                  Открыть
                </button>
              </div>

              <div style={{ marginTop: 10 }}>
                {replyBlock(thread, true)}
              </div>
            </article>
          );
        })}
      </div>

      {modalThread && (
        <div className="adm-modal-backdrop" onClick={() => setModalId(null)}>
          <div
            className="card adm-kb-panel"
            style={{ maxWidth: 640, width: '100%', maxHeight: '90vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ marginTop: 0, marginBottom: 6 }}>
                  {modalThread.subject || 'Обращение'} · #{modalThread.id}
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
                  <span className={statusClass(modalThread.status)}>{statusLabel(modalThread.status)}</span>
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

            <div className="adm-mod-answers" style={{ borderTop: 'none', paddingTop: 0 }}>
              {(modalThread.messages || []).length === 0 && (
                <p className="adm-muted">Сообщений нет</p>
              )}
              {(modalThread.messages || []).map(m => (
                <div
                  key={m.id}
                  className={m.senderType === 'admin' ? 'adm-mod-answer' : 'adm-mod-reply'}
                  style={m.senderType === 'admin' ? { background: 'rgba(0, 122, 255, 0.08)' } : undefined}
                >
                  <div className="adm-mod-answer-head">
                    <strong>{m.senderType === 'admin' ? 'Дирекция / организаторы' : 'Участник'}</strong>
                    <span className="adm-muted" style={{ fontSize: 11 }}>
                      {m.createdAt ? formatWhen(m.createdAt) : ''}
                    </span>
                  </div>
                  <div className="adm-mod-answer-text">{m.text}</div>
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
