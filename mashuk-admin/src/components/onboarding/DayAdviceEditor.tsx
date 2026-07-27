import { useState } from 'react';
import { ROLE_OPTIONS, roleName } from './roleOptions';
import type { DayExperiment } from './types';

export type AdviceForm = {
  dayNumber: number;
  roleKey: string;
  title: string;
  body: string;
  hint: string;
};

type Props = {
  experiments: DayExperiment[];
  form: AdviceForm;
  onFormChange: (next: AdviceForm) => void;
  onSave: () => void;
  onDelete: (id: number) => void;
  onEditLoad: (exp: DayExperiment) => void;
};

export function DayAdviceEditor({
  experiments,
  form,
  onFormChange,
  onSave,
  onDelete,
  onEditLoad,
}: Props) {
  const [editingId, setEditingId] = useState<number | null>(null);

  const startEdit = (e: DayExperiment) => {
    setEditingId(e.id);
    onEditLoad(e);
  };

  const cancelEdit = () => {
    setEditingId(null);
    onFormChange({
      dayNumber: 2,
      roleKey: 'meaning_researcher',
      title: '',
      body: '',
      hint: '',
    });
  };

  return (
    <div className="adm-forum-block card">
      <h3>Советы «роль × день» (Д2–Д7)</h3>
      <p className="adm-forum-hint">
        Короткие подсказки для карточки на главной в зависимости от роли участника и дня форума.
      </p>
      <div className="card adm-forum-nested-card">
        <div className="adm-forum-grid-2">
          <label className="adm-field">
            <span className="adm-label">День</span>
            <select
              className="adm-input"
              value={form.dayNumber}
              onChange={e => onFormChange({ ...form, dayNumber: Number(e.target.value) })}
            >
              {[2, 3, 4, 5, 6, 7].map(d => (
                <option key={d} value={d}>День {d}</option>
              ))}
            </select>
          </label>
          <label className="adm-field">
            <span className="adm-label">Роль</span>
            <select
              className="adm-input"
              value={form.roleKey}
              onChange={e => onFormChange({ ...form, roleKey: e.target.value })}
            >
              {ROLE_OPTIONS.map(r => (
                <option key={r.key} value={r.key}>{r.name}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="adm-field">
          <span className="adm-label">Заголовок</span>
          <input
            className="adm-input"
            value={form.title}
            onChange={e => onFormChange({ ...form, title: e.target.value })}
            placeholder="Заголовок совета"
          />
        </label>
        <label className="adm-field">
          <span className="adm-label">Текст совета</span>
          <textarea
            className="adm-input adm-textarea"
            rows={3}
            value={form.body}
            onChange={e => onFormChange({ ...form, body: e.target.value })}
          />
        </label>
        <label className="adm-field">
          <span className="adm-label">Подсказка (необязательно)</span>
          <input
            className="adm-input"
            value={form.hint}
            onChange={e => onFormChange({ ...form, hint: e.target.value })}
          />
        </label>
        <div className="adm-forum-actions">
          <button type="button" className="adm-btn adm-btn-primary" onClick={() => { onSave(); setEditingId(null); }}>
            {editingId != null ? 'Обновить совет' : 'Сохранить совет'}
          </button>
          {editingId != null && (
            <button type="button" className="adm-btn" onClick={cancelEdit}>Отмена</button>
          )}
        </div>
      </div>
      <div className="adm-onboarding-advice-list">
        {experiments.map(e => (
          <div key={e.id} className="card adm-forum-nested-card adm-onboarding-advice-card">
            <div className="adm-onboarding-advice-head">
              <span className="tag-chip">День {e.dayNumber}</span>
              <span className="tag-chip">{roleName(e.roleKey)}</span>
              <strong>{e.title}</strong>
              <span className="adm-onboarding-advice-actions">
                <button
                  type="button"
                  className="adm-tag-icon-btn"
                  title="Редактировать"
                  aria-label="Редактировать"
                  onClick={() => startEdit(e)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="adm-tag-icon-btn adm-tag-icon-btn-delete"
                  title="Удалить"
                  aria-label="Удалить"
                  onClick={() => {
                    if (!window.confirm('Удалить этот совет?')) return;
                    onDelete(e.id);
                  }}
                >
                  ×
                </button>
              </span>
            </div>
            <p className="adm-muted adm-onboarding-advice-preview">
              {(e.body || '').slice(0, 200)}{(e.body || '').length > 200 ? '…' : ''}
            </p>
            {e.hint && <p className="adm-forum-hint">Подсказка: {e.hint}</p>}
          </div>
        ))}
        {!experiments.length && <p className="adm-muted">Советов пока нет — добавьте первый через форму выше.</p>}
      </div>
    </div>
  );
}
