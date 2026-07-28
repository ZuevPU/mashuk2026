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
  'participants', 'directions', 'onboarding', 'forum', 'events', 'speakers', 'knowledge', 'tasks', 'questions',
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
