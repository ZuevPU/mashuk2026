import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, CustomSelect, FormItem } from '@vkontakte/vkui';
import { apiPatch, apiPost } from '../../api/client';

export type EveningField = {
  key: string;
  type: string;
  label: string;
  required?: boolean;
  options?: string[];
  allowOther?: boolean;
  otherLabel?: string;
  visibleWhen?: { field: string; equals: boolean | string | number };
};

export type EveningStep = {
  id: string;
  title: string;
  fields: EveningField[];
};

type RoleOpt = { roleKey: string; name: string };

export type EveningExperimentContext = {
  status?: string;
  title?: string;
  body?: string;
  hint?: string;
  roleName?: string;
} | null;

export type EveningQuestionnaireProps = {
  currentDay: number;
  questionnaire: {
    /** Forum day this evening survey belongs to (may differ from clock currentDay). */
    dayNumber?: number;
    config?: { steps: EveningStep[] };
    roles?: RoleOpt[];
    askTomorrowRole?: boolean;
    savedDraft?: { step?: number; form?: Record<string, unknown>; tomorrowRoleKey?: string } | null;
    pointBQuestionId?: number | null;
    hasPointB?: boolean;
  };
  experiment?: EveningExperimentContext;
  onClose: () => void;
  onSubmitted: () => void;
};

function fieldVisible(
  field: EveningField,
  form: Record<string, unknown>,
  allFields: EveningField[] = [],
): boolean {
  if (!field.visibleWhen) return true;
  const v = form[field.visibleWhen.field];
  const expected = field.visibleWhen.equals;
  if (expected === '__other__') {
    const parent = allFields.find(f => f.key === field.visibleWhen!.field);
    const opts = parent?.options ?? [];
    return typeof v === 'string' && v.trim().length > 0 && !opts.includes(v);
  }
  return v === expected;
}

function stepHasVisibleFields(
  step: EveningStep,
  form: Record<string, unknown>,
  experiment: EveningExperimentContext,
  questionnaire: EveningQuestionnaireProps['questionnaire'],
  currentDay: number,
): boolean {
  return step.fields.some(f => {
    if (!fieldVisible(f, form, step.fields)) return false;
    if (f.type === 'experiment_text' && !experiment) return false;
    if (f.type === 'role_select') {
      if (!questionnaire.askTomorrowRole || currentDay > 6) return false;
    }
    return true;
  });
}

function isExperimentStep(step: EveningStep): boolean {
  return step.id === 'experiment'
    || step.fields.some(f => f.type === 'experiment_text');
}

