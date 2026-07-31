export type TaskCategory = {
  id: number;
  name: string;
  iconKey?: string | null;
  sortOrder?: number;
};

export type MedalOption = {
  id: number;
  name: string;
  level?: string | null;
};

export type TaskKind = 'once' | 'daily' | 'repeatable' | 'team';
export type CatalogStatus = 'active' | 'hidden' | 'completed' | 'draft';

export type AdminTask = {
  id: number;
  title: string;
  shortDescription?: string | null;
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
  catalogStatus?: CatalogStatus;
  taskKind?: TaskKind;
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
  medalId?: number | null;
  medalCount?: number | null;
  medalName?: string | null;
  medalLevel?: string | null;
  nomination?: string | null;
  programPlaceId?: number | null;
  programPlaceName?: string | null;
  iconKey?: string | null;
  publishTime?: string | null;
  eventTime?: string | null;
  deadline?: string | null;
  availableFrom?: string | null;
  availableTo?: string | null;
  applicationDeadline?: string | null;
  completionCount?: number;
  pendingModerationCount?: number;
};

export type TaskDraft = {
  title: string;
  shortDescription: string;
  descriptionHtml: string;
  categoryId: number | '';
  points: number;
  dayNumbers: number[];
  catalogStatus: CatalogStatus;
  status: string;
  taskKind: TaskKind;
  scopeType: string;
  confirmationMethods: string[];
  requiresModeration: boolean;
  executionType: string;
  dailyRepeatLimit: number;
  teamConfirmHours: number;
  medalId: number | '';
  medalCount: number;
  medalTask: boolean;
  nomination: string;
  programPlaceId: number | '';
  iconKey: string;
  pushOnPublish: boolean;
  allowRetry: boolean;
  publishTimeLocal: string;
  eventTimeLocal: string;
  availableFromLocal: string;
  availableToLocal: string;
  applicationDeadlineLocal: string;
};

export const TASK_KIND_OPTIONS: { key: TaskKind; label: string }[] = [
  { key: 'once', label: 'Одноразовое' },
  { key: 'daily', label: 'Ежедневное' },
  { key: 'repeatable', label: 'Многоразовое' },
  { key: 'team', label: 'Командное' },
];

export const CATALOG_STATUS_OPTIONS: { key: CatalogStatus; label: string }[] = [
  { key: 'active', label: 'Активно' },
  { key: 'hidden', label: 'Скрыто' },
  { key: 'completed', label: 'Завершено' },
  { key: 'draft', label: 'Черновик' },
];

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

export function taskKindFromTask(t: AdminTask): TaskKind {
  if (t.taskKind) return t.taskKind;
  if (t.scopeType === 'team') return 'team';
  const et = t.executionType || 'once';
  if (et === 'daily' || et === 'repeatable') return et;
  return 'once';
}

export function catalogStatusFromTask(t: AdminTask): CatalogStatus {
  if (t.catalogStatus) return t.catalogStatus;
  if (t.status === 'archived') return 'completed';
  if (t.isHidden) return 'hidden';
  if (t.status === 'draft') return 'draft';
  return 'active';
}

