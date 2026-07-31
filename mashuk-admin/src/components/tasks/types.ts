export type TaskCategory = {
  id: number;
  name: string;
  iconKey?: string | null;
  sortOrder?: number;
};

export type AdminTask = {
  id: number;
  title: string;
  description?: string | null;
  descriptionHtml?: string | null;
  category?: string | null;
  categoryId?: number | null;
  categoryName?: string | null;
  categoryIconKey?: string | null;
  points?: number;
  dayNumber?: number;
  dayNumbers?: number[];
  status?: string;
  isHidden?: boolean;
  scopeType?: string;
  answerType?: string;
  answerOptions?: Array<{ label: string; value: string }>;
  confirmationType?: string;
  confirmationMethods?: string[];
  allowRetry?: boolean;
  autoConfirm?: boolean;
  pushOnPublish?: boolean;
  hideUntilPublish?: boolean;
  executionType?: string;
  dailyRepeatLimit?: number;
  teamConfirmHours?: number;
  medalTask?: boolean;
  nomination?: string | null;
  programPlaceId?: number | null;
  iconKey?: string | null;
  publishTime?: string | null;
  deadline?: string | null;
  availableFrom?: string | null;
  availableTo?: string | null;
  applicationDeadline?: string | null;
  qrValidFrom?: string | null;
  qrValidTo?: string | null;
  completionCount?: number;
  pendingModerationCount?: number;
  shortDescription?: string | null;
  medalId?: number | null;
  medalCount?: number | null;
  medalName?: string | null;
  eventTime?: string | null;
  programPlaceName?: string | null;
  catalogStatus?: string | null;
  taskKind?: string | null;
};

export type MedalOption = { id: number; name: string };

export type TaskDraft = {
  title: string;
  shortDescription: string;
  description: string;
  descriptionHtml: string;
  categoryId: number | '';
  points: number;
  dayNumbers: number[];
  status: string;
  scopeType: string;
  confirmationMethods: string[];
  answerType: string;
  answerOptions: Array<{ label: string; value: string }>;
  requiresModeration: boolean;
  executionType: string;
  dailyRepeatLimit: number;
  teamConfirmHours: number;
  medalTask: boolean;
  medalId: number | '';
  medalCount: number;
  eventTimeLocal: string;
  nomination: string;
  programPlaceId: number | '';
  iconKey: string;
  pushOnPublish: boolean;
  allowRetry: boolean;
  publishTimeLocal: string;
  availableFromLocal: string;
  availableToLocal: string;
  applicationDeadlineLocal: string;
  qrValidFromLocal: string;
  qrValidToLocal: string;
};

export const CONFIRMATION_METHOD_OPTIONS = [
  { key: 'qr', label: 'QR' },
  { key: 'photo', label: 'Фото до 5 МБ' },
  { key: 'link', label: 'Ссылка' },
  { key: 'volunteer', label: 'Волонтёр' },
  { key: 'team', label: 'Команда' },
  { key: 'moderator', label: 'Играпрактик' },
] as const;

export const TASK_ANSWER_FORMAT_OPTIONS = [
  { key: 'text', label: 'Текстовый ответ' },
  { key: 'choice', label: 'Выбор одного варианта' },
  { key: 'multi', label: 'Множественный выбор' },
  { key: 'text_and_photo', label: 'Фото + текст (необяз.)' },
  { key: 'photo', label: 'Только фото' },
] as const;

export const NOMINATION_OPTIONS = [
  { key: '', label: '— не указано —' },
  { key: 'sport', label: 'Спорт' },
  { key: 'creative', label: 'Креатив' },
  { key: 'media', label: 'Медиа' },
  { key: 'education', label: 'Образование' },
  { key: 'culture', label: 'Культура' },
  { key: 'volunteer', label: 'Волонтёрство' },
  { key: 'team', label: 'Команда' },
  { key: 'networking', label: 'Нетворкинг' },
  { key: 'leadership', label: 'Лидерство' },
  { key: 'general', label: 'Общее' },
];

function toLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): string | null {
  if (!v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function emptyDraft(day = 1): TaskDraft {
  return {
    title: '',
    shortDescription: '',
    description: '',
    descriptionHtml: '',
    categoryId: '',
    points: 20,
    dayNumbers: [day],
    status: 'draft',
    scopeType: 'individual',
    confirmationMethods: ['photo'],
    answerType: 'text_and_photo',
    answerOptions: [],
    requiresModeration: true,
    executionType: 'once',
    dailyRepeatLimit: 1,
    teamConfirmHours: 24,
    medalTask: false,
    medalId: '',
    medalCount: 1,
    eventTimeLocal: '',
    nomination: '',
    programPlaceId: '',
    iconKey: '',
    pushOnPublish: false,
    allowRetry: true,
    publishTimeLocal: '',
    availableFromLocal: '',
    availableToLocal: '',
    applicationDeadlineLocal: '',
    qrValidFromLocal: '',
    qrValidToLocal: '',
  };
}

export function draftFromTask(t: AdminTask): TaskDraft {
  const methods = t.confirmationMethods?.length
    ? [...t.confirmationMethods]
    : t.confirmationType === 'team'
      ? ['team']
      : t.confirmationType === 'qr'
        ? ['qr']
        : t.confirmationType === 'post_url'
          ? ['link']
          : t.autoConfirm === false
            ? ['photo', 'moderator']
            : ['photo'];
  return {
    title: t.title || '',
    shortDescription: t.shortDescription || t.description || '',
    description: t.description || '',
    descriptionHtml: t.descriptionHtml || t.description || '',
    categoryId: t.categoryId ?? '',
    points: t.points ?? 0,
    dayNumbers: t.dayNumbers?.length ? [...t.dayNumbers] : [t.dayNumber ?? 1],
    status: t.status || 'draft',
    scopeType: t.scopeType || 'individual',
    confirmationMethods: methods,
    answerType: t.answerType || (methods.includes('photo') ? 'text_and_photo' : 'text'),
    answerOptions: (t.answerOptions || []).map((o, i) => ({
      label: o.label,
      value: o.value || String(i),
    })),
    requiresModeration: methods.includes('moderator') || t.autoConfirm === false,
    executionType: t.executionType || 'once',
    dailyRepeatLimit: t.dailyRepeatLimit ?? 1,
    teamConfirmHours: t.teamConfirmHours ?? 24,
    medalTask: !!t.medalTask,
    medalId: t.medalId ?? '',
    medalCount: t.medalCount ?? 1,
    eventTimeLocal: toLocalInput(t.eventTime),
    nomination: t.nomination || '',
    programPlaceId: t.programPlaceId ?? '',
    iconKey: t.iconKey || '',
    pushOnPublish: !!t.pushOnPublish,
    allowRetry: t.allowRetry !== false,
    publishTimeLocal: toLocalInput(t.publishTime),
    availableFromLocal: toLocalInput(t.availableFrom),
    availableToLocal: toLocalInput(t.availableTo ?? t.deadline),
    applicationDeadlineLocal: toLocalInput(t.applicationDeadline),
    qrValidFromLocal: toLocalInput(t.qrValidFrom),
    qrValidToLocal: toLocalInput(t.qrValidTo),
  };
}

export function patchBodyFromDraft(draft: TaskDraft, publish = false): Record<string, unknown> {
  const status = publish ? 'published' : draft.status;
  return {
    title: draft.title.trim(),
    shortDescription: draft.shortDescription.trim() || draft.description.trim() || draft.descriptionHtml.replace(/<[^>]+>/g, ' ').trim(),
    description: draft.description.trim() || draft.descriptionHtml.replace(/<[^>]+>/g, ' ').trim(),
    descriptionHtml: draft.descriptionHtml,
    categoryId: draft.categoryId === '' ? null : Number(draft.categoryId),
    points: Number(draft.points),
    dayNumbers: draft.dayNumbers.length ? draft.dayNumbers : [1],
    dayNumber: draft.dayNumbers[0] ?? 1,
    status,
    scopeType: draft.scopeType,
    confirmationMethods: draft.confirmationMethods,
    answerType: draft.answerType,
    answerOptions: draft.answerOptions
      .map((o, i) => ({ label: o.label.trim(), value: o.value || String(i) }))
      .filter(o => o.label),
    requiresModeration: draft.requiresModeration,
    executionType: draft.executionType,
    dailyRepeatLimit: Number(draft.dailyRepeatLimit),
    teamConfirmHours: Number(draft.teamConfirmHours),
    medalTask: draft.medalTask,
    medalId: draft.medalId === '' ? null : Number(draft.medalId),
    medalCount: Number(draft.medalCount) || 1,
    eventTime: fromLocalInput(draft.eventTimeLocal),
    nomination: draft.nomination || null,
    programPlaceId: draft.programPlaceId === '' ? null : Number(draft.programPlaceId),
    iconKey: draft.iconKey.trim() || null,
    pushOnPublish: draft.pushOnPublish,
    allowRetry: draft.allowRetry,
    publishTime: fromLocalInput(draft.publishTimeLocal),
    availableFrom: fromLocalInput(draft.availableFromLocal),
    availableTo: fromLocalInput(draft.availableToLocal),
    applicationDeadline: fromLocalInput(draft.applicationDeadlineLocal),
    qrValidFrom: fromLocalInput(draft.qrValidFromLocal),
    qrValidTo: fromLocalInput(draft.qrValidToLocal),
  };
}

export function statusLabel(t: AdminTask): string {
  if (t.isHidden) return 'Скрыто';
  if (t.status === 'archived') return 'Архив';
  if (t.status === 'draft') return 'Черновик';
  return 'Опубликовано';
}

export function answerFormatLabel(answerType?: string | null): string {
  return TASK_ANSWER_FORMAT_OPTIONS.find(o => o.key === answerType)?.label
    ?? (answerType || '—');
}

export function methodsLabel(methods?: string[]): string {
  if (!methods?.length) return 'Авто';
  const map: Record<string, string> = {
    qr: 'QR',
    photo: 'Фото',
    link: 'Ссылка',
    volunteer: 'Волонтёр',
    team: 'Команда',
    moderator: 'Играпрактик',
  };
  return methods.map(m => map[m] || m).join(', ');
}

export function formatTaskDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function nominationLabel(key?: string | null): string {
  if (!key) return '—';
  return NOMINATION_OPTIONS.find(o => o.key === key)?.label ?? key;
}

export function taskKindLabel(t: AdminTask): string {
  const kind = t.taskKind || t.executionType || 'once';
  const map: Record<string, string> = {
    once: 'Разовое',
    daily: 'Ежедневное',
    repeatable: 'Повторяемое',
    team: 'Командное',
  };
  return map[kind] ?? kind;
}

export function medalLabel(t: AdminTask): string {
  if (t.medalName) return t.medalName;
  if (t.medalId) return `#${t.medalId}${t.medalCount && t.medalCount > 1 ? ` ×${t.medalCount}` : ''}`;
  if (t.medalTask) return 'Авто';
  return '—';
}
