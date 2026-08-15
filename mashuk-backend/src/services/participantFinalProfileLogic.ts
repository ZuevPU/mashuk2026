/**
 * Чистые правила итогового профиля участника (ТЗ §3–4).
 * Без БД — удобно тестировать фильтры, критерий, темы, ранги.
 */

export type ProfileZone = 'Подъём' | 'Включение' | 'Нейтраль' | 'Усталость' | 'Риск';

export type FinalProfileQa = {
  q: string;
  a: string;
  kind?: 'open' | 'closed';
  key?: string;
};

export type PointATopic = 'goal' | 'result' | 'criterion' | 'role' | 'request' | 'other';

export type PointCompareRow = {
  topic: PointATopic;
  qA: string;
  aA: string;
  qB: string | null;
  aB: string | null;
};

export type FinalProfileTheme = {
  name: string;
  n: number;
  quote: string | null;
  note: string | null;
  tag: string | null;
};

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
  updatedAt: string;
  startRole: string | null;
  snapshot: {
    touchpointsDone: number;
    touchpointsTotal: number;
    reflections: number;
    roleTries: number;
    roleDone: number;
  };
  pointA: FinalProfileQa[];
  pointB: {
    completed: boolean;
    items: FinalProfileQa[];
    leftover: FinalProfileQa[];
    goalOutcome: string | null;
    goalFollowup: string | null;
    roleNatural: string | null;
    roleInsight: string | null;
    plan: string | null;
    planWhen: string | null;
  };
  compare: PointCompareRow[];
  criterion: {
    text: string;
    target: number | null;
    found: { name: string; src: string }[];
    met: boolean;
    note: string | null;
  } | null;
  participation: { day: number; done: number | null; total: number | null }[];
  state: { day: number; morning?: ProfileZone; day_?: ProfileZone; evening?: ProfileZone }[];
  energy: { day: number; value: number | null }[];
  roles: { day: number; role: string; result: string | null; comment: string | null }[];
  kopilka: {
    total: number;
    thought: number;
    idea: number;
    toWork: number;
    later: number;
    contacts: number;
    picked: { text: string; src: string; tag: string }[];
    themes: FinalProfileTheme[];
    otherCount: number;
  };
  reflection: {
    total: number;
    transfer: number;
    self: number;
    thesis: number;
    reaction: number;
    best: { event: string; text: string }[];
    items: { event: string; text: string }[];
    theses: { day: number; thesis: string | null; change: string | null }[];
  };
  goalMid: {
    changed: string | null;
    scale: number | null;
    note: string | null;
  } | null;
  nextStep: string | null;
  nextStepWhen: string | null;
  ai: {
    roles: string;
    reflection: string;
    theses: string;
    closing: string;
  };
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

export function emptyEnergy(days = 8): FinalProfile['energy'] {
  return Array.from({ length: days }, (_, i) => ({ day: i + 1, value: null }));
}

const REACTION_ONLY = /^(очень\s+)?(класс|круто|супер|интересно|понравилось|спасибо|ок|хорошо|отлично|норм|вау)[!.,\s]*$/i;
const HAS_SUBJECT = /игр|практик|формат|приём|прием|метод|роль|дет|урок|занят|ценност|идея|подход|инструмент|квиз|мастер/i;
const HAS_ACTION = /сделаю|попробую|внедрю|хочу|буду|планирую|возьму|перенес|применю|введ/i;
const HAS_SELF = /\bя\b|мне |мой |моя |моё |мое /i;

/** Правило отбора содержательных осмыслений из макета v2.6. */
export function isSubstantiveReflection(text: string | null | undefined): boolean {
  const t = String(text || '').trim();
  if (t.length < 20) return false;
  const compact = t.toLowerCase().replace(/\s+/g, ' ').trim();
  if (REACTION_ONLY.test(compact)) return false;
  if (/^(очень\s+)?(класс|интересно|понравилось|круто)/i.test(t) && t.length < 40 && !HAS_SUBJECT.test(t)) {
    return false;
  }
  if (HAS_ACTION.test(t) || (HAS_SUBJECT.test(t) && t.length >= 30)) return true;
  if (HAS_SELF.test(t) && t.length >= 40) return true;
  return t.length >= 50;
}

