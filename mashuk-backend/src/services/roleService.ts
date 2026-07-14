export const ROLE_KEYS = [
  'meaning_researcher',
  'practice_realizer',
  'communication_guide',
  'content_packer',
  'process_navigator',
  'environment_keeper',
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

/** Option index 0..3 maps to role keys for each diagnostic question */
export const DEFAULT_OPTION_TO_ROLE: RoleKey[][] = [
  // Q1: When you take on a new task, what do you do first?
  ['meaning_researcher', 'practice_realizer', 'communication_guide', 'process_navigator'],
  // Q2: In a difficult conversation you usually...
  ['meaning_researcher', 'communication_guide', 'environment_keeper', 'content_packer'],
  // Q3: Your strongest contribution to a team is...
  ['practice_realizer', 'content_packer', 'process_navigator', 'environment_keeper'],
  // Q4: When something fails you first...
  ['meaning_researcher', 'practice_realizer', 'process_navigator', 'communication_guide'],
  // Q5: Colleagues come to you for...
  ['content_packer', 'practice_realizer', 'environment_keeper', 'communication_guide'],
  // Q6: Ideal workday looks like...
  ['meaning_researcher', 'process_navigator', 'practice_realizer', 'environment_keeper'],
];

/** @deprecated use DEFAULT_OPTION_TO_ROLE */
const OPTION_TO_ROLE = DEFAULT_OPTION_TO_ROLE;

export type RoleDiagnosticsConfig = {
  optionToRole: RoleKey[][];
  questions?: Array<{ text: string; options: string[] }>;
};

export function normalizeOptionToRole(raw: unknown): RoleKey[][] {
  if (!Array.isArray(raw) || raw.length !== 6) return DEFAULT_OPTION_TO_ROLE.map(row => [...row]);
  const out: RoleKey[][] = [];
  for (let i = 0; i < 6; i++) {
    const row = raw[i];
    if (!Array.isArray(row) || row.length !== 4) return DEFAULT_OPTION_TO_ROLE.map(r => [...r]);
    const mapped = row.map((k) => {
      const key = String(k) as RoleKey;
      return (ROLE_KEYS as readonly string[]).includes(key) ? key : null;
    });
    if (mapped.some(k => !k)) return DEFAULT_OPTION_TO_ROLE.map(r => [...r]);
    out.push(mapped as RoleKey[]);
  }
  return out;
}

export function getDefaultDiagnosticsConfig(): RoleDiagnosticsConfig {
  return {
    optionToRole: DEFAULT_OPTION_TO_ROLE.map(r => [...r]),
    questions: DIAGNOSTIC_QUESTIONS.map(q => ({ text: q.text, options: [...q.options] })),
  };
}

export const ROLE_PRIORITY: RoleKey[] = [
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
  sortOrder: number;
}> = [
  {
    roleKey: 'practice_realizer',
    name: 'Реализатор практики',
    quadrant: 'Лидерский · Действия',
    essence: 'Человек действия. Быстро превращает идею в работающий процесс. Смыслы держит в голове, но говорит через практику: «А давайте попробуем так».',
    inClass: 'Ты первый пробуешь новые форматы. Не ждёшь методичек — собираешь урок из того, что уже работает у других, и адаптируешь под своих детей.',
    keywords: 'пробовать · собирать · сделать · запустить · применить',
    sortOrder: 1,
  },
  {
    roleKey: 'meaning_researcher',
    name: 'Исследователь смыслов',
    quadrant: 'Лидерский · Мышление',
    essence: 'Ищет «зачем» раньше «как». Задаёт неудобные вопросы, держит глубину и помогает другим не сваливаться в суету.',
    inClass: 'Ты возвращаешь класс к смыслу задания. Помогаешь ученикам понять, зачем им это, а не только как выполнить.',
    keywords: 'зачем · смысл · вопрос · понять · разобраться',
    sortOrder: 2,
  },
  {
    roleKey: 'communication_guide',
    name: 'Проводник коммуникации',
    quadrant: 'Лидерский · Люди',
    essence: 'Связывает людей и разговоры. Видит, кого надо услышать, и создаёт пространство для диалога.',
    inClass: 'Ты умеешь включить тихих и охладить конфликт. Класс работает как команда, а не как набор одиночек.',
    keywords: 'связать · услышать · договориться · диалог · включить',
    sortOrder: 3,
  },
  {
    roleKey: 'content_packer',
    name: 'Упаковщик содержания',
    quadrant: 'Организационный · Мышление',
    essence: 'Делает сложное понятным. Структурирует материал, пишет инструкции, собирает «упаковку», которой можно пользоваться.',
    inClass: 'У тебя появляются схемы, чек-листы и памятки. Ученики знают, куда смотреть и как двигаться дальше.',
    keywords: 'структура · схема · инструкция · ясность · упаковать',
    sortOrder: 4,
  },
  {
    roleKey: 'process_navigator',
    name: 'Навигатор процесса',
    quadrant: 'Организационный · Действия',
    essence: 'Держит ритм и этапы. Видит маршрут от старта до финиша и не даёт команде потеряться.',
    inClass: 'Урок и проекты идут по понятным этапам. Ты заранее продумываешь переходы и дедлайны.',
    keywords: 'план · этап · ритм · маршрут · довести',
    sortOrder: 5,
  },
  {
    roleKey: 'environment_keeper',
    name: 'Хранитель среды',
    quadrant: 'Организационный · Люди',
    essence: 'Заботится об атмосфере и устойчивости. Замечает выгорание, поддерживает правила и психологическую безопасность.',
    inClass: 'В твоём классе безопасно ошибаться. Ты следишь за тоном, ритуалами и тем, чтобы никто не выпадал.',
    keywords: 'атмосфера · забота · устойчивость · правила · поддержка',
    sortOrder: 6,
  },
];

export const DIAGNOSTIC_QUESTIONS: Array<{ text: string; options: string[] }> = [
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
];

export const GOAL_QUESTIONS = [
  'С какой целью ты приехал на Машук?',
  'Что ты хочешь получить от программы?',
  'Какой запрос ты хочешь принести своему направлению?',
  'Что для тебя было бы главным результатом этих 8 дней?',
  'Что ты ожидаешь от других участников?',
] as const;

export const INTEREST_GROUPS: Array<{ title: string; tags: string[] }> = [
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
];

export function scorePedagogicalRole(
  roleAnswers: number[],
  optionToRole: RoleKey[][] = DEFAULT_OPTION_TO_ROLE,
): RoleKey {
  if (!Array.isArray(roleAnswers) || roleAnswers.length !== 6) {
    throw new Error('roleAnswers must contain 6 option indices');
  }

  const matrix = normalizeOptionToRole(optionToRole);

  const scores: Record<RoleKey, number> = {
    meaning_researcher: 0,
    practice_realizer: 0,
    communication_guide: 0,
    content_packer: 0,
    process_navigator: 0,
    environment_keeper: 0,
  };

  roleAnswers.forEach((optionIndex, qIndex) => {
    const map = matrix[qIndex];
    if (!map || optionIndex < 0 || optionIndex > 3) {
      throw new Error(`Invalid role answer at question ${qIndex + 1}`);
    }
    scores[map[optionIndex]] += 1;
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

export function getRoleMeta(roleKey: string) {
  return ROLE_CATALOG.find(r => r.roleKey === roleKey) ?? null;
}
