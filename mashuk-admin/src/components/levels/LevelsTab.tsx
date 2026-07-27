import { useCallback, useEffect, useMemo, useState } from 'react';
import { label } from '../../labels/ru';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';

type LevelConfig = {
  id: number;
  actionType: string;
  pointsPerUnit: number;
  maxAccruals?: number | null;
  levelThresholds?: unknown;
  track?: string | null;
  displayName?: string | null;
};

type ThresholdRow = { level: number; from: number; to: number; name: string };

type PointsLogRow = {
  id: number;
  participantId: number;
  participantName?: string;
  actionType: string;
  points: number;
  createdAt?: string;
  revokedAt?: string | null;
};

type RecalcRun = {
  id: number;
  startedAt?: string;
  finishedAt?: string;
  participantsProcessed?: number;
  status?: string;
  error?: string | null;
};

type BonusRule = {
  id: number;
  code: string;
  enabled?: boolean;
  params?: Record<string, unknown>;
  pointsActionType?: string | null;
};

type RatingSegment = 'settings' | 'manual';

const SYSTEM_ACTION_TYPES: { actionType: string; track: string }[] = [
  { actionType: 'question_answer', track: 'path' },
  { actionType: 'evening_complete', track: 'path' },
  { actionType: 'task_complete', track: 'experience' },
  { actionType: 'exchange_question', track: 'path' },
  { actionType: 'exchange_answer', track: 'path' },
  { actionType: 'day_complete_bonus', track: 'path' },
  { actionType: 'reflection_streak_7', track: 'path' },
  { actionType: 'bonus_regularity', track: 'bonus' },
  { actionType: 'bonus_diversity', track: 'bonus' },
  { actionType: 'piggybank_entry', track: 'experience' },
];

function parseThresholdRows(raw: unknown): ThresholdRow[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [
      { level: 1, from: 0, to: 99, name: 'Уровень 1' },
      { level: 2, from: 100, to: 249, name: 'Уровень 2' },
    ];
  }
  if (typeof raw[0] === 'number') {
    const nums = raw as number[];
    return nums.map((from, i) => ({
      level: i + 1,
      from,
      to: nums[i + 1] != null ? nums[i + 1]! - 1 : from + 9999,
      name: `Уровень ${i + 1}`,
    }));
  }
  return (raw as ThresholdRow[]).map((r, i) => ({
    level: r.level ?? i + 1,
    from: Number(r.from) || 0,
    to: Number(r.to) || 0,
    name: r.name || `Уровень ${i + 1}`,
  }));
}

function rowsToThresholdJson(rows: ThresholdRow[]) {
  return rows.map(r => ({
    level: r.level,
    from: r.from,
    to: r.to,
    name: r.name,
  }));
}

function ThresholdEditor({
  title,
  actionType,
  rows,
  onChange,
}: {
  title: string;
  actionType: string;
  rows: ThresholdRow[];
  onChange: (rows: ThresholdRow[]) => void;
}) {
  const update = (idx: number, patch: Partial<ThresholdRow>) => {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  return (
    <div className="card">
      <h3>{title}</h3>
      <p className="adm-muted" style={{ fontSize: 12 }}>Ключ конфигурации: {actionType}</p>
      <table className="adm-table">
        <thead>
          <tr>
            <th>Уровень</th>
            <th>От</th>
            <th>До</th>
            <th>Название</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.level}</td>
              <td><input type="number" className="adm-input" value={r.from} onChange={e => update(i, { from: Number(e.target.value) })} /></td>
              <td><input type="number" className="adm-input" value={r.to} onChange={e => update(i, { to: Number(e.target.value) })} /></td>
              <td><input className="adm-input" value={r.name} onChange={e => update(i, { name: e.target.value })} /></td>
              <td>
                <button type="button" className="adm-btn adm-btn-sm btn-danger" onClick={() => onChange(rows.filter((_, j) => j !== i))}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="adm-btn adm-btn-secondary adm-btn-sm"
        style={{ marginTop: 8 }}
        onClick={() => onChange([...rows, {
          level: rows.length + 1,
          from: rows.length ? rows[rows.length - 1].to + 1 : 0,
          to: rows.length ? rows[rows.length - 1].to + 100 : 99,
          name: `Уровень ${rows.length + 1}`,
        }])}
      >
        + Добавить уровень
      </button>
    </div>
  );
}

