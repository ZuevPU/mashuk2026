import { useEffect, useState } from 'react';
import {
  RECOMMEND_WHEN_OPTIONS,
  type ProfileProgressWeights,
  type RecommendationRule,
} from './types';

type Props = {
  adminFetch: (path: string, opts?: RequestInit) => Promise<any>;
  act: (fn: () => Promise<void>, msg?: string) => void;
  forumShiftLabel?: string;
  onShiftLabelSave: (label: string) => void;
};

const DEFAULT_WEIGHTS: ProfileProgressWeights = {
  touchpoints: 40,
  reflection: 30,
  tasks: 20,
  piggybankInWork: 10,
};

const WEIGHT_LABELS: { key: keyof ProfileProgressWeights; label: string; hint: string }[] = [
  { key: 'touchpoints', label: 'Точки осмысления', hint: 'Touchpoints за день' },
  { key: 'reflection', label: 'Рефлексия', hint: 'Вечерняя анкета / осмысление' },
  { key: 'tasks', label: 'Задания', hint: 'Одобренные задания' },
  { key: 'piggybankInWork', label: 'Копилка «в работе»', hint: 'Идеи в работе' },
];

function newRuleId(): string {
  return `rule_${Date.now().toString(36)}`;
}

export function ProfilePdfSettings({ adminFetch, act, forumShiftLabel, onShiftLabelSave }: Props) {
  const [shiftLabel, setShiftLabel] = useState(forumShiftLabel || 'Смена 1');
  const [weights, setWeights] = useState<ProfileProgressWeights>(DEFAULT_WEIGHTS);
  const [rules, setRules] = useState<RecommendationRule[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setShiftLabel(forumShiftLabel || 'Смена 1');
  }, [forumShiftLabel]);

  useEffect(() => {
    adminFetch('/pdf-template')
      .then((t: any) => {
        const w = t.profileProgressWeights ?? DEFAULT_WEIGHTS;
        setWeights({
          touchpoints: Number(w.touchpoints ?? 40),
          reflection: Number(w.reflection ?? 30),
          tasks: Number(w.tasks ?? 20),
          piggybankInWork: Number(w.piggybankInWork ?? 10),
        });
        if (t.shiftLabel) setShiftLabel(t.shiftLabel);
        setRules(Array.isArray(t.recommendationTemplates) ? t.recommendationTemplates : []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [adminFetch]);

  const weightSum = weights.touchpoints + weights.reflection + weights.tasks + weights.piggybankInWork;
  const sumOk = weightSum === 100;

  const setWeight = (key: keyof ProfileProgressWeights, value: number) => {
    setWeights(prev => ({ ...prev, [key]: Math.max(0, Math.min(100, value)) }));
  };

  const saveAll = () => {
    if (!sumOk) {
      alert('Сумма весов прогресса A→B должна быть ровно 100%.');
      return;
    }
    act(async () => {
      onShiftLabelSave(shiftLabel);
      await adminFetch('/pdf-template', {
        method: 'PATCH',
        body: JSON.stringify({
          shiftLabel: shiftLabel.trim() || 'Смена 1',
          profileProgressWeights: weights,
          recommendationTemplates: rules,
        }),
      });
    }, 'Настройки профиля и PDF сохранены');
  };

  const updateRule = (index: number, patch: Partial<RecommendationRule>) => {
    setRules(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const addRule = () => {
    setRules(prev => [...prev, {
      id: newRuleId(),
      minDay: 1,
      maxDay: 7,
      kind: 'daily',
      when: 'default',
      text: 'Текст рекомендации для участника',
    }]);
  };

  if (!loaded) return <p className="adm-muted">Загрузка настроек PDF…</p>;

  return (
    <div className="adm-forum-block">
      <div className="adm-kb-panel-head">
        <h3>Профиль и итоговый PDF</h3>
        <p className="adm-kb-panel-sub">
          Прогресс «Точка A → B» на главной и тексты подсказок в профиле. PDF использует название смены и эти веса.
        </p>
      </div>
      <label className="adm-field">
        <span className="adm-label">Название смены в PDF</span>
        <input
          className="adm-input"
          value={shiftLabel}
          onChange={e => setShiftLabel(e.target.value)}
          placeholder="Смена 1"
          style={{ maxWidth: 280 }}
        />
      </label>
      <div className="adm-forum-weights">
        <span className="adm-label">Веса прогресса A → B (сумма 100%)</span>
        {WEIGHT_LABELS.map(({ key, label, hint }) => (
          <div key={key} className="adm-forum-weight-row">
            <div className="adm-forum-weight-label">
              <strong>{label}</strong>
              <span className="adm-muted">{hint}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={weights[key]}
              onChange={e => setWeight(key, Number(e.target.value))}
            />
            <input
              type="number"
              min={0}
              max={100}
              className="adm-input adm-input-narrow"
              value={weights[key]}
              onChange={e => setWeight(key, Number(e.target.value))}
            />
            <span>%</span>
          </div>
        ))}
        <p className={sumOk ? 'adm-forum-sum ok' : 'adm-forum-sum warn'}>
          Сумма: {weightSum}% {sumOk ? '✓' : '— нужно 100%'}
        </p>
      </div>
      <div className="adm-forum-recs">
        <span className="adm-label">Тексты рекомендаций в профиле</span>
        <p className="adm-forum-hint">Когда срабатывает — какой текст показать участнику (по дням и условиям).</p>
        <table className="adm-table adm-forum-rec-table">
          <thead>
            <tr>
              <th>День с</th>
              <th>День по</th>
              <th>Тип</th>
              <th>Условие</th>
              <th>Текст</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r, i) => (
              <tr key={r.id}>
                <td>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    className="adm-input adm-input-narrow"
                    value={r.minDay ?? ''}
                    onChange={e => updateRule(i, { minDay: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    className="adm-input adm-input-narrow"
                    value={r.maxDay ?? ''}
                    onChange={e => updateRule(i, { maxDay: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </td>
                <td>
                  <select
                    className="adm-input"
                    value={r.kind}
                    onChange={e => updateRule(i, { kind: e.target.value as 'daily' | 'finale' })}
                  >
                    <option value="daily">Ежедневная</option>
                    <option value="finale">Финал</option>
                  </select>
                </td>
                <td>
                  <select
                    className="adm-input"
                    value={r.when}
                    onChange={e => updateRule(i, { when: e.target.value as RecommendationRule['when'] })}
                  >
                    {RECOMMEND_WHEN_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <textarea
                    className="adm-input"
                    rows={2}
                    value={r.text}
                    onChange={e => updateRule(i, { text: e.target.value })}
                  />
                </td>
                <td>
                  <button type="button" className="adm-btn adm-btn-danger adm-btn-sm" onClick={() => setRules(prev => prev.filter((_, j) => j !== i))}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={addRule}>+ Добавить рекомендацию</button>
      </div>
      <button type="button" className="adm-btn adm-btn-primary" style={{ marginTop: 16 }} onClick={saveAll} disabled={!sumOk}>
        Сохранить профиль и PDF
      </button>
    </div>
  );
}
