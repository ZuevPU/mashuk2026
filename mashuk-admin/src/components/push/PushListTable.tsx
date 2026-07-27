import type { PushNotificationRow } from './types';
import { typeLabel } from './types';

type Props = {
  rows: PushNotificationRow[];
  onEdit: (id: number) => void;
  onDuplicate: (id: number) => void;
  onDelete: (id: number) => void;
};

export function PushListTable({ rows, onEdit, onDuplicate, onDelete }: Props) {
  if (!rows.length) {
    return <p className="adm-muted">Нет уведомлений в этой вкладке.</p>;
  }

  return (
    <table className="adm-table">
      <thead>
        <tr>
          <th>Дата</th>
          <th>Заголовок</th>
          <th>Аудитория</th>
          <th>Доставлено/Открыто</th>
          <th>Тип</th>
          <th>Действия</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const date = r.sentAt ?? r.publishAt ?? r.updatedAt;
          const canEdit = r.status === 'draft' || r.status === 'queued';
          return (
            <tr key={r.id}>
              <td>{date ? new Date(date).toLocaleString('ru-RU') : '—'}</td>
              <td>
                <div><strong>{r.pushTitle || r.internalName || `#${r.id}`}</strong></div>
                <div className="adm-muted" style={{ fontSize: 11 }}>{r.internalName}</div>
              </td>
              <td>{r.audienceLabel ?? r.audienceType}</td>
              <td>{r.deliveredCount ?? 0}/{r.openedCount ?? 0}</td>
              <td>{typeLabel(r.notificationType)}</td>
              <td>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {canEdit && (
                    <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => onEdit(r.id)}>
                      Редактировать
                    </button>
                  )}
                  <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => onDuplicate(r.id)}>
                    Дублировать
                  </button>
                  <button type="button" className="adm-btn btn-danger adm-btn-sm" onClick={() => onDelete(r.id)}>
                    Удалить
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
