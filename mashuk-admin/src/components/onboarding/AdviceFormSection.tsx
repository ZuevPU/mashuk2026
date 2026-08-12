import { useMemo, useState } from 'react';
import { AdviceParticipantPreview } from './AdviceParticipantPreview';
import { ROLE_OPTIONS, roleName } from './roleOptions';
import type { DayExperiment } from './types';

export type AdviceFormState = {
  dayNumber: number;
  roleKey: string;
  title: string;
  body: string;
  hint: string;
  title2: string;
  body2: string;
  hint2: string;
  title3: string;
  body3: string;
  hint3: string;
  status: 'draft' | 'published';
};

export const emptyAdviceForm = (): AdviceFormState => ({
  dayNumber: 2,
  roleKey: 'meaning_researcher',
  title: '',
  body: '',
  hint: '',
  title2: '',
  body2: '',
  hint2: '',
  title3: '',
  body3: '',
  hint3: '',
  status: 'draft',
});

export function adviceFromExperiment(e: DayExperiment): AdviceFormState {
  return {
    dayNumber: e.dayNumber,
    roleKey: e.roleKey,
    title: e.title,
    body: e.body || '',
    hint: '',
    title2: e.title2 || '',
    body2: e.body2 || '',
    hint2: '',
    title3: e.title3 || '',
    body3: e.body3 || '',
    hint3: '',
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

  const b1Left = 500 - form.body.length;
  const b2Left = 500 - form.body2.length;
  const b3Left = 500 - form.body3.length;

  const statusLabel = useMemo(
    () => (form.status === 'published' ? 'Опубликован' : 'Черновик'),
    [form.status],
  );

  return (
    <div className="card adm-forum-block adm-kb-panel adm-advice-form">
      <div className="adm-forum-toolbar" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{editingId != null ? 'Редактирование советов' : 'Новые советы'}</h3>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AdviceParticipantPreview body={form.body} roleKey={form.roleKey} />
          {form.body2.trim() && <AdviceParticipantPreview body={form.body2} roleKey={form.roleKey} />}
          {form.body3.trim() && <AdviceParticipantPreview body={form.body3} roleKey={form.roleKey} />}
        </div>
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

      <div style={{ border: '1px solid #eee', padding: 12, borderRadius: 8, marginBottom: 16 }}>
        <h4 style={{ margin: '0 0 10px' }}>Совет дня №1 (основной)</h4>
        <label className="adm-field">
          <span className="adm-label">Текст совета ({b1Left} симв.)</span>
          <textarea
            className="adm-input adm-textarea"
            rows={3}
            value={form.body}
            maxLength={500}
            onChange={e => onChange({ ...form, body: e.target.value, title: '', hint: '' })}
            placeholder="До 500 символов"
          />
        </label>
      </div>

      <div style={{ border: '1px solid #eee', padding: 12, borderRadius: 8, marginBottom: 16 }}>
        <h4 style={{ margin: '0 0 10px' }}>Совет дня №2 (опционально)</h4>
        <label className="adm-field">
          <span className="adm-label">Текст совета ({b2Left} симв.)</span>
          <textarea
            className="adm-input adm-textarea"
            rows={3}
            value={form.body2}
            maxLength={500}
            onChange={e => onChange({ ...form, body2: e.target.value, title2: '', hint2: '' })}
            placeholder="До 500 символов"
          />
        </label>
      </div>

      <div style={{ border: '1px solid #eee', padding: 12, borderRadius: 8, marginBottom: 16 }}>
        <h4 style={{ margin: '0 0 10px' }}>Совет дня №3 (опционально)</h4>
        <label className="adm-field">
          <span className="adm-label">Текст совета ({b3Left} симв.)</span>
          <textarea
            className="adm-input adm-textarea"
            rows={3}
            value={form.body3}
            maxLength={500}
            onChange={e => onChange({ ...form, body3: e.target.value, title3: '', hint3: '' })}
            placeholder="До 500 символов"
          />
        </label>
      </div>

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
        Одна пара (роль × день) — до 3 советов. Повторное сохранение обновит существующую запись ({roleName(form.roleKey)}, день {form.dayNumber}).
      </p>
    </div>
  );
}
