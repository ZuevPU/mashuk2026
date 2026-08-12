import type { AdminTabProps } from '../admin/types';

export type BonusRule = {
  id: number;
  code: string;
  enabled?: boolean;
  params?: Record<string, unknown>;
  pointsActionType?: string | null;
};

type ActionPoints = { actionType: string; points: number; displayName?: string };

const RULE_META: Record<string, { title: string; paramKey?: string; paramLabel?: string; hint?: string }> = {
  day_complete_bonus: {
    title: 'Бонус за полный день',
    hint: 'Когда закрыты все точки дня (проверки + осмысления + итоги). По умолчанию 25 баллов «Путь». Пересчёт — кнопка «Пересчитать всех».',
  },
  reflection_streak_7: {
    title: 'Серия дней с рефлексией',
    paramKey: 'minDays',
    paramLabel: 'Дней подряд',
    hint: 'Считаются дни с активностью по линии «Путь» (точки, проверки, обмен).',
  },
  bonus_regularity: {
    title: 'Регулярность (полные дни)',
    paramKey: 'minStreak',
    paramLabel: 'Дней подряд',
    hint: 'N дней подряд с закрытыми всеми точками. По умолчанию 6 дней → 60 баллов (линия бонусов).',
  },
  bonus_diversity: {
    title: 'Разнообразие заданий',
    paramKey: 'minCategories',
    paramLabel: 'Категорий',
    hint: 'Уникальные категории одобренных заданий.',
  },
};

const ADDABLE_CODES = Object.keys(RULE_META);

type Props = AdminTabProps & {
  rules: BonusRule[];
  actionPoints: ActionPoints[];
  onReload: () => Promise<void>;
};

function paramValue(rule: BonusRule, paramKey: string): number {
  const v = rule.params?.[paramKey];
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : 1;
}

export function BonusRulesEditor({ adminFetch, act, rules, actionPoints, onReload }: Props) {
  const existingCodes = new Set(rules.map(r => r.code));
  const missingTemplates = ADDABLE_CODES.filter(c => !existingCodes.has(c));

  const pointsFor = (actionType: string | null | undefined) => {
    const t = actionType || '';
    const row = actionPoints.find(a => a.actionType === t);
    return row?.points ?? '—';
  };

  const saveRule = (rule: BonusRule, patch: Partial<BonusRule>) =>
    act(async () => {
      await adminFetch(`/rating/bonus-rules/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: patch.enabled ?? rule.enabled,
          pointsActionType: patch.pointsActionType ?? rule.pointsActionType,
          params: patch.params ?? rule.params,
        }),
      });
      await onReload();
    }, 'Правило сохранено');

  const addTemplate = (code: string) =>
    act(async () => {
      await adminFetch('/rating/bonus-rules', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      await onReload();
    }, 'Правило добавлено');

  return (
    <div className="card">
      <h3>Правила бонусов</h3>
      <p className="adm-muted" style={{ fontSize: 12, marginTop: 0 }}>
        Условия срабатывания и вкл/выкл. Размер награды задаётся action type в таблице ставок выше (группа «Бонусы» / «Путь»).
      </p>
      {rules.length === 0 && <p className="adm-muted">Нет правил — добавьте из шаблона.</p>}
      <table className="adm-table">
        <thead>
          <tr>
            <th>Правило</th>
            <th>Условие</th>
            <th>Action type</th>
            <th>Баллы</th>
            <th>Вкл</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rules.map(rule => {
            const meta = RULE_META[rule.code] ?? { title: rule.code };
            const paramKey = meta.paramKey;
            return (
              <tr key={rule.id}>
                <td>
                  <strong>{meta.title}</strong>
                  {meta.hint && (
                    <p className="adm-muted" style={{ fontSize: 11, margin: '4px 0 0' }}>{meta.hint}</p>
                  )}
                </td>
                <td>
                  {paramKey ? (
                    <label className="adm-field" style={{ margin: 0 }}>
                      <span className="adm-label">{meta.paramLabel ?? 'Порог'}</span>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        className="adm-input"
                        style={{ maxWidth: 88 }}
                        defaultValue={paramValue(rule, paramKey)}
                        key={`${rule.id}-${paramKey}-${paramValue(rule, paramKey)}`}
                        onBlur={e => {
                          const n = Math.max(1, Number(e.target.value) || 1);
                          if (n === paramValue(rule, paramKey)) return;
                          saveRule(rule, {
                            params: { ...(rule.params || {}), [paramKey]: n },
                          });
                        }}
                      />
                    </label>
                  ) : (
                    <span className="adm-muted">Все точки дня</span>
                  )}
                </td>
                <td>
                  <select
                    className="adm-input"
                    value={rule.pointsActionType || rule.code}
                    onChange={e => saveRule(rule, { pointsActionType: e.target.value })}
                  >
                    {actionPoints
                      .filter(a => a.actionType.includes('bonus') || a.actionType === 'day_complete_bonus' || a.actionType === 'reflection_streak_7')
                      .map(a => (
                        <option key={a.actionType} value={a.actionType}>{a.actionType}</option>
                      ))}
                  </select>
                </td>
                <td>{pointsFor(rule.pointsActionType || rule.code)}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={!!rule.enabled}
                    onChange={e => saveRule(rule, { enabled: e.target.checked })}
                  />
                </td>
                <td>
                  <code style={{ fontSize: 10 }}>{rule.code}</code>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {missingTemplates.length > 0 && (
        <div className="adm-forum-toolbar" style={{ marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
          <span className="adm-muted" style={{ fontSize: 12 }}>Добавить шаблон:</span>
          {missingTemplates.map(code => (
            <button
              key={code}
              type="button"
              className="adm-btn adm-btn-secondary adm-btn-sm"
              onClick={() => addTemplate(code)}
            >
              {RULE_META[code]?.title ?? code}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