export function emptyDraft(day = 1): TaskDraft {
  return {
    title: '',
    shortDescription: '',
    descriptionHtml: '',
    categoryId: '',
    points: 20,
    dayNumbers: [day],
    catalogStatus: 'draft',
    status: 'draft',
    taskKind: 'once',
    scopeType: 'individual',
    confirmationMethods: ['photo'],
    requiresModeration: true,
    executionType: 'once',
    dailyRepeatLimit: 1,
    teamConfirmHours: 24,
    medalId: '',
    medalCount: 1,
    medalTask: false,
    nomination: '',
    programPlaceId: '',
    iconKey: '',
    pushOnPublish: false,
    allowRetry: true,
    publishTimeLocal: '',
    eventTimeLocal: '',
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
  const kind = taskKindFromTask(t);
  return {
    title: t.title || '',
    shortDescription: t.shortDescription || '',
    descriptionHtml: t.descriptionHtml || t.description || '',
    categoryId: t.categoryId ?? '',
    points: t.points ?? 0,
    dayNumbers: t.dayNumbers?.length ? [...t.dayNumbers] : [t.dayNumber ?? 1],
    catalogStatus: catalogStatusFromTask(t),
    status: t.status || 'draft',
    taskKind: kind,
    scopeType: kind === 'team' ? 'team' : 'individual',
    confirmationMethods: methods,
    requiresModeration: methods.includes('moderator') || t.autoConfirm === false,
    executionType: kind === 'team' ? 'once' : (t.executionType || 'once'),
    dailyRepeatLimit: t.dailyRepeatLimit ?? 1,
    teamConfirmHours: t.teamConfirmHours ?? 24,
    medalId: t.medalId ?? '',
    medalCount: t.medalCount ?? 1,
    medalTask: !!(t.medalTask || t.medalId),
    nomination: t.nomination || '',
    programPlaceId: t.programPlaceId ?? '',
    iconKey: t.iconKey || '',
    pushOnPublish: !!t.pushOnPublish,
    allowRetry: t.allowRetry !== false,
    publishTimeLocal: toLocalInput(t.publishTime),
    eventTimeLocal: toLocalInput(t.eventTime ?? t.availableFrom),
    availableFromLocal: toLocalInput(t.availableFrom ?? t.eventTime),
    availableToLocal: toLocalInput(t.availableTo ?? t.deadline),
    applicationDeadlineLocal: toLocalInput(t.applicationDeadline),
  };
}

export function patchBodyFromDraft(draft: TaskDraft, publish = false): Record<string, unknown> {
  const catalogStatus = publish ? 'active' : draft.catalogStatus;
  const status = publish ? 'published' : (catalogStatus === 'completed' ? 'archived' : catalogStatus === 'draft' ? 'draft' : 'published');
  const isHidden = catalogStatus === 'hidden';
  return {
    title: draft.title.trim(),
    shortDescription: draft.shortDescription.trim() || null,
    descriptionHtml: draft.descriptionHtml,
    description: draft.shortDescription.trim() || draft.descriptionHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null,
    categoryId: draft.categoryId === '' ? null : Number(draft.categoryId),
    points: Number(draft.points),
    dayNumbers: draft.dayNumbers.length ? draft.dayNumbers : [1],
    dayNumber: draft.dayNumbers[0] ?? 1,
    catalogStatus,
    status,
    isHidden,
    taskKind: draft.taskKind,
    scopeType: draft.taskKind === 'team' ? 'team' : 'individual',
    confirmationMethods: draft.confirmationMethods,
    requiresModeration: draft.requiresModeration,
    executionType: draft.taskKind === 'team' ? 'once' : draft.taskKind,
    dailyRepeatLimit: Number(draft.dailyRepeatLimit),
    teamConfirmHours: Number(draft.teamConfirmHours),
    medalId: draft.medalId === '' ? null : Number(draft.medalId),
    medalCount: Number(draft.medalCount) || 1,
    medalTask: draft.medalId !== '' || draft.medalTask,
    nomination: draft.nomination || null,
    programPlaceId: draft.programPlaceId === '' ? null : Number(draft.programPlaceId),
    iconKey: draft.iconKey.trim() || null,
    pushOnPublish: draft.pushOnPublish,
    allowRetry: draft.allowRetry,
    publishTime: fromLocalInput(draft.publishTimeLocal),
    eventTime: fromLocalInput(draft.eventTimeLocal),
    availableFrom: fromLocalInput(draft.availableFromLocal || draft.eventTimeLocal),
    availableTo: fromLocalInput(draft.availableToLocal),
    applicationDeadline: fromLocalInput(draft.applicationDeadlineLocal),
  };
}

export function statusLabel(t: AdminTask): string {
  const cs = catalogStatusFromTask(t);
  const found = CATALOG_STATUS_OPTIONS.find(o => o.key === cs);
  return found?.label ?? cs;
}

export function taskKindLabel(t: AdminTask): string {
  const kind = taskKindFromTask(t);
  return TASK_KIND_OPTIONS.find(o => o.key === kind)?.label ?? kind;
}

export function nominationLabel(key?: string | null): string {
  if (!key) return '—';
  return NOMINATION_OPTIONS.find(o => o.key === key)?.label ?? key;
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

export function formatTaskDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function medalLabel(t: AdminTask): string {
  if (t.medalName) return t.medalLevel ? `${t.medalName} (${t.medalLevel})` : t.medalName;
  if (t.medalTask) return 'Особое';
  return '—';
}
