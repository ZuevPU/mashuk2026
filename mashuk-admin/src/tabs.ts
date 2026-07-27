export type Tab =
  | 'participants'
  | 'directions'
  | 'onboarding'
  | 'events'
  | 'knowledge'
  | 'tasks'
  | 'questions'
  | 'forum'
  | 'moderation'
  | 'data'
  | 'levels'
  | 'analytics'
  | 'exports'
  | 'push'
  | 'admins'
  | 'journal'
  | 'medals';

export const TAB_ORDER: Tab[] = [
  'participants', 'directions', 'onboarding', 'forum', 'events', 'knowledge', 'tasks', 'questions',
  'moderation', 'data', 'levels', 'analytics', 'exports', 'push', 'admins', 'journal', 'medals',
];

export const TAB_LABELS: Record<Tab, string> = {
  participants: 'Участники',
  directions: 'Направления',
  onboarding: 'Онбординг',
  events: 'Программа',
  knowledge: 'База знаний',
  tasks: 'Задания',
  questions: 'Вопросы',
  forum: 'Форум',
  moderation: 'Модерация',
  data: 'Данные',
  levels: 'Баллы',
  analytics: 'Аналитика',
  exports: 'Выгрузки',
  push: 'Уведомления',
  admins: 'Админы',
  journal: 'Журнал',
  medals: 'Медали',
};
