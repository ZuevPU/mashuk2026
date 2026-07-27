/** Admin push notification types (§8) — UI labels in admin; no «чек-ин». */
export const PUSH_NOTIFICATION_TYPES = [
  'state_check',
  'reminder',
  'day_summary',
  'program',
  'task',
  'org',
] as const;

export type PushNotificationType = typeof PUSH_NOTIFICATION_TYPES[number];

export const PUSH_NOTIFICATION_TYPE_LABELS: Record<PushNotificationType, string> = {
  state_check: 'Проверка состояния',
  reminder: 'Напоминание',
  day_summary: 'Итоги дня',
  program: 'Программа',
  task: 'Задание',
  org: 'Организационное',
};

export const PUSH_PRESET_CATEGORIES = [
  'morning',
  'state_check',
  'question_of_day',
  'reminder',
  'urgent',
] as const;

export type PushPresetCategory = typeof PUSH_PRESET_CATEGORIES[number];

export const PUSH_PRESET_CATEGORY_LABELS: Record<PushPresetCategory, string> = {
  morning: 'Утро',
  state_check: 'Проверка состояния',
  question_of_day: 'Вопрос дня',
  reminder: 'Напоминание',
  urgent: 'Срочное сообщение',
};

/** Maps admin notification type → participant pushOptOut category key */
export function optOutCategoryForNotificationType(type: string): string {
  switch (type) {
    case 'state_check':
    case 'day_summary':
      return 'touchpoints';
    case 'program':
      return 'program';
    case 'task':
      return 'tasks';
    case 'org':
      return 'org';
    case 'reminder':
    default:
      return 'program';
  }
}

export function triggerTypeForCampaign(notificationId: number, notificationType: string): string {
  return `admin_campaign_${notificationId}_${notificationType}`;
}

export const SLOT_HUMAN_LABELS: Record<string, string> = {
  slot_0800: 'Утро · 08:00',
  slot_1300: 'День · 13:00',
  slot_1600: 'После урока · 16:00',
  slot_1830: 'Вечер · 18:30',
  slot_2200: 'Итоги дня · 22:00',
  slot_2300: 'Ночь · 23:00',
};

export function humanSlotLabel(slotKey: string | null | undefined): string {
  if (!slotKey) return '';
  return SLOT_HUMAN_LABELS[slotKey] ?? slotKey;
}