export const EveningQuestionnaire: React.FC<EveningQuestionnaireProps> = ({
  currentDay,
  questionnaire,
  experiment,
  onClose,
  onSubmitted,
}) => {
  const rawSteps = questionnaire.config?.steps?.length
    ? questionnaire.config.steps
    : [{ id: 'legacy', title: 'Анкета', fields: [] }];
  const draft = questionnaire.savedDraft;
  const [form, setForm] = useState<Record<string, unknown>>(() => ({
    tripYes: false,
    practiceYes: false,
    recommendYes: false,
    ...(draft?.form || {}),
  }));
  const [tomorrowRole, setTomorrowRole] = useState(
    draft?.tomorrowRoleKey || questionnaire.roles?.[0]?.roleKey || '',
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Forum day of this evening survey (not necessarily clock/admin currentDay). */
  const surveyDay = questionnaire.dayNumber ?? currentDay;

  const steps = useMemo(
    () => rawSteps.filter(s => stepHasVisibleFields(s, form, experiment ?? null, questionnaire, surveyDay)),
    [rawSteps, form, experiment, questionnaire, surveyDay],
  );

  const [step, setStep] = useState(() => Math.min(draft?.step ?? 0, Math.max(steps.length - 1, 0)));

  useEffect(() => {
    if (step >= steps.length) setStep(Math.max(0, steps.length - 1));
  }, [step, steps.length]);

  const persistDraft = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      apiPatch('/day-state/evening/draft', {
        dayNumber: surveyDay,
        step,
        form,
        tomorrowRoleKey: tomorrowRole || undefined,
      }).catch(() => undefined);
    }, 400);
  }, [surveyDay, step, form, tomorrowRole]);

  useEffect(() => {
    persistDraft();
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [persistDraft]);

  const setField = (key: string, value: unknown) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const currentStep = steps[Math.min(step, Math.max(steps.length - 1, 0))] ?? steps[0];
  const visibleFields = useMemo(
    () => (currentStep?.fields ?? []).filter(f => fieldVisible(f, form, currentStep?.fields ?? [])),
    [currentStep, form],
  );
  const showExperimentBlock = currentStep && isExperimentStep(currentStep) && !!experiment;

  const fieldTop = (label: string) => (
    <span className="evening-q__label">{label}</span>
  );

  const renderField = (field: EveningField) => {
    if (field.type === 'scale_1_5') {
      return (
        <FormItem key={field.key} top={fieldTop(field.label)}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setField(field.key, n)}
                style={{
                  width: 36, height: 36, borderRadius: 8,
                  border: form[field.key] === n ? '2px solid #2D6A4F' : '1px solid #ddd',
                  background: form[field.key] === n ? '#D8F3DC' : '#fff',
                  fontWeight: 700, cursor: 'pointer',
                }}
              >{n}</button>
            ))}
          </div>
        </FormItem>
      );
    }
    if (field.type === 'scale_1_10') {
      return (
        <FormItem key={field.key} top={fieldTop(field.label)}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <button key={n} type="button" onClick={() => setField(field.key, n)}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #ddd', fontWeight: 700 }}>
                {n}
              </button>
            ))}
          </div>
        </FormItem>
      );
    }
    if (field.type === 'yes_no') {
      const val = !!form[field.key];
      return (
        <FormItem key={field.key} top={fieldTop(field.label)}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button mode={val ? 'primary' : 'secondary'} onClick={() => setField(field.key, true)}>Да</Button>
            <Button mode={!val ? 'primary' : 'secondary'} onClick={() => setField(field.key, false)}>Нет</Button>
          </div>
        </FormItem>
      );
    }
    if (field.type === 'choice') {
      const opts = (field.options || []).map(o => String(o).trim()).filter(Boolean);
      const raw = String(form[field.key] ?? '');
      const otherOn = !!field.allowOther && raw.length > 0 && !opts.includes(raw);
      const otherLabel = field.otherLabel || 'Свой вариант';
      return (
        <FormItem key={field.key} top={fieldTop(field.label)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {opts.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => setField(field.key, opt)}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: raw === opt ? '2px solid #2D6A4F' : '1px solid #ddd',
                  background: raw === opt ? '#D8F3DC' : '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                {opt}
              </button>
            ))}
            {field.allowOther && (
              <>
                <button
                  type="button"
                  onClick={() => setField(field.key, otherOn ? raw : ' ')}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: otherOn ? '2px solid #2D6A4F' : '1px solid #ddd',
                    background: otherOn ? '#D8F3DC' : '#fff',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  {otherLabel}
                </button>
                {otherOn && (
                  <textarea
                    value={raw.trim() ? raw : ''}
                    onChange={e => setField(field.key, e.target.value)}
                    placeholder="Введите свой вариант…"
                    style={{ width: '100%', minHeight: 48, borderRadius: 10, border: '1px solid #ddd', padding: 10 }}
                  />
                )}
              </>
            )}
          </div>
        </FormItem>
      );
    }
    if (field.type === 'text' || field.type === 'experiment_text') {
      if (field.type === 'experiment_text' && !experiment) return null;
      return (
        <FormItem key={field.key} top={fieldTop(field.label)}>
          <textarea
            value={String(form[field.key] || '')}
            onChange={e => setField(field.key, e.target.value)}
            placeholder={field.type === 'experiment_text' ? 'Кратко: что попробовали, что сработало, что нет…' : undefined}
            style={{ width: '100%', minHeight: field.type === 'experiment_text' ? 88 : 48, borderRadius: 10, border: '1px solid #ddd', padding: 10 }}
          />
        </FormItem>
      );
    }
    if (field.type === 'role_select') {
      if (!questionnaire.askTomorrowRole || surveyDay > 6) return null;
      return (
        <FormItem key={field.key} top={fieldTop(field.label)}>
          <CustomSelect
            options={(questionnaire.roles || []).map(r => ({ label: r.name, value: r.roleKey }))}
            value={tomorrowRole || undefined}
            onChange={e => setTomorrowRole(String(e.target.value))}
          />
        </FormItem>
      );
    }
    return null;
  };

  const handleSubmit = async () => {
    const askRole = questionnaire.askTomorrowRole !== false && surveyDay <= 6;
    const ratings = { ...form };
    delete (ratings as Record<string, unknown>).tomorrowRoleKey;
    await apiPost('/day-state/evening', {
      dayNumber: surveyDay,
      tomorrowRoleKey: askRole && tomorrowRole ? tomorrowRole : undefined,
      ratings,
      experimentStatus: experiment?.status === 'done' ? 'done' : undefined,
    });
    onSubmitted();
  };

  if (!currentStep) {
    return (
      <div className="m-card">
        <div style={{ fontSize: 13 }}>Нет шагов анкеты для этого дня.</div>
        <Button size="l" stretched mode="tertiary" style={{ marginTop: 8 }} onClick={onClose}>Закрыть</Button>
      </div>
    );
  }

  return (
    <div className="m-card evening-q">
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Итоговая анкета · день {surveyDay}</div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>
        {currentStep.title} · шаг {step + 1} из {steps.length} · можно закрыть и вернуться
      </div>
      <div style={{ height: 4, background: '#eee', borderRadius: 4, marginBottom: 12 }}>
        <div style={{ width: `${((step + 1) / steps.length) * 100}%`, height: 4, background: '#2D6A4F', borderRadius: 4 }} />
      </div>

      {showExperimentBlock && (
        <div className="evening-experiment-block">
          <div className="evening-experiment-block__tag">Эксперимент с ролью</div>
          {experiment?.roleName && (
            <div className="evening-experiment-block__role">Роль дня: {experiment.roleName}</div>
          )}
          {experiment?.title && (
            <div className="evening-experiment-block__title">{experiment.title}</div>
          )}
          {experiment?.body && (
            <p className="evening-experiment-block__body">{experiment.body}</p>
          )}
          {experiment?.hint && (
            <div className="evening-experiment-block__hint">{experiment.hint}</div>
          )}
        </div>
      )}

      {visibleFields.map(renderField)}

      {surveyDay === 7 && currentStep.fields.some(f => f.type === 'role_select') && (
        <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
          День 7 — роль на день отъезда не выбираем.
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {step > 0 && (
          <Button size="l" mode="secondary" onClick={() => setStep(s => s - 1)}>Назад</Button>
        )}
        {step < steps.length - 1 ? (
          <Button size="l" stretched onClick={() => setStep(s => s + 1)}>Далее</Button>
        ) : (
          <Button size="l" stretched onClick={handleSubmit}>Сохранить</Button>
        )}
      </div>
      <Button size="l" stretched mode="tertiary" style={{ marginTop: 8 }} onClick={onClose}>
        Отложить
      </Button>
    </div>
  );
};
