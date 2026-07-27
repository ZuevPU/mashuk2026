import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, CustomSelect, FormItem } from '@vkontakte/vkui';
import { apiPatch, apiPost } from '../../api/client';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';

type EveningField = {
  key: string;
  type: string;
  label: string;
  required?: boolean;
  visibleWhen?: { field: string; equals: boolean | string | number };
};

type EveningStep = {
  id: string;
  title: string;
  fields: EveningField[];
};

type RoleOpt = { roleKey: string; name: string };

export type EveningQuestionnaireProps = {
  currentDay: number;
  questionnaire: {
    config?: { steps: EveningStep[] };
    roles?: RoleOpt[];
    askTomorrowRole?: boolean;
    savedDraft?: { step?: number; form?: Record<string, unknown>; tomorrowRoleKey?: string } | null;
    pointBQuestionId?: number | null;
    hasPointB?: boolean;
  };
  experiment?: { status?: string } | null;
  onClose: () => void;
  onSubmitted: () => void;
};

function fieldVisible(field: EveningField, form: Record<string, unknown>): boolean {
  if (!field.visibleWhen) return true;
  return form[field.visibleWhen.field] === field.visibleWhen.equals;
}

export const EveningQuestionnaire: React.FC<EveningQuestionnaireProps> = ({
  currentDay,
  questionnaire,
  experiment,
  onClose,
  onSubmitted,
}) => {
  const routeNavigator = useRouteNavigator();
  const steps = questionnaire.config?.steps?.length
    ? questionnaire.config.steps
    : [{ id: 'legacy', title: 'Анкета', fields: [] }];
  const draft = questionnaire.savedDraft;
  const [step, setStep] = useState(draft?.step ?? 0);
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

  const persistDraft = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      apiPatch('/day-state/evening/draft', {
        dayNumber: currentDay,
        step,
        form,
        tomorrowRoleKey: tomorrowRole || undefined,
      }).catch(() => undefined);
    }, 400);
  }, [currentDay, step, form, tomorrowRole]);

  useEffect(() => {
    persistDraft();
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [persistDraft]);

  const setField = (key: string, value: unknown) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const currentStep = steps[Math.min(step, steps.length - 1)];
  const visibleFields = useMemo(
    () => currentStep.fields.filter(f => fieldVisible(f, form)),
    [currentStep, form],
  );

  const renderField = (field: EveningField) => {
    if (field.type === 'scale_1_5') {
      return (
        <FormItem key={field.key} top={field.label}>
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
        <FormItem key={field.key} top={field.label}>
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
        <FormItem key={field.key} top={field.label}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button mode={val ? 'primary' : 'secondary'} onClick={() => setField(field.key, true)}>Да</Button>
            <Button mode={!val ? 'primary' : 'secondary'} onClick={() => setField(field.key, false)}>Нет</Button>
          </div>
        </FormItem>
      );
    }
    if (field.type === 'text' || field.type === 'experiment_text') {
      if (field.type === 'experiment_text' && !experiment) return null;
      return (
        <FormItem key={field.key} top={field.label}>
          <textarea
            value={String(form[field.key] || '')}
            onChange={e => setField(field.key, e.target.value)}
            style={{ width: '100%', minHeight: field.type === 'experiment_text' ? 64 : 48, borderRadius: 10, border: '1px solid #ddd', padding: 10 }}
          />
        </FormItem>
      );
    }
    if (field.type === 'role_select') {
      if (!questionnaire.askTomorrowRole || currentDay > 6) return null;
      return (
        <FormItem key={field.key} top={field.label}>
          <CustomSelect
            options={(questionnaire.roles || []).map(r => ({ label: r.name, value: r.roleKey }))}
            value={tomorrowRole || undefined}
            onChange={e => setTomorrowRole(String(e.target.value))}
          />
        </FormItem>
      );
    }
    if (field.type === 'point_b_cta') {
      if (currentDay !== 7 || questionnaire.hasPointB) return null;
      const qid = questionnaire.pointBQuestionId;
      return (
        <FormItem key={field.key} top={field.label}>
          <p style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
            Завершите финальную рефлексию смены (Точка Б) — те же вопросы, что при входе, плюс роли.
          </p>
          {qid && (
            <Button stretched onClick={() => routeNavigator.push(`/questions?q=${qid}`)}>
              Перейти к Точке Б
            </Button>
          )}
        </FormItem>
      );
    }
    return null;
  };

  const handleSubmit = async () => {
    const askRole = questionnaire.askTomorrowRole !== false && currentDay <= 6;
    const ratings = { ...form };
    delete (ratings as Record<string, unknown>).tomorrowRoleKey;
    await apiPost('/day-state/evening', {
      dayNumber: currentDay,
      tomorrowRoleKey: askRole && tomorrowRole ? tomorrowRole : undefined,
      ratings,
      experimentStatus: experiment?.status === 'done' ? 'done' : undefined,
    });
    onSubmitted();
  };

  return (
    <div className="m-card">
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Итоговая анкета</div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>
        {currentStep.title} · шаг {step + 1} из {steps.length} · можно закрыть и вернуться
      </div>
      <div style={{ height: 4, background: '#eee', borderRadius: 4, marginBottom: 12 }}>
        <div style={{ width: `${((step + 1) / steps.length) * 100}%`, height: 4, background: '#2D6A4F', borderRadius: 4 }} />
      </div>
      {visibleFields.map(renderField)}
      {currentDay === 7 && (
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
