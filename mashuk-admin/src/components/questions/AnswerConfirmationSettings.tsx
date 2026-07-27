import { useState } from 'react';

export type AnswerConfirmForm = {
  enabled: boolean;
  showPoints: boolean;
  titleTemplate: string;
};

type Props = {
  form: AnswerConfirmForm;
  onChange: (patch: Partial<AnswerConfirmForm>) => void;
  onSave: () => void;
};

export function AnswerConfirmationSettings({ form, onChange, onSave }: Props) {
  return (
    <div className="card adm-forum-block">
      <h3>Подтверждение после ответа (участник)</h3>
      <div className="form-row">
        <label className="adm-forum-check">
          <input type="checkbox" checked={form.enabled} onChange={e => onChange({ enabled: e.target.checked })} />
          Показывать карточку
        </label>
        <label className="adm-forum-check">
          <input type="checkbox" checked={form.showPoints} onChange={e => onChange({ showPoints: e.target.checked })} />
          Показывать баллы
        </label>
      </div>
      <input
        className="adm-input"
        value={form.titleTemplate}
        onChange={e => onChange({ titleTemplate: e.target.value })}
        placeholder="Заголовок карточки"
        style={{ width: '100%', marginTop: 8 }}
      />
      <button type="button" className="adm-btn" style={{ marginTop: 8 }} onClick={onSave}>
        Сохранить настройки
      </button>
    </div>
  );
}
