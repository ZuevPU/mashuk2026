import { useMemo, useState } from 'react';
import { AdviceParticipantPreview } from './AdviceParticipantPreview';
import { ROLE_OPTIONS, roleName } from './roleOptions';
import type { DayExperiment } from './types';

export type AdviceFormState = {
  dayNumber: number;
  roleKey: string;
  title: string;
  body: string;
  status: 'draft' | 'published';
};

export const emptyAdviceForm = (): AdviceFormState => ({
  dayNumber: 2,
  roleKey: 'meaning_researcher',
  title: '',
  body: '',
  status: 'draft',
});

export function adviceFromExperiment(e: DayExperiment): AdviceFormState {
  return {
    dayNumber: e.dayNumber,
    roleKey: e.roleKey,
    title: e.title,
    body: e.body || '',
    status: (e.status === 'published' ? 'published' : 'draft'),
  };
}

type Props = {
  form: AdviceFormState;
  editingId: number | null;
  onChange: (next: AdviceFormState) => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  onCancel: () => void;
};

export function AdviceFormSection({
  form,
  editingId,
  onChange,
  onSaveDraft,
  onPublish,
  onCancel,
}: Props) {
  const [showPreview, setShowPreview] = useState(false);
  const titleLeft = 60 - form.title.length;
  const bodyLeft = 500 - form.body.length;

  const statusLabel = useMemo(
    () => (form.status === 'published' ? 'Опубликован' : 'Черновик'),
    [form.status],
  );

  return (
    <div className="card adm-forum-block adm-advice-form">
      <div className="adm-forum-toolbar" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{editingId != null ? 'Редактирование совета' : 'Новый совет'}</h3>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setShowPreview(v => !v)}>
            👁 {showPreview ? 'Скрыть превью' : 'Посмотреть как участник'}
          </button>
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={onCancel}>
            К списку
          </button>
        </div>
      </div>

      {showPreview && (
        <AdviceParticipantPreview title={form.title} body={form.body} roleKey={form.roleKey} />
      )}

      <p className="adm-muted" style={{ fontSize: 12 }}>Статус формы: {statusLabel}</p>

      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">Роль</span>
          <select
            className="adm-input"
            value={form.roleKey}
            onChange={e => onChange({ ...form, roleKey: e.target.value })}
          >
            {ROLE_OPTIONS.map(r => (
              <option key={r.key} value={r.key}>{r.name}</option>
            ))}
          </select>
        </label>
        <label className="adm-field">
          <span className="adm-label">День смены</span>
          <select
            className="adm-input"
            value={form.dayNumber}
            onChange={e => onChange({ ...form, dayNumber: Number(e.target.value) })}
          >
            {[1, 2, 3, 4, 5, 6, 7].map(d => (
              <option key={d} value={d}>День {d}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="adm-field">
        <span className="adm-label">Заголовок совета ({titleLeft} симв.)</span>
        <input
          className="adm-input"
          value={form.title}
          maxLength={60}
          onChange={e => onChange({ ...form, title: e.target.value })}
          placeholder="До 60 символов"
        />
      </label>

      <label className="adm-field">
        <span className="adm-label">Текст совета ({bodyLeft} симв.)</span>
        <textarea
          className="adm-input adm-textarea"
          rows={4}
          value={form.body}
          maxLength={500}
          onChange={e => onChange({ ...form, body: e.target.value })}
          placeholder="До 500 символов"
        />
      </label>

      <div className="adm-forum-actions">
        <button
          type="button"
          className="adm-btn adm-btn-primary"
          onClick={onSaveDraft}
        >
          Сохранить
        </button>
        <button
          type="button"
          className="adm-btn adm-btn-secondary"
          onClick={onPublish}
        >
          Опубликовать
        </button>
      </div>
      <p className="adm-forum-hint">
        Одна пара (роль × день) — один совет. Повторное сохранение обновит существующую запись ({roleName(form.roleKey)}, день {form.dayNumber}).
      </p>
    </div>
  );
}
