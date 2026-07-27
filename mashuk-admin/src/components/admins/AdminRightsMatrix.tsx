import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminTabProps } from '../admin/types';

type Perm = {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canConfirm: boolean;
  canExport: boolean;
};

type MatrixResponse = {
  matrix: {
    sections: Array<{ key: string; label: string }>;
    roles: Array<{ key: string; label: string }>;
    actions: Array<{ key: string; label: string }>;
    cells: Array<{ role: string; section: string; permissions: Perm }>;
  };
};

const ACTION_KEYS: Array<keyof Perm> = [
  'canRead', 'canCreate', 'canUpdate', 'canDelete', 'canConfirm', 'canExport',
];

const ACTION_LABELS: Record<keyof Perm, string> = {
  canRead: 'чтение',
  canCreate: 'создание',
  canUpdate: 'редактирование',
  canDelete: 'удаление',
  canConfirm: 'подтверждение',
  canExport: 'выгрузка',
};

export function AdminRightsMatrix({ adminFetch, act, reloadKey }: AdminTabProps) {
  const [data, setData] = useState<MatrixResponse['matrix'] | null>(null);
  const [roleTab, setRoleTab] = useState('moderator');
  const [draft, setDraft] = useState<Record<string, Perm>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch('/rights-matrix') as MatrixResponse;
      setData(res.matrix);
      const map: Record<string, Perm> = {};
      for (const c of res.matrix.cells) {
        map[`${c.role}:${c.section}`] = { ...c.permissions };
      }
      setDraft(map);
      if (res.matrix.roles.length && !res.matrix.roles.find(r => r.key === roleTab)) {
        setRoleTab(res.matrix.roles[0].key);
      }
    } finally {
      setLoading(false);
    }
  }, [adminFetch, roleTab]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const dirty = useMemo(() => draft, [draft]);

  const toggle = (section: string, field: keyof Perm) => {
    const key = `${roleTab}:${section}`;
    setDraft(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: !prev[key]?.[field] },
    }));
  };

  const save = () =>
    act(async () => {
      if (!data) return;
      const updates = data.sections.flatMap(sec => {
        const key = `${roleTab}:${sec.key}`;
        const permissions = dirty[key];
        if (!permissions) return [];
        return [{ role: roleTab, section: sec.key, permissions }];
      });
      await adminFetch('/rights-matrix', {
        method: 'PATCH',
        body: JSON.stringify({ updates }),
      });
      await load();
    }, 'Матрица прав сохранена');

  const reset = () =>
    act(async () => {
      await adminFetch('/rights-matrix/reset-defaults', { method: 'POST' });
      await load();
    }, 'Сброшено к дефолту');

  if (loading || !data) {
    return <p className="adm-muted">Загрузка матрицы прав…</p>;
  }

  return (
    <div className="card adm-forum-block">
      <h3>Роли и права · матрица</h3>
      <div className="adm-seg" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        {data.roles.filter(r => r.key !== 'superadmin').map(r => (
          <button
            key={r.key}
            type="button"
            className={roleTab === r.key ? 'on' : ''}
            onClick={() => setRoleTab(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <table className="adm-table">
        <thead>
          <tr>
            <th>Раздел</th>
            {ACTION_KEYS.map(k => (
              <th key={k}>{ACTION_LABELS[k]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.sections.map(sec => {
            const key = `${roleTab}:${sec.key}`;
            const p = draft[key] ?? {
              canRead: false, canCreate: false, canUpdate: false,
              canDelete: false, canConfirm: false, canExport: false,
            };
            return (
              <tr key={sec.key}>
                <td>{sec.label}</td>
                {ACTION_KEYS.map(field => (
                  <td key={field}>
                    <input
                      type="checkbox"
                      checked={!!p[field]}
                      onChange={() => toggle(sec.key, field)}
                      disabled={roleTab === 'admin'}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="adm-forum-toolbar" style={{ marginTop: 12 }}>
        <button type="button" className="adm-btn adm-btn-primary" onClick={save} disabled={roleTab === 'admin'}>
          Сохранить
        </button>
        <button type="button" className="adm-btn adm-btn-secondary" onClick={reset}>
          Сбросить к дефолту
        </button>
      </div>
    </div>
  );
}
