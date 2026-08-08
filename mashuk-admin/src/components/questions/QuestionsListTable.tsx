import { useMemo, useState, type ReactNode } from 'react';
import { RowActionsMenu } from '../participants/RowActionsMenu';
import type { AdminQuestion } from './types';
import { answerTypeLabel, audienceLabel, kindLabel, statusLabel } from './types';

type Props = {
  questions: AdminQuestion[];
  selectedIds: Set<number>;
  readOnly: boolean;
  /** When true, render collapsible sections by forum day */
  groupByDay?: boolean;
  onToggleSelect: (id: number) => void;
  onToggleAll: () => void;
  onEdit: (q: AdminQuestion) => void;
  onDuplicate: (id: number) => void;
  onViewAnswers: (q: AdminQuestion) => void;
  onViewPracticesResults?: (q: AdminQuestion) => void;
  onCopyToDay: (id: number) => void;
  onHide: (id: number) => void;
  onDelete: (id: number) => void;
  onOpenModeration?: () => void;
};

function primaryDay(q: AdminQuestion): number {
  if (q.dayNumbers?.length) return Math.min(...q.dayNumbers);
  if (q.dayNumber != null) return q.dayNumber;
  return 0;
}

function QuestionRows({
  questions,
  selectedIds,
  readOnly,
  onToggleSelect,
  onEdit,
  onDuplicate,
  onViewAnswers,
  onViewPracticesResults,
  onCopyToDay,
  onHide,
  onDelete,
  onOpenModeration,
}: Omit<Props, 'onToggleAll' | 'groupByDay'>) {
  return (
    <>
      {questions.map(q => {
        const days = q.dayNumbers?.length ? q.dayNumbers.join(', ') : String(q.dayNumber ?? '—');
        const isHidden = q.isHidden;
        const isPractices = q.questionKind === 'practices_vote' || q.answerType === 'practices_vote';
        return (
          <tr key={`${q.source || 'q'}-${q.id}`} className={isHidden ? 'adm-row-hidden' : ''} style={isHidden ? { opacity: 0.6, background: '#f5f5f5' } : undefined}>
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
                    ...(isPractices && onViewPracticesResults
                      ? [{ label: 'Результаты голосования', onClick: () => onViewPracticesResults(q) }]
                      : []),
                    { label: 'Скопировать на другой день', onClick: () => onCopyToDay(q.id) },
                    { label: q.isHidden ? 'Показать' : 'Скрыть', onClick: () => onHide(q.id) },
                    { label: 'Удалить', onClick: () => onDelete(q.id), danger: true },
                  ]}
                />
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function TableShell({
  questions,
  selectedIds,
  readOnly,
  onToggleAll,
  showSelectAll,
  children,
}: {
  questions: AdminQuestion[];
  selectedIds: Set<number>;
  readOnly: boolean;
  onToggleAll: () => void;
  showSelectAll: boolean;
  children: ReactNode;
}) {
  const allSelected = questions.length > 0 && questions.every(q => selectedIds.has(q.id));
  return (
    <table className="adm-table">
      <thead>
        <tr>
          {!readOnly && (
            <th>
              {showSelectAll ? (
                <input type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label="Выбрать все" />
              ) : null}
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
      <tbody>{children}</tbody>
    </table>
  );
}

export function QuestionsListTable({
  questions,
  selectedIds,
  readOnly,
  groupByDay = false,
  onToggleSelect,
  onToggleAll,
  onEdit,
  onDuplicate,
  onViewAnswers,
  onViewPracticesResults,
  onCopyToDay,
  onHide,
  onDelete,
  onOpenModeration,
}: Props) {
  const groups = useMemo(() => {
    if (!groupByDay) return null;
    const map = new Map<number, AdminQuestion[]>();
    for (const q of questions) {
      const d = primaryDay(q);
      const list = map.get(d) || [];
      list.push(q);
      map.set(d, list);
    }
    return [...map.entries()].sort((a, b) => {
      if (a[0] === 0) return 1;
      if (b[0] === 0) return -1;
      return a[0] - b[0];
    });
  }, [questions, groupByDay]);

  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

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

  const rowProps = {
    questions,
    selectedIds,
    readOnly,
    onToggleSelect,
    onEdit,
    onDuplicate,
    onViewAnswers,
    onViewPracticesResults,
    onCopyToDay,
    onHide,
    onDelete,
    onOpenModeration,
  };

  if (!groupByDay || !groups) {
    return (
      <TableShell
        questions={questions}
        selectedIds={selectedIds}
        readOnly={readOnly}
        onToggleAll={onToggleAll}
        showSelectAll
      >
        <QuestionRows {...rowProps} />
      </TableShell>
    );
  }

  return (
    <div className="adm-questions-by-day">
      {groups.map(([day, rows]) => {
        const isCollapsed = collapsed[day] === true;
        const label = day === 0 ? 'Без дня' : `День ${day}`;
        return (
          <div key={day} className="card" style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
            <button
              type="button"
              className="adm-forum-toolbar"
              style={{
                width: '100%',
                border: 'none',
                background: 'var(--m-surface, #F5F0E8)',
                padding: '10px 14px',
                cursor: 'pointer',
                justifyContent: 'space-between',
                fontWeight: 700,
                fontSize: 13,
              }}
              onClick={() => setCollapsed(prev => ({ ...prev, [day]: !isCollapsed }))}
            >
              <span>{label} · {rows.length}</span>
              <span className="adm-muted">{isCollapsed ? '▶' : '▼'}</span>
            </button>
            {!isCollapsed && (
              <div style={{ padding: '0 8px 8px' }}>
                <TableShell
                  questions={rows}
                  selectedIds={selectedIds}
                  readOnly={readOnly}
                  onToggleAll={onToggleAll}
                  showSelectAll={false}
                >
                  <QuestionRows {...rowProps} questions={rows} />
                </TableShell>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
