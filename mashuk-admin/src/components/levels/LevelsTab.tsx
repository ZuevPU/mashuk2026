import { useCallback, useEffect, useState } from 'react';
import { label } from '../../labels/ru';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';

type LevelConfig = {
  id: number;
  actionType: string;
  pointsPerUnit: number;
  maxAccruals?: number;
  levelType?: string;
  levelThresholds?: number[];
};

type PointsLogRow = {
  id: number;
  participantName?: string;
  actionType: string;
  points: number;
  createdAt?: string;
};

type NewLevelForm = {
  actionType: string;
  pointsPerUnit: number;
  maxAccruals: number;
  levelType: string;
  levelThresholds: string;
};

const emptyNewLevel = (): NewLevelForm => ({
  actionType: '',
  pointsPerUnit: 10,
  maxAccruals: 0,
  levelType: 'experience',
  levelThresholds: '0,100,250,500,1000',
});

export function LevelsTab({ adminFetch, act, reloadKey }: AdminTabProps) {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<LevelConfig[]>([]);
  const [pointsLog, setPointsLog] = useState<PointsLogRow[]>([]);
  const [newLevel, setNewLevel] = useState<NewLevelForm>(() => emptyNewLevel());
  const [pointsDrafts, setPointsDrafts] = useState<Record<number, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = ((await adminFetch('/levels-config')).config || []) as LevelConfig[];
      setConfig(cfg);
      setPointsDrafts(Object.fromEntries(cfg.map(c => [c.id, c.pointsPerUnit])));
      setPointsLog(((await adminFetch('/points-log')).log || []) as PointsLogRow[]);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const addLevel = () => {
    if (!newLevel.actionType.trim()) {
      alert('Укажите тип действия.');
      return;
    }
    act(async () => {
      await adminFetch('/levels-config', {
        method: 'POST',
        body: JSON.stringify({
          actionType: newLevel.actionType.trim(),
          pointsPerUnit: newLevel.pointsPerUnit,
          maxAccruals: newLevel.maxAccruals,
          levelType: newLevel.levelType,
          levelThresholds: newLevel.levelThresholds.split(',').map(Number),
        }),
      });
      setNewLevel(emptyNewLevel());
      await load();
    }, 'Добавлено');
  };

  const updateLevel = (c: LevelConfig) => {
    const pointsPerUnit = pointsDrafts[c.id] ?? c.pointsPerUnit;
    act(async () => {
      await adminFetch('/levels-config', {
        method: 'POST',
        body: JSON.stringify({
          actionType: c.actionType,
          pointsPerUnit: Number(pointsPerUnit),
          maxAccruals: c.maxAccruals,
          levelThresholds: c.levelThresholds,
        }),
      });
      await load();
    }, 'Обновлено');
  };

  if (loading) return <p className="adm-muted">Загрузка настроек баллов…</p>;

  return (
    <div className="adm-forum adm-levels">
      <AdminPageHero title="Баллы и уровни" hint="Настройка начисления баллов по типам действий и журнал начислений." />

      <div className="card">
        <h3>Новая настройка</h3>
        <div className="adm-forum-grid-2">
          <label className="adm-field">
            <span className="adm-label">Тип действия</span>
            <input className="adm-input" value={newLevel.actionType} onChange={e => setNewLevel({ ...newLevel, actionType: e.target.value })} placeholder="action_type" />
          </label>
          <label className="adm-field">
            <span className="adm-label">Баллы за единицу</span>
            <input type="number" className="adm-input" value={newLevel.pointsPerUnit} onChange={e => setNewLevel({ ...newLevel, pointsPerUnit: Number(e.target.value) })} />
          </label>
        </div>
        <label className="adm-field">
          <span className="adm-label">Пороги уровней (через запятую)</span>
          <input className="adm-input" value={newLevel.levelThresholds} onChange={e => setNewLevel({ ...newLevel, levelThresholds: e.target.value })} />
        </label>
        <button type="button" className="adm-btn adm-btn-primary" onClick={addLevel}>
          Добавить
        </button>
      </div>

      {config.map(c => {
        const pts = pointsDrafts[c.id] ?? c.pointsPerUnit;
        const dirty = Number(pts) !== c.pointsPerUnit;
        return (
          <div key={c.id} className="card adm-level-row">
            <div className="adm-forum-toolbar" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>{label(c.actionType)}</strong>
              <label className="adm-field" style={{ marginBottom: 0, minWidth: 100 }}>
                <span className="adm-label">Баллы</span>
                <input
                  type="number"
                  className="adm-input"
                  value={pts}
                  onChange={e => setPointsDrafts(d => ({ ...d, [c.id]: Number(e.target.value) }))}
                  style={{ width: 80 }}
                />
              </label>
              <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={() => updateLevel(c)}>
                Обновить{dirty ? ' •' : ''}
              </button>
            </div>
          </div>
        );
      })}

      <div className="card">
        <h3>Лог начислений</h3>
        <table className="adm-table">
          <thead>
            <tr>
              <th>Участник</th>
              <th>Действие</th>
              <th>Баллы</th>
              <th>Дата</th>
            </tr>
          </thead>
          <tbody>
            {pointsLog.map(l => (
              <tr key={l.id}>
                <td>{l.participantName}</td>
                <td>{label(l.actionType)}</td>
                <td>{l.points}</td>
                <td>{l.createdAt ? new Date(l.createdAt).toLocaleString('ru-RU') : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
