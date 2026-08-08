export type GoalAnswerType = 'open' | 'choice' | 'multi';

export type GoalShowWhen = {
  questionId: string;
  options: string[];
};

export type GoalQuestion = {
  id: string;
  text: string;
  type: GoalAnswerType;
  options: string[];
  allowOther?: boolean;
  otherLabel?: string;
  showWhen?: GoalShowWhen | null;
};

export {
  GOAL_MULTI_SEP,
  GOAL_OTHER_VALUE,
  coerceGoalQuestions,
  parseMultiGoalAnswer,
  joinMultiGoalAnswer,
  isGoalQuestionVisible,
  pruneHiddenGoalAnswers,
  visibleGoalQuestionsFilled,
  isOtherGoalAnswer,
} from './goalQuestions';

import { coerceGoalQuestions as coerceGQ } from './goalQuestions';

export const GOAL_QUESTIONS: GoalQuestion[] = coerceGQ(null);

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
    text: 'Ты приходишь на незнакомое образовательное событие. Что ты, скорее всего, сделаешь сначала?',
    options: [
      'Постараюсь понять, какие главные вопросы и смыслы стоят за программой.',
      'Посмотрю, как организованы материалы и что стоит сразу зафиксировать.',
      'Найду возможность быстро включиться в конкретную задачу.',
      'Разберусь, как устроен день и где находятся ключевые точки программы.',
      'Начну знакомиться и выяснять, с кем у нас могут быть общие интересы.',
      'Обращу внимание, кому тоже трудно сориентироваться, и постараюсь поддержать.',
    ],
  },
  {
    text: 'В выступлении прозвучало много мыслей. Что тебе ближе?',
    options: [
      'Собрать ключевые тезисы в понятную схему.',
      'Выбрать одну идею и сразу подумать, как ее проверить на практике.',
      'Понять, какое место эта тема занимает в общей логике программы.',
      'Обсудить услышанное с другими и сопоставить позиции.',
      'Обратить внимание, как группа реагирует и кому важно дать пространство высказаться.',
      'Найти неожиданную связь, скрытый вопрос или новую возможность для размышления.',
    ],
  },
  {
    text: 'Группа не понимает, с чего начать работу. Твой первый импульс?',
    options: [
      'Предложить минимальный шаг, который можно сделать прямо сейчас.',
      'Уточнить цель и выстроить последовательность действий.',
      'Запустить обсуждение, чтобы услышать разные предложения.',
      'Проверить, все ли чувствуют себя включенными и готовы предлагать идеи.',
      'Сформулировать вопрос, который поможет иначе посмотреть на задачу.',
      'Собрать прозвучавшие идеи в несколько понятных направлений.',
    ],
  },
  {
    text: 'Ты услышал(а) полезную идею. Что обычно происходит дальше?',
    options: [
      'Определяю, где она находится в общей логике и какой этап должен быть следующим.',
      'Ищу человека, с которым полезно это обсудить или объединить усилия.',
      'Думаю, кому эта идея может быть полезна и как помочь ей найти применение.',
      'Начинаю искать, какие новые вопросы, связи или возможности она открывает.',
      'Перевожу идею в понятную формулировку, схему или краткий вывод.',
      'Выбираю конкретное действие, на котором можно ее проверить.',
    ],
  },
  {
    text: 'В обсуждении возникла пауза. Что тебе ближе сделать?',
    options: [
      'Задать вопрос, который поможет участникам вступить в разговор.',
      'Обратить внимание на атмосферу и не торопить тех, кому нужно время.',
      'Использовать паузу, чтобы сформулировать более точный вопрос или заметить то, что осталось неочевидным.',
      'Кратко собрать уже прозвучавшее, чтобы стало понятнее, куда двигаться дальше.',
      'Предложить небольшой практический шаг вместо продолжения разговора.',
      'Напомнить о цели и обозначить следующий этап обсуждения.',
    ],
  },
  {
    text: 'Как ты чаще всего понимаешь ценность целого образовательного дня?',
    options: [
      'По тому, насколько участники чувствовали себя включенными и принятыми.',
      'По тому, какие новые вопросы, идеи или связи я обнаружил(а).',
      'По тому, удалось ли выделить и понятно зафиксировать главное.',
      'По тому, что я попробовал(а) сделать или изменить на практике.',
      'По тому, насколько понятным был маршрут и удалось ли двигаться к цели.',
      'По новым разговорам, совместным решениям и взаимопониманию.',
    ],
  },
  {
    text: 'Ты замечаешь трудность в совместной работе. Что ты скорее сделаешь?',
    options: [
      'Попытаюсь понять, что именно мы не замечаем или неверно понимаем.',
      'Предложу конкретное действие, которое поможет сдвинуться с места.',
      'Организую разговор между теми, чьи позиции важно соединить.',
      'Соберу разные точки зрения в понятную картину и помогу выделить главное.',
      'Обращу внимание на напряжение и на тех, чей голос сейчас не слышен.',
      'Помогу договориться о следующих шагах, ролях и точке следующей сверки.',
    ],
  },
  {
    text: 'Какой вклад в образовательную программу тебе хотелось бы внести в первую очередь?',
    options: [
      'Помочь участникам видеть общий маршрут и не терять цель.',
      'Поддержать атмосферу, в которой люди могут быть включенными и настоящими.',
      'Сделать сложное содержание понятным и передаваемым.',
      'Соединить людей и запустить полезные разговоры.',
      'Превратить идеи программы в реальные действия.',
      'Открыть новые вопросы, смыслы и возможности.',
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
  ['meaning_researcher', 'content_packer', 'practice_realizer', 'process_navigator', 'communication_guide', 'environment_keeper'],
  ['content_packer', 'practice_realizer', 'process_navigator', 'communication_guide', 'environment_keeper', 'meaning_researcher'],
  ['practice_realizer', 'process_navigator', 'communication_guide', 'environment_keeper', 'meaning_researcher', 'content_packer'],
  ['process_navigator', 'communication_guide', 'environment_keeper', 'meaning_researcher', 'content_packer', 'practice_realizer'],
  ['communication_guide', 'environment_keeper', 'meaning_researcher', 'content_packer', 'practice_realizer', 'process_navigator'],
  ['environment_keeper', 'meaning_researcher', 'content_packer', 'practice_realizer', 'process_navigator', 'communication_guide'],
  ['meaning_researcher', 'practice_realizer', 'communication_guide', 'content_packer', 'environment_keeper', 'process_navigator'],
  ['process_navigator', 'environment_keeper', 'content_packer', 'communication_guide', 'practice_realizer', 'meaning_researcher'],
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

export function scoreRoleClient(
  roleAnswers: number[],
  optionToRole: RoleKey[][] = OPTION_TO_ROLE,
): RoleKey {
  const matrix = optionToRole.length === roleAnswers.length ? optionToRole : OPTION_TO_ROLE;
  const scores: Record<RoleKey, number> = {
    meaning_researcher: 0,
    practice_realizer: 0,
    communication_guide: 0,
    content_packer: 0,
    process_navigator: 0,
    environment_keeper: 0,
  };
  roleAnswers.forEach((optionIndex, qIndex) => {
    const row = matrix[qIndex];
    if (!row || optionIndex < 0 || optionIndex >= row.length) return;
    scores[row[optionIndex]] += 1;
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