export function LevelsTab({ adminFetch, act, reloadKey }: AdminTabProps) {
  const [segment, setSegment] = useState<RatingSegment>('settings');
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<LevelConfig[]>([]);
  const [pathRows, setPathRows] = useState<ThresholdRow[]>([]);
  const [expRows, setExpRows] = useState<ThresholdRow[]>([]);
  const [rateDrafts, setRateDrafts] = useState<Record<string, { points: number; track: string; max: number }>>({});
  const [bonusRules, setBonusRules] = useState<BonusRule[]>([]);
  const [recalcHistory, setRecalcHistory] = useState<RecalcRun[]>([]);
  const [manualLog, setManualLog] = useState<PointsLogRow[]>([]);
  const [participantQuery, setParticipantQuery] = useState('');
  const [participantHits, setParticipantHits] = useState<{ id: number; name: string }[]>([]);
  const [selectedParticipantId, setSelectedParticipantId] = useState<number | null>(null);
  const [manualTrack, setManualTrack] = useState<'path' | 'experience'>('path');
  const [manualPoints, setManualPoints] = useState(10);
  const [manualReason, setManualReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = ((await adminFetch('/levels-config')).config || []) as LevelConfig[];
      setConfig(cfg);
      const pathCfg = cfg.find(c => c.actionType === 'path_level');
      const expCfg = cfg.find(c => c.actionType === 'exp_level');
      setPathRows(parseThresholdRows(pathCfg?.levelThresholds));
      setExpRows(parseThresholdRows(expCfg?.levelThresholds));

      const drafts: Record<string, { points: number; track: string; max: number }> = {};
      for (const sys of SYSTEM_ACTION_TYPES) {
        const row = cfg.find(c => c.actionType === sys.actionType);
        drafts[sys.actionType] = {
          points: row?.pointsPerUnit ?? 0,
          track: row?.track || sys.track,
          max: row?.maxAccruals ?? 0,
        };
      }
      setRateDrafts(drafts);

      setBonusRules(((await adminFetch('/rating/bonus-rules')).rules || []) as BonusRule[]);
      setRecalcHistory(((await adminFetch('/rating/recalc-history')).runs || []) as RecalcRun[]);
      setManualLog(((await adminFetch('/points-log?actionTypePrefix=admin_manual*&limit=50')).log || []) as PointsLogRow[]);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  useEffect(() => {
    if (participantQuery.trim().length < 2) {
      setParticipantHits([]);
      return;
    }
    const t = setTimeout(() => {
      adminFetch(`/participants?q=${encodeURIComponent(participantQuery.trim())}&limit=10`)
        .then((r: { participants?: { id: number; firstName?: string; lastName?: string }[] }) => {
          setParticipantHits((r.participants || []).map(p => ({
            id: p.id,
            name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || `#${p.id}`,
          })));
        })
        .catch(() => setParticipantHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [participantQuery, adminFetch]);

  const saveAll = () => act(async () => {
    const items: Record<string, unknown>[] = [
      { actionType: 'path_level', pointsPerUnit: 0, levelThresholds: rowsToThresholdJson(pathRows), track: 'path' },
      { actionType: 'exp_level', pointsPerUnit: 0, levelThresholds: rowsToThresholdJson(expRows), track: 'experience' },
    ];
    for (const sys of SYSTEM_ACTION_TYPES) {
      const d = rateDrafts[sys.actionType];
      if (!d) continue;
      items.push({
        actionType: sys.actionType,
        pointsPerUnit: d.points,
        maxAccruals: d.max || null,
        track: d.track,
      });
    }
    await adminFetch('/levels-config/batch', { method: 'POST', body: JSON.stringify({ items }) });
    await load();
  }, 'Настройки сохранены');

  const recalcAll = () => {
    if (!confirm('Пересчитать баллы всех участников из журнала?')) return;
    act(async () => {
      await adminFetch('/rating/recalculate-all', { method: 'POST', body: '{}' });
      await load();
    }, 'Пересчёт завершён');
  };

  const submitManual = () => {
    if (!selectedParticipantId) {
      alert('Выберите участника');
      return;
    }
    if (!manualReason.trim()) {
      alert('Укажите причину');
      return;
    }
    act(async () => {
      await adminFetch(`/participants/${selectedParticipantId}/points/adjust`, {
        method: 'POST',
        body: JSON.stringify({ points: manualPoints, track: manualTrack, reason: manualReason.trim() }),
      });
      setManualReason('');
      await load();
    }, 'Начислено');
  };

  const revokeManual = (row: PointsLogRow) => {
    const reason = prompt('Причина отмены') || 'Отмена администратором';
    act(async () => {
      await adminFetch(`/participants/${row.participantId}/points/${row.id}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      await load();
    }, 'Отменено');
  };

  const configByAction = useMemo(
    () => Object.fromEntries(config.map(c => [c.actionType, c])),
    [config],
  );

  if (loading) return <p className="adm-muted">Загрузка рейтинга…</p>;

  return (
    <div className="adm-forum adm-levels">
      <AdminPageHero
        title="Рейтинг · настройка и операции"
        hint="Ставки по типам действий. Баллы конкретных заданий и вопросов задаются в карточках «Задания» и «Вопросы»."
      />

      <div className="adm-seg" style={{ marginBottom: 12 }}>
        <button type="button" className={segment === 'settings' ? 'on' : ''} onClick={() => setSegment('settings')}>Настройка</button>
        <button type="button" className={segment === 'manual' ? 'on' : ''} onClick={() => setSegment('manual')}>Ручные операции</button>
      </div>

      {segment === 'settings' && (
        <>
          <div className="adm-forum-toolbar" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="adm-btn adm-btn-primary" onClick={saveAll}>Сохранить</button>
            <button type="button" className="adm-btn adm-btn-secondary" onClick={recalcAll}>Пересчитать всех</button>
          </div>

          <ThresholdEditor title="Пороги уровней «Пути»" actionType="path_level" rows={pathRows} onChange={setPathRows} />
          <ThresholdEditor title="Пороги уровней «Опыта»" actionType="exp_level" rows={expRows} onChange={setExpRows} />

          <div className="card">
            <h3>Ставки действий (actionType × баллы × линия)</h3>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Действие</th>
                  <th>Баллы</th>
                  <th>Линия</th>
                  <th>Макс. начислений</th>
                </tr>
              </thead>
              <tbody>
                {SYSTEM_ACTION_TYPES.map(sys => {
                  const d = rateDrafts[sys.actionType] || { points: 0, track: sys.track, max: 0 };
                  return (
                    <tr key={sys.actionType}>
                      <td>{configByAction[sys.actionType]?.displayName || label(sys.actionType)}</td>
                      <td>
                        <input
                          type="number"
                          className="adm-input"
                          style={{ width: 72 }}
                          value={d.points}
                          onChange={e => setRateDrafts(prev => ({
                            ...prev,
                            [sys.actionType]: { ...d, points: Number(e.target.value) },
                          }))}
                        />
                      </td>
                      <td>
                        <select
                          className="adm-input"
                          value={d.track}
                          onChange={e => setRateDrafts(prev => ({
                            ...prev,
                            [sys.actionType]: { ...d, track: e.target.value },
                          }))}
                        >
                          <option value="path">Путь</option>
                          <option value="experience">Опыт</option>
                          <option value="bonus">Бонус</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          className="adm-input"
                          style={{ width: 72 }}
                          value={d.max}
                          onChange={e => setRateDrafts(prev => ({
                            ...prev,
                            [sys.actionType]: { ...d, max: Number(e.target.value) },
                          }))}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>Правила бонусов</h3>
            <table className="adm-table">
              <thead>
                <tr><th>Код</th><th>Action type</th><th>Включено</th></tr>
              </thead>
              <tbody>
                {bonusRules.map(rule => (
                  <tr key={rule.id}>
                    <td>{rule.code}</td>
                    <td>{rule.pointsActionType || '—'}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!rule.enabled}
                        onChange={e => act(async () => {
                          await adminFetch(`/rating/bonus-rules/${rule.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ enabled: e.target.checked }),
                          });
                          await load();
                        }, 'Обновлено')}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>История пересчётов</h3>
            {recalcHistory.length === 0 && <p className="adm-muted">Пока не было пересчётов</p>}
            <table className="adm-table">
              <thead>
                <tr><th>ID</th><th>Старт</th><th>Завершение</th><th>Участников</th><th>Статус</th></tr>
              </thead>
              <tbody>
                {recalcHistory.map(r => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{r.startedAt ? new Date(r.startedAt).toLocaleString('ru-RU') : '—'}</td>
                    <td>{r.finishedAt ? new Date(r.finishedAt).toLocaleString('ru-RU') : '—'}</td>
                    <td>{r.participantsProcessed ?? '—'}</td>
                    <td>{r.status}{r.error ? ` · ${r.error}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {segment === 'manual' && (
        <>
          <div className="card">
            <h3>Ручное начисление</h3>
            <div className="adm-forum-grid-2">
              <label className="adm-field">
                <span className="adm-label">Участник</span>
                <input
                  className="adm-input"
                  value={participantQuery}
                  onChange={e => { setParticipantQuery(e.target.value); setSelectedParticipantId(null); }}
                  placeholder="Поиск по ФИО"
                />
                {participantHits.length > 0 && !selectedParticipantId && (
                  <div className="adm-dropdown-list">
                    {participantHits.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        className="adm-btn adm-btn-sm adm-btn-secondary"
                        style={{ display: 'block', width: '100%', marginTop: 4, textAlign: 'left' }}
                        onClick={() => { setSelectedParticipantId(p.id); setParticipantQuery(p.name); setParticipantHits([]); }}
                      >
                        {p.name} (#{p.id})
                      </button>
                    ))}
                  </div>
                )}
              </label>
              <label className="adm-field">
                <span className="adm-label">Линия</span>
                <select className="adm-input" value={manualTrack} onChange={e => setManualTrack(e.target.value as 'path' | 'experience')}>
                  <option value="path">Путь</option>
                  <option value="experience">Опыт</option>
                </select>
              </label>
              <label className="adm-field">
                <span className="adm-label">Баллы (+/−)</span>
                <input type="number" className="adm-input" value={manualPoints} onChange={e => setManualPoints(Number(e.target.value))} />
              </label>
              <label className="adm-field">
                <span className="adm-label">Причина (обязательно)</span>
                <input className="adm-input" value={manualReason} onChange={e => setManualReason(e.target.value)} />
              </label>
            </div>
            <button type="button" className="adm-btn adm-btn-primary" onClick={submitManual}>Начислить</button>
          </div>

          <div className="card">
            <h3>История ручных начислений</h3>
            <table className="adm-table">
              <thead>
                <tr><th>Дата</th><th>Участник</th><th>Действие</th><th>Баллы</th><th /></tr>
              </thead>
              <tbody>
                {manualLog.map(l => (
                  <tr key={l.id}>
                    <td>{l.createdAt ? new Date(l.createdAt).toLocaleString('ru-RU') : ''}</td>
                    <td>{l.participantName}</td>
                    <td>{label(l.actionType)}</td>
                    <td>{l.points}</td>
                    <td>
                      {!l.revokedAt && l.points > 0 && (
                        <button type="button" className="adm-btn adm-btn-sm btn-danger" onClick={() => revokeManual(l)}>Отменить</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