export function classifyPiggyThemesDetailed(
  rows: { text: string; tags: string[] }[],
  limit = 3,
): { themes: FinalProfileTheme[]; otherCount: number } {
  const buckets = new Map<string, { texts: string[]; tags: string[] }>();
  let assigned = 0;
  for (const row of rows) {
    const t = row.text.toLowerCase();
    const hit = PROFILE_PIGGY_THEMES.find(theme => theme.keywords.some(k => t.includes(k)));
    if (!hit) continue;
    const b = buckets.get(hit.name) || { texts: [], tags: [] };
    b.texts.push(row.text);
    b.tags.push(...row.tags);
    buckets.set(hit.name, b);
    assigned += 1;
  }
  const themes = [...buckets.entries()]
    .map(([name, b]) => {
      const quote = b.texts.slice().sort((a, c) => c.length - a.length)[0] || null;
      const tagCounts = new Map<string, number>();
      for (const tag of b.tags) {
        const k = tag.trim().toLowerCase();
        if (!k) continue;
        tagCounts.set(k, (tagCounts.get(k) || 0) + 1);
      }
      const tag = [...tagCounts.entries()].sort((a, c) => c[1] - a[1])[0]?.[0] || null;
      return {
        name,
        n: b.texts.length,
        quote: quote ? clampText(quote, 180) : null,
        note: themeNote(name, b.texts.length, tag),
        tag,
      };
    })
    .filter(t => t.n >= 2)
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ru'))
    .slice(0, limit);
  const shown = themes.reduce((s, t) => s + t.n, 0);
  return { themes, otherCount: Math.max(0, rows.length - shown) };
}

function themeNote(name: string, n: number, tag: string | null): string {
  const tagBit = tag ? ` чаще с тегом «${tag}»` : '';
  return `${n === 1 ? 'Одна запись' : `${n} записи`} темы «${name}»${tagBit}. Тема собрана по вашим формулировкам копилки, а не по отдельному вопросу анкеты.`;
}

export type PointBSlot =
  | 'goalOutcome'
  | 'goalFollowup'
  | 'roleNatural'
  | 'roleInsight'
  | 'plan'
  | 'planWhen'
  | 'other';

export function classifyPointBItem(q: string, a: string): PointBSlot {
  const qn = String(q || '').toLowerCase();
  const an = String(a || '').toLowerCase();
  if (/когда планир|48 час|14 дн|3 месяц|первых 48|ближайшие/.test(qn) || (/^(первые 48|ближайшие 14|ближайшие 3)/.test(an) && an.length < 80)) {
    return 'planWhen';
  }
  if (/перв(ого|ый) шаг|планируете использовать|как вы планир/.test(qn)) return 'plan';
  if (/естественн.*роль|ролью вам было|какой ролью/.test(qn)) return 'roleNatural';
  if (/способ.*действов|поняли о своём|поняли о своем|что вы поняли/.test(qn)) return 'roleInsight';
  if (/произошл.*цел|достиг\S* цел|цель изменил|уже не так важн/.test(qn)) return 'goalOutcome';
  if (/как звучит цель|что стало важнее|какой результат вы получили/.test(qn)) return 'goalFollowup';
  if (/достиг|цель изменилась|не так важна|не достиг/.test(an) && an.length < 90) return 'goalOutcome';
  return 'other';
}

/** Вопросы «первый шаг» / срок из итоговой анкеты — блок «Один шаг на 30 дней», не Точка Б. */
export function isNextStepPlanQuestion(q: string): boolean {
  const slot = classifyPointBItem(q, '');
  return slot === 'plan' || slot === 'planWhen';
}

export function pickNextStepFromQa(items: FinalProfileQa[]): {
  nextStep: string | null;
  nextStepWhen: string | null;
} {
  let nextStep: string | null = null;
  let nextStepWhen: string | null = null;
  for (const item of items) {
    const a = String(item.a || '').trim();
    if (!a) continue;
    const slot = classifyPointBItem(item.q, a);
    if (slot === 'planWhen') nextStepWhen = clampText(a, 120);
    else if (slot === 'plan') nextStep = clampText(a, 300);
  }
  return { nextStep, nextStepWhen };
}

