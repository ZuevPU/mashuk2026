import { useEffect, useRef, useState } from 'react';
import { apiGet, apiPatch, ApiError } from '../../api/client';

function isPlaceholderName(first?: string | null, last?: string | null): boolean {
  const full = `${first || ''} ${last || ''}`.trim().toLowerCase();
  return full === 'тест пользователь' || full === 'test user' || !full;
}

type DirectionOpt = { id: number; name: string };

type SavedUser = {
  firstName: string;
  lastName: string;
  direction?: string | null;
  directionId?: number | null;
  groupId?: number | null;
  groupName?: string | null;
};

type Props = {
  firstName: string;
  lastName: string;
  direction?: string | null;
  directionId?: number | null;
  onSaved: (user: SavedUser) => void;
  onError: (message: string) => void;
};

export function ProfileNameEditor({
  firstName,
  lastName,
  direction,
  directionId,
  onSaved,
  onError,
}: Props) {
  const placeholder = isPlaceholderName(firstName, lastName);
  const [open, setOpen] = useState(placeholder);
  const [first, setFirst] = useState(placeholder ? '' : firstName);
  const [last, setLast] = useState(placeholder ? '' : lastName);
  const [pickedDirectionId, setPickedDirectionId] = useState<number | ''>(directionId ?? '');
  const [directions, setDirections] = useState<DirectionOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => firstRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    apiGet<{ directions: DirectionOpt[] }>('/directions')
      .then(data => {
        const list = data.directions || [];
        if (directionId && direction && !list.some(d => d.id === directionId)) {
          setDirections([{ id: directionId, name: direction }, ...list]);
        } else {
          setDirections(list);
        }
      })
      .catch(() => setDirections(
        directionId && direction ? [{ id: directionId, name: direction }] : [],
      ));
  }, [open, direction, directionId]);

  const display = placeholder ? 'Имя не указано' : `${firstName} ${lastName}`.trim();
  const canSave = first.trim().length > 0 && last.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await apiPatch<{ user: SavedUser }>('/profile/name', {
        firstName: first,
        lastName: last,
        ...(pickedDirectionId ? { directionId: Number(pickedDirectionId) } : {}),
      });
      onSaved(res.user);
      setOpen(false);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
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
        {directions.length > 0 && (
          <label className="pf-name-row">
            <span>Направление</span>
            <select
              value={pickedDirectionId}
              onChange={e => setPickedDirectionId(e.target.value ? Number(e.target.value) : '')}
            >
              {!pickedDirectionId && <option value="">Выберите направление</option>}
              {directions.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="pf-name-actions">
        {!placeholder && (
          <button
            type="button"
            className="pf-name-btn pf-name-btn--ghost"
            onClick={() => {
              setFirst(firstName);
              setLast(lastName);
              setPickedDirectionId(directionId ?? '');
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
