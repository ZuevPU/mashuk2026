import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { confirmDelete } from '../../admin/confirmDelete';
import { getAdminApiBase, getAdminToken } from '../../admin/client';
import { RowActionsMenu } from '../participants/RowActionsMenu';
import {
  AdviceFormSection,
  adviceFromExperiment,
  emptyAdviceForm,
  type AdviceFormState,
} from './AdviceFormSection';
import { ROLE_OPTIONS, roleName } from './roleOptions';
import type { DayExperiment } from './types';

function buildListQuery(params: {
  q: string;
  roleKey: string;
  day: string;
  status: string;
}): string {
  const sp = new URLSearchParams();
  if (params.q.trim()) sp.set('q', params.q.trim());
  if (params.roleKey) sp.set('roleKey', params.roleKey);
  if (params.day) sp.set('day', params.day);
  if (params.status) sp.set('status', params.status);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

function statusLabel(s?: string | null): string {
  return s === 'published' ? 'Опубликован' : 'Черновик';
}

type Props = {
  adminFetch: (path: string, opts?: RequestInit) => Promise<any>;
  act: (fn: () => Promise<void>, msg?: string) => void;
  initialRoleFilter?: string;
  filterVersion?: number;
};

export function AdviceCatalogSection({
  adminFetch,
  act,
  initialRoleFilter = '',
  filterVersion = 0,
}: Props) {
  const [experiments, setExperiments] = useState<DayExperiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'form'>('list');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState(initialRoleFilter);
  const [dayFilter, setDayFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AdviceFormState>(() => emptyAdviceForm());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRoleFilter(initialRoleFilter);
  }, [initialRoleFilter, filterVersion]);

  const listQuery = useMemo(
    () => buildListQuery({ q: search, roleKey: roleFilter, day: dayFilter, status: statusFilter }),
    [search, roleFilter, dayFilter, statusFilter],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filteredRes = await adminFetch(`/day-experiments${listQuery}`);
      setExperiments(filteredRes.experiments || []);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [adminFetch, listQuery]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  const allVisibleSelected = experiments.length > 0
    && experiments.every(e => selectedIds.has(e.id));

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(experiments.map(e => e.id)));
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyAdviceForm());
    if (roleFilter) setForm(f => ({ ...emptyAdviceForm(), roleKey: roleFilter }));
    setView('form');
  };

  const openEdit = (e: DayExperiment) => {
    setEditingId(e.id);
    setForm(adviceFromExperiment(e));
    setView('form');
  };

  const submit = (status: 'draft' | 'published') => act(async () => {
    if (!form.body.trim()) throw new Error('Укажите текст совета');
    await adminFetch('/day-experiments', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        title: '',
        hint: '',
        title2: '',
        hint2: '',
        title3: '',
        hint3: '',
        status,
      }),
    });
    setView('list');
    setEditingId(null);
    await load();
  }, status === 'published' ? 'Совет опубликован' : 'Совет сохранён');

  const deleteOne = (id: number) => act(async () => {
    await adminFetch(`/day-experiments/${id}`, { method: 'DELETE' });
    await load();
  }, 'Удалено');

  const deleteSelected = () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!confirmDelete(`Удалить выбранные советы (${ids.length})?`)) return;
    act(async () => {
      for (const id of ids) {
        await adminFetch(`/day-experiments/${id}`, { method: 'DELETE' });
      }
      setSelectedIds(new Set());
      await load();
    }, `Удалено: ${ids.length}`);
  };

  const downloadTemplate = async () => {
    const token = getAdminToken();
    const res = await fetch(`${getAdminApiBase()}/day-experiments/csv-template`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'advice-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportFile = (file: File) => act(async () => {
    const csv = await file.text();
    const res = await adminFetch('/day-experiments/import', {
      method: 'POST',
      body: JSON.stringify({ csv }),
    });
    const errCount = (res.errors || []).length;
    if (errCount) {
      throw new Error(`Импорт: создано ${res.created}, обновлено ${res.updated}, ошибок ${errCount}`);
    }
    await load();
  }, 'CSV импортирован');

  if (view === 'form') {
    return (
      <AdviceFormSection
        form={form}
        editingId={editingId}
        onChange={setForm}
        onSaveDraft={() => submit('draft')}
        onPublish={() => submit('published')}
        onCancel={() => { setView('list'); setEditingId(null); }}
      />
    );
  }

  return (
    <>
      <div className="card adm-forum-hero">
        <div className="adm-forum-toolbar adm-advice-toolbar">
          <input
            className="adm-input"
            placeholder="Поиск"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ minWidth: 160 }}
          />
          <select className="adm-input" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="">Роль: все</option>
            {ROLE_OPTIONS.map(r => (
              <option key={r.key} value={r.key}>{r.name}</option>
            ))}
          </select>
          <select className="adm-input" value={dayFilter} onChange={e => setDayFilter(e.target.value)}>
            <option value="">День: все</option>
            {[1, 2, 3, 4, 5, 6, 7].map(d => (
              <option key={d} value={String(d)}>День {d}</option>
            ))}
          </select>
          <select className="adm-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Статус: все</option>
            <option value="draft">Черновик</option>
            <option value="published">Опубликован</option>
          </select>
          <button type="button" className="adm-btn adm-btn-primary" onClick={openNew}>+ Добавить совет</button>
          {selectedIds.size > 0 && (
            <button type="button" className="adm-btn adm-btn-danger" onClick={deleteSelected}>
              Удалить выбранные ({selectedIds.size})
            </button>
          )}
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => importRef.current?.click()}>
            Импорт из CSV
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f);
              e.target.value = '';
            }}
          />
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadTemplate().catch(err => alert(String(err)))}>
            Скачать шаблон CSV
          </button>
        </div>
      </div>

      <div className="card adm-forum-block">
        {loading ? (
          <p className="adm-muted">Загрузка…</p>
        ) : experiments.length === 0 ? (
          <p className="adm-muted">Советов не найдено — добавьте первый или измените фильтры.</p>
        ) : (
          <>
          {selectedIds.size > 0 && (
            <div className="adm-forum-toolbar" style={{ marginBottom: 10, gap: 8 }}>
              <span style={{ fontWeight: 700 }}>Выбрано: {selectedIds.size}</span>
              <button type="button" className="adm-btn adm-btn-danger adm-btn-sm" onClick={deleteSelected}>
                Удалить
              </button>
              <button
                type="button"
                className="adm-btn adm-btn-ghost adm-btn-sm"
                onClick={() => setSelectedIds(new Set())}
              >
                Снять выбор
              </button>
            </div>
          )}
          <table className="adm-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    aria-label="Выбрать все"
                    title="Выбрать все на экране"
                  />
                </th>
                <th>Роль</th>
                <th>День</th>
                <th>Совет дня №1</th>
                <th>Совет дня №2</th>
                <th>Совет дня №3</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {experiments.map(e => (
                <tr key={e.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(e.id)}
                      onChange={() => toggleSelect(e.id)}
                      aria-label={`Выбрать совет ${roleName(e.roleKey)} день ${e.dayNumber}`}
                    />
                  </td>
                  <td>{roleName(e.roleKey)}</td>
                  <td>{e.dayNumber}</td>
                  <td style={{ fontSize: 12, maxWidth: 180, color: '#555' }}>
                    {(e.body || '').trim()
                      ? `${(e.body || '').slice(0, 100)}${(e.body || '').length > 100 ? '…' : ''}`
                      : <span className="adm-muted">—</span>}
                  </td>
                  <td style={{ fontSize: 12, maxWidth: 180, color: '#555' }}>
                    {(e.body2 || '').trim()
                      ? `${(e.body2 || '').slice(0, 100)}${(e.body2 || '').length > 100 ? '…' : ''}`
                      : <span className="adm-muted">—</span>}
                  </td>
                  <td style={{ fontSize: 12, maxWidth: 180, color: '#555' }}>
                    {(e.body3 || '').trim()
                      ? `${(e.body3 || '').slice(0, 100)}${(e.body3 || '').length > 100 ? '…' : ''}`
                      : <span className="adm-muted">—</span>}
                  </td>
                  <td>{statusLabel(e.status)}</td>
                  <td>
                    <RowActionsMenu
                      actions={[
                        { label: 'Редактировать', onClick: () => openEdit(e) },
                        {
                          label: 'Удалить',
                          danger: true,
                          onClick: () => {
                            if (!confirmDelete()) return;
                            deleteOne(e.id);
                          },
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </div>
    </>
  );
}
