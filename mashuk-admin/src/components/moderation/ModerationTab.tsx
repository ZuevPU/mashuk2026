import { useCallback, useEffect, useState } from 'react';
import { label } from '../../labels/ru';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';
import { TaskModerationQueue } from './TaskModerationQueue';

type Segment = 'exchange' | 'org' | 'archive' | 'tasks';

type ParticipantCardTab = 'profile' | 'answers' | 'tasks' | 'medals' | 'points' | 'piggybank';

export type ModerationTabProps = AdminTabProps & {
  onOpenCard: (id: number, tab?: ParticipantCardTab) => void;
};

export function ModerationTab({ adminFetch, act, reloadKey, onOpenCard: _onOpenCard }: ModerationTabProps) {
  const [segment, setSegment] = useState<Segment>('exchange');
  const [loading, setLoading] = useState(true);
  const [pendingExchange, setPendingExchange] = useState<any[]>([]);
  const [exchangeArchive, setExchangeArchive] = useState<any[]>([]);
  const [orgThreads, setOrgThreads] = useState<any[]>([]);
  const [orgReplyDraft, setOrgReplyDraft] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPendingExchange((await adminFetch('/exchange/pending')).questions || []);
      setExchangeArchive((await adminFetch('/exchange?status=approved')).questions || []);
      setOrgThreads((await adminFetch('/org/threads')).threads || []);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const reload = () => load().catch(() => {});

  const segments: { key: Segment; label: string }[] = [
    { key: 'exchange', label: 'Обмен (ожидает)' },
    { key: 'tasks', label: 'Задания на проверке' },
    { key: 'org', label: 'Организаторы' },
    { key: 'archive', label: 'Архив обмена' },
  ];

  if (loading) return <p className="adm-muted">Загрузка модерации…</p>;

  return (
    <div className="adm-forum">
      <AdminPageHero title="Модерация" hint="Обмен опытом, очередь заданий и обращения к организаторам." />

      <div className="adm-seg" style={{ marginBottom: 12 }}>
        {segments.map(s => (
          <button key={s.key} type="button" className={segment === s.key ? 'on' : ''} onClick={() => setSegment(s.key)}>
            {s.label}
          </button>
        ))}
      </div>

      {segment === 'tasks' && (
        <TaskModerationQueue adminFetch={adminFetch} act={act} reloadKey={reloadKey} />
      )}

      {segment === 'exchange' && (
        <>
          {pendingExchange.length === 0 && <p className="adm-muted">Нет вопросов на модерации</p>}
          {pendingExchange.map(q => (
            <div key={q.id} className="card">
              <p>{q.text}</p>
              <div className="form-row">
                <button type="button" className="adm-btn" onClick={() => adminFetch(`/exchange/${q.id}`, { method: 'PATCH', body: JSON.stringify({ moderationStatus: 'approved' }) }).then(reload)}>Одобрить</button>
                <button type="button" className="adm-btn btn-danger" onClick={() => adminFetch(`/exchange/${q.id}`, { method: 'PATCH', body: JSON.stringify({ moderationStatus: 'rejected' }) }).then(reload)}>Отклонить</button>
              </div>
            </div>
          ))}
        </>
      )}

      {segment === 'archive' && (
        <>
          {exchangeArchive.map(q => (
            <div key={q.id} className="card">
              <p>{q.text}</p>
              <p style={{ fontSize: 11, color: '#888' }}>{q.authorName} · {label(q.moderationStatus)}</p>
              {q.answers?.map((a: any) => (
                <div key={a.id} style={{ marginTop: 6, padding: 6, background: '#f5f5f5', borderRadius: 6, fontSize: 12 }}>
                  {a.authorName}: {a.text}
                  {a.reactions && ` · 👍 ${a.reactions.likes ?? 0}`}
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {segment === 'org' && (
        <>
          {orgThreads.length === 0 && <p className="adm-muted">Нет обращений</p>}
          {orgThreads.map(t => (
            <div key={t.id} className="card">
              <p>
                <strong>{t.participantName || 'Участник'}</strong>
                {t.groupName ? ` · ${t.groupName}` : ''}
                {t.direction ? ` · ${t.direction}` : ''}
                {' · '}
                <span style={{ color: t.status === 'answered' ? '#2F855A' : '#B8621A' }}>
                  {t.status === 'answered' ? 'отвечено' : 'ожидает'}
                </span>
              </p>
              <p style={{ fontSize: 12, color: '#666' }}>{t.subject}</p>
              {(t.messages || []).map((m: any) => (
                <div key={m.id} style={{
                  marginTop: 6, padding: 8, borderRadius: 6, fontSize: 12,
                  background: m.senderType === 'admin' ? '#F0FFF4' : '#F7F7F7',
                }}>
                  <div style={{ color: '#888', fontSize: 10 }}>
                    {m.senderType === 'admin' ? 'Организаторы' : 'Участник'}
                    {m.createdAt ? ` · ${new Date(m.createdAt).toLocaleString('ru-RU')}` : ''}
                  </div>
                  {m.text}
                </div>
              ))}
              <div className="form-row" style={{ marginTop: 8 }}>
                <input
                  className="adm-input"
                  value={orgReplyDraft[t.id] || ''}
                  onChange={e => setOrgReplyDraft({ ...orgReplyDraft, [t.id]: e.target.value })}
                  placeholder="Ответ организатора…"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="adm-btn"
                  onClick={() => act(() => adminFetch(`/org/threads/${t.id}/reply`, {
                    method: 'POST',
                    body: JSON.stringify({ text: orgReplyDraft[t.id], sendPush: true }),
                  }).then(() => setOrgReplyDraft({ ...orgReplyDraft, [t.id]: '' })), 'Ответ отправлен')}
                >
                  Ответить и уведомить
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
