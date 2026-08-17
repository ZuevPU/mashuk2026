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
export const AFTER_BLOCKS_PICK_PROMPT_TEXT = 'На каком уроке / блоке ты был(а)?';

const PROMPT_TYPE_SET = new Set<string>(AFTER_BLOCKS_PROMPT_TYPES);
const BLOCK_PICK_START_RE = /^(на каком (уроке|блоке)|где вы были|где ты был)/i;

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

export function splitPromptSentences(text: string): string[] {
  const raw = (text || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [];
  const parts = raw
    .split(/\n+/)
    .flatMap(line => line.split(/(?<=[?？])\s+/))
    .map(s => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [raw];
}

/** First step of after_blocks is the event picker, not a separate text prompt. */
export function isBlockPickPromptText(text: string): boolean {
  const t = (text || '').trim().replace(/\s+/g, ' ');
  return Boolean(t) && BLOCK_PICK_START_RE.test(t);
}

export function reflectionTextFromAfterBlocksSource(text?: string | null): string {
  const parts = splitPromptSentences(text || '');
  const reflection = parts.filter(p => !isBlockPickPromptText(p));
  if (reflection.length) return reflection.join(' ').trim();
  return DEFAULT_AFTER_BLOCKS_PROMPT_TEXT;
}

function withoutBlockPickPrompt(prompt: AfterBlocksPrompt): AfterBlocksPrompt | null {
  const parts = splitPromptSentences(prompt.text);
  if (parts.length <= 1) {
    return isBlockPickPromptText(prompt.text) ? null : prompt;
  }
  const reflection = parts.filter(p => !isBlockPickPromptText(p));
  if (!reflection.length) return null;
  return { ...prompt, text: reflection.join(' ').trim() };
}

export function defaultAfterBlocksConfig(text?: string | null): AfterBlocksConfig {
  const t = reflectionTextFromAfterBlocksSource(text);
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
  const kept = prompts
    .filter(p => p.text)
    .map(withoutBlockPickPrompt)
    .filter((p): p is AfterBlocksPrompt => Boolean(p));
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
