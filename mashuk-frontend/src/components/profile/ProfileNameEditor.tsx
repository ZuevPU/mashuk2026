import { useEffect, useRef, useState } from 'react';
import { apiPatch, ApiError } from '../../api/client';

function isPlaceholderName(first?: string | null, last?: string | null): boolean {
  const full = `${first || ''} ${last || ''}`.trim().toLowerCase();
  return full === 'тест пользователь' || full === 'test user' || !full;
}

type Props = {
  firstName: string;
  lastName: string;
  onSaved: (firstName: string, lastName: string) => void;
  onError: (message: string) => void;
};

export function ProfileNameEditor({ firstName, lastName, onSaved, onError }: Props) {
  const placeholder = isPlaceholderName(firstName, lastName);
  const [open, setOpen] = useState(placeholder);
  const [first, setFirst] = useState(placeholder ? '' : firstName);
  const [last, setLast] = useState(placeholder ? '' : lastName);
  const [saving, setSaving] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => firstRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

  const display = placeholder ? 'Имя не указано' : `${firstName} ${lastName}`.trim();
  const canSave = first.trim().length > 0 && last.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await apiPatch<{ user: { firstName: string; lastName: string } }>('/profile/name', {
        firstName: first,
        lastName: last,
      });
      onSaved(res.user.firstName, res.user.lastName);
      setOpen(false);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Не удалось сохранить имя');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="pf-name-open" onClick={() => setOpen(true)}>
        <span className={`pf-n${placeholder ? ' pf-n--empty' : ''}`}>{display}</span>
        <span className="pf-name-hint">{placeholder ? 'Указать своё имя' : 'Изменить'}</span>
      </button>
    );
  }

  return (
    <div className="pf-name-edit">
      <div className="pf-name-edit-title">Как к вам обращаться</div>
      <div className="pf-name-group">
        <label className="pf-name-row">
          <span>Имя</span>
          <input
            ref={firstRef}
            value={first}
            onChange={e => setFirst(e.target.value)}
            placeholder="Анна"
            autoComplete="given-name"
            maxLength={80}
          />
        </label>
        <label className="pf-name-row">
          <span>Фамилия</span>
          <input
            value={last}
            onChange={e => setLast(e.target.value)}
            placeholder="Иванова"
            autoComplete="family-name"
            maxLength={80}
            onKeyDown={e => {
              if (e.key === 'Enter') void save();
            }}
          />
        </label>
      </div>
      <div className="pf-name-actions">
        {!placeholder && (
          <button
            type="button"
            className="pf-name-btn pf-name-btn--ghost"
            onClick={() => {
              setFirst(firstName);
              setLast(lastName);
              setOpen(false);
            }}
          >
            Отмена
          </button>
        )}
        <button
          type="button"
          className="pf-name-btn pf-name-btn--done"
          disabled={!canSave}
          onClick={() => void save()}
        >
          {saving ? 'Сохраняем…' : 'Готово'}
        </button>
      </div>
    </div>
  );
}
