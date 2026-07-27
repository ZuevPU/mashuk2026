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
  completionCount?: number;
  pendingModerationCount?: number;
};

export type TaskDraft = {
  title: string;
  description: string;
  descriptionHtml: string;
  categoryId: number | '';
  points: number;
  dayNumbers: number[];
  status: string;
  scopeType: string;
  confirmationMethods: string[];
  requiresModeration: boolean;
  executionType: string;
  dailyRepeatLimit: number;
  teamConfirmHours: number;
  medalTask: boolean;
  nomination: string;
  programPlaceId: number | '';
  iconKey: string;
  pushOnPublish: boolean;
  allowRetry: boolean;
  publishTimeLocal: string;
  availableFromLocal: string;
  availableToLocal: string;
  applicationDeadlineLocal: string;
};

export const CONFIRMATION_METHOD_OPTIONS = [
  { key: 'qr', label: 'QR' },
  { key: 'photo', label: 'Фото до 5 МБ' },
  { key: 'link', label: 'Ссылка' },
  { key: 'volunteer', label: 'Волонтёр' },
  { key: 'team', label: 'Команда' },
  { key: 'moderator', label: 'Модератор' },
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
    description: '',
    descriptionHtml: '',
    categoryId: '',
    points: 20,
    dayNumbers: [day],
    status: 'draft',
    scopeType: 'individual',
    confirmationMethods: ['photo'],
    requiresModeration: true,
    executionType: 'once',
    dailyRepeatLimit: 1,
    teamConfirmHours: 24,
    medalTask: false,
    nomination: '',
    programPlaceId: '',
    iconKey: '',
    pushOnPublish: false,
    allowRetry: true,
    publishTimeLocal: '',
    availableFromLocal: '',
    availableToLocal: '',
    applicationDeadlineLocal: '',
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
    description: t.description || '',
    descriptionHtml: t.descriptionHtml || t.description || '',
    categoryId: t.categoryId ?? '',
    points: t.points ?? 0,
    dayNumbers: t.dayNumbers?.length ? [...t.dayNumbers] : [t.dayNumber ?? 1],
    status: t.status || 'draft',
    scopeType: t.scopeType || 'individual',
    confirmationMethods: methods,
    requiresModeration: methods.includes('moderator') || t.autoConfirm === false,
    executionType: t.executionType || 'once',
    dailyRepeatLimit: t.dailyRepeatLimit ?? 1,
    teamConfirmHours: t.teamConfirmHours ?? 24,
    medalTask: !!t.medalTask,
    nomination: t.nomination || '',
    programPlaceId: t.programPlaceId ?? '',
    iconKey: t.iconKey || '',
    pushOnPublish: !!t.pushOnPublish,
    allowRetry: t.allowRetry !== false,
    publishTimeLocal: toLocalInput(t.publishTime),
    availableFromLocal: toLocalInput(t.availableFrom),
    availableToLocal: toLocalInput(t.availableTo ?? t.deadline),
    applicationDeadlineLocal: toLocalInput(t.applicationDeadline),
  };
}

export function patchBodyFromDraft(draft: TaskDraft, publish = false): Record<string, unknown> {
  const status = publish ? 'published' : draft.status;
  return {
    title: draft.title.trim(),
    description: draft.description.trim() || draft.descriptionHtml.replace(/<[^>]+>/g, ' ').trim(),
    descriptionHtml: draft.descriptionHtml,
    categoryId: draft.categoryId === '' ? null : Number(draft.categoryId),
    points: Number(draft.points),
    dayNumbers: draft.dayNumbers.length ? draft.dayNumbers : [1],
    dayNumber: draft.dayNumbers[0] ?? 1,
    status,
    scopeType: draft.scopeType,
    confirmationMethods: draft.confirmationMethods,
    requiresModeration: draft.requiresModeration,
    executionType: draft.executionType,
    dailyRepeatLimit: Number(draft.dailyRepeatLimit),
    teamConfirmHours: Number(draft.teamConfirmHours),
    medalTask: draft.medalTask,
    nomination: draft.nomination || null,
    programPlaceId: draft.programPlaceId === '' ? null : Number(draft.programPlaceId),
    iconKey: draft.iconKey.trim() || null,
    pushOnPublish: draft.pushOnPublish,
    allowRetry: draft.allowRetry,
    publishTime: fromLocalInput(draft.publishTimeLocal),
    availableFrom: fromLocalInput(draft.availableFromLocal),
    availableTo: fromLocalInput(draft.availableToLocal),
    applicationDeadline: fromLocalInput(draft.applicationDeadlineLocal),
  };
}

export function statusLabel(t: AdminTask): string {
  if (t.isHidden) return 'Скрыто';
  if (t.status === 'archived') return 'Архив';
  if (t.status === 'draft') return 'Черновик';
  return 'Опубликовано';
}

export function methodsLabel(methods?: string[]): string {
  if (!methods?.length) return 'Авто';
  const map: Record<string, string> = {
    qr: 'QR',
    photo: 'Фото',
    link: 'Ссылка',
    volunteer: 'Волонтёр',
    team: 'Команда',
    moderator: 'Модератор',
  };
  return methods.map(m => map[m] || m).join(', ');
}
