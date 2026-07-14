export const GOAL_QUESTIONS = [
  'С какой целью ты приехал на Машук?',
  'Что ты хочешь получить от программы?',
  'Какой запрос ты хочешь принести своему направлению?',
  'Что для тебя было бы главным результатом этих 8 дней?',
  'Что ты ожидаешь от других участников?',
] as const;

export const INTEREST_GROUPS = [
  {
    title: 'Как я работаю',
    tags: [
      'проектная работа',
      'исследовательская деятельность',
      'игропрактики',
      'воспитательная работа',
      'классное руководство',
      'детская редакция',
    ],
  },
  {
    title: 'С кем и как',
    tags: [
      'подростки',
      'младшая школа',
      'старшие классы',
      'работа с родителями',
      'командная работа учителей',
      'наставничество',
    ],
  },
  {
    title: 'Про что говорить',
    tags: [
      'оценки и мотивация',
      'осмысленность обучения',
      'выгорание учителя',
      'образование будущего',
      'школа и семья',
      'цифровая среда',
    ],
  },
  {
    title: 'Форматы, которые нравятся',
    tags: [
      'открытые уроки',
      'лекции и большие форматы',
      'клубы обсуждений',
      'мастер-классы',
      'полевые выезды',
    ],
  },
] as const;

export const DIAGNOSTIC_QUESTIONS = [
  {
    text: 'Когда ты берёшься за новую задачу, что ты делаешь первым делом?',
    options: [
      'Разбираю смысл — зачем и почему это нужно',
      'Ищу похожие задачи, которые я уже делал',
      'Собираю команду / договариваюсь с людьми',
      'Составляю план и этапы',
    ],
  },
  {
    text: 'В сложном разговоре ты обычно…',
    options: [
      'Ищешь скрытый смысл и настоящую причину',
      'Помогаешь всем высказаться и услышать друг друга',
      'Следишь, чтобы атмосфера оставалась безопасной',
      'Фиксируешь договорённости и формулировки',
    ],
  },
  {
    text: 'Твой самый сильный вклад в команду — это…',
    options: [
      'Быстро запустить и проверить на практике',
      'Сделать материал понятным и готовым к использованию',
      'Выстроить процесс и не дать сбиться с курса',
      'Поддержать людей и удержать рабочую атмосферу',
    ],
  },
  {
    text: 'Когда что-то идёт не так, ты сначала…',
    options: [
      'Переосмысливаешь задачу и исходные допущения',
      'Пробуешь другой рабочий вариант прямо сейчас',
      'Пересобираешь этапы и ближайшие шаги',
      'Собираешь людей и проясняешь ожидания',
    ],
  },
  {
    text: 'Коллеги чаще всего приходят к тебе за…',
    options: [
      'Готовой структурой, схемой или текстом',
      'Практическим приёмом, который уже работает',
      'Поддержкой и советом «как быть с людьми»',
      'Помощью договориться и снять напряжение',
    ],
  },
  {
    text: 'Идеальный рабочий день для тебя — это…',
    options: [
      'Глубоко разобраться в важном вопросе',
      'Чётко пройти маршрут от плана к результату',
      'Запустить несколько живых проб и увидеть эффект',
      'Создать спокойную и поддерживающую среду',
    ],
  },
] as const;

export type RoleKey =
  | 'meaning_researcher'
  | 'practice_realizer'
  | 'communication_guide'
  | 'content_packer'
  | 'process_navigator'
  | 'environment_keeper';

const OPTION_TO_ROLE: RoleKey[][] = [
  ['meaning_researcher', 'practice_realizer', 'communication_guide', 'process_navigator'],
  ['meaning_researcher', 'communication_guide', 'environment_keeper', 'content_packer'],
  ['practice_realizer', 'content_packer', 'process_navigator', 'environment_keeper'],
  ['meaning_researcher', 'practice_realizer', 'process_navigator', 'communication_guide'],
  ['content_packer', 'practice_realizer', 'environment_keeper', 'communication_guide'],
  ['meaning_researcher', 'process_navigator', 'practice_realizer', 'environment_keeper'],
];

const ROLE_PRIORITY: RoleKey[] = [
  'practice_realizer',
  'meaning_researcher',
  'communication_guide',
  'content_packer',
  'process_navigator',
  'environment_keeper',
];

export const ROLE_CATALOG: Array<{
  roleKey: RoleKey;
  name: string;
  quadrant: string;
  essence: string;
  inClass: string;
  keywords: string;
}> = [
  {
    roleKey: 'practice_realizer',
    name: 'Реализатор практики',
    quadrant: 'Лидерский · Действия',
    essence: 'Человек действия. Быстро превращает идею в работающий процесс.',
    inClass: 'Ты первый пробуешь новые форматы и адаптируешь их под своих детей.',
    keywords: 'пробовать · собирать · сделать · запустить · применить',
  },
  {
    roleKey: 'meaning_researcher',
    name: 'Исследователь смыслов',
    quadrant: 'Лидерский · Мышление',
    essence: 'Ищет «зачем» раньше «как». Держит глубину и помогает не сваливаться в суету.',
    inClass: 'Ты возвращаешь класс к смыслу задания.',
    keywords: 'зачем · смысл · вопрос · понять · разобраться',
  },
  {
    roleKey: 'communication_guide',
    name: 'Проводник коммуникации',
    quadrant: 'Лидерский · Люди',
    essence: 'Связывает людей и разговоры, создаёт пространство для диалога.',
    inClass: 'Ты умеешь включить тихих и охладить конфликт.',
    keywords: 'связать · услышать · договориться · диалог · включить',
  },
  {
    roleKey: 'content_packer',
    name: 'Упаковщик содержания',
    quadrant: 'Организационный · Мышление',
    essence: 'Делает сложное понятным: схемы, инструкции, упаковка.',
    inClass: 'У тебя появляются схемы и чек-листы, которыми можно пользоваться.',
    keywords: 'структура · схема · инструкция · ясность · упаковать',
  },
  {
    roleKey: 'process_navigator',
    name: 'Навигатор процесса',
    quadrant: 'Организационный · Действия',
    essence: 'Держит ритм и этапы от старта до финиша.',
    inClass: 'Урок и проекты идут по понятным этапам.',
    keywords: 'план · этап · ритм · маршрут · довести',
  },
  {
    roleKey: 'environment_keeper',
    name: 'Хранитель среды',
    quadrant: 'Организационный · Люди',
    essence: 'Заботится об атмосфере, устойчивости и безопасности.',
    inClass: 'В твоём классе безопасно ошибаться.',
    keywords: 'атмосфера · забота · устойчивость · правила · поддержка',
  },
];

export function scoreRoleClient(roleAnswers: number[]): RoleKey {
  const scores: Record<RoleKey, number> = {
    meaning_researcher: 0,
    practice_realizer: 0,
    communication_guide: 0,
    content_packer: 0,
    process_navigator: 0,
    environment_keeper: 0,
  };
  roleAnswers.forEach((optionIndex, qIndex) => {
    scores[OPTION_TO_ROLE[qIndex][optionIndex]] += 1;
  });
  let best = ROLE_PRIORITY[0];
  let bestScore = -1;
  for (const key of ROLE_PRIORITY) {
    if (scores[key] > bestScore) {
      bestScore = scores[key];
      best = key;
    }
  }
  return best;
}
