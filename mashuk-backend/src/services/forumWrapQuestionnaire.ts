import {
  DEFAULT_EVENING_QUESTIONNAIRE_CONFIG,
  isEveningOpenForConfig,
  type EveningQuestionnaireConfig,
} from './eveningQuestionnaireConfig.js';

export function defaultForumWrapConfig(): EveningQuestionnaireConfig {
  const base = JSON.parse(JSON.stringify(DEFAULT_EVENING_QUESTIONNAIRE_CONFIG)) as EveningQuestionnaireConfig;
  return {
    ...base,
    opensAtMsk: '10:00',
    steps: (base.steps || [])
      .map(step => {
        if (step.id === 'open') {
          return {
            ...step,
            title: 'Выводы форума',
            fields: step.fields.map(f => {
              if (f.key === 'mainThesis') return { ...f, label: 'Главный тезис (ключевая мысль) форума' };
              if (f.key === 'improveTomorrow') {
                return { ...f, label: 'Что сделать, чтобы оценки на следующих сменах стали выше?' };
              }
              return f;
            }),
          };
        }
        if (step.id === 'role' || step.fields.some(f => f.type === 'role_select')) {
          return { ...step, fields: step.fields.filter(f => f.type !== 'role_select') };
        }
        return step;
      })
      .filter(step => step.fields.length > 0),
  };
}

export function resolveForumWrapConfig(
  settings: { forumWrapQuestionnaireConfig?: unknown } | null | undefined,
): EveningQuestionnaireConfig {
  const raw = settings?.forumWrapQuestionnaireConfig as EveningQuestionnaireConfig | null | undefined;
  if (raw && Array.isArray(raw.steps) && raw.steps.length) return raw;
  return defaultForumWrapConfig();
}

export function isForumWrapOpen(
  config: EveningQuestionnaireConfig | null | undefined,
  now = new Date(),
): boolean {
  return isEveningOpenForConfig(config, now);
}
