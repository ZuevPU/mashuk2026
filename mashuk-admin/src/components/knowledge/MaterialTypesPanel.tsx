import { useCallback, useEffect, useState } from 'react';
import type { AdminTabProps } from '../admin/types';
import { confirmDelete } from '../../admin/confirmDelete';

type MatType = { id: number; key: string; name: string; sortOrder?: number };

export function MaterialTypesPanel({ adminFetch, act }: Pick<AdminTabProps, 'adminFetch' | 'act'>) {
  const [types, setTypes] = useState<MatType[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    const res = await adminFetch('/material-types');
    setTypes(res.types || []);
  }, [adminFetch]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  return (
    <div className="card adm-forum-block adm-kb-panel">
      <div className="adm-kb-panel-head">
        <h3>Типы материалов</h3>
        <p className="adm-kb-panel-sub">Справочник артефактов: презентация, видео, конспект…</p>
      </div>
      <div className="adm-kb-toolbar">
        <input
          className="adm-input"
          placeholder="Ключ (латиница)"
          value={newKey}
          onChange={e => setNewKey(e.target.value)}
        />
        <input
          className="adm-input"
          placeholder="Название"
          value={newName}
          onChange={e => setNewName(e.target.value)}
        />
        <button
          type="button"
          className="adm-kb-btn adm-kb-btn-primary"
          onClick={() => act(async () => {
            await adminFetch('/material-types', {
              method: 'POST',
              body: JSON.stringify({ key: newKey.trim(), name: newName.trim() }),
            });
            setNewKey('');
            setNewName('');
            await load();
          }, 'Тип добавлен')}
        >
          Добавить
        </button>
      </div>
      <div className="adm-table-scroll adm-kb-mini-scroll">
        <table className="adm-table adm-kb-mini-table">
          <thead>
            <tr><th>Ключ</th><th>Название</th><th /></tr>
          </thead>
          <tbody>
            {types.map(t => (
              <tr key={t.id}>
                <td><code className="adm-kb-code">{t.key}</code></td>
                <td>
                  <input
                    className="adm-input"
                    defaultValue={t.name}
                    onBlur={e => {
                      const name = e.target.value.trim();
                      if (name && name !== t.name) {
                        act(() => adminFetch(`/material-types/${t.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ name }),
                        }).then(load), 'Сохранено');
                      }
                    }}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="adm-kb-btn adm-kb-btn-danger"
                    onClick={() => {
                      if (!confirmDelete()) return;
                      act(() => adminFetch(`/material-types/${t.id}`, { method: 'DELETE' }).then(load), 'Удалено');
                    }}
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
