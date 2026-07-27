import { RowActionsMenu } from '../participants/RowActionsMenu';
import type { AdminQuestion } from './types';
import { answerTypeLabel, audienceLabel, kindLabel, statusLabel } from './types';

type Props = {
  questions: AdminQuestion[];
  selectedIds: Set<number>;
  readOnly: boolean;
  onToggleSelect: (id: number) => void;
  onToggleAll: () => void;
  onEdit: (q: AdminQuestion) => void;
  onDuplicate: (id: number) => void;
  onViewAnswers: (q: AdminQuestion) => void;
  onCopyToDay: (id: number) => void;
  onHide: (id: number) => void;
  onDelete: (id: number) => void;
  onOpenModeration?: () => void;
};

export function QuestionsListTable({
  questions,
  selectedIds,
  readOnly,
  onToggleSelect,
  onToggleAll,
  onEdit,
  onDuplicate,
  onViewAnswers,
  onCopyToDay,
  onHide,
  onDelete,
  onOpenModeration,
}: Props) {
  if (questions.length === 0) {
    return (
      <p className="adm-muted">
        Нет вопросов в этой вкладке.
        {readOnly && onOpenModeration && (
          <>
            {' '}
            <button type="button" className="adm-link-btn" onClick={onOpenModeration}>Открыть модерацию</button>
          </>
        )}
      </p>
    );
  }

  const allSelected = questions.length > 0 && questions.every(q => selectedIds.has(q.id));

  return (
    <table className="adm-table">
      <thead>
        <tr>
          {!readOnly && (
            <th>
              <input type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label="Выбрать все" />
            </th>
          )}
          <th>№</th>
          <th>Заголовок</th>
          <th>Тип</th>
          <th>Тип ответа</th>
          <th>День</th>
          <th>Окно</th>
          <th>Аудитория</th>
          <th>Статус</th>
          <th>Ответов</th>
          <th>Действия</th>
        </tr>
      </thead>
      <tbody>
        {questions.map(q => {
          const days = q.dayNumbers?.length ? q.dayNumbers.join(', ') : String(q.dayNumber ?? '—');
          return (
            <tr key={`${q.source || 'q'}-${q.id}`}>
              {!readOnly && (
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(q.id)}
                    onChange={() => onToggleSelect(q.id)}
                    aria-label={`Выбрать ${q.title}`}
                  />
                </td>
              )}
              <td>{q.id}</td>
              <td>
                {readOnly ? (
                  q.title
                ) : (
                  <button type="button" className="adm-link-btn" onClick={() => onEdit(q)}>{q.title}</button>
                )}
                {q.subtitle && <div className="adm-muted" style={{ fontSize: 11 }}>{q.subtitle}</div>}
              </td>
              <td>{kindLabel(q.questionKind)}</td>
              <td>{answerTypeLabel(q.answerType || q.type)}</td>
              <td>{days}</td>
              <td>{q.timeWindowLabel || '—'}</td>
              <td>{audienceLabel(q)}</td>
              <td>{statusLabel(q)}</td>
              <td>{q.answerCount ?? 0}</td>
              <td>
                {readOnly ? (
                  onOpenModeration && (
                    <button type="button" className="adm-btn adm-btn-sm" onClick={onOpenModeration}>
                      В модерацию
                    </button>
                  )
                ) : (
                  <RowActionsMenu
                    actions={[
                      { label: 'Редактировать', onClick: () => onEdit(q) },
                      { label: 'Дублировать', onClick: () => onDuplicate(q.id) },
                      { label: 'Просмотр ответов', onClick: () => onViewAnswers(q) },
                      { label: 'Скопировать на другой день', onClick: () => onCopyToDay(q.id) },
                      { label: 'Скрыть', onClick: () => onHide(q.id) },
                      { label: 'Удалить', onClick: () => onDelete(q.id), danger: true },
                    ]}
                  />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
