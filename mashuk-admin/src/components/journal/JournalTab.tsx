import { useCallback, useEffect, useState } from 'react';
import { label } from '../../labels/ru';
import { adminDownloadBinary } from '../../admin/client';
import { AdminPageHero } from '../admin/AdminPageHero';
import { RowActionsMenu } from '../participants/RowActionsMenu';
import type { AdminTabProps } from '../admin/types';

type ActionLogRow = {
  id: number;
  createdAt?: string;
  adminLogin?: string;
  actionType?: string;
  section?: string;
  objectId?: string | number;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string;
  isCritical?: boolean;
  reviewedAt?: string | null;
};

type JournalMode = 'all' | 'critical';

export function JournalTab({ adminFetch, act, reloadKey }: AdminTabProps) {
  const [mode, setMode] = useState<JournalMode>('all');
  const [reviewFilter, setReviewFilter] = useState('');
  const [search, setSearch] = useState('');
  const [section, setSection] = useState('');
  const [actionType, setActionType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actionsLog, setActionsLog] = useState<ActionLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<ActionLogRow | null>(null);
  const [loading, setLoading] = useState(true);

  const buildQuery = useCallback(() => {
    const sp = new URLSearchParams();
    sp.set('limit', '100');
    if (mode === 'critical') sp.set('critical', '1');
    if (reviewFilter) sp.set('review', reviewFilter);
    if (search.trim()) sp.set('search', search.trim());
    if (section) sp.set('section', section);
    if (actionType) sp.set('actionType', actionType);
    if (dateFrom) sp.set('dateFrom', dateFrom);
    if (dateTo) sp.set('dateTo', dateTo);
    return sp.toString();
  }, [mode, reviewFilter, search, section, actionType, dateFrom, dateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch(`/actions-log?${buildQuery()}`);
      setActionsLog(res.actions || []);
      setTotal(res.total ?? res.actions?.length ?? 0);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, buildQuery]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const exportXlsx = () => {
    const sp = buildQuery();
    act(() => adminDownloadBinary(`/actions-log/export?${sp}`, 'admin_actions_log.xlsx'), 'Экспорт');
  };

  return (
    <div className="adm-forum">
      <AdminPageHero
        title="Журнал изменений"
        hint="История операций администраторов. Критичные операции — отдельная вкладка."
      />

      <div className="adm-seg" style={{ marginBottom: 12 }}>
        <button type="button" className={mode === 'all' ? 'on' : ''} onClick={() => setMode('all')}>Все записи</button>
        <button type="button" className={mode === 'critical' ? 'on' : ''} onClick={() => setMode('critical')}>Критичные операции</button>
      </div>

      <div className="card adm-forum-block">
        <div className="adm-forum-toolbar">
          <input className="adm-input" placeholder="Поиск" value={search} onChange={e => setSearch(e.target.value)} />
          <input className="adm-input" placeholder="Раздел" value={section} onChange={e => setSection(e.target.value)} />
          <input className="adm-input" placeholder="Тип действия" value={actionType} onChange={e => setActionType(e.target.value)} />
          <input className="adm-input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <input className="adm-input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          {mode === 'critical' && (
            <select className="adm-input" value={reviewFilter} onChange={e => setReviewFilter(e.target.value)}>
              <option value="">Все</option>
              <option value="pending">Требует ревью</option>
              <option value="reviewed">Отревьюено</option>
            </select>
          )}
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => load()}>Применить</button>
          <button type="button" className="adm-btn adm-btn-primary" onClick={exportXlsx}>Экспорт лога в XLSX</button>
        </div>
        <p className="adm-muted">Записей: {total}</p>
      </div>

      {loading ? (
        <p className="adm-muted">Загрузка журнала…</p>
      ) : (
        <div className="card adm-forum-block">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Дата+время</th>
                <th>Пользователь</th>
                <th>Раздел</th>
                <th>Действие</th>
                <th>Объект</th>
                <th>IP</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {actionsLog.map(a => (
                <tr key={a.id}>
                  <td>{a.createdAt ? new Date(a.createdAt).toLocaleString('ru-RU') : ''}</td>
                  <td>{a.adminLogin}</td>
                  <td>{a.section}</td>
                  <td>{label(a.actionType ?? '')}</td>
                  <td>{a.objectId}</td>
                  <td>{a.ip || '—'}</td>
                  <td>
                    <RowActionsMenu
                      actions={[
                        { label: 'Открыть детали', onClick: () => setDetail(a) },
                        {
                          label: 'Откатить',
                          onClick: () => act(async () => {
                            await adminFetch(`/actions-log/${a.id}/rollback`, { method: 'POST', body: '{}' });
                            await load();
                          }, 'Откат'),
                        },
                        ...(mode === 'critical' && !a.reviewedAt ? [{
                          label: 'Пометить как отревьюено',
                          onClick: () => act(async () => {
                            await adminFetch(`/actions-log/${a.id}/review`, {
                              method: 'PATCH',
                              body: JSON.stringify({ reviewed: true }),
                            });
                            await load();
                          }, 'Отмечено'),
                        }] : []),
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {actionsLog.length === 0 && <p className="adm-muted">Записей нет</p>}
        </div>
      )}

      {detail && (
        <div className="adm-modal-backdrop" onClick={() => setDetail(null)}>
          <div className="adm-modal adm-modal-wide" onClick={e => e.stopPropagation()}>
            <h3>Детали записи #{detail.id}</h3>
            <p><strong>Старое значение:</strong></p>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(detail.oldValue, null, 2)}</pre>
            <p><strong>Новое значение:</strong></p>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(detail.newValue, null, 2)}</pre>
            <button type="button" className="adm-btn adm-btn-secondary" onClick={() => setDetail(null)}>Закрыть</button>
          </div>
        </div>
      )}
    </div>
  );
}
