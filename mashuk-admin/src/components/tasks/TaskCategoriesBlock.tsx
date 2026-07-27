import type { TaskCategory } from './types';

type Props = {
  categories: TaskCategory[];
  newName: string;
  onNewNameChange: (v: string) => void;
  onAdd: () => void;
  onDelete: (id: number) => void;
};

export function TaskCategoriesBlock({ categories, newName, onNewNameChange, onAdd, onDelete }: Props) {
  return (
    <div className="card adm-forum-block">
      <h3>Категории заданий</h3>
      <p className="adm-forum-hint">Справочник для dropdown в форме задания и фильтра списка.</p>
      <div className="adm-forum-toolbar">
        <input
          className="adm-input"
          value={newName}
          onChange={e => onNewNameChange(e.target.value)}
          placeholder="Название категории"
          style={{ maxWidth: 280 }}
        />
        <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={onAdd}>
          Добавить
        </button>
      </div>
      <div className="adm-program-tag-pick" style={{ marginTop: 10 }}>
        {categories.map(c => (
          <span key={c.id} className="tag-chip adm-program-tag-chip">
            <span className="adm-program-tag-name">{c.name}</span>
            <button
              type="button"
              className="adm-tag-icon-btn adm-tag-icon-btn-delete"
              title="Удалить"
              aria-label="Удалить"
              onClick={() => onDelete(c.id)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
