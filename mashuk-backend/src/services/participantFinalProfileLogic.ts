/**
 * Чистые правила итогового профиля участника (ТЗ §3–4).
 * Без БД — удобно тестировать фильтры, критерий, темы, ранги.
 */

export type ProfileZone = 'Подъём' | 'Включение' | 'Нейтраль' | 'Усталость' | 'Риск';

export type FinalProfile = {
  person: {
    name: string;
    direction: string;
    shift: string;
    group: string;
    from: string;
    to: string;
    days: number;
  };
  pointA: { q: string; a: string }[];
  pointB: (string | null)[];
  criterion: {
    text: string;
    target: number | null;
    found: { name: string; src: string }[];
  } | null;
  participation: { day: number; done: number | null; total: number | null }[];
  state: { day: number; morning?: ProfileZone; day_?: ProfileZone; evening?: ProfileZone }[];
  roles: { day: number; role: string; result: string | null }[];
  kopilka: {
    total: number;
    thought: number;
    idea: number;
    toWork: number;
    later: number;
    contacts: number;
    picked: { text: string; src: string; tag: string }[];
    themes: { name: string; n: number }[];
  };
  reflection: {
    total: number;
    transfer: number;
    self: number;
    thesis: number;
    reaction: number;
    best: { event: string; text: string }[];
  };
  contribution: {
    answers: number;
    questions: number;
    peopleReached: number;
    expRank: string;
    bestAnswer: string;
  };
  context: {
    dirName: string;
    dirPoints: number | null;
    dirOwn: number | null;
    dirKop: number | null;
  };
  nextStep: string | null;
  nextStepWhen: string | null;
};

export type ProfileMode = 'full' | 'short' | 'brief' | 'trace';

export const KOPILKA_STOP_LIST = new Set(['.', '-', '+', 'нет', 'ок']);

/** Темы копилки — словарная рубрикация (педагогический запрос). */
export const PROFILE_PIGGY_THEMES: Array<{ name: string; keywords: string[] }> = [
  {
    name: 'Наставничество и работа с молодыми педагогами',
    keywords: ['наставник', 'наставничеств', 'молодой педагог', 'молодых педагог', 'ментор', 'кураторств'],
  },
  {
    name: 'Воспитательные практики и ценности',
    keywords: ['воспитат', 'ценност', 'урок о важн', 'памят', 'нравствен', 'патриот'],
  },
  {
    name: 'Форматы занятий и мастер-классов',
    keywords: ['формат', 'мастер-класс', 'мастер класс', 'открытый урок', 'заняти', 'урок', 'практик'],
  },
  {
    name: 'Работа с родителями и семьёй',
    keywords: ['родител', 'семь', 'семьи', 'родительск'],
  },
  {
    name: 'Мотивация и осмысленность обучения',
    keywords: ['мотивац', 'осмыслен', 'оценк', 'интерес ученик', 'вовлечен'],
  },
  {
    name: 'Командная работа педагогов',
    keywords: ['команд', 'коллег', 'педсовет', 'методич', 'сотрудничеств'],
  },
  {
    name: 'Проектная и исследовательская работа',
    keywords: ['проект', 'исследовател', 'исследован'],
  },
  {
    name: 'Игровые практики',
    keywords: ['игр', 'геймиф', 'игропрактик'],
  },
  {
    name: 'Цифровая среда',
    keywords: ['цифр', 'онлайн', 'платформ', 'бот', 'прилож'],
  },
  {
    name: 'Классное руководство',
    keywords: ['классн', 'классрук', 'руководств класс'],
  },
];

