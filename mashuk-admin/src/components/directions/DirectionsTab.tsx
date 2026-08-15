import { useCallback, useEffect, useState } from 'react';
import { confirmDelete } from '../../admin/confirmDelete';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';
import { HubLensLayout, type HubNavItem } from '../hub/HubSideNav';

type Direction = { id: number; name: string; isHidden?: boolean; isOrganizer?: boolean };

type DirectionDraft = { name: string; visible: boolean; organizer: boolean };

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
  const [busyId, setBusyId] = useState<number | 'new' | null>(null);

  const applyList = (list: Direction[]) => {
    setDirections(list);
    setDrafts(Object.fromEntries(
      list.map(d => [d.id, { name: d.name ?? '', visible: !d.isHidden, organizer: d.isOrganizer === true }]),
    ));
  };

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await adminFetch('/directions');
      applyList(res.directions || []);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const updateDraft = (id: number, patch: Partial<DirectionDraft>) => {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const createDirection = () => {
    const name = newDirection.trim();
    if (!name || busyId) return;
    setBusyId('new');
    act(async () => {
      try {
        const res = await adminFetch('/directions', {
          method: 'POST',
          body: JSON.stringify({ name }),
        });
        const created = res.direction as Direction | undefined;
        if (created?.id) {
          setDirections(prev => [...prev, created]);
          setDrafts(prev => ({
            ...prev,
            [created.id]: {
              name: created.name ?? name,
              visible: !created.isHidden,
              organizer: created.isOrganizer === true,
            },
          }));
        } else {
          await load({ silent: true });
        }
        setNewDirection('');
      } finally {
        setBusyId(null);
      }
    }, 'Направление добавлено', { reload: false });
  };

  const saveDirection = (id: number) => {
    const draft = drafts[id];
    if (!draft || busyId) return;
    const name = draft.name.trim();
    if (!name) return;
    setBusyId(id);
    act(async () => {
      try {
        const res = await adminFetch(`/directions/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name,
            isHidden: !draft.visible,
            isOrganizer: draft.organizer,
          }),
        });
        const updated = res.direction as Direction | undefined;
        const next = updated ?? { id, name, isHidden: !draft.visible, isOrganizer: draft.organizer };
        setDirections(prev => prev.map(d => (d.id === id ? { ...d, ...next } : d)));
        setDrafts(prev => ({
          ...prev,
          [id]: {
            name: next.name ?? name,
            visible: !next.isHidden,
            organizer: next.isOrganizer === true,
          },
        }));
      } finally {
        setBusyId(null);
      }
    }, 'Сохранено', { reload: false });
  };

  const deleteDirection = (d: Direction) => {
    if (busyId) return;
    if (!confirmDelete(
      `Удалить направление «${d.name}»?\n\n`
      + 'У участников и групп этой смены направление снимется. Действие необратимо.',
    )) return;
    setBusyId(d.id);
    act(async () => {
      try {
        await adminFetch(`/directions/${d.id}`, { method: 'DELETE' });
        setDirections(prev => prev.filter(x => x.id !== d.id));
        setDrafts(prev => {
          const next = { ...prev };
          delete next[d.id];
          return next;
        });
      } finally {
        setBusyId(null);
      }
    }, 'Удалено', { reload: false });
  };

  if (loading) {
    return <p className="adm-muted">Загрузка направлений…</p>;
  }

  return (
    <HubLensLayout className="adm-forum adm-kb" items={DIR_NAV} navLabel="Разделы направлений">
      <section id="directions-hero" className="adm-forum-anchor">
        <AdminPageHero
          title="Направления"
          hint="Список этой смены. Скрытое не показывается при регистрации. «Организатор форума» убирает направление из общих дашбордов Штаба."
        />
      </section>

      <section id="directions-add" className="adm-forum-anchor">
        <div className="card adm-forum-block adm-kb-panel">
          <div className="adm-kb-panel-head">
            <h3>Добавить</h3>
            <p className="adm-kb-panel-sub">Новое направление появится в регистрации и фильтрах этой смены.</p>
          </div>
          <div className="adm-kb-toolbar" style={{ marginBottom: 0 }}>
            <input
              className="adm-input adm-kb-search"
              value={newDirection}
              onChange={e => setNewDirection(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  createDirection();
                }
              }}
              placeholder="Новое направление"
            />
            <button
              type="button"
              className="adm-btn adm-btn-primary adm-btn-sm"
              onClick={createDirection}
              disabled={!newDirection.trim() || busyId === 'new'}
            >
              {busyId === 'new' ? 'Добавляем…' : 'Добавить'}
            </button>
          </div>
        </div>
      </section>

      <section id="directions-list" className="adm-forum-anchor">
        <div className="card adm-forum-block adm-kb-panel">
          <div className="adm-kb-panel-head">
            <h3>Список · {directions.length}</h3>
            <p className="adm-kb-panel-sub">Название, видимость и статус организатора. Сохранить или удалить — без обновления страницы.</p>
          </div>
          {directions.length === 0 && <p className="adm-muted">Нет направлений</p>}
          <div className="adm-mod-list">
            {directions.map(d => {
              const draft = drafts[d.id] ?? {
                name: d.name ?? '',
                visible: !d.isHidden,
                organizer: d.isOrganizer === true,
              };
              const rowBusy = busyId === d.id;
              const patchDirection = (next: DirectionDraft) => {
                const name = next.name.trim();
                if (!name) return;
                setBusyId(d.id);
                act(async () => {
                  try {
                    const res = await adminFetch(`/directions/${d.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({
                        name,
                        isHidden: !next.visible,
                        isOrganizer: next.organizer,
                      }),
                    });
                    const updated = res.direction as Direction | undefined;
                    if (updated) {
                      setDirections(prev => prev.map(x => (x.id === d.id ? { ...x, ...updated } : x)));
                      setDrafts(prev => ({
                        ...prev,
                        [d.id]: {
                          name: updated.name ?? name,
                          visible: !updated.isHidden,
                          organizer: updated.isOrganizer === true,
                        },
                      }));
                    }
                  } finally {
                    setBusyId(null);
                  }
                }, 'Сохранено', { reload: false });
              };
              return (
                <article key={d.id} className="adm-mod-item">
                  <div className="adm-mod-item-actions" style={{ marginTop: 0, width: '100%' }}>
                    <input
                      className="adm-input"
                      value={draft.name}
                      onChange={e => updateDraft(d.id, { name: e.target.value })}
                      onBlur={() => {
                        const current = drafts[d.id];
                        if (!current) return;
                        if (
                          current.name.trim() === (d.name ?? '')
                          && current.visible === !d.isHidden
                          && current.organizer === (d.isOrganizer === true)
                        ) return;
                        saveDirection(d.id);
                      }}
                      style={{ flex: '1 1 200px', minWidth: 160 }}
                    />
                    <label className="adm-tasks-check">
                      <input
                        type="checkbox"
                        checked={draft.visible}
                        onChange={e => {
                          const next = { ...draft, visible: e.target.checked };
                          updateDraft(d.id, { visible: next.visible });
                          patchDirection(next);
                        }}
                      />
                      <span>Видимо</span>
                    </label>
                    <label className="adm-tasks-check">
                      <input
                        type="checkbox"
                        checked={draft.organizer}
                        onChange={e => {
                          const next = { ...draft, organizer: e.target.checked };
                          updateDraft(d.id, { organizer: next.organizer });
                          patchDirection(next);
                        }}
                      />
                      <span>Организатор форума</span>
                    </label>
                    <button
                      type="button"
                      className="adm-btn adm-btn-secondary adm-btn-sm"
                      onClick={() => saveDirection(d.id)}
                      disabled={rowBusy}
                    >
                      {rowBusy ? 'Сохраняем…' : 'Сохранить'}
                    </button>
                    <button
                      type="button"
                      className="adm-btn adm-btn-danger adm-btn-sm"
                      onClick={() => deleteDirection(d)}
                      disabled={rowBusy}
                    >
                      Удалить
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
