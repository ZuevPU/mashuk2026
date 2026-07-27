import { EnumOptions } from '../admin/EnumOptions';
import { taskDraftDirty, type AdminTask, type TaskDraft } from './types';

type Props = {
  task: AdminTask;
  draft: TaskDraft;
  onDraftChange: (patch: Partial<TaskDraft>) => void;
  onSave: () => void;
  onDelete: () => void;
  onQr: () => void;
  onModerate?: () => void;
  act: (fn: () => Promise<unknown>, msg?: string) => void;
};

export function TaskCard({ task, draft, onDraftChange, onSave, onDelete, onQr, onModerate, act: _act }: Props) {
  const dirty = taskDraftDirty(task, draft);

  const set = (patch: Partial<TaskDraft>) => onDraftChange(patch);

  return (
    <div className="card adm-task-card">
      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">Название</span>
          <input className="adm-input" value={draft.title} onChange={e => set({ title: e.target.value })} placeholder="Название" />
        </label>
        <label className="adm-field">
          <span className="adm-label">Категория</span>
          <input className="adm-input" value={draft.category} onChange={e => set({ category: e.target.value })} placeholder="Категория" />
        </label>
      </div>
      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">Баллы</span>
          <input type="number" className="adm-input" value={draft.points} onChange={e => set({ points: Number(e.target.value) })} />
        </label>
        <label className="adm-field">
          <span className="adm-label">День</span>
          <input type="number" className="adm-input" value={draft.dayNumber} onChange={e => set({ dayNumber: Number(e.target.value) })} />
        </label>
      </div>
      <label className="adm-field">
        <span className="adm-label">Описание</span>
        <textarea className="adm-input" value={draft.description} onChange={e => set({ description: e.target.value })} placeholder="Описание" rows={2} />
      </label>
      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">Тип подтверждения</span>
          <select className="adm-input" value={draft.confirmationType} onChange={e => set({ confirmationType: e.target.value })}>
            <EnumOptions values={['text_photo', 'photo', 'post_url', 'qr', 'auto', 'team']} />
          </select>
        </label>
        <label className="adm-field">
          <span className="adm-label">Частота выполнения</span>
          <select className="adm-input" value={draft.executionType} onChange={e => set({ executionType: e.target.value })} title="Частота выполнения">
            <EnumOptions values={['once', 'daily', 'repeatable']} />
          </select>
        </label>
      </div>
      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">Лимит / день</span>
          <input type="number" className="adm-input" value={draft.dailyRepeatLimit} onChange={e => set({ dailyRepeatLimit: Number(e.target.value) })} />
        </label>
        <label className="adm-field">
          <span className="adm-label">Ч на команду</span>
          <input type="number" className="adm-input" value={draft.teamConfirmHours} onChange={e => set({ teamConfirmHours: Number(e.target.value) })} />
        </label>
      </div>
      <div className="form-row" style={{ fontSize: 12, flexWrap: 'wrap', gap: 12 }}>
        <label className="adm-forum-check">
          <input type="checkbox" checked={draft.pushOnPublish} onChange={e => set({ pushOnPublish: e.target.checked })} />
          Уведомление при публикации
        </label>
        <label className="adm-forum-check">
          <input type="checkbox" checked={draft.allowRetry} onChange={e => set({ allowRetry: e.target.checked })} />
          Повтор
        </label>
        <label className="adm-forum-check">
          <input type="checkbox" checked={draft.autoConfirm} onChange={e => set({ autoConfirm: e.target.checked })} />
          Автоподтверждение
        </label>
      </div>
      <div className="adm-forum-toolbar">
        <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={onSave}>
          Сохранить{dirty ? ' •' : ''}
        </button>
        <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={onQr}>
          QR
        </button>
        {onModerate && (
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={onModerate}>
            Модерация ответов
          </button>
        )}
        <button
          type="button"
          className="adm-btn adm-btn-danger adm-btn-sm"
          onClick={() => {
            if (!confirm('Удалить задание?')) return;
            onDelete();
          }}
        >
          Удалить
        </button>
      </div>
      <p className="adm-muted" style={{ fontSize: 11, marginTop: 8 }}>id {task.id}</p>
    </div>
  );
}
