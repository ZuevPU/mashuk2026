/** Prompts shown after the participant picks a program block. */

export const AFTER_BLOCKS_PROMPT_TYPES = [
  'text',
  'scale_5',
  'scale_10',
  'choice',
  'multi',
] as const;

export type AfterBlocksPromptType = (typeof AFTER_BLOCKS_PROMPT_TYPES)[number];

export type AfterBlocksPrompt = {
  id: string;
  text: string;
  answerType: AfterBlocksPromptType;
  options: string[];
};

export type AfterBlocksConfig = {
  prompts: AfterBlocksPrompt[];
};

export const DEFAULT_AFTER_BLOCKS_PROMPT_TEXT = 'Что вынесли из этого блока?';

const PROMPT_TYPE_SET = new Set<string>(AFTER_BLOCKS_PROMPT_TYPES);

function newPromptId(): string {
  return `abp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyAfterBlocksPrompt(
  patch?: Partial<AfterBlocksPrompt>,
): AfterBlocksPrompt {
  return {
    id: newPromptId(),
    text: '',
    answerType: 'text',
    options: [],
    ...patch,
  };
}

export function defaultAfterBlocksConfig(text?: string | null): AfterBlocksConfig {
  const t = (text || '').trim() || DEFAULT_AFTER_BLOCKS_PROMPT_TEXT;
  return {
    prompts: [emptyAfterBlocksPrompt({ text: t, answerType: 'text' })],
  };
}

function asPromptType(raw: unknown): AfterBlocksPromptType {
  const v = String(raw || '');
  return PROMPT_TYPE_SET.has(v) ? v as AfterBlocksPromptType : 'text';
}

export function normalizeAfterBlocksConfig(
  raw: unknown,
  fallbackText?: string | null,
): AfterBlocksConfig {
  const fallback = (fallbackText || '').trim() || DEFAULT_AFTER_BLOCKS_PROMPT_TEXT;
  if (!raw || typeof raw !== 'object') {
    return defaultAfterBlocksConfig(fallback);
  }
  const o = raw as Record<string, unknown>;
  const list = Array.isArray(o.prompts) ? o.prompts : (Array.isArray(raw) ? raw : []);
  const prompts: AfterBlocksPrompt[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const text = String(row.text ?? row.label ?? '').trim();
    const answerType = asPromptType(row.answerType ?? row.type);
    const options = Array.isArray(row.options)
      ? row.options.map(x => String(x ?? '').trim()).filter(Boolean)
      : [];
    const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : newPromptId();
    prompts.push({ id, text, answerType, options });
  }
  const kept = prompts.filter(p => p.text);
  return kept.length ? { prompts: kept } : defaultAfterBlocksConfig(fallback);
}

export function formatAfterBlocksPromptValue(
  prompt: AfterBlocksPrompt,
  value: unknown,
): string {
  if (prompt.answerType === 'multi') {
    const arr = Array.isArray(value) ? value.map(v => String(v).trim()).filter(Boolean) : [];
    return arr.join(', ');
  }
  if (value == null) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return String(value).trim();
}

export function afterBlocksPromptAnswerOk(
  prompt: AfterBlocksPrompt,
  value: unknown,
  minTextChars = 20,
): boolean {
  if (prompt.answerType === 'text') {
    return formatAfterBlocksPromptValue(prompt, value).length >= minTextChars;
  }
  if (prompt.answerType === 'scale_5' || prompt.answerType === 'scale_10') {
    const n = typeof value === 'number' ? value : Number(value);
    const max = prompt.answerType === 'scale_10' ? 10 : 5;
    return Number.isFinite(n) && n >= 1 && n <= max;
  }
  if (prompt.answerType === 'choice') {
    return formatAfterBlocksPromptValue(prompt, value).length > 0;
  }
  if (prompt.answerType === 'multi') {
    return Array.isArray(value) && value.some(v => String(v).trim());
  }
  return false;
}

export function composeAfterBlocksReflectionText(
  prompts: AfterBlocksPrompt[],
  answers: Record<string, unknown> | undefined,
): string {
  const parts: string[] = [];
  for (const prompt of prompts) {
    const formatted = formatAfterBlocksPromptValue(prompt, answers?.[prompt.id]);
    if (!formatted) continue;
    parts.push(prompts.length > 1 ? `${prompt.text}: ${formatted}` : formatted);
  }
  return parts.join('\n');
}
