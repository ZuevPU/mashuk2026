import { useCallback, useEffect, useMemo, useState } from 'react';
import { label } from '../../labels/ru';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';
import { BonusRulesEditor, type BonusRule } from './BonusRulesEditor';
import { RatingFormulaPreview } from './RatingFormulaPreview';
import { levelNameForPoints, validateThresholdRows, type ThresholdRow } from './levelPreviewUtils';

type LevelConfig = {
  id: number;
  actionType: string;
  pointsPerUnit: number;
  maxAccruals?: number | null;
  levelThresholds?: unknown;
  track?: string | null;
  displayName?: string | null;
};

type ActionRow = {
  actionType: string;
  displayName: string;
  points: number;
  track: string;
  max: number;
  group: string;
};

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

type LeaderboardScopes = {
  total: boolean;
  path: boolean;
  experience: boolean;
  day: boolean;
  shift: boolean;
};

type RatingSegment = 'settings' | 'manual';

const GROUP_ORDER = ['path', 'experience', 'piggybank', 'bonus'] as const;
const GROUP_LABELS: Record<string, string> = {
  path: 'Путь · точки осмысления и обмен',
  experience: 'Опыт · задания и общение',
  piggybank: 'Копилка (XP по тегам; счётчик «Идей» на главной — без XP)',
  bonus: 'Бонусы итогового рейтинга',
};

const DEFAULT_SCOPES: LeaderboardScopes = {
  total: true,
  path: true,
  experience: true,
  day: true,
  shift: true,
};

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
      <ThresholdLevelSample rows={rows} />
    </div>
  );
}

