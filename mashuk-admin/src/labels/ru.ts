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

  // Жизненный цикл заявки
  created: 'Создана',
  awaiting_confirm: 'Ожидает подтверждения',
  points_awarded: 'Баллы начислены',
  medal_awarded: 'Медаль получена',

  // Тип доказательства
  proof_qr: 'QR',
  proof_photo: 'Фото',
  proof_post: 'Пост VK',
  proof_volunteer: 'Волонтёр',
  proof_moderator: 'Модератор',
  proof_team: 'Команда',

  // Тип проверки
  manual_moderator: 'Модератор',
  manual_volunteer: 'Волонтёр',
  team_confirm: 'Команда',

  // Типы действий (баллы)
  question_answer: 'Ответ на вопрос',
  task_complete: 'Выполнение задания',
  exchange_answer: 'Ответ участнику в «Общении»',
  exchange_question: 'Вопрос в «Общении»',
  piggybank_entry: 'Копилка: запись',
  piggybank_idea: 'Копилка: идея',
  piggybank_thought: 'Копилка: мысль',
  piggybank_question: 'Копилка: вопрос',
  state_check_morning: 'Утренняя проверка состояния',
  state_check_day: 'Дневная проверка состояния',
  state_check_evening: 'Вечерняя проверка состояния',
  evening_complete: 'Итоги дня',
  point_a_complete: 'Точка А (вход)',
  point_b_complete: 'Точка Б (выход)',
  attendance: 'Посещение события программы',
  day_complete_bonus: 'Бонус за полный день (все точки)',
  reflection_streak_7: 'Бонус за регулярность 7 дней',
  bonus_regularity: 'Бонус регулярности (6 полных дней)',
  bonus_diversity: 'Бонус разнообразия заданий',
  admin_manual_path: 'Ручное начисление (Путь)',
  admin_manual_experience: 'Ручное начисление (Опыт)',
  admin_manual_deduct_path: 'Ручное списание (Путь)',
  admin_manual_deduct_experience: 'Ручное списание (Опыт)',
  admin_manual_task: 'Ручное выполнение задания',
  path_level: 'Порог уровня «Путь»',
  exp_level: 'Порог уровня «Опыт»',
  points_recalculate: 'Пересчёт баллов',
  points_revoke: 'Аннулирование баллов',
  org_reply: 'Ответ на обращение к дирекции',
  org_thread_delete: 'Удаление обращения к дирекции',

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
  confirm_link: 'Ссылка',
  confirm_volunteer: 'Волонтёр',
  confirm_moderator: 'Модератор',
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
  waiting: 'Ожидает ответа',
  closed: 'Закрыто',
  org_thread_open: 'Ожидает ответа',

  // Роли админов
  admin: 'Администратор',
  moderator: 'Модератор',
  analyst: 'Аналитик',
  director: 'Дирекция',

  admin_user_change: 'Изменение пользователя админки',
  points_adjust: 'Ручное начисление баллов',
  task_moderate: 'Модерация задания',
  question_update: 'Изменение вопроса',
  question_delete: 'Удаление вопроса',
  event_delete: 'Удаление события',
  event_update: 'Изменение программы',
  task_delete: 'Удаление задания',
  material_delete: 'Удаление материала',
  medal_delete: 'Удаление медали',
  tag_merge: 'Слияние тегов',
  tag_delete: 'Удаление тега',
  forum_settings: 'Настройки форума',

  // Выгрузки (префикс export_ — не путать с типами вопросов)
  export_all: 'Все типы',
  export_checkin: 'Проверка состояния',
  export_direction: 'Направление / осмысление',
  export_lessons: 'После уроков (важное)',
  export_lesson_important: 'После урока — важное',
  export_lesson_open: 'После урока — открытый вопрос',
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
  if (key.endsWith('_revoke')) {
    const base = key.slice(0, -'_revoke'.length);
    return `Аннулирование: ${label(base)}`;
  }
  if (key.startsWith('task_cat_')) {
    const raw = key.slice('task_cat_'.length).replace(/_/g, ' ').trim();
    return raw ? `Задание: ${raw}` : 'Задание';
  }
  if (key.startsWith('auto_retry_slot_')) {
    const t = key.replace('auto_retry_slot_', '');
    return `Автоповтор слота ${t.slice(0, 2)}:${t.slice(2)}`;
  }
  if (key.startsWith('auto_slot_')) {
    const t = key.replace('auto_slot_', '');
    return SLOT_LABELS[`slot_${t}`] ?? `Авто слот ${t.slice(0, 2)}:${t.slice(2)}`;
  }
  return LABELS[key] ?? SLOT_LABELS[key] ?? key;
}

const SLOT_LABELS: Record<string, string> = {
  slot_0800: 'Утро · 08:00',
  slot_1300: 'День · 13:00',
  slot_1600: 'После урока · 16:00',
  slot_1830: 'Вечер · 18:30',
  slot_2200: 'Итоги дня · 22:00',
  slot_2300: 'Ночь · 23:00',
};
