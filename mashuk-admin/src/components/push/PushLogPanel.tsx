import { useCallback, useEffect, useState } from 'react';
import type { AdminTabProps } from '../admin/types';
import { deliveryStatusShort, pushTriggerLabel } from './pushLabels';

type LogRow = {
  id: number;
  triggerType?: string | null;
  participantId?: number | null;
  participantName?: string | null;
  text: string;
  sentAt?: string | null;
  deliveryStatus?: string | null;
  deliveryStatusHint?: string | null;
};

export function PushLogPanel({ adminFetch }: Pick<AdminTabProps, 'adminFetch'>) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch('/push/log?limit=100') as { log: LogRow[] };
      setRows(res.log || []);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  if (loading) return <p className="adm-muted">Загрузка журнала…</p>;

  return (
    <div className="card adm-forum-block">
      <h3>Журнал отправок</h3>
      <p className="adm-muted" style={{ fontSize: 12, marginBottom: 12 }}>
        Последние 100 уведомлений: автоматические, рассылки администратора и сообщения по заданиям.
        Если статус «Не настроены ключи VK» — обратитесь к техническому администратору (см. документацию PUSH_VK_SETUP).
      </p>
      {rows.length === 0 ? (
        <p className="adm-muted">Пока нет записей.</p>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th>Время</th>
              <th>Тип</th>
              <th>Участник</th>
              <th>Текст</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                  {r.sentAt ? new Date(r.sentAt).toLocaleString('ru-RU') : '—'}
                </td>
                <td style={{ fontSize: 12 }}>{pushTriggerLabel(r.triggerType)}</td>
                <td style={{ fontSize: 12 }}>
                  {r.participantName || (r.participantId ? `#${r.participantId}` : 'Все')}
                </td>
                <td style={{ fontSize: 12, maxWidth: 280 }}>{r.text}</td>
                <td style={{ fontSize: 11 }} title={r.deliveryStatusHint || r.deliveryStatus || ''}>
                  {deliveryStatusShort(r.deliveryStatus)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" style={{ marginTop: 12 }} onClick={() => load()}>
        Обновить
      </button>
    </div>
  );
}