function ThresholdLevelSample({ rows }: { rows: ThresholdRow[] }) {
  const [sampleA, setSampleA] = useState(50);
  const [sampleB, setSampleB] = useState(200);
  return (
    <div className="adm-muted" style={{ fontSize: 12, marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        Пример
        <input type="number" min={0} className="adm-input" style={{ width: 72 }} value={sampleA} onChange={e => setSampleA(Math.max(0, Number(e.target.value) || 0))} />
        баллов → {levelNameForPoints(sampleA, rows)}
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        Пример
        <input type="number" min={0} className="adm-input" style={{ width: 72 }} value={sampleB} onChange={e => setSampleB(Math.max(0, Number(e.target.value) || 0))} />
        баллов → {levelNameForPoints(sampleB, rows)}
      </label>
    </div>
  );
}

function ActionTable({
  rows,
  onChange,
}: {
  rows: ActionRow[];
  onChange: (actionType: string, patch: Partial<ActionRow>) => void;
}) {
  return (
    <table className="adm-table">
      <thead>
        <tr>
          <th>Название</th>
          <th>Баллы</th>
          <th>Линия</th>
          <th>Макс.</th>
          <th className="adm-muted" style={{ fontSize: 11 }}>actionType</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.actionType}>
            <td>
              <input
                className="adm-input"
                value={row.displayName}
                onChange={e => onChange(row.actionType, { displayName: e.target.value })}
              />
            </td>
            <td>
              <input
                type="number"
                className="adm-input"
                style={{ width: 72 }}
                value={row.points}
                onChange={e => onChange(row.actionType, { points: Number(e.target.value) })}
              />
            </td>
            <td>
              <select
                className="adm-input"
                value={row.track}
                onChange={e => onChange(row.actionType, { track: e.target.value })}
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
                value={row.max}
                onChange={e => onChange(row.actionType, { max: Number(e.target.value) })}
              />
            </td>
            <td className="adm-muted" style={{ fontSize: 11 }}>{row.actionType}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LevelsTab({ adminFetch, act, reloadKey }: AdminTabProps) {
  const [segment, setSegment] = useState<RatingSegment>('settings');
  const [loading, setLoading] = useState(true);
  const [pathRows, setPathRows] = useState<ThresholdRow[]>([]);
  const [expRows, setExpRows] = useState<ThresholdRow[]>([]);
  const [actionRows, setActionRows] = useState<ActionRow[]>([]);
  const [leaderboardScopes, setLeaderboardScopes] = useState<LeaderboardScopes>(DEFAULT_SCOPES);
  const [bonusRules, setBonusRules] = useState<BonusRule[]>([]);
  const [recalcHistory, setRecalcHistory] = useState<RecalcRun[]>([]);
  const [manualLog, setManualLog] = useState<PointsLogRow[]>([]);
  const [participantQuery, setParticipantQuery] = useState('');
  const [participantHits, setParticipantHits] = useState<{ id: number; name: string }[]>([]);
  const [selectedParticipantId, setSelectedParticipantId] = useState<number | null>(null);
  const [manualTrack, setManualTrack] = useState<'path' | 'experience'>('path');
  const [manualPoints, setManualPoints] = useState(10);
  const [manualReason, setManualReason] = useState('');
  const [manualEffectiveAt, setManualEffectiveAt] = useState('');
  const [bulkForumDay, setBulkForumDay] = useState<number | ''>('');
  const [bulkActionType, setBulkActionType] = useState('');
  const [bulkReason, setBulkReason] = useState('');
  const [bulkNotify, setBulkNotify] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const catRes = await adminFetch('/levels-config/action-catalog') as {
        catalog: {
          actionType: string;
          displayName: string;
          pointsPerUnit: number;
          maxAccruals?: number | null;
          track: string;
          group: string;
        }[];
        levelConfig?: LevelConfig[];
      };
      const levelCfg = (catRes.levelConfig || []) as LevelConfig[];
      const pathCfg = levelCfg.find(c => c.actionType === 'path_level');
      const expCfg = levelCfg.find(c => c.actionType === 'exp_level');
      setPathRows(parseThresholdRows(pathCfg?.levelThresholds));
      setExpRows(parseThresholdRows(expCfg?.levelThresholds));

      setActionRows((catRes.catalog || []).map(c => ({
        actionType: c.actionType,
        displayName: c.displayName,
        points: c.pointsPerUnit ?? 0,
        track: c.track || 'path',
        max: c.maxAccruals ?? 0,
        group: c.group || 'path',
      })));

      const fs = (await adminFetch('/forum-settings')).settings as { leaderboardScopes?: Partial<LeaderboardScopes> } | undefined;
      setLeaderboardScopes({ ...DEFAULT_SCOPES, ...(fs?.leaderboardScopes || {}) });

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

  const patchAction = (actionType: string, patch: Partial<ActionRow>) => {
    setActionRows(prev => prev.map(r => (r.actionType === actionType ? { ...r, ...patch } : r)));
  };

  const saveAll = () => {
    const issues = [...validateThresholdRows(pathRows), ...validateThresholdRows(expRows)];
    if (issues.length > 0) {
      const msg = issues.map(i => i.message).join('\n');
      if (!confirm(`Пороги уровней выглядят некорректно:\n\n${msg}\n\nВсё равно сохранить?`)) return;
    }
    act(async () => {
    const items: Record<string, unknown>[] = [
      { actionType: 'path_level', pointsPerUnit: 0, levelThresholds: rowsToThresholdJson(pathRows), track: 'path', displayName: 'Пороги «Пути»' },
      { actionType: 'exp_level', pointsPerUnit: 0, levelThresholds: rowsToThresholdJson(expRows), track: 'experience', displayName: 'Пороги «Опыта»' },
    ];
    for (const row of actionRows) {
      items.push({
        actionType: row.actionType,
        pointsPerUnit: row.points,
        maxAccruals: row.max || null,
        track: row.track,
        displayName: row.displayName.trim() || null,
      });
    }
    await adminFetch('/levels-config/batch', { method: 'POST', body: JSON.stringify({ items }) });
    await adminFetch('/forum-settings', {
      method: 'PATCH',
      body: JSON.stringify({ leaderboardScopes }),
    });
    await load();
  }, 'Настройки сохранены');
  };

  const recalcAll = () => {
    if (!confirm(
      'Пересчитать всех: доначислить бонусы «полный день» (25) и «регулярность 6 дней» (60) тем, кто закрыл все точки, затем пересобрать суммы из журнала?',
    )) return;
    act(async () => {
      const res = await adminFetch('/rating/recalculate-all', { method: 'POST', body: '{}' }) as {
        bonuses?: {
          dayCompleteAwarded?: number;
          regularityAwarded?: number;
          dayCompleteAmountFixed?: number;
          regularityAmountFixed?: number;
        };
      };
      await load();
      const b = res?.bonuses;
      if (b) {
        alert(
          `Готово.\nПолный день начислено: ${b.dayCompleteAwarded ?? 0}\nРегулярность начислено: ${b.regularityAwarded ?? 0}\nСуммы в журнале выровнены: день ${b.dayCompleteAmountFixed ?? 0}, регулярность ${b.regularityAmountFixed ?? 0}`,
        );
      }
    }, 'Пересчёт завершён');
  };

  const submitManual = (sign: 1 | -1) => {
    if (!selectedParticipantId) {
      alert('Выберите участника');
      return;
    }
    if (!manualReason.trim()) {
      alert('Укажите причину');
      return;
    }
    const pts = Math.abs(manualPoints) * sign;
    if (!pts) return;
    act(async () => {
      await adminFetch(`/participants/${selectedParticipantId}/points/adjust`, {
        method: 'POST',
        body: JSON.stringify({
          points: pts,
          track: manualTrack,
          reason: manualReason.trim(),
          ...(manualEffectiveAt.trim() ? { effectiveAt: new Date(manualEffectiveAt).toISOString() } : {}),
        }),
      });
      setManualReason('');
      await load();
    }, sign > 0 ? 'Начислено' : 'Списано');
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

  const bulkRevokeSuspicious = () => {
    if (!selectedParticipantId) {
      alert('Выберите участника');
      return;
    }
    if (!bulkReason.trim()) {
      alert('Укажите причину');
      return;
    }
    if (!confirm('Аннулировать подходящие начисления? Участник получит push.')) return;
    act(async () => {
      await adminFetch(`/participants/${selectedParticipantId}/points/revoke-bulk`, {
        method: 'POST',
        body: JSON.stringify({
          reason: bulkReason.trim(),
          notify: bulkNotify,
          forumDay: bulkForumDay === '' ? undefined : Number(bulkForumDay),
          actionType: bulkActionType.trim() || undefined,
        }),
      });
      setBulkReason('');
      await load();
    }, 'Массовое аннулирование выполнено');
  };

  const rowsByGroup = useMemo(() => {
    const map = new Map<string, ActionRow[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const row of actionRows) {
      const g = GROUP_ORDER.includes(row.group as typeof GROUP_ORDER[number]) ? row.group : 'experience';
      map.get(g)!.push(row);
    }
    return map;
  }, [actionRows]);

  if (loading) return <p className="adm-muted">Загрузка системы баллов…</p>;

  return (
    <div className="adm-forum adm-levels">
      <AdminPageHero
        title="Система рейтинга"
        hint="Ставки по типам действий и области лидербордов. Итоговый рейтинг участника — единый счётчик (path + experience + bonus). Баллы конкретного задания задаются в «Задания»."
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

          <RatingFormulaPreview pathRows={pathRows} expRows={expRows} />

          <ThresholdEditor title="Пороги уровней «Пути»" actionType="path_level" rows={pathRows} onChange={setPathRows} />
          <ThresholdEditor title="Пороги уровней «Опыта»" actionType="exp_level" rows={expRows} onChange={setExpRows} />

          {GROUP_ORDER.map(g => {
            const rows = rowsByGroup.get(g) || [];
            if (rows.length === 0) return null;
            return (
              <div className="card" key={g}>
                <h3>{GROUP_LABELS[g] || g}</h3>
                {g === 'experience' && (
                  <p className="adm-muted" style={{ fontSize: 12, marginTop: 0 }}>
                    Командные задания начисляют XP через task_complete (очки из карточки задания). Медаль — отдельная награда, без XP.
                  </p>
                )}
                <ActionTable rows={rows} onChange={patchAction} />
              </div>
            );
          })}

          <div className="card">
            <h3>Таблицы лидеров (доступные срезы)</h3>
            <p className="adm-muted" style={{ fontSize: 12 }}>Какие разрезы рейтинга видит участник в приложении.</p>
            <div className="adm-forum-grid-2" style={{ marginTop: 8 }}>
              {([
                ['total', 'Общий рейтинг'],
                ['path', 'Линия «Путь»'],
                ['experience', 'Линия «Опыт»'],
                ['day', 'Лидеры дня'],
                ['shift', 'Лидеры смены (дни 1–7)'],
              ] as const).map(([key, lbl]) => (
                <label key={key} className="adm-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={leaderboardScopes[key]}
                    onChange={e => setLeaderboardScopes(prev => ({ ...prev, [key]: e.target.checked }))}
                  />
                  <span>{lbl}</span>
                </label>
              ))}
            </div>
          </div>

          <BonusRulesEditor
            adminFetch={adminFetch}
            act={act}
            reloadKey={reloadKey}
            rules={bonusRules}
            actionPoints={actionRows.map(r => ({ actionType: r.actionType, points: r.points, displayName: r.displayName }))}
            onReload={load}
          />

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
            <h3>Ручное начисление / снятие</h3>
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
                <span className="adm-label">Сумма</span>
                <input type="number" min={1} className="adm-input" value={manualPoints} onChange={e => setManualPoints(Math.max(1, Number(e.target.value) || 1))} />
              </label>
              <label className="adm-field">
                <span className="adm-label">Причина (обязательно)</span>
                <input className="adm-input" value={manualReason} onChange={e => setManualReason(e.target.value)} />
              </label>
              <label className="adm-field">
                <span className="adm-label">Дата (опционально)</span>
                <input
                  type="datetime-local"
                  className="adm-input"
                  value={manualEffectiveAt}
                  onChange={e => setManualEffectiveAt(e.target.value)}
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <button type="button" className="adm-btn adm-btn-primary" onClick={() => submitManual(1)}>Добавить баллы</button>
              <button type="button" className="adm-btn btn-danger" onClick={() => submitManual(-1)}>Снять баллы</button>
            </div>
          </div>

          <div className="card">
            <h3>Аннулировать подозрительные начисления</h3>
            <p className="adm-muted" style={{ fontSize: 12 }}>Массовая отмена по дню смены и/или типу действия. Участнику отправится push.</p>
            <div className="adm-forum-grid-2">
              <label className="adm-field">
                <span className="adm-label">День смены (опционально)</span>
                <input type="number" min={1} max={8} className="adm-input" value={bulkForumDay} onChange={e => setBulkForumDay(e.target.value === '' ? '' : Number(e.target.value))} />
              </label>
              <label className="adm-field">
                <span className="adm-label">Тип действия (опционально)</span>
                <input className="adm-input" placeholder="task_complete" value={bulkActionType} onChange={e => setBulkActionType(e.target.value)} />
              </label>
              <label className="adm-field" style={{ gridColumn: '1 / -1' }}>
                <span className="adm-label">Причина</span>
                <input className="adm-input" value={bulkReason} onChange={e => setBulkReason(e.target.value)} />
              </label>
              <label className="adm-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={bulkNotify} onChange={e => setBulkNotify(e.target.checked)} />
                <span>Уведомить участника</span>
              </label>
            </div>
            <button type="button" className="adm-btn btn-danger" onClick={bulkRevokeSuspicious}>Аннулировать подозрительные</button>
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
