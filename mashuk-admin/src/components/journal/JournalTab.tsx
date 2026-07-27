import { useCallback, useEffect, useState } from 'react';
import { label } from '../../labels/ru';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';

type ActionLogRow = {
  id: number;
  createdAt?: string;
  adminLogin?: string;
  actionType?: string;
  section?: string;
  objectId?: string | number;
  isCritical?: boolean;
};

export function JournalTab({ adminFetch, act: _act, reloadKey }: AdminTabProps) {
  const [journalCritical, setJournalCritical] = useState(false);
  const [actionsLog, setActionsLog] = useState<ActionLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch(`/actions-log?critical=${journalCritical ? 1 : 0}`);
      setActionsLog(res.actions || []);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, journalCritical]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  return (
    <div className="adm-forum">
      <AdminPageHero
        title="Журнал действий"
        hint="История операций администраторов. Критичные операции — удаления и блокировки."
      />

      <div className="card adm-forum-block">
        <label className="adm-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={journalCritical}
            onChange={e => setJournalCritical(e.target.checked)}
          />
          <span className="adm-label">Только критичные операции</span>
        </label>
      </div>

      {loading ? (
        <p className="adm-muted">Загрузка журнала…</p>
      ) : (
        <div className="card adm-forum-block">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Время</th>
                <th>Админ</th>
                <th>Действие</th>
                <th>Раздел</th>
                <th>Объект</th>
                <th>Крит.</th>
              </tr>
            </thead>
            <tbody>
              {actionsLog.map(a => (
                <tr key={a.id}>
                  <td>{a.createdAt ? new Date(a.createdAt).toLocaleString('ru-RU') : ''}</td>
                  <td>{a.adminLogin}</td>
                  <td>{label(a.actionType ?? '')}</td>
                  <td>{a.section}</td>
                  <td>{a.objectId}</td>
                  <td>{a.isCritical ? '⚠' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {actionsLog.length === 0 && <p className="adm-muted">Записей нет</p>}
        </div>
      )}
    </div>
  );
}
