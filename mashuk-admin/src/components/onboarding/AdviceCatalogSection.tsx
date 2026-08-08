import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { confirmDelete } from '../../admin/confirmDelete';
import { getAdminApiBase, getAdminToken } from '../../admin/client';
import { AdminPageHero } from '../admin/AdminPageHero';
import { RowActionsMenu } from '../participants/RowActionsMenu';
import {
  AdviceFormSection,
  adviceFromExperiment,
  emptyAdviceForm,
  type AdviceFormState,
} from './AdviceFormSection';
import { ROLE_OPTIONS, roleName } from './roleOptions';
import type { DayExperiment } from './types';

const TOTAL_CELLS = 6 * 7;

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
  const [totalInDb, setTotalInDb] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'form'>('list');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState(initialRoleFilter);
  const [dayFilter, setDayFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AdviceFormState>(() => emptyAdviceForm());
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
      const [filteredRes, allRes] = await Promise.all([
        adminFetch(`/day-experiments${listQuery}`),
        adminFetch('/day-experiments'),
      ]);
      setExperiments(filteredRes.experiments || []);
      setTotalInDb((allRes.experiments || []).length);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, listQuery]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  const missingCells = TOTAL_CELLS - totalInDb;

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
    if (!form.title.trim()) throw new Error('Укажите заголовок');
    await adminFetch('/day-experiments', {
      method: 'POST',
      body: JSON.stringify({ ...form, status }),
    });
    setView('list');
    setEditingId(null);
    await load();
  }, status === 'published' ? 'Совет опубликован' : 'Совет сохранён');

  const deleteOne = (id: number) => act(async () => {
    await adminFetch(`/day-experiments/${id}`, { method: 'DELETE' });
    await load();
  }, 'Удалено');

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
      <AdminPageHero
        title={`Каталог советов · ${totalInDb} групп`}
        hint={`Каждой паре (роль × день) — от 1 до 3 советов (${totalInDb}/${TOTAL_CELLS} ячеек). Участник на главной видит только опубликованные (дни 2–7).`}
      >
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
        {missingCells > 0 && (
          <p className="adm-forum-hint" style={{ marginTop: 10 }}>
            Не заполнено ячеек каталога (6 ролей × 7 дней): {missingCells} из {TOTAL_CELLS}.
          </p>
        )}
      </AdminPageHero>

      <div className="card adm-forum-block">
        {loading ? (
          <p className="adm-muted">Загрузка…</p>
        ) : experiments.length === 0 ? (
          <p className="adm-muted">Советов не найдено — добавьте первый или измените фильтры.</p>
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
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
                  <td>{roleName(e.roleKey)}</td>
                  <td>{e.dayNumber}</td>
                  <td style={{ fontSize: 12, maxWidth: 160, color: '#555' }}>
                    <strong>{e.title}</strong>
                    <div>{(e.body || '').slice(0, 80)}{(e.body || '').length > 80 ? '…' : ''}</div>
                  </td>
                  <td style={{ fontSize: 12, maxWidth: 160, color: '#555' }}>
                    {e.title2 ? (
                      <>
                        <strong>{e.title2}</strong>
                        <div>{(e.body2 || '').slice(0, 80)}{(e.body2 || '').length > 80 ? '…' : ''}</div>
                      </>
                    ) : (
                      <span className="adm-muted">—</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, maxWidth: 160, color: '#555' }}>
                    {e.title3 ? (
                      <>
                        <strong>{e.title3}</strong>
                        <div>{(e.body3 || '').slice(0, 80)}{(e.body3 || '').length > 80 ? '…' : ''}</div>
                      </>
                    ) : (
                      <span className="adm-muted">—</span>
                    )}
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
        )}
      </div>
    </>
  );
}
