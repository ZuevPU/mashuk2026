import { useEffect, useMemo, useRef } from 'react';
import type { ProgramPlace } from '../program/types';
import { TaskParticipantPreview } from './TaskParticipantPreview';
import {
  CONFIRMATION_METHOD_OPTIONS,
  NOMINATION_OPTIONS,
  type TaskCategory,
  type TaskDraft,
  type MedalOption,
} from './types';

type Props = {
  draft: TaskDraft;
  categories: TaskCategory[];
  places: ProgramPlace[];
  medals?: MedalOption[];
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
      scopeType: next.includes('team') ? 'team' : draft.scopeType,
    });
  };

  const execExec = (executionType: string) => onChange({ executionType });

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
        <span className="adm-label">Описание (rich text)</span>
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
          <span className="adm-label">Тип</span>
          <select className="adm-input" value={draft.scopeType} onChange={e => onChange({ scopeType: e.target.value })}>
            <option value="individual">Индивидуальное</option>
            <option value="team">Командное</option>
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

      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">Лимит выполнений</span>
          <select className="adm-input" value={draft.executionType} onChange={e => execExec(e.target.value)}>
            <option value="once">Одноразовое</option>
            <option value="daily">Ежедневное</option>
            <option value="repeatable">Многоразовое</option>
          </select>
        </label>
        {(draft.executionType === 'daily' || draft.executionType === 'repeatable') && (
          <label className="adm-field">
            <span className="adm-label">Лимит / день</span>
            <input type="number" className="adm-input" value={draft.dailyRepeatLimit} onChange={e => onChange({ dailyRepeatLimit: Number(e.target.value) })} />
          </label>
        )}
      </div>

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
          <input type="checkbox" checked={draft.medalTask} onChange={e => onChange({ medalTask: e.target.checked })} />
          Особое (награда медалью)
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

      {draft.confirmationMethods.includes('qr') && (
        <div className="adm-forum-grid-2">
          <label className="adm-field">
            <span className="adm-label">QR активен с</span>
            <input type="datetime-local" className="adm-input" value={draft.qrValidFromLocal} onChange={e => onChange({ qrValidFromLocal: e.target.value })} />
          </label>
          <label className="adm-field">
            <span className="adm-label">QR активен до</span>
            <input type="datetime-local" className="adm-input" value={draft.qrValidToLocal} onChange={e => onChange({ qrValidToLocal: e.target.value })} />
          </label>
        </div>
      )}

      <div className="adm-forum-toolbar" style={{ marginTop: 16 }}>
        <button type="button" className="adm-btn adm-btn-primary" onClick={onSave}>Сохранить черновик</button>
        <button type="button" className="adm-btn adm-btn-secondary" onClick={onPublish}>Опубликовать</button>
        <span className="adm-muted" style={{ fontSize: 12 }}>Статус: {draft.status === 'published' ? 'Опубликовано' : draft.status === 'archived' ? 'Архив' : 'Черновик'}</span>
      </div>
    </div>
  );
}
