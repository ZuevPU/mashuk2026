import { useCallback, useEffect, useState } from 'react';
import { AdminPageHero } from '../admin/AdminPageHero';
import { EnumOptions } from '../admin/EnumOptions';
import type { AdminTabProps } from '../admin/types';

const ADMIN_ROLES = ['admin', 'moderator', 'analyst', 'director'] as const;
const RIGHTS_ACTIONS = ['read', 'moderate', 'export', 'settings', 'users', 'delete'] as const;

type AdminUser = {
  id: number;
  login: string;
  role?: string;
  isActive?: boolean;
};

type RightsRow = {
  role: string;
  label: string;
  actions?: Record<string, boolean>;
};

export function AdminsTab({ adminFetch, act, reloadKey }: AdminTabProps) {
  const [rightsMatrix, setRightsMatrix] = useState<RightsRow[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [newAdmin, setNewAdmin] = useState({ login: '', password: '', role: 'moderator' });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, matrixRes] = await Promise.all([
        adminFetch('/admin-users'),
        adminFetch('/rights-matrix'),
      ]);
      setAdminUsers(usersRes.users || []);
      setRightsMatrix(matrixRes.matrix || []);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const createAdmin = () =>
    act(async () => {
      await adminFetch('/admin-users', {
        method: 'POST',
        body: JSON.stringify(newAdmin),
      });
      setNewAdmin({ login: '', password: '', role: 'moderator' });
      await load();
    }, 'Админ создан');

  const patchAdmin = (id: number, body: Record<string, unknown>, msg?: string) =>
    act(async () => {
      await adminFetch(`/admin-users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      await load();
    }, msg);

  if (loading) {
    return <p className="adm-muted">Загрузка администраторов…</p>;
  }

  return (
    <div className="adm-forum">
      <AdminPageHero
        title="Администраторы"
        hint="Права задаются в коде (roleCan). Роли пользователей можно менять ниже."
      />

      <div className="card adm-forum-block">
        <h3>Матрица прав (только просмотр)</h3>
        <table className="adm-table">
          <thead>
            <tr>
              <th>Роль</th>
              <th>чтение</th>
              <th>модерация</th>
              <th>выгрузка</th>
              <th>настройки</th>
              <th>пользователи</th>
              <th>удаление</th>
            </tr>
          </thead>
          <tbody>
            {rightsMatrix.map(row => (
              <tr key={row.role}>
                <td>{row.label}</td>
                {RIGHTS_ACTIONS.map(a => (
                  <td key={a}>{row.actions?.[a] ? '✓' : '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card adm-forum-block">
        <h3>Учётные записи</h3>
        <div className="adm-forum-toolbar">
          <input
            className="adm-input"
            value={newAdmin.login}
            onChange={e => setNewAdmin({ ...newAdmin, login: e.target.value })}
            placeholder="Логин"
          />
          <input
            className="adm-input"
            type="password"
            value={newAdmin.password}
            onChange={e => setNewAdmin({ ...newAdmin, password: e.target.value })}
            placeholder="Пароль"
          />
          <select
            className="adm-input"
            value={newAdmin.role}
            onChange={e => setNewAdmin({ ...newAdmin, role: e.target.value })}
          >
            <EnumOptions values={[...ADMIN_ROLES]} />
          </select>
          <button type="button" className="adm-btn adm-btn-primary" onClick={createAdmin}>
            Добавить
          </button>
        </div>

        <table className="adm-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Логин</th>
              <th>Роль</th>
              <th>Активен</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {adminUsers.map(u => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>{u.login}</td>
                <td>
                  <select
                    className="adm-input"
                    value={u.role || 'admin'}
                    onChange={e =>
                      patchAdmin(u.id, { role: e.target.value })
                    }
                  >
                    <EnumOptions values={[...ADMIN_ROLES]} />
                  </select>
                </td>
                <td>{u.isActive === false ? 'нет' : 'да'}</td>
                <td>
                  <button
                    type="button"
                    className="adm-btn adm-btn-secondary"
                    onClick={() =>
                      patchAdmin(
                        u.id,
                        { isActive: u.isActive === false },
                        u.isActive === false ? 'Разблокирован' : 'Заблокирован',
                      )
                    }
                  >
                    {u.isActive === false ? 'Разблок' : 'Блок'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {adminUsers.length === 0 && <p className="adm-muted">Нет пользователей</p>}
      </div>
    </div>
  );
}
