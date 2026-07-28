/** Базовый набор медалей по формулировкам ТЗ §9 (upsert по name). */
export const FORUM_MEDALS_CATALOG = [
  { name: 'Первый шаг', description: 'Выполнил первое задание', conditionRule: 'tasks_completed>=1', awardType: 'auto', level: 'bronze', category: 'tasks' },
  { name: 'Стабильный участник', description: 'Выполнял задания 3 дня подряд', conditionRule: 'task_streak_days>=3', awardType: 'auto', level: 'silver', category: 'tasks' },
  { name: 'Форумный марафонец', description: 'Активен все 7 дней смены', conditionRule: 'active_days>=7', awardType: 'auto', level: 'gold', category: 'activity' },
  { name: 'Коммуникатор', description: 'Ответил на вопросы участников (обмен)', conditionRule: 'exchange_answers>=5', awardType: 'auto', level: 'bronze', category: 'exchange' },
  { name: 'Голос форума', description: 'Контент / пост / интервью (ручная или модерация)', conditionRule: 'manual', awardType: 'manual', level: 'silver', category: 'media' },
  { name: 'Создатель', description: 'Организовал активность (ручная выдача)', conditionRule: 'manual', awardType: 'manual', level: 'gold', category: 'creative' },
  { name: 'Командный игрок', description: 'Выполнил 3 командных задания', conditionRule: 'team_tasks>=3', awardType: 'auto', level: 'silver', category: 'team' },
  { name: 'Спортивный герой', description: 'Спортивные активности (номинация sport)', conditionRule: 'nomination_sport>=1', awardType: 'auto', level: 'bronze', category: 'sport' },
  { name: 'Чемпион', description: 'Призовое место в номинации', conditionRule: 'manual', awardType: 'manual', level: 'gold', category: 'rating' },
  { name: 'Амбассадор форума', description: 'Лучший контент по модерации', conditionRule: 'manual', awardType: 'manual', level: 'platinum', category: 'media' },
  { name: 'Копилка идей', description: '≥20 записей в копилке', conditionRule: 'piggybank_count>=20', awardType: 'auto', level: 'silver', category: 'piggybank' },
  { name: 'Рефлексивный', description: '≥10 ответов на вопросы', conditionRule: 'answers_count>=10', awardType: 'auto', level: 'bronze', category: 'reflection' },
  { name: 'Путь 100', description: '≥100 баллов Пути', conditionRule: 'path_points>=100', awardType: 'auto', level: 'gold', category: 'points' },
] as const;
