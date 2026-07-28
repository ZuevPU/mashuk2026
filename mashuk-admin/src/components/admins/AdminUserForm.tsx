import { useEffect, useState } from 'react';
import type { AdminTabProps } from '../admin/types';

export type AdminUserDraft = {
  fullName: string;
  email: string;
  role: string;
  directionId: number | '';
  password: string;
  passwordMode: 'manual' | 'generate';
};

const ROLES = [
  'admin', 'director', 'analyst', 'curator', 'moderator', 'volunteer', 'organizer', 'gamification',
] as const;

const ROLE_LABELS: Record<string, string> = {
  admin: 'администратор',
  director: 'дирекция',
  analyst: 'аналитик',
  curator: 'куратор направления',
  moderator: 'модератор',
  volunteer: 'волонтёр',
  organizer: 'организатор',
  gamification: 'игропатика',
};

type Direction = { id: number; name: string };

type Props = AdminTabProps & {
  initial?: Partial<AdminUserDraft> & { id?: number; login?: string };
  onCancel: () => void;
  onSaved: (info?: { temporaryPassword: string; login?: string }) => void;
};

export function emptyAdminUserDraft(): AdminUserDraft {
  return {
    fullName: '',
    email: '',
    role: 'moderator',
    directionId: '',
    password: '',
    passwordMode: 'manual',
  };
}

export function AdminUserForm({ adminFetch, act, initial, onCancel, onSaved }: Props) {
  const [draft, setDraft] = useState<AdminUserDraft>(() => ({
    ...emptyAdminUserDraft(),
    ...initial,
    directionId: initial?.directionId ?? '',
  }));
  const [directions, setDirections] = useState<Direction[]>([]);
  const editing = initial?.id != null;

  useEffect(() => {
    adminFetch('/directions').then(r => setDirections(r.directions || [])).catch(() => {});
  }, [adminFetch]);

  const save = () => {
    if (!draft.email.trim()) return;
    if (draft.role === 'curator' && !draft.directionId) return;
    const body: Record<string, unknown> = {
      fullName: draft.fullName.trim() || undefined,
      email: draft.email.trim(),
      role: draft.role,
      directionId: draft.directionId === '' ? null : draft.directionId,
    };
    if (draft.passwordMode === 'manual' && draft.password) body.password = draft.password;

    act(async () => {
      if (editing && initial?.id) {
        await adminFetch(`/admin-users/${initial.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        onSaved();
      } else {
        const res = await adminFetch('/admin-users', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        const pwd = res.temporaryPassword as string | undefined;
        if (pwd) {
          onSaved({ temporaryPassword: pwd, login: res.user?.login as string | undefined });
        } else {
          onSaved();
        }
      }
    }, editing ? 'Пользователь сохранён' : 'Пользователь создан');
  };

  const sendInvitation = () => {
    if (!editing || initial?.id == null) return;
    act(async () => {
      const r = await adminFetch(`/admin-users/${initial.id}/reset-password`, { method: 'POST', body: '{}' });
      onSaved({
        temporaryPassword: r.temporaryPassword as string,
        login: initial.login ?? (draft.email.trim() || undefined),
      });
    }, 'Данные для входа сгенерированы — передайте пользователю');
  };

  return (
    <div className="card adm-forum-block">
      <h3>{editing ? 'Редактирование пользователя' : 'Новый пользователь админки'}</h3>
      <label className="adm-field">
        <span className="adm-label">ФИО</span>
        <input className="adm-input" value={draft.fullName} onChange={e => setDraft({ ...draft, fullName: e.target.value })} />
      </label>
      <label className="adm-field">
        <span className="adm-label">Email</span>
        <input className="adm-input" type="email" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} />
      </label>
      <label className="adm-field">
        <span className="adm-label">Роль</span>
        <select className="adm-input" value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })}>
          {ROLES.map(r => (
            <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
          ))}
        </select>
      </label>
      {draft.role === 'curator' && (
        <label className="adm-field">
          <span className="adm-label">Направление</span>
          <select
            className="adm-input"
            value={draft.directionId === '' ? '' : String(draft.directionId)}
            onChange={e => setDraft({ ...draft, directionId: e.target.value ? Number(e.target.value) : '' })}
          >
            <option value="">— выберите —</option>
            {directions.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
      )}
      {!editing && (
        <>
          <div className="adm-forum-toolbar" style={{ marginTop: 8 }}>
            <label className="adm-field" style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <input
                type="radio"
                checked={draft.passwordMode === 'manual'}
                onChange={() => setDraft({ ...draft, passwordMode: 'manual' })}
              />
              Задать вручную
            </label>
            <label className="adm-field" style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <input
                type="radio"
                checked={draft.passwordMode === 'generate'}
                onChange={() => setDraft({ ...draft, passwordMode: 'generate', password: '' })}
              />
              Сгенерировать и отправить
            </label>
          </div>
          {draft.passwordMode === 'manual' && (
            <label className="adm-field">
              <span className="adm-label">Пароль</span>
              <input
                className="adm-input"
                type="password"
                value={draft.password}
                onChange={e => setDraft({ ...draft, password: e.target.value })}
              />
            </label>
          )}
        </>
      )}
      <div className="adm-forum-toolbar" style={{ marginTop: 12 }}>
        <button type="button" className="adm-btn adm-btn-primary" onClick={save}>Сохранить</button>
        {editing && (
          <button type="button" className="adm-btn adm-btn-secondary" onClick={sendInvitation}>
            Отправить приглашение
          </button>
        )}
        <button type="button" className="adm-btn adm-btn-secondary" onClick={onCancel}>Отменить</button>
      </div>
    </div>
  );
}
