export type Tab =
  | 'rating'
  | 'participants'
  | 'directions'
  | 'onboarding'
  | 'events'
  | 'speakers'
  | 'knowledge'
  | 'tasks'
  | 'questions'
  | 'forum'
  | 'shifts'
  | 'moderation'
  | 'data'
  | 'levels'
  | 'analytics'
  | 'exports'
  | 'push'
  | 'admins'
  | 'journal'
  | 'medals'
  | 'piggybank'
  | 'recommendation-tags';

export const TAB_ORDER: Tab[] = [
  'participants', 'directions', 'onboarding', 'forum', 'shifts', 'events', 'speakers', 'knowledge', 'tasks', 'questions',
  'moderation', 'piggybank', 'data', 'levels', 'analytics', 'exports', 'push', 'recommendation-tags', 'admins', 'journal', 'medals',
];

export const TAB_LABELS: Record<Tab, string> = {
  rating: 'Рейтинг',
  participants: 'Участники',
  directions: 'Направления',
  onboarding: 'Онбординг',
  events: 'Программа',
  speakers: 'Спикеры',
  knowledge: 'База знаний',
  tasks: 'Задания',
  questions: 'Вопросы',
  forum: 'Форум',
  shifts: 'Смены',
  moderation: 'Модерация',
  piggybank: 'Копилка',
  data: 'Данные',
  levels: 'Система баллов',
  analytics: 'Дашборды',
  exports: 'Выгрузки',
  push: 'Уведомления',
  'recommendation-tags': 'Теги',
  admins: 'Админы',
  journal: 'Журнал',
  medals: 'Медали',
};

/** Группы боковой навигации (Apple Settings–style) */
export const NAV_GROUPS: { id: string; label: string; tabs: Tab[] }[] = [
  {
    id: 'people',
    label: 'Участники',
    tabs: ['participants', 'directions', 'onboarding'],
  },
  {
    id: 'program',
    label: 'Программа',
    tabs: ['forum', 'shifts', 'events', 'speakers', 'knowledge', 'tasks', 'questions'],
  },
  {
    id: 'engagement',
    label: 'Вовлечённость',
    tabs: ['moderation', 'piggybank', 'levels', 'medals', 'rating'],
  },
  {
    id: 'insights',
    label: 'Аналитика',
    tabs: ['analytics', 'exports', 'data'],
  },
  {
    id: 'system',
    label: 'Система',
    tabs: ['push', 'recommendation-tags', 'admins', 'journal'],
  },
];

export function groupedAllowedTabs(allowed: Tab[]): { id: string; label: string; tabs: Tab[] }[] {
  const allow = new Set(allowed);
  return NAV_GROUPS
    .map(g => ({ ...g, tabs: g.tabs.filter(t => allow.has(t)) }))
    .filter(g => g.tabs.length > 0);
}
