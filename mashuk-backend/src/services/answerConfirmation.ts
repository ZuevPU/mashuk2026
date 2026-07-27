export type AnswerConfirmationConfig = {
  enabled: boolean;
  showPoints: boolean;
  titleTemplate: string;
};

export const DEFAULT_ANSWER_CONFIRMATION: AnswerConfirmationConfig = {
  enabled: true,
  showPoints: true,
  titleTemplate: 'Ответ отправлен',
};

export function resolveAnswerConfirmation(raw: unknown): AnswerConfirmationConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_ANSWER_CONFIRMATION };
  const o = raw as Record<string, unknown>;
  return {
    enabled: o.enabled !== false,
    showPoints: o.showPoints !== false,
    titleTemplate: typeof o.titleTemplate === 'string' && o.titleTemplate.trim()
      ? o.titleTemplate.trim()
      : DEFAULT_ANSWER_CONFIRMATION.titleTemplate,
  };
}
