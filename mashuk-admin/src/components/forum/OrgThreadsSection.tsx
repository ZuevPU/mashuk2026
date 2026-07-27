import { useCallback, useEffect, useState } from 'react';
import type { AdminTabProps } from '../admin/types';

type Props = Pick<AdminTabProps, 'adminFetch' | 'act' | 'reloadKey'>;

export function OrgThreadsSection({ adminFetch, act, reloadKey }: Props) {
  const [orgThreads, setOrgThreads] = useState<any[]>([]);
  const [orgReplyDraft, setOrgReplyDraft] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOrgThreads((await adminFetch('/org/threads')).threads || []);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  if (loading) return <p className="adm-muted">Загрузка обращений…</p>;

  return (
    <div className="card adm-forum-block">
      <h3>Обращения к организаторам</h3>
      <p className="adm-forum-hint">Ответы участникам с push-уведомлением.</p>
      {orgThreads.length === 0 && <p className="adm-muted">Нет обращений</p>}
      {orgThreads.map(t => (
        <div key={t.id} className="card" style={{ marginTop: 12 }}>
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
              }).then(() => {
                setOrgReplyDraft({ ...orgReplyDraft, [t.id]: '' });
                return load();
              }), 'Ответ отправлен')}
            >
              Ответить и уведомить
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
