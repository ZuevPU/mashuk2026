import { RowActionsMenu } from '../participants/RowActionsMenu';
import { label } from '../../labels/ru';
import type { Medal } from './types';

type Props = {
  medals: Medal[];
  onEdit: (m: Medal) => void;
  onHide: (m: Medal) => void;
  onDelete: (id: number) => void;
};

export function MedalsListTable({ medals, onEdit, onHide, onDelete }: Props) {
  if (medals.length === 0) {
    return <p className="adm-muted">Нет медалей в этой вкладке.</p>;
  }

  return (
    <table className="adm-table">
      <thead>
        <tr>
          <th>Иконка</th>
          <th>Название</th>
          <th>Уровень</th>
          <th>Категория</th>
          <th>Тип выдачи</th>
          <th>Видимость</th>
          <th>Выдано раз</th>
          <th>Действия</th>
        </tr>
      </thead>
      <tbody>
        {medals.map(m => (
          <tr key={m.id}>
            <td>
              {m.iconUrl ? (
                <img src={m.iconUrl} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
              ) : (
                '🏅'
              )}
            </td>
            <td>
              <button type="button" className="adm-link-btn" onClick={() => onEdit(m)}>{m.name}</button>
            </td>
            <td>{label(m.level ?? '')}</td>
            <td>{label(`medal_cat_${m.category}`) !== `medal_cat_${m.category}` ? label(`medal_cat_${m.category}`) : (m.category || '—')}</td>
            <td>{m.awardType === 'auto' ? 'Автоматическая' : 'Ручная'}</td>
            <td>{m.visibility === 'hidden' ? 'Скрытая' : 'Открытая'}</td>
            <td>{m.awardedCount ?? 0}</td>
            <td>
              <RowActionsMenu
                actions={[
                  { label: 'Редактировать', onClick: () => onEdit(m) },
                  ...(m.visibility !== 'hidden'
                    ? [{ label: 'Скрыть', onClick: () => onHide(m) }]
                    : []),
                  { label: 'Удалить', onClick: () => onDelete(m.id), danger: true },
                ]}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
