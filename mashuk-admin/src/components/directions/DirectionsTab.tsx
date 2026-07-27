import { useCallback, useEffect, useState } from 'react';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';

type Direction = { id: number; name: string; isHidden?: boolean };

type DirectionDraft = { name: string; visible: boolean };

export function DirectionsTab({ adminFetch, act, reloadKey }: AdminTabProps) {
  const [directions, setDirections] = useState<Direction[]>([]);
  const [drafts, setDrafts] = useState<Record<number, DirectionDraft>>({});
  const [newDirection, setNewDirection] = useState('');
  const [loading, setLoading] = useState(true);

  const syncDrafts = (list: Direction[]) => {
    setDrafts(
      Object.fromEntries(
        list.map(d => [d.id, { name: d.name ?? '', visible: !d.isHidden }]),
      ),
    );
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch('/directions');
      const list: Direction[] = res.directions || [];
      setDirections(list);
      syncDrafts(list);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const updateDraft = (id: number, patch: Partial<DirectionDraft>) => {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const createDirection = () =>
    act(async () => {
      if (!newDirection.trim()) return;
      await adminFetch('/directions', {
        method: 'POST',
        body: JSON.stringify({ name: newDirection.trim() }),
      });
      setNewDirection('');
      await load();
    }, 'Направление добавлено');

  const saveDirection = (id: number) => {
    const draft = drafts[id];
    if (!draft) return;
    act(async () => {
      await adminFetch(`/directions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: draft.name, isHidden: !draft.visible }),
      });
      await load();
    }, 'Сохранено');
  };

  if (loading) {
    return <p className="adm-muted">Загрузка направлений…</p>;
  }

  return (
    <div className="adm-forum">
      <AdminPageHero
        title="Направления"
        hint="Направления участников форума. Скрытое направление не показывается в выборе при регистрации."
      />

      <div className="card adm-forum-block">
        <div className="adm-forum-toolbar">
          <input
            className="adm-input"
            value={newDirection}
            onChange={e => setNewDirection(e.target.value)}
            placeholder="Новое направление"
          />
          <button type="button" className="adm-btn adm-btn-primary" onClick={createDirection}>
            Добавить
          </button>
        </div>
      </div>

      {directions.map(d => {
        const draft = drafts[d.id] ?? { name: d.name ?? '', visible: !d.isHidden };
        return (
          <div key={d.id} className="card adm-forum-block">
            <div className="adm-forum-toolbar">
              <input
                className="adm-input"
                value={draft.name}
                onChange={e => updateDraft(d.id, { name: e.target.value })}
              />
              <label className="adm-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={draft.visible}
                  onChange={e => updateDraft(d.id, { visible: e.target.checked })}
                />
                <span className="adm-label">Видимо</span>
              </label>
              <button type="button" className="adm-btn adm-btn-secondary" onClick={() => saveDirection(d.id)}>
                Сохранить
              </button>
            </div>
          </div>
        );
      })}

      {directions.length === 0 && <p className="adm-muted">Нет направлений</p>}
    </div>
  );
}