export function assemblePointB(items: FinalProfileQa[]): FinalProfile['pointB'] {
  const out: FinalProfile['pointB'] = {
    completed: items.some(x => x.a.trim()),
    items,
    leftover: items,
    goalOutcome: null,
    goalFollowup: null,
    roleNatural: null,
    roleInsight: null,
    plan: null,
    planWhen: null,
  };
  for (const item of items) {
    const slot = classifyPointBItem(item.q, item.a);
    if (slot === 'other') continue;
    if (!out[slot]) out[slot] = clampText(item.a, 320);
  }
  return out;
}

export function classifyPointATopic(q: string): PointATopic {
  const t = String(q || '').toLowerCase();
  if (/критери|признак|пойм[её]шь/.test(t)) return 'criterion';
  if (/роль|способ.? действ/.test(t)) return 'role';
  if (/запрос|направлен/.test(t)) return 'request';
  if (/результат|получить от программ/.test(t)) return 'result';
  if (/цел[ьи]|зачем|приехал/.test(t)) return 'goal';
  return 'other';
}

const SLOT_FOR_TOPIC: Record<PointATopic, PointBSlot[]> = {
  goal: ['goalFollowup', 'goalOutcome', 'other'],
  result: ['goalOutcome', 'goalFollowup', 'other'],
  criterion: ['other', 'goalFollowup'],
  role: ['roleInsight', 'roleNatural'],
  request: ['other', 'plan', 'goalFollowup'],
  other: ['other', 'plan', 'goalFollowup'],
};

function topicTokens(s: string): Set<string> {
  return new Set(
    String(s || '')
      .toLowerCase()
      .split(/[^a-zа-яё0-9]+/i)
      .filter(w => w.length >= 4),
  );
}

function tokenOverlap(a: string, b: string): number {
  const left = topicTokens(a);
  const right = topicTokens(b);
  let n = 0;
  for (const t of left) {
    if (right.has(t)) n += 1;
  }
  return n;
}

