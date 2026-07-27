import { useCallback, useEffect, useState } from 'react';
import { label } from '../../labels/ru';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';

type ParticipantCardTab = 'profile' | 'answers' | 'tasks' | 'medals' | 'points' | 'piggybank';

export type PushTabProps = AdminTabProps & {
  onOpenCard?: (id: number, tab?: ParticipantCardTab) => void;
};

export function PushTab({ adminFetch, act, reloadKey, onOpenCard }: PushTabProps) {
  const [loading, setLoading] = useState(true);
  const [pushLog, setPushLog] = useState<any[]>([]);
  const [pushTemplates, setPushTemplates] = useState<any[]>([]);
  const [pushNightSlot, setPushNightSlot] = useState(false);
  const [pushBlockTypesJson, setPushBlockTypesJson] = useState('{}');
  const [pushText, setPushText] = useState('');
  const [pushParticipantId, setPushParticipantId] = useState('');
  const [newPushTemplate, setNewPushTemplate] = useState({ key: '', title: '', body: '', slotKey: '', isActive: true });
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPushLog((await adminFetch('/push/log')).log || []);
      setPushTemplates((await adminFetch('/push/templates')).templates || []);
      const fs = (await adminFetch('/forum-settings')).settings;
      setPushNightSlot(!!fs?.pushNightSlotEnabled);
      setPushBlockTypesJson(JSON.stringify(fs?.pushBlockTypes || {}, null, 2));
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  if (loading) return <p className="adm-muted">Загрузка уведомлений…</p>;

  return (
    <div className="adm-forum">
      <AdminPageHero title="Уведомления" hint="Автопush, шаблоны, ручная отправка и журнал доставки." />

      <div className="card adm-forum-block">
        <h3>Настройки автопush</h3>
        <label className="adm-forum-check" style={{ display: 'block', marginBottom: 8 }}>
          <input type="checkbox" checked={pushNightSlot} onChange={e => setPushNightSlot(e.target.checked)} />
          {' '}Ночной push 23:00 («Спокойной ночи»)
        </label>
        <p className="adm-muted" style={{ fontSize: 12 }}>
          Напоминания о блоках программы: JSON типов блоков (true = push за 10–15 мин). Пример: {`{"session":true,"key_block":true}`}
        </p>
        <textarea
          className="adm-input"
          value={pushBlockTypesJson}
          onChange={e => setPushBlockTypesJson(e.target.value)}
          rows={4}
          style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
        />
        <button
          type="button"
          className="adm-btn"
          style={{ marginTop: 8 }}
          onClick={() => act(async () => {
            let parsed: Record<string, boolean> = {};
            try {
              parsed = JSON.parse(pushBlockTypesJson || '{}');
            } catch {
              throw new Error('Некорректный JSON push_block_types');
            }
            await adminFetch('/forum-settings', {
              method: 'PATCH',
              body: JSON.stringify({
                pushNightSlotEnabled: pushNightSlot,
                pushBlockTypes: parsed,
              }),
            });
          }, 'Настройки push сохранены')}
        >
          Сохранить настройки push
        </button>
      </div>

      <div className="card adm-forum-block">
        <h3>Шаблоны уведомлений</h3>
        {templateNotice && <p className="adm-muted" style={{ fontSize: 12 }}>{templateNotice}</p>}
        <div className="form-row">
          <input className="adm-input" value={newPushTemplate.key} onChange={e => setNewPushTemplate({ ...newPushTemplate, key: e.target.value })} placeholder="Ключ шаблона" />
          <input className="adm-input" value={newPushTemplate.slotKey} onChange={e => setNewPushTemplate({ ...newPushTemplate, slotKey: e.target.value })} placeholder="Слот (утро / вечер…)" />
          <input className="adm-input" value={newPushTemplate.title} onChange={e => setNewPushTemplate({ ...newPushTemplate, title: e.target.value })} placeholder="Заголовок" />
        </div>
        <textarea className="adm-input" value={newPushTemplate.body} onChange={e => setNewPushTemplate({ ...newPushTemplate, body: e.target.value })} placeholder="Текст шаблона" rows={2} style={{ width: '100%' }} />
        <button
          type="button"
          className="adm-btn"
          style={{ marginTop: 8 }}
          onClick={() => act(() => adminFetch('/push/templates', {
            method: 'POST', body: JSON.stringify(newPushTemplate),
          }).then(() => setNewPushTemplate({ key: '', title: '', body: '', slotKey: '', isActive: true })), 'Шаблон создан')}
        >
          Добавить шаблон
        </button>
        {pushTemplates.map(t => (
          <div key={t.id} className="card" style={{ marginTop: 8, fontSize: 12 }}>
            <strong>{t.title || t.key}</strong>{t.slotKey ? ` · ${label(t.slotKey)}` : ''} {t.isActive === false ? '· выкл' : ''}
            <div>{t.title}</div>
            <div style={{ color: '#666' }}>{t.body}</div>
            <div className="form-row" style={{ marginTop: 6 }}>
              <button type="button" className="adm-btn adm-btn-secondary" onClick={() => {
                setPushText(t.body || '');
                setTemplateNotice('Текст шаблона подставлен');
              }}>
                Использовать
              </button>
              <button type="button" className="adm-btn adm-btn-secondary" onClick={() => act(() => adminFetch(`/push/templates/${t.id}`, {
                method: 'PATCH', body: JSON.stringify({ isActive: t.isActive === false }),
              }), t.isActive === false ? 'Включён' : 'Выключен')}>
                {t.isActive === false ? 'Вкл' : 'Выкл'}
              </button>
              <button type="button" className="adm-btn btn-danger" onClick={() => {
                if (confirm('Удалить шаблон?')) act(() => adminFetch(`/push/templates/${t.id}`, { method: 'DELETE' }));
              }}>
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="card adm-forum-block">
        <textarea className="adm-input" value={pushText} onChange={e => setPushText(e.target.value)} placeholder="Текст уведомления" rows={3} style={{ width: '100%' }} />
        <div className="form-row" style={{ marginTop: 8 }}>
          <input
            type="number"
            className="adm-input"
            value={pushParticipantId}
            onChange={e => setPushParticipantId(e.target.value)}
            placeholder="ID участника (пусто = всем)"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="adm-btn adm-btn-secondary"
            onClick={() => {
              const id = Number(pushParticipantId);
              if (id && onOpenCard) onOpenCard(id);
            }}
          >
            Карточка
          </button>
          <button
            type="button"
            className="adm-btn"
            onClick={() => act(async () => {
              await adminFetch('/push/send', {
                method: 'POST',
                body: JSON.stringify({
                  text: pushText,
                  ...(pushParticipantId ? { participantId: Number(pushParticipantId) } : {}),
                }),
              });
              setPushText('');
              setPushParticipantId('');
            }, 'Уведомление отправлено')}
          >
            Отправить
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => act(() => adminFetch('/integrations/club-match', { method: 'POST' }), 'Подбор клубов выполнен')}>
            Подбор клубов (ИИ)
          </button>
        </div>
      </div>

      <table className="adm-table">
        <thead><tr><th>Текст</th><th>Триггер</th><th>Статус</th><th>Дата</th></tr></thead>
        <tbody>
          {pushLog.map(l => (
            <tr key={l.id}>
              <td>{l.text}</td>
              <td>{label(l.triggerType)}</td>
              <td>{label(l.deliveryStatus)}</td>
              <td>{l.sentAt ? new Date(l.sentAt).toLocaleString('ru-RU') : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
