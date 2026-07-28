import { useEffect, useState } from 'react';
import type { AdminTabProps } from '../admin/types';

export type AdminUserDraft = {
  login: string;
  fullName: string;
  email: string;
  role: string;
  directionId: number | '';
  password: string;
  passwordMode: 'manual' | 'generate';
  newPassword: string;
};

const ROLES = [
  'admin', 'director', 'analyst', 'curator', 'moderator', 'volunteer', 'organizer', 'gamification',
] as const;

const ROLE_LABELS: Record<string, string> = {
  admin: 'администратор (полный доступ)',
  director: 'дирекция (чтение и выгрузки)',
  analyst: 'аналитик',
  curator: 'куратор направления',
  moderator: 'модератор',
  volunteer: 'волонтёр',
  organizer: 'организатор',
  gamification: 'игропатика (рейтинг и задания)',
};

type Direction = { id: number; name: string };

type Props = AdminTabProps & {
  initial?: Partial<AdminUserDraft> & { id?: number; login?: string };
  onCancel: () => void;
  onSaved: (info?: { temporaryPassword?: string; login?: string; manualPasswordSet?: boolean }) => void;
};

export function emptyAdminUserDraft(): AdminUserDraft {
  return {
    login: '',
    fullName: '',
    email: '',
    role: 'moderator',
    directionId: '',
    password: '',
    passwordMode: 'manual',
    newPassword: '',
  };
}

function parseApiError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  try {
    const j = JSON.parse(msg) as { error?: unknown };
    if (typeof j.error === 'string') return j.error;
    if (j.error && typeof j.error === 'object' && 'formErrors' in (j.error as object)) {
      return 'Проверьте поля формы';
    }
  } catch {
    /* keep msg */
  }
  return msg;
}

