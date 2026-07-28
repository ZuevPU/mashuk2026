import { useCallback, useEffect, useState } from 'react';
import { adminDownloadBinary } from '../../admin/client';
import { useInsights } from '../insights/InsightsContext';

type ExportMeta = {
  sources: {
    id: string;
    label: string;
    defaultColumns: string[];
    columns: { key: string; label: string }[];
  }[];
};

type HistoryItem = {
  id: string;
  title: string;
  source: string;
  status: string;
  fileName?: string;
  byteSize?: number;
  createdAt?: string;
  errorMessage?: string;
};

export function CustomExportModal({
  open,
  onClose,
  adminFetch,
  act,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  adminFetch: (path: string, init?: RequestInit) => Promise<unknown>;
  act: (fn: () => Promise<unknown>, msg?: string) => void;
  onDone: () => void;
}) {
  const { forumDay, direction, group } = useInsights();
  const [step, setStep] = useState(0);
  const [meta, setMeta] = useState<ExportMeta | null>(null);
  const [source, setSource] = useState('answers');
  const [columns, setColumns] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [exportType, setExportType] = useState('all');
  const [participantId, setParticipantId] = useState('');

  useEffect(() => {
    if (!open) return;
    adminFetch('/exports/meta').then(m => setMeta(m as ExportMeta)).catch(() => undefined);
    setStep(0);
  }, [open, adminFetch]);

  const srcDef = meta?.sources.find(s => s.id === source);

  useEffect(() => {
    if (srcDef && columns.length === 0) setColumns([...srcDef.defaultColumns]);
  }, [srcDef, columns.length]);

  const toggleColumn = (key: string) => {
    setColumns(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  };

  const submit = () => {
    act(async () => {
      await adminFetch('/exports/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          title: title || `Кастом ${source}`,
          columns,
          params: {
            day: Number(forumDay) || undefined,
            direction: direction || undefined,
            group: group || undefined,
            type: exportType !== 'all' ? exportType : undefined,
            participantId: participantId ? Number(participantId) : undefined,
          },
        }),
      });
      onDone();
      onClose();
    }, 'Выгрузка сформирована');
  };

  if (!open) return null;

  return (
    <div className="adm-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="adm-modal card" role="dialog" onClick={e => e.stopPropagation()}>
        <h3>Кастомная выгрузка</h3>
        {step === 0 && (
          <>
            <p className="adm-muted">Шаг 1 — источник данных</p>
            <select className="adm-input" value={source} onChange={e => { setSource(e.target.value); setColumns([]); }}>
              {(meta?.sources ?? []).map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <button type="button" className="adm-btn adm-btn-primary" style={{ marginTop: 12 }} onClick={() => setStep(1)}>
              Далее
            </button>
          </>
        )}
        {step === 1 && (
          <>
            <p className="adm-muted">Шаг 2 — фильтры (из верхней панели: D{forumDay}, направление, группа)</p>
            {(source === 'answers' || source === 'reflections') && (
              <select className="adm-input" value={exportType} onChange={e => setExportType(e.target.value)}>
                <option value="all">Все типы</option>
                <option value="checkin">Check-in</option>
                <option value="evening">Итоги дня</option>
              </select>
            )}
            <input className="adm-input" placeholder="ID участника (опционально)" value={participantId} onChange={e => setParticipantId(e.target.value)} />
            <input className="adm-input" placeholder="Название файла" value={title} onChange={e => setTitle(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" className="adm-btn adm-btn-secondary" onClick={() => setStep(0)}>Назад</button>
              <button type="button" className="adm-btn adm-btn-primary" onClick={() => setStep(2)}>Далее</button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <p className="adm-muted">Шаг 3 — колонки</p>
            <div className="adm-custom-columns">
              {(srcDef?.columns ?? []).map(c => (
                <label key={c.key} className="adm-muted" style={{ display: 'block' }}>
                  <input type="checkbox" checked={columns.includes(c.key)} onChange={() => toggleColumn(c.key)} />
                  {' '}{c.label}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" className="adm-btn adm-btn-secondary" onClick={() => setStep(1)}>Назад</button>
              <button type="button" className="adm-btn adm-btn-primary" disabled={columns.length === 0} onClick={submit}>
                Сформировать XLSX
              </button>
            </div>
          </>
        )}
        <button type="button" className="adm-btn adm-btn-ghost" style={{ marginTop: 8 }} onClick={onClose}>Отмена</button>
      </div>
    </div>
  );
}

export function ExportHistoryBlock({
  adminFetch,
  reloadKey,
}: {
  adminFetch: (path: string, init?: RequestInit) => Promise<unknown>;
  reloadKey: number;
}) {
  const [items, setItems] = useState<HistoryItem[]>([]);

  const load = useCallback(async () => {
    try {
      const data = (await adminFetch('/exports/history?limit=50')) as { items: HistoryItem[] };
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    }
  }, [adminFetch]);

  useEffect(() => { load(); }, [load, reloadKey]);

  return (
    <div className="card adm-forum-block">
      <h3>История выгрузок</h3>
      {items.length === 0 ? <p className="adm-muted">Пока нет сохранённых выгрузок</p> : (
        <table className="adm-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Название</th>
              <th>Источник</th>
              <th>Статус</th>
              <th>Размер</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map(row => (
              <tr key={row.id}>
                <td>{row.createdAt ? new Date(row.createdAt).toLocaleString('ru-RU') : '—'}</td>
                <td>{row.title}</td>
                <td>{row.source}</td>
                <td>{row.status}{row.errorMessage ? ` · ${row.errorMessage}` : ''}</td>
                <td>{row.byteSize ? `${Math.round(row.byteSize / 1024)} КБ` : '—'}</td>
                <td>
                  {row.status === 'ready' && (
                    <button
                      type="button"
                      className="adm-btn adm-btn-secondary adm-btn-sm"
                      onClick={() => adminDownloadBinary(`/exports/history/${row.id}/download`, row.fileName || 'export.xlsx')}
                    >
                      Скачать
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
