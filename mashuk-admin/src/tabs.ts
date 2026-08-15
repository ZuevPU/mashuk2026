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
  | 'hub'
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
  'moderation', 'piggybank', 'rating', 'data', 'levels', 'hub', 'analytics', 'exports', 'push', 'recommendation-tags', 'admins', 'journal', 'medals',
];

export const TAB_LABELS: Record<Tab, string> = {
  rating: 'Рейтинг',
  participants: 'Участники',
  directions: 'Направления',
  onboarding: 'Регистрация',
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
  hub: 'Штаб',
  analytics: 'Дашборды',
  exports: 'Выгрузки',
  push: 'Уведомления',
  'recommendation-tags': 'Интересы',
  admins: 'Админы',
  journal: 'Журнал',
  medals: 'Медали',
};

/** Якорь на блок внутри вкладки (не отдельное право доступа). */
export type NavShortcut = {
  kind: 'anchor';
  id: string;
  label: string;
  tab: Tab;
  anchor: string;
};

export type NavEntry = Tab | NavShortcut;

export function isNavShortcut(entry: NavEntry): entry is NavShortcut {
  return typeof entry === 'object' && entry != null && entry.kind === 'anchor';
}

export const FORUM_EVENING_NAV: NavShortcut = {
  kind: 'anchor',
  id: 'forum-evening',
  label: 'Итоговая анкета вечера',
  tab: 'forum',
  anchor: 'forum-cfg-evening',
};

/** Группы боковой навигации (Apple Settings–style) */
export const NAV_GROUPS: { id: string; label: string; items: NavEntry[] }[] = [
  {
    id: 'people',
    label: 'Участники',
    items: ['participants', 'directions', 'onboarding'],
  },
  {
    id: 'program',
    label: 'Программа',
    items: ['forum', FORUM_EVENING_NAV, 'shifts', 'events', 'speakers', 'knowledge', 'tasks', 'questions'],
  },
  {
    id: 'engagement',
    label: 'Вовлечённость',
    items: ['moderation', 'piggybank', 'levels', 'medals', 'rating'],
  },
  {
    id: 'insights',
    label: 'Аналитика',
    items: ['hub', 'analytics', 'exports', 'data'],
  },
  {
    id: 'system',
    label: 'Система',
    items: ['push', 'recommendation-tags', 'admins', 'journal'],
  },
];

export function groupedAllowedTabs(allowed: Tab[]): { id: string; label: string; items: NavEntry[] }[] {
  const allow = new Set(allowed);
  return NAV_GROUPS
    .map(g => ({
      ...g,
      items: g.items.filter(e => (isNavShortcut(e) ? allow.has(e.tab) : allow.has(e))),
    }))
    .filter(g => g.items.length > 0);
}
