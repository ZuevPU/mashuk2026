const LABELS: Record<string, string> = {
  // Вкладки / разделы
  push: 'Уведомления',
  home: 'Главная',
  program: 'Программа',
  tasks: 'Задания',
  questions: 'Общение',
  profile: 'Профиль',

  // Тип ответа на задание
  text: 'Текст',
  photo: 'Фото',
  text_and_photo: 'Текст и фото',

  // Тип подтверждения задания
  text_photo: 'Текст/фото',
  post_url: 'Ссылка на пост',
  qr: 'QR-код',

  // Частота выполнения
  once: 'Один раз',
  daily: 'Раз в день',
  repeatable: 'Многоразовое',

  // Тип вопроса
  open: 'Открытый',
  checkin: 'Проверка состояния (настроение)',
  choice: 'Выбор одного',
  multi: 'Множественный выбор',
  dependent: 'Зависимый',
  evening_summary: 'Итоги дня',

  // Статусы
  draft: 'Черновик',
  published: 'Опубликован',
  pending: 'На проверке',
  approved: 'Одобрено',
  rejected: 'Отклонено',
  pending_team: 'Ожидает команду',
  expired: 'Истекло',
  confirmed: 'Подтверждено',
  declined: 'Отказ',

  // Типы действий (баллы)
  question_answer: 'Ответ на вопрос',
  task_complete: 'Выполнение задания',
  exchange_answer: 'Ответ в обмене',
  exchange_question: 'Вопрос в обмене',
  piggybank_entry: 'Запись в копилку',
  piggybank_idea: 'Идея в копилку',
  piggybank_thought: 'Мысль в копилку',
  piggybank_question: 'Вопрос в копилку',
  path_level: 'Уровень пути',
  exp_level: 'Уровень опыта',

  // Уведомления / доставка
  manual: 'Вручную',
  skipped_no_token: 'Пропущено (нет токена)',
  skipped_opt_out: 'Пропущено (отключено)',
  sent: 'Отправлено',
  task_publish: 'Публикация задания',
  question_publish: 'Публикация вопроса',
  task_moderation: 'Модерация задания',
  team_confirm_request: 'Запрос подтверждения команды',
  team_submission_expired: 'Истекло время команды',
  points_revoked: 'Баллы пересмотрены',

  // Медали / уровни
  bronze: 'Бронза',
  silver: 'Серебро',
  gold: 'Золото',
  experience: 'Опыт',
  path: 'Путь',

  // Роли команды (кратко)
  team: 'Команда',
  auto: 'Автоподтверждение',
  morning: 'Утро',
  evening: 'Вечер',

  // Программа — тип блока
  block_session: 'Сессия',
  block_plenary: 'Пленар',
  block_workshop: 'Мастер-класс',
  block_break: 'Перерыв',
  block_key_block: 'Ключевой блок',

  // Программа — публикация
  schedule_visible: 'В расписании',
  schedule_waiting_day: 'Ждёт публикации дня',
  day_published: 'День опубликован',
  day_draft: 'День не опубликован',

  // Материалы БЗ
  pdf: 'PDF',
  video: 'Видео',
  link: 'Ссылка',
  audio: 'Аудио',

  // Метки рефлексии
  state_check: 'Проверка состояния',
  after_event: 'После события',
  point_a: 'Точка А',
  point_b: 'Точка Б',

  // Орг. обращения
  answered: 'Отвечено',
  org_thread_open: 'Ожидает ответа',

  // Роли админов
  admin: 'Администратор',
  moderator: 'Модератор',
  analyst: 'Аналитик',
  director: 'Дирекция',

  // Выгрузки (префикс export_ — не путать с типами вопросов)
  export_all: 'Все типы',
  export_checkin: 'Проверка состояния',
  export_direction: 'Направление / осмысление',
  export_lessons: 'После уроков',
  export_evening: 'Итоги дня',
  export_point_a: 'Точка А',
  export_point_b: 'Точка Б',
};

export function vkProfileUrl(vkId: string | number | null | undefined): string | null {
  if (vkId == null || vkId === '') return null;
  const raw = String(vkId).trim();
  if (!raw) return null;
  const numeric = raw.replace(/^id/i, '');
  if (!/^\d+$/.test(numeric)) return null;
  return `https://vk.com/id${numeric}`;
}

export function label(key: string): string {
  if (!key) return key;
  if (key.startsWith('error:')) return `Ошибка: ${key.slice(7)}`;
  if (key.startsWith('auto_retry_slot_')) {
    const t = key.replace('auto_retry_slot_', '');
    return `Автоповтор слота ${t.slice(0, 2)}:${t.slice(2)}`;
  }
  if (key.startsWith('auto_slot_')) {
    const t = key.replace('auto_slot_', '');
    return `Авто слот ${t.slice(0, 2)}:${t.slice(2)}`;
  }
  return LABELS[key] ?? key;
}
