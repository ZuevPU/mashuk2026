import { RowActionsMenu } from '../participants/RowActionsMenu';
import type { AdminTask } from './types';
import {
  formatTaskDateTime,
  medalLabel,
  methodsLabel,
  nominationLabel,
  statusLabel,
  taskKindLabel,
} from './types';

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
    <div className="adm-table-scroll">
      <table className="adm-table adm-table-compact">
        <thead>
          <tr>
            <th>№</th>
            <th>Название</th>
            <th>Кратко</th>
            <th>Категория</th>
            <th>Номинация</th>
            <th>Баллы</th>
            <th>День</th>
            <th>Тип</th>
            <th>Лимит</th>
            <th>Место</th>
            <th>Время</th>
            <th>Медаль</th>
            <th>Подтверждение</th>
            <th>Заявка до</th>
            <th>Проверка</th>
            <th>Статус</th>
            <th>Вып.</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => {
            const cat = t.categoryName || (t.categoryId ? categoriesById.get(t.categoryId) : null) || t.category || '—';
            const days = t.dayNumbers?.length ? t.dayNumbers.join(', ') : String(t.dayNumber ?? '—');
            const short = (t.shortDescription || t.description || '').slice(0, 60);
            return (
              <tr key={t.id}>
                <td>{t.id}</td>
                <td>
                  <button type="button" className="adm-link-btn" onClick={() => onEdit(t)}>{t.title}</button>
                </td>
                <td title={t.shortDescription || t.description || ''}>{short ? `${short}${short.length >= 60 ? '…' : ''}` : '—'}</td>
                <td>{cat}</td>
                <td>{nominationLabel(t.nomination)}</td>
                <td>{t.points ?? 0}</td>
                <td>{days}</td>
                <td>{taskKindLabel(t)}</td>
                <td>{t.dailyRepeatLimit && t.executionType !== 'once' ? t.dailyRepeatLimit : '—'}</td>
                <td>{t.programPlaceName || '—'}</td>
                <td>{formatTaskDateTime(t.eventTime ?? t.availableFrom ?? t.publishTime)}</td>
                <td>{medalLabel(t)}</td>
                <td>{methodsLabel(t.confirmationMethods)}</td>
                <td>{formatTaskDateTime(t.applicationDeadline)}</td>
                <td title={t.pendingModerationCount ? `${t.pendingModerationCount} заявок ждут играпрактика` : undefined}>
                  {t.pendingModerationCount ? `${t.pendingModerationCount}` : '—'}
                </td>
                <td>{statusLabel(t)}</td>
                <td>{t.completionCount ?? 0}</td>
                <td>
                  <RowActionsMenu
                    actions={[
                      { label: 'Редактировать', onClick: () => onEdit(t) },
                      { label: 'Дублировать', onClick: () => onDuplicate(t.id) },
                      { label: 'Скачать QR', onClick: () => onQr(t.id) },
                      { label: 'Проверка играпрактиком', onClick: () => onModerate(t) },
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
    </div>
  );
}
