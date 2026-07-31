import { useEffect, useMemo, useRef } from 'react';
import type { ProgramPlace } from '../program/types';
import { TaskParticipantPreview } from './TaskParticipantPreview';
import {
  CATALOG_STATUS_OPTIONS,
  CONFIRMATION_METHOD_OPTIONS,
  NOMINATION_OPTIONS,
  TASK_KIND_OPTIONS,
  type MedalOption,
  type TaskCategory,
  type TaskDraft,
  type TaskKind,
} from './types';

type Props = {
  draft: TaskDraft;
  categories: TaskCategory[];
  places: ProgramPlace[];
  medals: MedalOption[];
  totalDays: number;
  isNew: boolean;
  editingKey: string | number;
  onChange: (patch: Partial<TaskDraft>) => void;
  onSave: () => void;
  onPublish: () => void;
  onDuplicate?: () => void;
  onCancel: () => void;
  showPreview: boolean;
  onTogglePreview: () => void;
};

export function TaskForm({
  draft,
  categories,
  places,
  medals,
  totalDays,
  isNew,
  editingKey,
  onChange,
  onSave,
  onPublish,
  onDuplicate,
  onCancel,
  showPreview,
  onTogglePreview,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = draft.descriptionHtml || '';
  }, [editingKey]);
  const categoryName = useMemo(
    () => categories.find(c => c.id === draft.categoryId)?.name,
    [categories, draft.categoryId],
  );

  const toggleDay = (d: number) => {
    const has = draft.dayNumbers.includes(d);
    const next = has ? draft.dayNumbers.filter(x => x !== d) : [...draft.dayNumbers, d].sort((a, b) => a - b);
    onChange({ dayNumbers: next.length ? next : [d] });
  };

  const toggleMethod = (key: string) => {
    const has = draft.confirmationMethods.includes(key);
    const next = has ? draft.confirmationMethods.filter(x => x !== key) : [...draft.confirmationMethods, key];
    onChange({
      confirmationMethods: next,
      requiresModeration: next.includes('moderator'),
      taskKind: next.includes('team') ? 'team' : draft.taskKind === 'team' ? 'once' : draft.taskKind,
      scopeType: next.includes('team') ? 'team' : 'individual',
    });
  };

  const setTaskKind = (kind: TaskKind) => {
    if (kind === 'team') {
      const methods = draft.confirmationMethods.includes('team')
        ? draft.confirmationMethods
        : [...draft.confirmationMethods, 'team'];
      onChange({ taskKind: 'team', scopeType: 'team', executionType: 'once', confirmationMethods: methods });
      return;
    }
    onChange({
      taskKind: kind,
      scopeType: 'individual',
      executionType: kind,
      confirmationMethods: draft.confirmationMethods.filter(x => x !== 'team'),
    });
  };

  return (
    <div className="card adm-task-form">
      <div className="adm-forum-toolbar" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{isNew ? 'Новое задание' : 'Редактирование задания'}</h3>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={onTogglePreview}>
            👁 {showPreview ? 'Скрыть превью' : 'Посмотреть как участник'}
          </button>
          {onDuplicate && (
            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={onDuplicate}>
              Скопировать
            </button>
          )}
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={onCancel}>
            К списку
          </button>
        </div>
      </div>

      {showPreview && (
        <TaskParticipantPreview draft={draft} categoryName={categoryName} />
      )}

      <label className="adm-field">
        <span className="adm-label">Название</span>
        <input className="adm-input" value={draft.title} onChange={e => onChange({ title: e.target.value })} />
      </label>

      <label className="adm-field">
        <span className="adm-label">Краткое описание</span>
        <textarea
          className="adm-input"
          rows={2}
          value={draft.shortDescription}
          onChange={e => onChange({ shortDescription: e.target.value })}
          placeholder="1–2 предложения для карточки в списке"
        />
      </label>

      <label className="adm-field">
        <span className="adm-label">Полное условие (rich text)</span>
        <div className="adm-rich-toolbar">
          <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onClick={() => document.execCommand('bold')}>B</button>
          <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onClick={() => document.execCommand('insertUnorderedList')}>•</button>
        </div>
        <div
          ref={editorRef}
          className="adm-input adm-rich-editor"
          contentEditable
          suppressContentEditableWarning
          onInput={() => onChange({ descriptionHtml: editorRef.current?.innerHTML || '' })}
        />
      </label>

      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">Иконка задания (ключ)</span>
          <input className="adm-input" value={draft.iconKey} onChange={e => onChange({ iconKey: e.target.value })} placeholder="sport, media…" />
        </label>
        <label className="adm-field">
          <span className="adm-label">Категория</span>
          <select
            className="adm-input"
            value={draft.categoryId}
            onChange={e => onChange({ categoryId: e.target.value ? Number(e.target.value) : '' })}
          >
            <option value="">— выберите —</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">Тип задания</span>
          <select className="adm-input" value={draft.taskKind} onChange={e => setTaskKind(e.target.value as TaskKind)}>
            {TASK_KIND_OPTIONS.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="adm-field">
          <span className="adm-label">Баллы (линия «Опыт»)</span>
          <input type="number" className="adm-input" value={draft.points} onChange={e => onChange({ points: Number(e.target.value) })} />
        </label>
      </div>

      <div className="adm-field">
        <span className="adm-label">День доступности (мультивыбор)</span>
        <div className="adm-seg adm-forum-day-seg">
          {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => (
            <button key={d} type="button" className={draft.dayNumbers.includes(d) ? 'on' : ''} onClick={() => toggleDay(d)}>
              {d}
            </button>
          ))}
        </div>
      </div>

      {(draft.taskKind === 'daily' || draft.taskKind === 'repeatable') && (
        <label className="adm-field">
          <span className="adm-label">Лимит выполнений / день</span>
          <input type="number" className="adm-input" value={draft.dailyRepeatLimit} onChange={e => onChange({ dailyRepeatLimit: Number(e.target.value) })} />
        </label>
      )}

      <div className="adm-field">
        <span className="adm-label">Способ подтверждения (мультивыбор)</span>
        <div className="adm-program-tag-pick">
          {CONFIRMATION_METHOD_OPTIONS.map(m => (
            <button
              key={m.key}
              type="button"
              className={`adm-chip-btn ${draft.confirmationMethods.includes(m.key) ? 'on' : ''}`}
              onClick={() => toggleMethod(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="form-row" style={{ flexWrap: 'wrap', gap: 16 }}>
        <label className="adm-forum-check">
          <input
            type="checkbox"
            checked={draft.requiresModeration}
            onChange={e => {
              const req = e.target.checked;
              let methods = [...draft.confirmationMethods];
              if (req && !methods.includes('moderator')) methods.push('moderator');
              if (!req) methods = methods.filter(x => x !== 'moderator');
              onChange({ requiresModeration: req, confirmationMethods: methods });
            }}
          />
          Требует модерации
        </label>
        <label className="adm-forum-check">
          <input type="checkbox" checked={draft.pushOnPublish} onChange={e => onChange({ pushOnPublish: e.target.checked })} />
          Push при публикации
        </label>
        <label className="adm-forum-check">
          <input type="checkbox" checked={draft.allowRetry} onChange={e => onChange({ allowRetry: e.target.checked })} />
          Повтор при отклонении
        </label>
      </div>

      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">Номинация (рейтинг)</span>
          <select className="adm-input" value={draft.nomination} onChange={e => onChange({ nomination: e.target.value })}>
            {NOMINATION_OPTIONS.map(o => (
              <option key={o.key || 'none'} value={o.key}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="adm-field">
          <span className="adm-label">Место проведения</span>
          <select
            className="adm-input"
            value={draft.programPlaceId}
            onChange={e => onChange({ programPlaceId: e.target.value ? Number(e.target.value) : '' })}
          >
            <option value="">— не выбрано —</option>
            {places.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">Медаль за выполнение</span>
          <select
            className="adm-input"
            value={draft.medalId}
            onChange={e => {
              const v = e.target.value;
              onChange({
                medalId: v ? Number(v) : '',
                medalTask: !!v,
              });
            }}
          >
            <option value="">— без медали —</option>
            {medals.map(m => (
              <option key={m.id} value={m.id}>{m.name}{m.level ? ` (${m.level})` : ''}</option>
            ))}
          </select>
        </label>
        <label className="adm-field">
          <span className="adm-label">Количество медалей</span>
          <input
            type="number"
            min={1}
            max={10}
            className="adm-input"
            value={draft.medalCount}
            disabled={draft.medalId === ''}
            onChange={e => onChange({ medalCount: Number(e.target.value) || 1 })}
          />
        </label>
      </div>

      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">Статус в каталоге</span>
          <select className="adm-input" value={draft.catalogStatus} onChange={e => onChange({ catalogStatus: e.target.value as TaskDraft['catalogStatus'] })}>
            {CATALOG_STATUS_OPTIONS.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="adm-field">
          <span className="adm-label">Время проведения</span>
          <input type="datetime-local" className="adm-input" value={draft.eventTimeLocal} onChange={e => onChange({ eventTimeLocal: e.target.value, availableFromLocal: e.target.value })} />
        </label>
      </div>

      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">Время публикации</span>
          <input type="datetime-local" className="adm-input" value={draft.publishTimeLocal} onChange={e => onChange({ publishTimeLocal: e.target.value })} />
        </label>
        <label className="adm-field">
          <span className="adm-label">Срок приёма заявки</span>
          <input type="datetime-local" className="adm-input" value={draft.applicationDeadlineLocal} onChange={e => onChange({ applicationDeadlineLocal: e.target.value })} />
        </label>
      </div>
      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">Срок выполнения — начало</span>
          <input type="datetime-local" className="adm-input" value={draft.availableFromLocal} onChange={e => onChange({ availableFromLocal: e.target.value })} />
        </label>
        <label className="adm-field">
          <span className="adm-label">Срок выполнения — окончание</span>
          <input type="datetime-local" className="adm-input" value={draft.availableToLocal} onChange={e => onChange({ availableToLocal: e.target.value })} />
        </label>
      </div>

      <div className="adm-forum-toolbar" style={{ marginTop: 16 }}>
        <button type="button" className="adm-btn adm-btn-primary" onClick={onSave}>Сохранить черновик</button>
        <button type="button" className="adm-btn adm-btn-secondary" onClick={onPublish}>Опубликовать</button>
        <span className="adm-muted" style={{ fontSize: 12 }}>
          Статус: {CATALOG_STATUS_OPTIONS.find(o => o.key === draft.catalogStatus)?.label ?? draft.catalogStatus}
        </span>
      </div>
    </div>
  );
}