export function clampText(s: string | null | undefined, n = 320): string {
  const t = String(s || '').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n).replace(/\s+\S*$/, '')}…`;
}

export function isKopilkaTrash(text: string | null | undefined): boolean {
  const t = String(text || '').trim();
  if (!t) return true;
  if (t.length < 8) return true;
  return KOPILKA_STOP_LIST.has(t.toLowerCase());
}

export function isKopilkaContact(tags: string[]): boolean {
  return tags.some(t => String(t).trim().toLowerCase() === 'контакт');
}

export type PiggyRow = {
  text: string;
  source?: string | null;
  tags: string[];
  createdAt?: Date | null;
  forumDay?: number | null;
};

export function filterProfilePiggy(
  rows: PiggyRow[],
  isAuto: (text: string) => boolean,
): {
  total: number;
  usable: PiggyRow[];
  contacts: number;
  thought: number;
  idea: number;
  toWork: number;
  later: number;
  picked: { text: string; src: string; tag: string }[];
} {
  const total = rows.length;
  let contacts = 0;
  const usable: PiggyRow[] = [];
  for (const row of rows) {
    if (isAuto(row.text)) continue;
    if (isKopilkaContact(row.tags)) {
      contacts += 1;
      continue;
    }
    if (isKopilkaTrash(row.text)) continue;
    usable.push(row);
  }

  let thought = 0;
  let idea = 0;
  let toWork = 0;
  let later = 0;
  for (const row of usable) {
    const set = new Set(row.tags.map(t => t.trim().toLowerCase()));
    if (set.has('мысль') || set.has('вопрос')) thought += 1;
    if (set.has('идея')) idea += 1;
    if (set.has('в работу')) toWork += 1;
    if (set.has('на будущее')) later += 1;
  }

  const pickTags = ['в работу', 'на будущее', 'идея'] as const;
  const picked = usable
    .map(row => {
      const set = new Set(row.tags.map(t => t.trim().toLowerCase()));
      const tag = pickTags.find(t => set.has(t));
      if (!tag) return null;
      return {
        text: clampText(row.text, 260),
        src: (row.source || 'Своя мысль').trim() || 'Своя мысль',
        tag,
        createdAt: row.createdAt?.getTime() ?? 0,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 6)
    .map(({ text, src, tag }) => ({ text, src, tag }));

  return { total, usable, contacts, thought, idea, toWork, later, picked };
}

export function classifyPiggyThemes(
  texts: string[],
  limit = 3,
): { name: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const raw of texts) {
    const t = raw.toLowerCase();
    for (const theme of PROFILE_PIGGY_THEMES) {
      if (theme.keywords.some(k => t.includes(k))) {
        counts.set(theme.name, (counts.get(theme.name) || 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ru'))
    .slice(0, limit);
}

/** Число из ответа входной анкеты («найду 5 форматов»). */
export function extractCriterionTarget(text: string | null | undefined): number | null {
  const t = String(text || '');
  const m = t.match(/(?:^|[^\d])(\d{1,2})(?:[^\d]|$)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1 || n > 30) return null;
  return n;
}

export function pickCriterionAnswer(
  pointA: { q: string; a: string }[],
): { text: string; target: number } | null {
  for (const item of pointA) {
    const target = extractCriterionTarget(item.a);
    if (target != null) {
      return { text: item.a.trim(), target };
    }
  }
  return null;
}

export function resolveExpRank(
  experiencePoints: number,
  cohortPoints: number[],
): string {
  const valid = cohortPoints.filter(n => Number.isFinite(n)).sort((a, b) => b - a);
  if (valid.length < 8 || experiencePoints <= 0) return '';
  const better = valid.filter(n => n > experiencePoints).length;
  const rank = better + 1; // 1 = лучший
  const fromTop = rank / valid.length;
  if (fromTop <= 0.1) return 'верхние 10%';
  if (fromTop <= 0.25) return 'верхние 25%';
  return '';
}

export function mapExperimentResult(
  status: string | null | undefined,
  freeText: string | null | undefined,
): string | null {
  const text = String(freeText || '').trim();
  if (text) {
    const low = text.toLowerCase();
    if (/не\s+получ.*попроб|не\s+успел|не\s+успела|не\s+попробов/.test(low)) {
      return 'Не получилось попробовать';
    }
    if (/непривычн/.test(low) && /получал|получил|получилось/.test(low)) {
      return 'Получилось, но было непривычно';
    }
    if (/естественн/.test(low) || (/получал|получил|получилось/.test(low) && !/не\s+полу/.test(low))) {
      if (/непривычн/.test(low)) return 'Получилось, но было непривычно';
      return 'Получилось естественно';
    }
    return clampText(text, 80);
  }
  switch (String(status || '').toLowerCase()) {
    case 'done':
      return 'Получилось естественно';
    case 'none':
      return 'Не получилось попробовать';
    case 'in_progress':
      return null;
    default:
      return null;
  }
}

export function profileDensity(input: {
  stateDays: number;
  reflectionTotal: number;
  kopilkaTotal: number;
  contributionAnswers: number;
}): { density: number; mode: ProfileMode } {
  const density = [
    input.stateDays > 0,
    input.reflectionTotal > 0,
    input.kopilkaTotal > 0,
    input.contributionAnswers > 0,
  ].filter(Boolean).length;
  const mode: ProfileMode =
    density >= 3 ? 'full' : density === 2 ? 'short' : density === 1 ? 'brief' : 'trace';
  return { density, mode };
}

export function formatRuDayMonth(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Moscow',
  });
}

export function shiftDateRange(
  startDate: Date | null | undefined,
  totalDays: number,
): { from: string; to: string; days: number } {
  const days = Math.max(1, Math.min(14, totalDays || 8));
  if (!startDate || Number.isNaN(startDate.getTime())) {
    return { from: 'день 1', to: `день ${days}`, days };
  }
  const end = new Date(startDate.getTime());
  end.setUTCDate(end.getUTCDate() + (days - 1));
  return {
    from: formatRuDayMonth(startDate),
    to: formatRuDayMonth(end),
    days,
  };
}

export function emptyParticipation(days = 8): FinalProfile['participation'] {
  return Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    done: null,
    total: null,
  }));
}

export function emptyState(days = 8): FinalProfile['state'] {
  return Array.from({ length: days }, (_, i) => ({ day: i + 1 }));
}