export function AdminUserForm({ adminFetch, act, initial, onCancel, onSaved }: Props) {
  const [draft, setDraft] = useState<AdminUserDraft>(() => ({
    ...emptyAdminUserDraft(),
    ...initial,
    login: initial?.login ?? '',
    directionId: initial?.directionId ?? '',
    newPassword: '',
  }));
  const [directions, setDirections] = useState<Direction[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const editing = initial?.id != null;

  useEffect(() => {
    adminFetch('/directions').then(r => setDirections(r.directions || [])).catch(() => {});
  }, [adminFetch]);

  const validate = (): string | null => {
    const loginTrim = draft.login.trim();
    const emailTrim = draft.email.trim();
    if (!editing && !loginTrim && !emailTrim) {
      return 'Укажите логин или email';
    }
    if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      return 'Некорректный email';
    }
    if (draft.role === 'curator' && !draft.directionId) {
      return 'Для куратора выберите направление';
    }
    if (!editing && draft.passwordMode === 'manual') {
      if (draft.password.length < 6) return 'Пароль не короче 6 символов';
    }
    if (editing && draft.newPassword && draft.newPassword.length < 6) {
      return 'Новый пароль не короче 6 символов';
    }
    return null;
  };

  const save = () => {
    setFormError(null);
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }

    const loginTrim = draft.login.trim();
    const emailTrim = draft.email.trim();
    const body: Record<string, unknown> = {
      fullName: draft.fullName.trim() || undefined,
      role: draft.role,
      directionId: draft.directionId === '' ? null : draft.directionId,
    };
    if (emailTrim) body.email = emailTrim;
    if (!editing && loginTrim) body.login = loginTrim;
    if (!editing && draft.passwordMode === 'manual' && draft.password) {
      body.password = draft.password;
    }

    act(async () => {
      try {
        if (editing && initial?.id) {
          if (draft.newPassword) body.password = draft.newPassword;
          await adminFetch(`/admin-users/${initial.id}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
          });
          onSaved({
            login: initial.login ?? loginTrim,
            manualPasswordSet: !!draft.newPassword,
          });
        } else {
          const res = await adminFetch('/admin-users', {
            method: 'POST',
            body: JSON.stringify(body),
          });
          const pwd = res.temporaryPassword as string | undefined;
          const userLogin = (res.user?.login as string | undefined) ?? loginTrim;
          if (pwd) {
            onSaved({ temporaryPassword: pwd, login: userLogin });
          } else {
            onSaved({
              login: userLogin,
              manualPasswordSet: draft.passwordMode === 'manual',
            });
          }
        }
      } catch (e) {
        setFormError(parseApiError(e));
        throw e;
      }
    }, editing ? 'Пользователь сохранён' : 'Пользователь создан');
  };

  const generatePassword = () => {
    if (!editing || initial?.id == null) return;
    setFormError(null);
    act(async () => {
      const r = await adminFetch(`/admin-users/${initial.id}/reset-password`, { method: 'POST', body: '{}' });
      onSaved({
        temporaryPassword: r.temporaryPassword as string,
        login: initial.login ?? (draft.login.trim() || draft.email.trim()),
      });
    }, 'Новый пароль сгенерирован');
  };

  const saveManualResetPassword = () => {
    if (!editing || initial?.id == null) return;
    if (draft.newPassword.length < 6) {
      setFormError('Пароль не короче 6 символов');
      return;
    }
    setFormError(null);
    act(async () => {
      await adminFetch(`/admin-users/${initial.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: draft.newPassword }),
      });
      setDraft(d => ({ ...d, newPassword: '' }));
      onSaved({ login: initial.login, manualPasswordSet: true });
    }, 'Пароль сохранён в базе');
  };

  return (
    <div className="card adm-forum-block">
      <h3>{editing ? 'Редактирование пользователя' : 'Новый пользователь админки'}</h3>
      <p className="adm-muted" style={{ fontSize: 13, marginTop: 0 }}>
        Роль задаёт доступ к разделам (матрица прав ниже на странице «Админы»). Пароль хранится в базе в виде хеша.
      </p>

      {editing && initial?.login && (
        <label className="adm-field">
          <span className="adm-label">Логин для входа</span>
          <input className="adm-input" value={initial.login} readOnly disabled />
        </label>
      )}

      {!editing && (
        <label className="adm-field">
          <span className="adm-label">Логин для входа</span>
          <input
            className="adm-input"
            value={draft.login}
            onChange={e => setDraft({ ...draft, login: e.target.value })}
            placeholder="например igropatik1"
            autoComplete="off"
          />
        </label>
      )}

      <label className="adm-field">
        <span className="adm-label">Email {editing ? '' : '(если нет логина — обязателен)'}</span>
        <input
          className="adm-input"
          type="email"
          value={draft.email}
          onChange={e => setDraft({ ...draft, email: e.target.value })}
          placeholder="user@example.com"
        />
      </label>

      <label className="adm-field">
        <span className="adm-label">ФИО</span>
        <input className="adm-input" value={draft.fullName} onChange={e => setDraft({ ...draft, fullName: e.target.value })} />
      </label>

      <label className="adm-field">
        <span className="adm-label">Роль и доступ</span>
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
        <div className="card" style={{ padding: 12, marginTop: 8, background: '#fafafa' }}>
          <p className="adm-label" style={{ margin: '0 0 8px' }}>Пароль при создании</p>
          <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
            <label className="adm-field" style={{ flexDirection: 'row', gap: 8, alignItems: 'center', margin: 0 }}>
              <input
                type="radio"
                checked={draft.passwordMode === 'manual'}
                onChange={() => setDraft({ ...draft, passwordMode: 'manual' })}
              />
              Задать вручную
            </label>
            <label className="adm-field" style={{ flexDirection: 'row', gap: 8, alignItems: 'center', margin: 0 }}>
              <input
                type="radio"
                checked={draft.passwordMode === 'generate'}
                onChange={() => setDraft({ ...draft, passwordMode: 'generate', password: '' })}
              />
              Сгенерировать автоматически
            </label>
          </div>
          {draft.passwordMode === 'manual' && (
            <label className="adm-field" style={{ marginTop: 8 }}>
              <span className="adm-label">Пароль (мин. 6 символов)</span>
              <input
                className="adm-input"
                type="password"
                value={draft.password}
                onChange={e => setDraft({ ...draft, password: e.target.value })}
                autoComplete="new-password"
              />
            </label>
          )}
        </div>
      )}

      {editing && (
        <div className="card" style={{ padding: 12, marginTop: 8, background: '#fafafa' }}>
          <p className="adm-label" style={{ margin: '0 0 8px' }}>Смена пароля</p>
          <label className="adm-field">
            <span className="adm-label">Новый пароль (мин. 6 символов)</span>
            <input
              className="adm-input"
              type="password"
              value={draft.newPassword}
              onChange={e => setDraft({ ...draft, newPassword: e.target.value })}
              autoComplete="new-password"
              placeholder="Оставьте пустым, если не меняете при «Сохранить»"
            />
          </label>
          <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="adm-btn adm-btn-secondary" onClick={saveManualResetPassword}>
              Сохранить пароль в базу
            </button>
            <button type="button" className="adm-btn adm-btn-secondary" onClick={generatePassword}>
              Сгенерировать новый пароль
            </button>
          </div>
          <p className="adm-muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
            Можно сохранить пароль кнопкой выше или указать его в поле и нажать «Сохранить» вместе с остальными данными.
          </p>
        </div>
      )}

      {formError && <p className="admin-login-error" style={{ marginTop: 8 }}>{formError}</p>}

      <div className="adm-forum-toolbar" style={{ marginTop: 12 }}>
        <button type="button" className="adm-btn adm-btn-primary" onClick={save}>Сохранить</button>
        <button type="button" className="adm-btn adm-btn-secondary" onClick={onCancel}>Отменить</button>
      </div>
    </div>
  );
}
