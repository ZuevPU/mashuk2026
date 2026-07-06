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

  // Тип вопроса
  open: 'Открытый',
  checkin: 'Check-in (настроение)',
  choice: 'Выбор одного',
  multi: 'Множественный выбор',
  dependent: 'Зависимый',

  // Статусы
  draft: 'Черновик',
  published: 'Опубликован',
  pending: 'На проверке',
  approved: 'Одобрено',
  rejected: 'Отклонено',

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

  // Push / доставка
  manual: 'Вручную',
  skipped_no_token: 'Пропущено (нет токена)',
  sent: 'Отправлено',
  task_publish: 'Публикация задания',
  question_publish: 'Публикация вопроса',
};

export function label(key: string): string {
  if (!key) return key;
  // deliveryStatus может быть "error: ..." — переводим префикс
  if (key.startsWith('error:')) return `Ошибка: ${key.slice(7)}`;
  return LABELS[key] ?? key;
}
