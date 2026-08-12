import { useCallback, useEffect, useState } from 'react';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';
import { HubLensLayout, type HubNavItem } from '../hub/HubSideNav';

type Direction = { id: number; name: string; isHidden?: boolean };

type DirectionDraft = { name: string; visible: boolean };

const DIR_NAV: HubNavItem[] = [
  { id: 'directions-hero', label: 'Обзор' },
  { id: 'directions-add', label: 'Добавить' },
  { id: 'directions-list', label: 'Список' },
];

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
    <HubLensLayout className="adm-forum adm-kb" items={DIR_NAV} navLabel="Разделы направлений">
      <section id="directions-hero" className="adm-forum-anchor">
        <AdminPageHero
          title="Направления"
          hint="Направления участников форума. Скрытое не показывается в выборе при регистрации."
        />
      </section>

      <section id="directions-add" className="adm-forum-anchor">
        <div className="card adm-forum-block adm-kb-panel">
          <div className="adm-kb-panel-head">
            <h3>Добавить</h3>
            <p className="adm-kb-panel-sub">Новое направление появится в регистрации и фильтрах.</p>
          </div>
          <div className="adm-kb-toolbar" style={{ marginBottom: 0 }}>
            <input
              className="adm-input adm-kb-search"
              value={newDirection}
              onChange={e => setNewDirection(e.target.value)}
              placeholder="Новое направление"
            />
            <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={createDirection}>
              Добавить
            </button>
          </div>
        </div>
      </section>

      <section id="directions-list" className="adm-forum-anchor">
        <div className="card adm-forum-block adm-kb-panel">
          <div className="adm-kb-panel-head">
            <h3>Список · {directions.length}</h3>
            <p className="adm-kb-panel-sub">Название и видимость для участников.</p>
          </div>
          {directions.length === 0 && <p className="adm-muted">Нет направлений</p>}
          <div className="adm-mod-list">
            {directions.map(d => {
              const draft = drafts[d.id] ?? { name: d.name ?? '', visible: !d.isHidden };
              return (
                <article key={d.id} className="adm-mod-item">
                  <div className="adm-mod-item-actions" style={{ marginTop: 0, width: '100%' }}>
                    <input
                      className="adm-input"
                      value={draft.name}
                      onChange={e => updateDraft(d.id, { name: e.target.value })}
                      style={{ flex: '1 1 200px', minWidth: 160 }}
                    />
                    <label className="adm-tasks-check">
                      <input
                        type="checkbox"
                        checked={draft.visible}
                        onChange={e => updateDraft(d.id, { visible: e.target.checked })}
                      />
                      <span>Видимо</span>
                    </label>
                    <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => saveDirection(d.id)}>
                      Сохранить
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </HubLensLayout>
  );
}
