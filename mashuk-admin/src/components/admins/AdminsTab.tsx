import { useCallback, useEffect, useState } from 'react';
import { confirmDelete } from '../../admin/confirmDelete';
import { AdminPageHero } from '../admin/AdminPageHero';
import { RowActionsMenu } from '../participants/RowActionsMenu';
import type { AdminTabProps } from '../admin/types';
import { AdminRightsMatrix } from './AdminRightsMatrix';
import { AdminUserForm } from './AdminUserForm';

type AdminUser = {
  id: number;
  login?: string;
  fullName?: string | null;
  email?: string | null;
  role?: string;
  directionId?: number | null;
  directionName?: string | null;
  lastLoginAt?: string | null;
  isActive?: boolean;
};

type Direction = { id: number; name: string };

const ROLE_FILTER = ['', 'admin', 'director', 'analyst', 'curator', 'moderator', 'volunteer', 'organizer', 'gamification'];

export function AdminsTab({ adminFetch, act, reloadKey }: AdminTabProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [directions, setDirections] = useState<Direction[]>([]);
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [tempPasswordModal, setTempPasswordModal] = useState<{ password: string; login?: string } | null>(null);
  const [logsModal, setLogsModal] = useState<{ user: AdminUser; actions: unknown[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (search.trim()) sp.set('search', search.trim());
      if (roleFilter) sp.set('role', roleFilter);
      if (directionFilter) sp.set('directionId', directionFilter);
      const res = await adminFetch(`/admin-users?${sp.toString()}`);
      setUsers(res.users || []);
      setTotal(res.total ?? res.users?.length ?? 0);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, search, roleFilter, directionFilter]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  useEffect(() => {
    adminFetch('/directions').then(r => setDirections(r.directions || [])).catch(() => {});
  }, [adminFetch]);

  const openLogs = (u: AdminUser) => {
    adminFetch(`/admin-users/${u.id}/actions`)
      .then(r => setLogsModal({ user: u, actions: r.actions || [] }))
      .catch(() => {});
  };

  if (view === 'form') {
    return (
      <div className="adm-forum">
        <AdminUserForm
          adminFetch={adminFetch}
          act={act}
          reloadKey={reloadKey}
          initial={editUser ? {
            id: editUser.id,
            login: editUser.login,
            fullName: editUser.fullName ?? '',
            email: editUser.email ?? '',
            role: editUser.role ?? 'moderator',
            directionId: (editUser as { directionId?: number | null }).directionId ?? '',
          } : undefined}
          onCancel={() => { setView('list'); setEditUser(null); }}
          onSaved={info => {
            setView('list');
            setEditUser(null);
            if (info?.temporaryPassword) setTempPasswordModal({ password: info.temporaryPassword, login: info.login });
            load();
          }}
        />
      </div>
    );
  }

  return (
    <div className="adm-forum">
      <AdminPageHero
        title={`Пользователи админки · ${total} всего`}
        hint="Управление доступом к админ-панели. Email используется для идентификации; вход — по логину."
      />

      <AdminRightsMatrix adminFetch={adminFetch} act={act} reloadKey={reloadKey} />

      <div className="card adm-forum-block">
        <div className="adm-forum-toolbar">
          <input
            className="adm-input"
            placeholder="Поиск"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="adm-input" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="">Все роли</option>
            {ROLE_FILTER.filter(Boolean).map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select className="adm-input" value={directionFilter} onChange={e => setDirectionFilter(e.target.value)}>
            <option value="">Все направления</option>
            {directions.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => load()}>Применить</button>
          <button
            type="button"
            className="adm-btn adm-btn-primary"
            onClick={() => { setEditUser(null); setView('form'); }}
          >
            + Добавить пользователя
          </button>
        </div>

        {loading ? (
          <p className="adm-muted">Загрузка…</p>
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th>ФИО</th>
                <th>Email</th>
                <th>Роль</th>
                <th>Направление</th>
                <th>Последний вход</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.fullName || u.login || '—'}</td>
                  <td>{u.email || '—'}</td>
                  <td>{u.role}</td>
                  <td>{u.directionName || '—'}</td>
                  <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ru-RU') : '—'}</td>
                  <td>{u.isActive === false ? 'заблокирован' : 'активен'}</td>
                  <td>
                    <RowActionsMenu
                      actions={[
                        {
                          label: 'Редактировать',
                          onClick: () => { setEditUser(u); setView('form'); },
                        },
                        {
                          label: 'Сбросить пароль',
                          onClick: () => act(async () => {
                            const r = await adminFetch(`/admin-users/${u.id}/reset-password`, { method: 'POST', body: '{}' });
                            setTempPasswordModal({ password: r.temporaryPassword, login: u.login });
                          }, 'Пароль сброшен'),
                        },
                        {
                          label: u.isActive === false ? 'Разблокировать' : 'Заблокировать',
                          onClick: () => act(() => adminFetch(`/admin-users/${u.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ isActive: u.isActive === false }),
                          }).then(load), u.isActive === false ? 'Разблокирован' : 'Заблокирован'),
                        },
                        {
                          label: 'Удалить',
                          danger: true,
                          onClick: () => {
                            if (!confirmDelete()) return;
                            act(() => adminFetch(`/admin-users/${u.id}`, { method: 'DELETE' }).then(load), 'Удалён');
                          },
                        },
                        { label: 'Логи действий', onClick: () => openLogs(u) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {tempPasswordModal && (
        <div className="adm-modal-backdrop" onClick={() => setTempPasswordModal(null)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <h3>Данные для входа</h3>
            {tempPasswordModal.login && (
              <p>Логин: <code>{tempPasswordModal.login}</code></p>
            )}
            <p>Сохраните и передайте пользователю один раз:</p>
            <code style={{ fontSize: 18 }}>{tempPasswordModal.password}</code>
            <button type="button" className="adm-btn adm-btn-primary" style={{ marginTop: 12 }} onClick={() => setTempPasswordModal(null)}>Закрыть</button>
          </div>
        </div>
      )}

      {logsModal && (
        <div className="adm-modal-backdrop" onClick={() => setLogsModal(null)}>
          <div className="adm-modal adm-modal-wide" onClick={e => e.stopPropagation()}>
            <h3>Логи · {logsModal.user.fullName || logsModal.user.email}</h3>
            <table className="adm-table">
              <thead>
                <tr><th>Время</th><th>Действие</th><th>Раздел</th></tr>
              </thead>
              <tbody>
                {(logsModal.actions as Array<{ createdAt?: string; actionType?: string; section?: string }>).map((a, i) => (
                  <tr key={i}>
                    <td>{a.createdAt ? new Date(a.createdAt).toLocaleString('ru-RU') : ''}</td>
                    <td>{a.actionType}</td>
                    <td>{a.section}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="adm-btn adm-btn-secondary" onClick={() => setLogsModal(null)}>Закрыть</button>
          </div>
        </div>
      )}
    </div>
  );
}
