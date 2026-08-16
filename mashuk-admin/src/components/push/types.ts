export const PUSH_NOTIFICATION_TYPE_OPTIONS = [
  { key: 'state_check', label: 'Проверка состояния' },
  { key: 'reminder', label: 'Напоминание' },
  { key: 'day_summary', label: 'Итоги дня' },
  { key: 'program', label: 'Программа' },
  { key: 'task', label: 'Задание' },
  { key: 'org', label: 'Организационное' },
] as const;

export const PUSH_PRESET_CATEGORY_OPTIONS = [
  { key: 'morning', label: 'Утро' },
  { key: 'state_check', label: 'Проверка состояния' },
  { key: 'question_of_day', label: 'Вопрос дня' },
  { key: 'reminder', label: 'Напоминание' },
  { key: 'urgent', label: 'Срочное сообщение' },
] as const;

export const PUSH_AUDIENCE_OPTIONS = [
  { key: 'all', label: 'Все участники смены' },
  { key: 'direction', label: 'Одно направление' },
  { key: 'group', label: 'Одна группа' },
  { key: 'ids', label: 'Выбранные участники (по ID)' },
] as const;

export const PUSH_SEND_MODE_OPTIONS = [
  { key: 'now', label: 'Отправить сразу' },
  { key: 'scheduled', label: 'Отправить в указанное время' },
] as const;

export type PushNotificationRow = {
  id: number;
  internalName?: string | null;
  pushTitle?: string | null;
  body: string;
  icon?: string | null;
  imageUrl?: string | null;
  notificationType?: string | null;
  status?: string | null;
  programDay?: number | null;
  programDate?: string | null;
  publishAt?: string | null;
  visibleUntil?: string | null;
  sendMode?: string | null;
  triggerConfig?: Record<string, unknown> | null;
  audienceType?: string | null;
  audiencePayload?: Record<string, unknown> | null;
  audienceLabel?: string;
  templateId?: number | null;
  sentAt?: string | null;
  deliveredCount?: number | null;
  openedCount?: number | null;
  updatedAt?: string | null;
};

export type PushTemplateRow = {
  id: number;
  key: string;
  title?: string | null;
  pushTitle?: string | null;
  body: string;
  icon?: string | null;
  notificationType?: string | null;
  presetCategory?: string | null;
  kind?: string | null;
  slotKey?: string | null;
  isActive?: boolean;
};

export type PushDraft = {
  internalName: string;
  pushTitle: string;
  body: string;
  icon: string;
  imageUrl: string;
  notificationType: string;
  status: string;
  programDay: number | '';
  programDate: string;
  publishAt: string;
  visibleUntil: string;
  sendMode: string;
  triggerConfig: Record<string, unknown>;
  audienceType: string;
  audiencePayload: Record<string, unknown>;
  templateId: number | '';
};

export function emptyPushDraft(): PushDraft {
  return {
    internalName: '',
    pushTitle: '',
    body: '',
    icon: '🔔',
    imageUrl: '',
    notificationType: 'reminder',
    status: 'draft',
    programDay: '',
    programDate: '',
    publishAt: '',
    visibleUntil: '',
    sendMode: 'now',
    triggerConfig: { kind: 'task_publish' },
    audienceType: 'all',
    audiencePayload: {},
    templateId: '',
  };
}

export function rowToDraft(row: PushNotificationRow): PushDraft {
  const iso = (v?: string | null) => (v ? new Date(v).toISOString().slice(0, 16) : '');
  return {
    internalName: row.internalName ?? '',
    pushTitle: row.pushTitle ?? '',
    body: row.body ?? '',
    icon: row.icon ?? '🔔',
    imageUrl: row.imageUrl ?? '',
    notificationType: row.notificationType ?? 'reminder',
    status: row.status ?? 'draft',
    programDay: row.programDay ?? '',
    programDate: row.programDate ? new Date(row.programDate).toISOString().slice(0, 10) : '',
    publishAt: iso(row.publishAt),
    visibleUntil: iso(row.visibleUntil),
    sendMode: row.sendMode ?? 'now',
    triggerConfig: (row.triggerConfig as Record<string, unknown>) ?? { kind: 'webhook' },
    audienceType: row.audienceType ?? 'all',
    audiencePayload: (row.audiencePayload as Record<string, unknown>) ?? {},
    templateId: row.templateId ?? '',
  };
}

export function draftToPayload(draft: PushDraft) {
  return {
    internalName: draft.internalName || undefined,
    pushTitle: draft.pushTitle || undefined,
    body: draft.body,
    icon: draft.icon || undefined,
    imageUrl: draft.imageUrl || undefined,
    notificationType: draft.notificationType,
    status: draft.status,
    programDay: draft.programDay === '' ? null : Number(draft.programDay),
    programDate: draft.programDate || undefined,
    publishAt: draft.publishAt ? new Date(draft.publishAt).toISOString() : undefined,
    visibleUntil: draft.visibleUntil ? new Date(draft.visibleUntil).toISOString() : undefined,
    sendMode: draft.sendMode,
    triggerConfig: draft.triggerConfig,
    audienceType: draft.audienceType,
    audiencePayload: draft.audiencePayload,
    templateId: draft.templateId === '' ? null : Number(draft.templateId),
  };
}

export function typeLabel(key: string | null | undefined): string {
  return PUSH_NOTIFICATION_TYPE_OPTIONS.find(o => o.key === key)?.label ?? key ?? '';
}
