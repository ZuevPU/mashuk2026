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
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onSelectAll: (ids: number[]) => void;
  onEdit: (t: AdminTask) => void;
  onDuplicate: (id: number) => void;
  onQr: (id: number) => void;
  onHide: (id: number) => void;
  onArchive: (id: number) => void;
  onDelete: (id: number) => void;
  onModerate: (t: AdminTask) => void;
};

function MetaChip({ children }: { children: string }) {
  if (!children || children === '—') return null;
  return <span className="adm-tasks-chip">{children}</span>;
}

export function TasksListTable({
  tasks,
  categoriesById,
  selectedIds,
  onToggleSelect,
  onSelectAll,
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

  const allSelected = tasks.length > 0 && tasks.every(t => selectedIds.has(t.id));

  return (
    <div className="adm-tasks-list">
      <div className="adm-tasks-list-head">
        <label className="adm-tasks-check">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => onSelectAll(allSelected ? [] : tasks.map(t => t.id))}
          />
          <span>Все на странице</span>
        </label>
      </div>

      {tasks.map(t => {
        const cat = t.categoryName || (t.categoryId ? categoriesById.get(t.categoryId) : null) || t.category || '—';
        const days = t.dayNumbers?.length ? t.dayNumbers.join(', ') : String(t.dayNumber ?? '—');
        const short = (t.shortDescription || t.description || '').trim();
        const isSelected = selectedIds.has(t.id);
        const isHidden = t.isHidden;
        const time = formatTaskDateTime(t.eventTime ?? t.availableFrom ?? t.publishTime);
        const deadline = formatTaskDateTime(t.applicationDeadline);
        const medal = medalLabel(t);
        const methods = methodsLabel(t.confirmationMethods);
        const nomination = nominationLabel(t.nomination);

        return (
          <article
            key={t.id}
            className={[
              'adm-tasks-item',
              isSelected ? 'is-selected' : '',
              isHidden ? 'is-hidden' : '',
            ].filter(Boolean).join(' ')}
          >
            <div className="adm-tasks-item-row1">
              <label className="adm-tasks-check adm-tasks-check-solo">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect(t.id)}
                  aria-label={`Выбрать задание ${t.id}`}
                />
              </label>

              <div className="adm-tasks-item-main">
                <div className="adm-tasks-item-title-line">
                  <span className="adm-tasks-id">#{t.id}</span>
                  <button type="button" className="adm-tasks-title" onClick={() => onEdit(t)}>
                    {t.title}
                  </button>
                  <span className="adm-tasks-status">{statusLabel(t)}</span>
                </div>
                {short ? (
                  <p className="adm-tasks-short" title={short}>
                    {short.length > 120 ? `${short.slice(0, 120)}…` : short}
                  </p>
                ) : null}
              </div>

              <div className="adm-tasks-item-kpis" aria-label="Ключевые поля">
                <span><em>Баллы</em>{t.points ?? 0}</span>
                <span><em>День</em>{days}</span>
                <span><em>Вып.</em>{t.completionCount ?? 0}</span>
                {t.pendingModerationCount ? (
                  <span className="is-warn" title="Заявок ждут играпрактика">
                    <em>Проверка</em>{t.pendingModerationCount}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="adm-tasks-item-row2">
              <div className="adm-tasks-item-meta">
                <MetaChip>{cat}</MetaChip>
                <MetaChip>{nomination}</MetaChip>
                <MetaChip>{taskKindLabel(t)}</MetaChip>
                {t.dailyRepeatLimit && t.executionType !== 'once' ? (
                  <MetaChip>{`Лимит ${t.dailyRepeatLimit}`}</MetaChip>
                ) : null}
                {t.programPlaceName ? <MetaChip>{t.programPlaceName}</MetaChip> : null}
                {time !== '—' ? <MetaChip>{time}</MetaChip> : null}
                {medal !== '—' ? <MetaChip>{medal}</MetaChip> : null}
                {methods !== '—' ? <MetaChip>{methods}</MetaChip> : null}
                {deadline !== '—' ? <MetaChip>{`До ${deadline}`}</MetaChip> : null}
              </div>

              <div className="adm-tasks-item-actions">
                <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => onEdit(t)}>
                  Изменить
                </button>
                <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => onDuplicate(t.id)}>
                  Дубль
                </button>
                <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => onQr(t.id)}>
                  QR
                </button>
                <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => onModerate(t)}>
                  Проверка
                </button>
                <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => onHide(t.id)}>
                  {t.isHidden ? 'Показать' : 'Скрыть'}
                </button>
                <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => onArchive(t.id)}>
                  Архив
                </button>
                <button type="button" className="adm-btn adm-btn-danger adm-btn-sm" onClick={() => onDelete(t.id)}>
                  Удалить
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
