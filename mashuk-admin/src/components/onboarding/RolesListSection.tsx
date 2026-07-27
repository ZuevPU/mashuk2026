import { Fragment, useMemo, useState } from 'react';
import { AdminPageHero } from '../admin/AdminPageHero';
import { RowActionsMenu } from '../participants/RowActionsMenu';
import { RoleEditModal } from './RoleEditModal';
import {
  MATRIX_COL_LABELS,
  MATRIX_ROW_LABELS,
  ROLE_MATRIX,
  essencePreview,
  roleIcon,
  type MatrixCol,
  type MatrixRow,
} from './roleMatrix';
import type { AdminRole } from './types';

type Props = {
  roles: AdminRole[];
  adminFetch: (path: string, opts?: RequestInit) => Promise<any>;
  act: (fn: () => Promise<void>, msg?: string) => void;
  onRolesUpdated: (roles: AdminRole[]) => void;
  onViewAdviceForRole: (roleKey: string) => void;
};

export function RolesListSection({
  roles,
  adminFetch,
  act,
  onRolesUpdated,
  onViewAdviceForRole,
}: Props) {
  const [editing, setEditing] = useState<AdminRole | null>(null);
  const byKey = useMemo(() => new Map(roles.map(r => [r.roleKey, r])), [roles]);

  const matrixRows: MatrixRow[] = ['leader', 'org'];
  const matrixCols: MatrixCol[] = ['thinking', 'actions', 'people'];

  return (
    <>
      <AdminPageHero
        title="Роли · 6 ролей матрицы"
        hint="Шесть педагогических ролей форума. Тексты и иконки участник видит после диагностики и в «Роли дня»."
      />

      <div className="card adm-forum-block adm-role-matrix-wrap">
        <div className="adm-role-matrix-grid">
          <div className="adm-role-matrix-corner" />
          {matrixCols.map(col => (
            <div key={col} className="adm-role-matrix-col-head">{MATRIX_COL_LABELS[col]}</div>
          ))}
          {matrixRows.map(row => (
            <Fragment key={row}>
              <div className="adm-role-matrix-row-head">{MATRIX_ROW_LABELS[row]}</div>
              {matrixCols.map(col => {
                const key = ROLE_MATRIX[row][col];
                const r = byKey.get(key);
                if (!r) {
                  return <div key={`${row}-${col}`} className="adm-role-matrix-cell adm-muted">—</div>;
                }
                return (
                  <button
                    key={`${row}-${col}`}
                    type="button"
                    className="adm-role-matrix-cell adm-role-matrix-cell-btn"
                    onClick={() => setEditing(r)}
                  >
                    <span className="adm-role-matrix-icon">{roleIcon(r)}</span>
                    <span className="adm-role-matrix-name">{r.name}</span>
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="card adm-forum-block">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Ключ</th>
              <th>Квадрант</th>
              <th>Иконка</th>
              <th>Описание</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {roles.map(r => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td><code>{r.roleKey}</code></td>
                <td>{r.quadrant || '—'}</td>
                <td>{roleIcon(r)}</td>
                <td className="adm-role-table-desc">{essencePreview(r.essence, 100)}</td>
                <td>
                  <RowActionsMenu
                    actions={[
                      { label: 'Редактировать', onClick: () => setEditing(r) },
                      { label: 'Просмотр советов', onClick: () => onViewAdviceForRole(r.roleKey) },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RoleEditModal
        role={editing}
        onClose={() => setEditing(null)}
        adminFetch={adminFetch}
        act={act}
        onSaved={updated => onRolesUpdated(roles.map(x => (x.id === updated.id ? updated : x)))}
      />
    </>
  );
}
