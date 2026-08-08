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
  progress?: number;
  doneCount?: number | null;
  totalCount?: number | null;
  fileName?: string;
  byteSize?: number;
  createdAt?: string;
  expiresAt?: string;
  errorMessage?: string;
};

type ReadyExport = { id: string; fileName?: string; status?: string; errorMessage?: string };

const EXPORT_TYPES = [
  { value: 'all', label: 'Все типы' },
  { value: 'checkin', label: 'Check-in' },
  { value: 'direction', label: 'Направление' },
  { value: 'lesson_important', label: 'Урок о важном' },
  { value: 'lesson_open', label: 'Открытый урок' },
  { value: 'evening', label: 'Итоги дня' },
  { value: 'point_a', label: 'Точка А' },
  { value: 'point_b', label: 'Точка Б' },
] as const;

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
  const [allDays, setAllDays] = useState(false);
  const [participantId, setParticipantId] = useState('');
  const [lastReady, setLastReady] = useState<ReadyExport | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setLastReady(null);
    setFormError(null);
    setMeta(null);
    adminFetch('/exports/meta')
      .then(m => setMeta(m as ExportMeta))
      .catch((err: unknown) => {
        setFormError(err instanceof Error ? err.message : 'Не удалось загрузить источники выгрузки');
      });
  }, [open, adminFetch]);

  const srcDef = meta?.sources.find(s => s.id === source);
  const supportsType = source === 'answers' || source === 'reflections';
  const supportsDayScope = source === 'answers' || source === 'reflections'
    || source === 'participant_activity_wide' || source === 'rating_day';

  useEffect(() => {
    if (srcDef && columns.length === 0) setColumns([...srcDef.defaultColumns]);
  }, [srcDef, columns.length]);

  const toggleColumn = (key: string) => {
    setColumns(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  };

  const submit = () => {
    setFormError(null);
    act(async () => {
      try {
        const dayParam = supportsDayScope && !allDays
          ? (Number(forumDay) || undefined)
          : undefined;
        const row = (await adminFetch('/exports/custom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source,
            title: title || `Кастом ${source}`,
            columns,
            params: {
              day: dayParam,
              direction: direction || undefined,
              group: group || undefined,
              type: supportsType && exportType !== 'all' ? exportType : undefined,
              participantId: participantId ? Number(participantId) : undefined,
            },
          }),
        })) as ReadyExport;

        if (row.status === 'failed') {
          setFormError(row.errorMessage || 'Не удалось сформировать выгрузку');
          setLastReady(null);
          throw new Error(row.errorMessage || 'export failed');
        }

        setLastReady(row);
        await adminDownloadBinary(`/exports/history/${row.id}/download`, row.fileName || 'export.xlsx');
        onDone();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Ошибка выгрузки';
        setFormError(msg);
        throw err;
      }
    }, 'Файл скачан');
  };

  if (!open) return null;

  return (
    <div className="adm-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="adm-modal card" role="dialog" onClick={e => e.stopPropagation()}>
        <h3>Кастомная выгрузка</h3>
        <p className="adm-muted" style={{ fontSize: 12 }}>
          Файл сразу скачивается и сохраняется в истории на 30 дней.
        </p>
        {formError && (
          <p className="adm-insights-warn" style={{ marginTop: 8 }}>{formError}</p>
        )}
        {step === 0 && (
          <>
            <p className="adm-muted">Шаг 1 — источник данных</p>
            <select className="adm-input" value={source} onChange={e => { setSource(e.target.value); setColumns([]); setLastReady(null); }}>
              {(meta?.sources ?? []).map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            {source === 'participant_activity_wide' && (
              <p className="adm-muted" style={{ fontSize: 12, marginTop: 8 }}>
                Одна строка = участник × активности. Без галочки «вся смена» берётся D{forumDay}.
              </p>
            )}
            <button
              type="button"
              className="adm-btn adm-btn-primary"
              style={{ marginTop: 12 }}
              disabled={!meta?.sources?.length}
              onClick={() => setStep(1)}
            >
              {meta?.sources?.length ? 'Далее' : 'Загрузка источников…'}
            </button>
          </>
        )}
        {step === 1 && (
          <>
            <p className="adm-muted">Шаг 2 — фильтры (направление/группа из верхней панели)</p>
            {supportsDayScope && (
              <label className="adm-muted" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <input type="checkbox" checked={allDays} onChange={e => setAllDays(e.target.checked)} />
                Вся смена (без фильтра по дню)
              </label>
            )}
            {supportsDayScope && !allDays && (
              <p className="adm-muted" style={{ fontSize: 12 }}>День форума: D{forumDay}</p>
            )}
            {supportsType && (
              <select className="adm-input" value={exportType} onChange={e => setExportType(e.target.value)}>
                {EXPORT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
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
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button type="button" className="adm-btn adm-btn-secondary" onClick={() => setStep(1)}>Назад</button>
              <button type="button" className="adm-btn adm-btn-primary" disabled={columns.length === 0} onClick={submit}>
                Сформировать и скачать XLSX
              </button>
              {lastReady?.id && (
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary"
                  onClick={() => act(
                    () => adminDownloadBinary(
                      `/exports/history/${lastReady.id}/download`,
                      lastReady.fileName || 'export.xlsx',
                    ),
                    'Файл скачан',
                  )}
                >
                  Скачать ещё раз
                </button>
              )}
            </div>
            {lastReady?.id && (
              <p className="adm-muted" style={{ fontSize: 12, marginTop: 8 }}>
                Файл сохранён в историю выгрузок на 30 дней.
              </p>
            )}
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

  const hasActive = items.some(i => i.status === 'pending' || i.status === 'running');
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => { load().catch(() => undefined); }, 2000);
    return () => clearInterval(t);
  }, [hasActive, load]);

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
              <th>Прогресс</th>
              <th>Размер</th>
              <th>До</th>
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
                <td>
                  {(row.status === 'pending' || row.status === 'running' || (row.progress != null && row.progress > 0))
                    ? `${row.progress ?? 0}%${row.totalCount != null ? ` (${row.doneCount ?? 0}/${row.totalCount})` : ''}`
                    : '—'}
                </td>
                <td>{row.byteSize ? `${Math.round(row.byteSize / 1024)} КБ` : '—'}</td>
                <td>{row.expiresAt ? new Date(row.expiresAt).toLocaleDateString('ru-RU') : '—'}</td>
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
