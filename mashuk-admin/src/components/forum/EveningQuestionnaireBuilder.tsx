import { useEffect, useState } from 'react';
import {
  collectFieldKeys,
  EVENING_FIELD_TYPE_OPTIONS,
  slugKey,
  type EveningField,
  type EveningFieldType,
  type EveningQuestionnaireConfig,
  type EveningStep,
} from './types';

type Props = {
  adminFetch: (path: string, opts?: RequestInit) => Promise<any>;
  act: (fn: () => Promise<void>, msg?: string) => void;
};

const EMPTY_CONFIG: EveningQuestionnaireConfig = {
  steps: [{ id: 'step_1', title: 'Новый шаг', fields: [] }],
};

export function EveningQuestionnaireBuilder({ adminFetch, act }: Props) {
  const [day, setDay] = useState(1);
  const [config, setConfig] = useState<EveningQuestionnaireConfig>(EMPTY_CONFIG);
  const [copyFromDay, setCopyFromDay] = useState(1);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadDay = async (d: number) => {
    setLoading(true);
    try {
      const ev = await adminFetch(`/evening-questionnaire?day=${d}`);
      const c = ev.config as EveningQuestionnaireConfig;
      if (c?.steps?.length) setConfig(JSON.parse(JSON.stringify(c)));
      else setConfig(JSON.parse(JSON.stringify(EMPTY_CONFIG)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDay(day).catch(() => {});
  }, [day]);

  const updateStep = (index: number, patch: Partial<EveningStep>) => {
    setConfig(prev => {
      const steps = [...prev.steps];
      steps[index] = { ...steps[index], ...patch };
      return { ...prev, steps };
    });
  };

  const moveStep = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= config.steps.length) return;
    setConfig(prev => {
      const steps = [...prev.steps];
      [steps[index], steps[j]] = [steps[j], steps[index]];
      return { ...prev, steps };
    });
  };

  const removeStep = (index: number) => {
    if (config.steps.length <= 1) return;
    if (!confirm('Удалить этот шаг анкеты?')) return;
    setConfig(prev => ({ ...prev, steps: prev.steps.filter((_, i) => i !== index) }));
  };

  const addStep = () => {
    const n = config.steps.length + 1;
    setConfig(prev => ({
      ...prev,
      steps: [...prev.steps, { id: `step_${n}`, title: `Шаг ${n}`, fields: [] }],
    }));
  };

  const updateField = (stepIndex: number, fieldIndex: number, patch: Partial<EveningField>) => {
    setConfig(prev => {
      const steps = prev.steps.map((s, si) => {
        if (si !== stepIndex) return s;
        const fields = s.fields.map((f, fi) => (fi === fieldIndex ? { ...f, ...patch } : f));
        return { ...s, fields };
      });
      return { ...prev, steps };
    });
  };

  const addField = (stepIndex: number) => {
    const keys = collectFieldKeys(config);
    const key = slugKey('new_field', keys);
    const field: EveningField = { key, type: 'text', label: 'Новый вопрос', required: false };
    setConfig(prev => {
      const steps = prev.steps.map((s, si) =>
        si === stepIndex ? { ...s, fields: [...s.fields, field] } : s,
      );
      return { ...prev, steps };
    });
  };

  const removeField = (stepIndex: number, fieldIndex: number) => {
    setConfig(prev => {
      const steps = prev.steps.map((s, si) =>
        si === stepIndex ? { ...s, fields: s.fields.filter((_, fi) => fi !== fieldIndex) } : s,
      );
      return { ...prev, steps };
    });
  };

  const moveField = (stepIndex: number, fieldIndex: number, dir: -1 | 1) => {
    const j = fieldIndex + dir;
    const step = config.steps[stepIndex];
    if (!step || j < 0 || j >= step.fields.length) return;
    setConfig(prev => {
      const steps = prev.steps.map((s, si) => {
        if (si !== stepIndex) return s;
        const fields = [...s.fields];
        [fields[fieldIndex], fields[j]] = [fields[j], fields[fieldIndex]];
        return { ...s, fields };
      });
      return { ...prev, steps };
    });
  };

  const onLabelChange = (stepIndex: number, fieldIndex: number, label: string) => {
    updateField(stepIndex, fieldIndex, { label });
  };

  const save = () => {
    for (const step of config.steps) {
      if (!step.title.trim()) {
        alert('У каждого шага должно быть название.');
        return;
      }
      for (const f of step.fields) {
        if (!f.label.trim()) {
          alert('У каждого поля должна быть подпись для участника.');
          return;
        }
      }
    }
    act(async () => {
      await adminFetch(`/evening-questionnaire?day=${day}`, {
        method: 'PATCH',
        body: JSON.stringify({ config }),
      });
    }, `Анкета дня ${day} сохранена`);
  };

  const yesNoFieldsInStep = (step: EveningStep) =>
    step.fields.filter(f => f.type === 'yes_no');

  return (
    <div className="adm-forum-block">
      <h3>Итоговая анкета вечера</h3>
      <p className="adm-forum-hint">
        Участники заполняют эту анкету вечером на главной. Настройте шаги и вопросы для каждого дня (1–7).
      </p>
      <div className="adm-seg adm-forum-day-seg">
        {Array.from({ length: 7 }, (_, i) => i + 1).map(d => (
          <button key={d} type="button" className={day === d ? 'on' : ''} onClick={() => setDay(d)}>
            День {d}
          </button>
        ))}
      </div>
      {loading && <p className="adm-muted">Загрузка…</p>}
      <div className="adm-forum-toolbar">
        <label className="adm-forum-inline">
          Скопировать настройки с дня
          <select value={copyFromDay} onChange={e => setCopyFromDay(Number(e.target.value))}>
            {Array.from({ length: 7 }, (_, i) => i + 1).map(d => (
              <option key={d} value={d}>День {d}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="adm-btn adm-btn-secondary adm-btn-sm"
          onClick={() => act(async () => {
            await adminFetch('/evening-questionnaire/copy', {
              method: 'POST',
              body: JSON.stringify({ fromDay: copyFromDay, toDay: day }),
            });
            await loadDay(day);
          }, 'Скопировано')}
        >
          Копировать
        </button>
        <button
          type="button"
          className="adm-btn adm-btn-secondary adm-btn-sm"
          onClick={() => {
            if (!confirm(`Сбросить анкету дня ${day} к заводским настройкам?`)) return;
            act(async () => {
              await adminFetch(`/evening-questionnaire/reset?day=${day}`, { method: 'POST' });
              await loadDay(day);
            }, 'Сброшено');
          }}
        >
          Заводские настройки
        </button>
        <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setPreviewOpen(v => !v)}>
          {previewOpen ? 'Скрыть предпросмотр' : 'Предпросмотр'}
        </button>
        <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={save}>
          Сохранить анкету
        </button>
      </div>
      {previewOpen && (
        <div className="adm-forum-preview">
          {config.steps.map((step, si) => (
            <div key={step.id} className="adm-forum-preview-step">
              <strong>{si + 1}. {step.title}</strong>
              <ul>
                {step.fields.map(f => (
                  <li key={f.key}>{f.label}{f.required ? ' *' : ''}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {config.steps.map((step, stepIndex) => (
        <div key={`${step.id}-${stepIndex}`} className="adm-forum-step-card">
          <div className="adm-forum-step-head">
            <input
              className="adm-input adm-forum-step-title"
              value={step.title}
              onChange={e => updateStep(stepIndex, { title: e.target.value })}
              placeholder="Название шага (видит участник)"
            />
            <div className="adm-forum-step-actions">
              <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => moveStep(stepIndex, -1)} title="Выше">↑</button>
              <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => moveStep(stepIndex, 1)} title="Ниже">↓</button>
              <button type="button" className="adm-btn adm-btn-danger adm-btn-sm" onClick={() => removeStep(stepIndex)}>Удалить шаг</button>
            </div>
          </div>
          {step.fields.map((field, fieldIndex) => (
            <div key={field.key} className="adm-forum-field-row">
              <input
                className="adm-input"
                value={field.label}
                onChange={e => onLabelChange(stepIndex, fieldIndex, e.target.value)}
                placeholder="Текст вопроса для участника"
              />
              <select
                className="adm-input"
                value={field.type}
                onChange={e => updateField(stepIndex, fieldIndex, { type: e.target.value as EveningFieldType })}
              >
                {EVENING_FIELD_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <label className="adm-forum-check">
                <input
                  type="checkbox"
                  checked={!!field.required}
                  onChange={e => updateField(stepIndex, fieldIndex, { required: e.target.checked })}
                />
                Обязательное
              </label>
              {yesNoFieldsInStep(step).length > 0 && (
                <label className="adm-forum-check">
                  <input
                    type="checkbox"
                    checked={!!field.visibleWhen}
                    onChange={e => {
                      if (!e.target.checked) {
                        updateField(stepIndex, fieldIndex, { visibleWhen: undefined });
                        return;
                      }
                      const dep = yesNoFieldsInStep(step)[0]?.key;
                      if (dep) updateField(stepIndex, fieldIndex, { visibleWhen: { field: dep, equals: true } });
                    }}
                  />
                  Условие
                </label>
              )}
              {field.visibleWhen && (
                <>
                  <select
                    className="adm-input adm-input-narrow"
                    value={field.visibleWhen.field}
                    onChange={e => updateField(stepIndex, fieldIndex, {
                      visibleWhen: { field: e.target.value, equals: field.visibleWhen!.equals },
                    })}
                  >
                    {yesNoFieldsInStep(step).map(f => (
                      <option key={f.key} value={f.key}>{f.label.slice(0, 40)}</option>
                    ))}
                  </select>
                  <select
                    className="adm-input adm-input-narrow"
                    value={String(field.visibleWhen.equals)}
                    onChange={e => updateField(stepIndex, fieldIndex, {
                      visibleWhen: { field: field.visibleWhen!.field, equals: e.target.value === 'true' },
                    })}
                  >
                    <option value="true">= Да</option>
                    <option value="false">= Нет</option>
                  </select>
                </>
              )}
              <div className="adm-forum-field-actions">
                <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => moveField(stepIndex, fieldIndex, -1)}>↑</button>
                <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => moveField(stepIndex, fieldIndex, 1)}>↓</button>
                <button type="button" className="adm-btn adm-btn-danger adm-btn-sm" onClick={() => removeField(stepIndex, fieldIndex)}>×</button>
              </div>
            </div>
          ))}
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => addField(stepIndex)}>
            + Добавить вопрос
          </button>
        </div>
      ))}
      <button type="button" className="adm-btn adm-btn-secondary" onClick={addStep} style={{ marginTop: 12 }}>
        + Добавить шаг
      </button>
    </div>
  );
}
