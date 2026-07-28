import { RowActionsMenu } from '../participants/RowActionsMenu';
import type { AdminTask } from './types';
import { methodsLabel, statusLabel } from './types';

type Props = {
  tasks: AdminTask[];
  categoriesById: Map<number, string>;
  onEdit: (t: AdminTask) => void;
  onDuplicate: (id: number) => void;
  onQr: (id: number) => void;
  onHide: (id: number) => void;
  onArchive: (id: number) => void;
  onDelete: (id: number) => void;
  onModerate: (t: AdminTask) => void;
};

export function TasksListTable({
  tasks,
  categoriesById,
  onEdit,
  onDuplicate,
  onQr,
  onHide,
  onArchive,
  onDelete,
  onModerate,
}: Props) {
  if (tasks.length === 0) {
    return <p className="adm-muted">Нет заданий в этой вкладке.</p>;
  }

  return (
    <table className="adm-table">
      <thead>
        <tr>
          <th>№</th>
          <th>Название</th>
          <th>Иконка</th>
          <th>Категория</th>
          <th>Баллы</th>
          <th>День</th>
          <th>Способ подтверждения</th>
          <th>Модерация</th>
          <th>Статус</th>
          <th>Выполнено</th>
          <th>Действия</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map(t => {
          const cat = t.categoryName || (t.categoryId ? categoriesById.get(t.categoryId) : null) || t.category || '—';
          const icon = t.iconKey || t.categoryIconKey || '—';
          const days = t.dayNumbers?.length ? t.dayNumbers.join(', ') : String(t.dayNumber ?? '—');
          return (
            <tr key={t.id}>
              <td>{t.id}</td>
              <td>
                <button type="button" className="adm-link-btn" onClick={() => onEdit(t)}>{t.title}</button>
              </td>
              <td>{icon}</td>
              <td>{cat}</td>
              <td>{t.points ?? 0}</td>
              <td>{days}</td>
              <td>{methodsLabel(t.confirmationMethods)}</td>
              <td title={t.pendingModerationCount ? `${t.pendingModerationCount} заявок ждут модерации` : undefined}>
                {t.pendingModerationCount ? `${t.pendingModerationCount} в очереди` : '—'}
              </td>
              <td>{statusLabel(t)}</td>
              <td>{t.completionCount ?? 0}</td>
              <td>
                <RowActionsMenu
                  actions={[
                    { label: 'Редактировать', onClick: () => onEdit(t) },
                    { label: 'Дублировать', onClick: () => onDuplicate(t.id) },
                    { label: 'Скачать QR', onClick: () => onQr(t.id) },
                    { label: 'Модерация ответов', onClick: () => onModerate(t) },
                    { label: 'Скрыть', onClick: () => onHide(t.id) },
                    { label: 'В архив', onClick: () => onArchive(t.id) },
                    { label: 'Удалить', onClick: () => onDelete(t.id), danger: true },
                  ]}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