export function pairPointAtoB(
  pointA: FinalProfileQa[],
  pointBItems: FinalProfileQa[],
): { pairs: PointCompareRow[]; leftoverB: FinalProfileQa[] } {
  const used = new Set<number>();
  const pairs: PointCompareRow[] = [];
  for (const a of pointA) {
    const topic = classifyPointATopic(a.q);
    const preferred = SLOT_FOR_TOPIC[topic];
    let best = -1;
    let bestScore = -1;
    pointBItems.forEach((b, i) => {
      if (used.has(i)) return;
      const slot = classifyPointBItem(b.q, b.a);
      if (slot === 'plan' || slot === 'planWhen') return;
      const pref = preferred.indexOf(slot);
      const slotScore = pref === -1 ? 0 : (preferred.length - pref) * 10;
      const textScore = tokenOverlap(`${a.q} ${a.a}`, `${b.q} ${b.a}`);
      const score = slotScore + textScore;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0 && bestScore >= 8) {
      used.add(best);
      const b = pointBItems[best];
      pairs.push({ topic, qA: a.q, aA: a.a, qB: b.q, aB: b.a });
    } else {
      pairs.push({ topic, qA: a.q, aA: a.a, qB: null, aB: null });
    }
  }
  return {
    pairs,
    leftoverB: pointBItems.filter((_, i) => !used.has(i)),
  };
}

export function assembleGoalMidFromQa(items: FinalProfileQa[]): FinalProfile['goalMid'] {
  if (!items.length) return null;
  let changed: string | null = null;
  let note: string | null = null;
  let scale: number | null = null;
  for (const item of items) {
    const n = Number(item.a);
    if (Number.isFinite(n) && n >= 1 && n <= 10 && scale == null) {
      scale = Math.round(n);
      continue;
    }
    const slot = classifyPointBItem(item.q, item.a);
    if ((slot === 'goalOutcome' || /изменил|уточн|цел/.test(item.q.toLowerCase())) && !changed) {
      changed = clampText(item.a, 240);
      continue;
    }
    if (!note && item.a.trim().length >= 8) note = clampText(item.a, 320);
  }
  if (!changed && !note && scale == null) return null;
  return { changed, scale, note };
}

export function buildProfileAiCopy(input: {
  roleComments: number;
  reflectionCount: number;
  thesisCount: number;
  touchDone: number;
  touchTotal: number;
  roles: string[];
  kopilkaTotal: number;
  toWork: number;
  themeNames: string[];
  pointBDone: boolean;
}): FinalProfile['ai'] {
  const roleArc = input.roles.length
    ? input.roles.join(' → ')
    : 'роль дня';
  const themes = input.themeNames.length
    ? input.themeNames.join(', ')
    : 'темы, которые вы поднимали чаще всего';
  return {
    roles: input.roleComments
      ? `За смену вы оставляли комментарии к ролевым пробам. Где-то рамка садилась сразу, где-то требовала усилия или смены. Ниже — ваши слова, не наша оценка.`
      : `Роль — рамка на один день, а не звание. Если комментариев к пробам ещё нет, здесь остаётся только то, какие роли вы брали и чем день закончился.`,
    reflection: input.reflectionCount
      ? `По текстам после блоков видно и пересказ содержания, и собственные формулировки. В профиль подняты только содержательные записи: где есть предмет (приём, тема, идея) или личное действие.`
      : `Содержательных осмыслений после блоков пока нет — в профиль не поднимаются короткие оценки без предмета: «класс», «интересно», «понравилось».`,
    theses: input.thesisCount
      ? `Вечерние тезисы и ответы «как изменилось понимание» складываются в одну линию: от того, что вы заметили снаружи, к тому, как вы сами действуете.`
      : `Когда появятся вечерние тезисы и ответы «как изменилось понимание», здесь будет короткая линия смены фокуса — без оценки и без сравнения с другими.`,
    closing: [
      input.touchTotal
        ? `За неделю вы закрыли ${input.touchDone} из ${input.touchTotal} точек маршрута и держались в контуре форума в те дни, когда ставили отметки.`
        : `Точки маршрута в этом профиле — про присутствие в контуре форума, а не про качество.`,
      input.roles.length
        ? `В ролевых экспериментах ваш путь: ${roleArc}. Это смена рамки, а не оценка «правильнее / хуже».`
        : `Ролевые пробы, если они были, показывают, какую рамку вы выбирали на день.`,
      input.kopilkaTotal
        ? `В копилке — ${input.kopilkaTotal} ${pluralRu(input.kopilkaTotal, 'запись', 'записи', 'записей')}, к переносу отмечено ${input.toWork}. Частые темы: ${themes}.`
        : `Копилка ещё не дала достаточно записей, чтобы собрать темы.`,
      input.pointBDone
        ? `Финальная анкета (точка Б) заполнена — к выводу добавлены цель и первый шаг.`
        : `Финальная анкета (точка Б) пока не пройдена — как только вы её заполните, этот вывод дополнится тем, что произошло с целью и какой первый шаг вы выбрали.`,
    ].join(' '),
  };
}

function pluralRu(n: number, a: string, b: string, c: string): string {
  const m = n % 100;
  const k = n % 10;
  if (m >= 11 && m <= 14) return c;
  if (k === 1) return a;
  if (k >= 2 && k <= 4) return b;
  return c;
}

export function emptyFinalProfile(): FinalProfile {
  return {
    person: {
      name: '',
      direction: '—',
      shift: 'Смена',
      group: '—',
      from: 'день 1',
      to: 'день 8',
      days: 8,
    },
    updatedAt: '',
    startRole: null,
    snapshot: {
      touchpointsDone: 0,
      touchpointsTotal: 0,
      reflections: 0,
      roleTries: 0,
      roleDone: 0,
    },
    pointA: [],
    pointB: {
      completed: false,
      items: [],
      leftover: [],
      goalOutcome: null,
      goalFollowup: null,
      roleNatural: null,
      roleInsight: null,
      plan: null,
      planWhen: null,
    },
    compare: [],
    criterion: null,
    participation: emptyParticipation(8),
    state: emptyState(8),
    energy: emptyEnergy(8),
    roles: [],
    kopilka: {
      total: 0,
      thought: 0,
      idea: 0,
      toWork: 0,
      later: 0,
      contacts: 0,
      picked: [],
      themes: [],
      otherCount: 0,
    },
    reflection: {
      total: 0,
      transfer: 0,
      self: 0,
      thesis: 0,
      reaction: 0,
      best: [],
      items: [],
      theses: [],
    },
    goalMid: null,
    nextStep: null,
    nextStepWhen: null,
    ai: { roles: '', reflection: '', theses: '', closing: '' },
  };
}
