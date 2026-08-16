import { useEffect, useRef, useState } from 'react';
import { apiGet, apiPatch, ApiError } from '../../api/client';

function isPlaceholderName(first?: string | null, last?: string | null): boolean {
  const full = `${first || ''} ${last || ''}`.trim().toLowerCase();
  return full === 'тест пользователь' || full === 'test user' || !full;
}

type GroupOpt = {
  id: number;
  name: string;
  seatsLeft: number | null;
};

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
  groupId?: number | null;
  groupName?: string | null;
  onSaved: (user: SavedUser) => void;
  onError: (message: string) => void;
};

export function ProfileNameEditor({
  firstName,
  lastName,
  groupId,
  groupName,
  onSaved,
  onError,
}: Props) {
  const placeholder = isPlaceholderName(firstName, lastName);
  const [open, setOpen] = useState(placeholder);
  const [first, setFirst] = useState(placeholder ? '' : firstName);
  const [last, setLast] = useState(placeholder ? '' : lastName);
  const [pickedGroupId, setPickedGroupId] = useState<number | ''>(groupId ?? '');
  const [groups, setGroups] = useState<GroupOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => firstRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    apiGet<{ groups: GroupOpt[] }>('/profile/groups')
      .then(data => {
        const list = data.groups || [];
        if (groupId && groupName && !list.some(g => g.id === groupId)) {
          setGroups([{ id: groupId, name: groupName, seatsLeft: null }, ...list]);
        } else {
          setGroups(list);
        }
      })
      .catch(() => setGroups(
        groupId && groupName ? [{ id: groupId, name: groupName, seatsLeft: null }] : [],
      ));
  }, [open, groupId, groupName]);

  const display = placeholder ? 'Имя не указано' : `${firstName} ${lastName}`.trim();
  const canSave = first.trim().length > 0 && last.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await apiPatch<{ user: SavedUser }>('/profile/name', {
        firstName: first,
        lastName: last,
        ...(pickedGroupId ? { groupId: Number(pickedGroupId) } : {}),
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
        {groups.length > 0 && (
          <label className="pf-name-row">
            <span>Группа</span>
            <select
              value={pickedGroupId}
              onChange={e => setPickedGroupId(e.target.value ? Number(e.target.value) : '')}
            >
              {!pickedGroupId && <option value="">Выберите группу</option>}
              {groups.map(g => {
                const full = g.seatsLeft === 0 && g.id !== groupId;
                return (
                  <option key={g.id} value={g.id} disabled={full}>
                    {full ? `${g.name} (нет мест)` : g.name}
                  </option>
                );
              })}
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
              setPickedGroupId(groupId ?? '');
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
