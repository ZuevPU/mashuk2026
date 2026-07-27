import { useEffect, useState } from 'react';
import type { AdminRole } from './types';

type Props = {
  roles: AdminRole[];
  adminFetch: (path: string, opts?: RequestInit) => Promise<any>;
  act: (fn: () => Promise<void>, msg?: string) => void;
  onRolesUpdated: (roles: AdminRole[]) => void;
};

type RoleDraft = {
  essence: string;
  inClass: string;
  keywords: string;
};

export function RoleCatalogEditor({ roles, adminFetch, act, onRolesUpdated }: Props) {
  const [drafts, setDrafts] = useState<Record<number, RoleDraft>>({});

  useEffect(() => {
    const next: Record<number, RoleDraft> = {};
    for (const r of roles) {
      next[r.id] = {
        essence: r.essence || '',
        inClass: r.inClass || '',
        keywords: r.keywords || '',
      };
    }
    setDrafts(next);
  }, [roles]);

  const setField = (id: number, field: keyof RoleDraft, value: string) => {
    setDrafts(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const saveRole = (r: AdminRole) => {
    const d = drafts[r.id];
    if (!d) return;
    act(async () => {
      const res = await adminFetch(`/roles/${r.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: r.name,
          quadrant: r.quadrant,
          essence: d.essence,
          inClass: d.inClass,
          keywords: d.keywords,
          sortOrder: r.sortOrder,
        }),
      });
      const updated = res.role as AdminRole;
      onRolesUpdated(roles.map(x => (x.id === r.id ? { ...x, ...updated } : x)));
    }, `Роль «${r.name}» сохранена`);
  };

  const isDirty = (r: AdminRole) => {
    const d = drafts[r.id];
    if (!d) return false;
    return d.essence !== (r.essence || '')
      || d.inClass !== (r.inClass || '')
      || d.keywords !== (r.keywords || '');
  };

  return (
    <div className="adm-forum-block card">
      <h3>Тексты шести ролей</h3>
      <p className="adm-forum-hint">
        Эти тексты участник видит после диагностики. Название роли задаётся в базе и отображается как заголовок карточки.
      </p>
      {roles.map(r => (
        <div key={r.id} className="card adm-forum-nested-card">
          <div className="adm-forum-role-head">
            <strong>{r.name}</strong>
            {r.quadrant && <span className="tag-chip adm-forum-role-quadrant">{r.quadrant}</span>}
            <span className="adm-muted adm-forum-role-key-hint" title={r.roleKey}>ⓘ</span>
          </div>
          <label className="adm-label">Суть</label>
          <textarea
            className="adm-input adm-textarea"
            rows={2}
            value={drafts[r.id]?.essence ?? ''}
            onChange={e => setField(r.id, 'essence', e.target.value)}
          />
          <label className="adm-label">Проявления в классе</label>
          <textarea
            className="adm-input adm-textarea"
            rows={2}
            value={drafts[r.id]?.inClass ?? ''}
            onChange={e => setField(r.id, 'inClass', e.target.value)}
          />
          <label className="adm-label">Ключевые слова</label>
          <input
            className="adm-input"
            value={drafts[r.id]?.keywords ?? ''}
            onChange={e => setField(r.id, 'keywords', e.target.value)}
          />
          <button
            type="button"
            className="adm-btn adm-btn-primary"
            style={{ marginTop: 10 }}
            disabled={!isDirty(r)}
            onClick={() => saveRole(r)}
          >
            Сохранить{isDirty(r) ? ' •' : ''}
          </button>
        </div>
      ))}
    </div>
  );
}
