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

const ROLE_FILTER = ['', 'admin', 'director', 'analyst', 'curator', 'moderator', 'volunteer', 'organizer', 'gamification'] as const;

const ROLE_FILTER_LABELS: Record<string, string> = {
  '': 'Все роли',
  admin: 'администратор',
  director: 'дирекция',
  analyst: 'аналитик',
  curator: 'куратор',
  moderator: 'модератор',
  volunteer: 'волонтёр',
  organizer: 'организатор',
  gamification: 'игропатика',
};

export function AdminsTab({ adminFetch, act, reloadKey }: AdminTabProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [directions, setDirections] = useState<Direction[]>([]);
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [tempPasswordModal, setTempPasswordModal] = useState<{
    password?: string;
    login?: string;
    manualOnly?: boolean;
    message?: string;
  } | null>(null);
  const [resetPwdModal, setResetPwdModal] = useState<{ user: AdminUser; password: string } | null>(null);
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
            login: editUser.login ?? '',
            fullName: editUser.fullName ?? '',
            email: editUser.email ?? '',
            role: editUser.role ?? 'moderator',
            directionId: editUser.directionId ?? '',
          } : undefined}
          onCancel={() => { setView('list'); setEditUser(null); }}
          onSaved={info => {
            setView('list');
            setEditUser(null);
            if (info?.temporaryPassword) {
              setTempPasswordModal({
                password: info.temporaryPassword,
                login: info.login,
                message: 'Сгенерированный пароль — передайте пользователю один раз:',
              });
            } else if (info?.login) {
              setTempPasswordModal({
                login: info.login,
                manualOnly: true,
                message: info.manualPasswordSet
                  ? 'Пароль сохранён в базе. Передайте его пользователю по защищённому каналу.'
                  : 'Пользователь создан. Логин для входа:',
              });
            }
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
            {ROLE_FILTER.map(r => (
              <option key={r || 'all'} value={r}>{ROLE_FILTER_LABELS[r] ?? r}</option>
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
                <th>Логин</th>
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
                  <td>{u.fullName || '—'}</td>
                  <td><code>{u.login || '—'}</code></td>
                  <td>{u.email || '—'}</td>
                  <td>{ROLE_FILTER_LABELS[u.role ?? ''] ?? u.role}</td>
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
                          label: 'Сменить пароль',
                          onClick: () => setResetPwdModal({ user: u, password: '' }),
                        },
                        {
                          label: 'Сгенерировать пароль',
                          onClick: () => act(async () => {
                            const r = await adminFetch(`/admin-users/${u.id}/reset-password`, { method: 'POST', body: '{}' });
                            setTempPasswordModal({
                              password: r.temporaryPassword,
                              login: u.login,
                              message: 'Сгенерированный пароль — передайте пользователю один раз:',
                            });
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
            {tempPasswordModal.message && <p>{tempPasswordModal.message}</p>}
            {tempPasswordModal.login && (
              <p>Логин: <code>{tempPasswordModal.login}</code></p>
            )}
            {tempPasswordModal.password && (
              <p>Пароль: <code style={{ fontSize: 18 }}>{tempPasswordModal.password}</code></p>
            )}
            <button type="button" className="adm-btn adm-btn-primary" style={{ marginTop: 12 }} onClick={() => setTempPasswordModal(null)}>Закрыть</button>
          </div>
        </div>
      )}

      {resetPwdModal && (
        <div className="adm-modal-backdrop" onClick={() => setResetPwdModal(null)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <h3>Сменить пароль</h3>
            <p className="adm-muted">{resetPwdModal.user.fullName || resetPwdModal.user.login}</p>
            <label className="adm-field">
              <span className="adm-label">Новый пароль (мин. 6 символов)</span>
              <input
                className="adm-input"
                type="password"
                value={resetPwdModal.password}
                onChange={e => setResetPwdModal({ ...resetPwdModal, password: e.target.value })}
                autoComplete="new-password"
              />
            </label>
            <div className="adm-forum-toolbar" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="adm-btn adm-btn-primary"
                disabled={resetPwdModal.password.length < 6}
                onClick={() => act(async () => {
                  await adminFetch(`/admin-users/${resetPwdModal.user.id}/reset-password`, {
                    method: 'POST',
                    body: JSON.stringify({ password: resetPwdModal.password }),
                  });
                  setResetPwdModal(null);
                  setTempPasswordModal({
                    login: resetPwdModal.user.login,
                    manualOnly: true,
                    message: 'Пароль сохранён в базе.',
                  });
                }, 'Пароль сохранён')}
              >
                Сохранить в базу
              </button>
              <button type="button" className="adm-btn adm-btn-secondary" onClick={() => setResetPwdModal(null)}>Отмена</button>
            </div>
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
