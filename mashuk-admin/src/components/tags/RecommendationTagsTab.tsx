import { useCallback, useEffect, useState } from 'react';
import { AdminPageHero } from '../admin/AdminPageHero';
import { RowActionsMenu } from '../participants/RowActionsMenu';
import type { AdminTabProps } from '../admin/types';

const APP_TYPES = [
  { key: 'events', label: 'события' },
  { key: 'diagnosis', label: 'диагностика' },
  { key: 'interests', label: 'интересы' },
  { key: 'materials', label: 'материалы' },
  { key: 'clubs', label: 'клубы' },
] as const;

type TagRow = {
  id: number;
  name: string;
  slug?: string | null;
  description?: string | null;
  color?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  applicationTypes?: string[];
  usage?: { events: number; materials: number; participants: number; questions: number };
};

export function RecommendationTagsTab({ adminFetch, act, reloadKey }: AdminTabProps) {
  const [tags, setTags] = useState<TagRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [appFilter, setAppFilter] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [form, setForm] = useState<TagRow | null>(null);
  const [mergeFrom, setMergeFrom] = useState<number | ''>('');
  const [mergeTo, setMergeTo] = useState<number | ''>('');
  const [mergePreview, setMergePreview] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (search.trim()) sp.set('search', search.trim());
      if (appFilter) sp.set('applicationType', appFilter);
      const res = await adminFetch(`/thematic-tags?${sp.toString()}`);
      setTags(res.tags || []);
      setTotal(res.total ?? res.tags?.length ?? 0);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, search, appFilter]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const saveForm = () => {
    if (!form || !form.name.trim()) return;
    const body = {
      name: form.name.trim(),
      slug: form.slug,
      description: form.description,
      color: form.color,
      isActive: form.isActive !== false,
      sortOrder: form.sortOrder ?? 0,
      applicationTypes: form.applicationTypes ?? ['events', 'interests'],
    };
    act(async () => {
      if (form.id && form.id > 0) {
        await adminFetch(`/thematic-tags/${form.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await adminFetch('/thematic-tags', { method: 'POST', body: JSON.stringify(body) });
      }
      setForm(null);
      await load();
    }, 'Тег сохранён');
  };

  const previewMerge = async () => {
    if (!mergeFrom || !mergeTo) return;
    const res = await adminFetch('/thematic-tags/merge/preview', {
      method: 'POST',
      body: JSON.stringify({ fromId: mergeFrom, toId: mergeTo }),
    });
    setMergePreview(res.preview);
  };

  const doMerge = () => {
    if (!mergeFrom || !mergeTo) return;
    if (!window.confirm('Объединить теги? Действие необратимо.')) return;
    act(async () => {
      await adminFetch('/thematic-tags/merge', {
        method: 'POST',
        body: JSON.stringify({ fromId: mergeFrom, toId: mergeTo }),
      });
      setMergeFrom('');
      setMergeTo('');
      setMergePreview(null);
      await load();
    }, 'Теги объединены');
  };

  const bulkMerge = () => {
    const ids = [...selected];
    if (ids.length < 2) return;
    const toId = ids[0];
    act(async () => {
      for (let i = 1; i < ids.length; i++) {
        await adminFetch('/thematic-tags/merge', {
          method: 'POST',
          body: JSON.stringify({ fromId: ids[i], toId }),
        });
      }
      setSelected(new Set());
      await load();
    }, 'Объединение выполнено');
  };

  return (
    <div className="adm-forum">
      <AdminPageHero title={`Управление тегами · ${total} тегов`} hint="Единый реестр тегов для рекомендаций и онбординга." />

      {form && (
        <div className="card adm-forum-block">
          <h3>{form.id ? 'Редактировать тег' : 'Создать тег'}</h3>
          <label className="adm-field"><span className="adm-label">Название</span>
            <input className="adm-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="adm-field"><span className="adm-label">Ключ (латиница)</span>
            <input className="adm-input" value={form.slug ?? ''} onChange={e => setForm({ ...form, slug: e.target.value })} />
          </label>
          <div className="adm-field">
            <span className="adm-label">Тип применения</span>
            {APP_TYPES.map(t => (
              <label key={t.key} style={{ display: 'block' }}>
                <input
                  type="checkbox"
                  checked={(form.applicationTypes ?? []).includes(t.key)}
                  onChange={e => {
                    const cur = new Set(form.applicationTypes ?? []);
                    if (e.target.checked) cur.add(t.key);
                    else cur.delete(t.key);
                    setForm({ ...form, applicationTypes: [...cur] });
                  }}
                />
                {' '}{t.label}
              </label>
            ))}
          </div>
          <label className="adm-field"><span className="adm-label">Описание</span>
            <textarea className="adm-input" value={form.description ?? ''} onChange={e => setForm({ ...form, description: e.target.value })} />
          </label>
          <label className="adm-field"><span className="adm-label">Цвет</span>
            <input className="adm-input" value={form.color ?? ''} onChange={e => setForm({ ...form, color: e.target.value })} placeholder="#336699" />
          </label>
          <label className="adm-field" style={{ flexDirection: 'row', gap: 8 }}>
            <input type="checkbox" checked={form.isActive !== false} onChange={e => setForm({ ...form, isActive: e.target.checked })} />
            Активен
          </label>
          <div className="adm-forum-toolbar">
            <button type="button" className="adm-btn adm-btn-primary" onClick={saveForm}>Сохранить</button>
            <button type="button" className="adm-btn adm-btn-secondary" onClick={() => setForm(null)}>Отменить</button>
          </div>
        </div>
      )}

      <div className="card adm-forum-block">
        <div className="adm-forum-toolbar">
          <input className="adm-input" placeholder="Поиск по названию" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="adm-input" value={appFilter} onChange={e => setAppFilter(e.target.value)}>
            <option value="">Все типы</option>
            {APP_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => load()}>Применить</button>
          <button type="button" className="adm-btn adm-btn-primary" onClick={() => setForm({ name: '', applicationTypes: ['events', 'interests'] } as TagRow)}>+ Создать тег</button>
          <button type="button" className="adm-btn adm-btn-secondary" disabled={selected.size < 2} onClick={bulkMerge}>Объединить выбранные</button>
        </div>

        <div className="adm-forum-block" style={{ marginTop: 16 }}>
          <h4>Слияние (merge)</h4>
          <div className="adm-forum-toolbar">
            <select className="adm-input" value={mergeFrom} onChange={e => setMergeFrom(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Тег-источник</option>
              {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select className="adm-input" value={mergeTo} onChange={e => setMergeTo(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Тег-назначение</option>
              {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button type="button" className="adm-btn adm-btn-secondary" onClick={previewMerge}>Preview</button>
            <button type="button" className="adm-btn adm-btn-primary" onClick={doMerge}>Объединить</button>
          </div>
          {mergePreview && (
            <p className="adm-muted">Будет перепривязано: событий {mergePreview.eventsUpdated}, материалов {mergePreview.materialsUpdated}, участников {mergePreview.participantsUpdated}</p>
          )}
        </div>

        {loading ? <p className="adm-muted">Загрузка…</p> : (
          <table className="adm-table">
            <thead>
              <tr>
                <th />
                <th>Название</th>
                <th>Типы</th>
                <th>Использование</th>
                <th>Порядок</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tags.map(t => (
                <tr key={t.id}>
                  <td><input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)} /></td>
                  <td>{t.name}</td>
                  <td>{(t.applicationTypes ?? []).join(', ')}</td>
                  <td>
                    событий {t.usage?.events ?? 0}, материалов {t.usage?.materials ?? 0}, участников {t.usage?.participants ?? 0}
                  </td>
                  <td>{t.sortOrder ?? 0}</td>
                  <td>
                    <RowActionsMenu actions={[
                      { label: 'Редактировать', onClick: () => setForm({ ...t }) },
                      { label: 'Переименовать', onClick: () => setForm({ ...t }) },
                      {
                        label: 'Удалить',
                        danger: true,
                        onClick: () => {
                          if (!window.confirm('Точно удалить? Действие необратимо')) return;
                          act(() => adminFetch(`/thematic-tags/${t.id}`, { method: 'DELETE' }).then(load), 'Удалено');
                        },
                      },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
