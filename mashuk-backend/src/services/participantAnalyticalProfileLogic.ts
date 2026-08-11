/**
 * Аналитический профиль участника (Профиль 2) — структура и чистые правила нарратива.
 * Соответствует методологическому промпту: путь, смыслы, сильные стороны, рекомендации.
 */

import {
  PROFILE_PIGGY_THEMES,
  clampText,
  type ProfileZone,
} from './participantFinalProfileLogic.js';

export type AnalyticalProfile = {
  person: {
    name: string;
    direction: string;
    shift: string;
    group: string;
    from: string;
    to: string;
    days: number;
  };
  activity: {
    pathPoints: number;
    experiencePoints: number;
    touchpointsDone: number;
    touchpointsTotal: number;
    lastActiveAt: string | null;
    lastActivePhase: 'утро' | 'день' | 'вечер' | null;
    dirAvgPath: number | null;
    dirAvgExp: number | null;
  };
  exchange: {
    questionsCount: number;
    answersCount: number;
    questionSamples: string[];
    answerSamples: string[];
    themes: { name: string; n: number }[];
  };
  kopilka: {
    total: number;
    thought: number;
    idea: number;
    toWork: number;
    later: number;
    question: number;
    favoriteTags: { tag: string; n: number }[];
    quotes: { text: string; tag: string; src: string }[];
    themes: { name: string; n: number }[];
  };
  state: {
    days: {
      day: number;
      morning?: ProfileZone;
      day_?: ProfileZone;
      evening?: ProfileZone;
      reasons: string[];
    }[];
    zoneCounts: { zone: ProfileZone; n: number }[];
    topReasons: string[];
  };
  afterBlocks: {
    total: number;
    items: { event: string; text: string }[];
    themes: { name: string; n: number }[];
  };
  pointA: { q: string; a: string }[];
  nextStep: string | null;
  nextStepWhen: string | null;
  roles: { day: number; role: string; result: string | null }[];
  narrative: AnalyticalNarrative;
};

export type AnalyticalNarrative = {
  intro: string;
  path: string;
  meanings: string;
  strengths: { title: string; evidence: string }[];
  resume: string;
  closing: string;
  snapshot: {
    tags: string[];
    quotes: string[];
    energy: string;
  };
};

export function classifyThemes(texts: string[], limit = 5): { name: string; n: number }[] {
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

export function engagementLabel(input: {
  touchRatio: number | null;
  kopTotal: number;
  exchangeTotal: number;
  afterTotal: number;
}): string {
  const score =
    (input.touchRatio != null && input.touchRatio >= 0.7 ? 2 : input.touchRatio != null && input.touchRatio >= 0.4 ? 1 : 0)
    + (input.kopTotal >= 8 ? 2 : input.kopTotal >= 3 ? 1 : 0)
    + (input.exchangeTotal >= 3 ? 1 : 0)
    + (input.afterTotal >= 4 ? 1 : 0);
  if (score >= 5) return 'высокий уровень вовлечённости';
  if (score >= 3) return 'устойчивая вовлечённость';
  if (score >= 1) return 'избирательная вовлечённость';
  return 'спокойное, точечное участие';
}

export function dominantZone(zoneCounts: { zone: ProfileZone; n: number }[]): ProfileZone | null {
  if (!zoneCounts.length) return null;
  return [...zoneCounts].sort((a, b) => b.n - a.n)[0]?.zone ?? null;
}

export function energyDynamicsText(stateDays: AnalyticalProfile['state']['days']): string {
  const filled = stateDays.filter(s => s.morning || s.day_ || s.evening);
  if (!filled.length) return 'Динамика энергии в приложении почти не зафиксирована — состояние проживалось вне заметок.';

  const weight = (z?: ProfileZone) => {
    if (!z) return null;
    return ({ Подъём: 2, Включение: 1, Нейтраль: 0, Усталость: -1, Риск: -2 } as Record<ProfileZone, number>)[z];
  };
  let morning = 0; let evening = 0; let mc = 0; let ec = 0;
  let risk = 0; let rise = 0;
  for (const s of filled) {
    const mw = weight(s.morning);
    const ew = weight(s.evening);
    if (mw != null) { morning += mw; mc += 1; }
    if (ew != null) { evening += ew; ec += 1; }
    for (const z of [s.morning, s.day_, s.evening]) {
      if (z === 'Риск' || z === 'Усталость') risk += 1;
      if (z === 'Подъём' || z === 'Включение') rise += 1;
    }
  }
  if (mc && ec) {
    const md = morning / mc;
    const ed = evening / ec;
    if (md > ed + 0.45) {
      return 'Энергия чаще была выше утром и снижалась к вечеру — ресурс уходил в насыщенный день программы.';
    }
    if (ed > md + 0.45) {
      return 'К вечеру состояние часто становилось лучше утреннего — восстановление шло через общение и прожитые смыслы.';
    }
  }
  if (risk >= rise && risk >= 2) {
    return 'В динамике заметны зоны усталости и риска: участник честно фиксировал нагрузку и не маскировал спад.';
  }
  if (rise > risk) {
    return 'Преобладали зоны подъёма и включения: смена в целом давала заряд, а не истощение.';
  }
  return 'Эмоциональная кривая шла ровно, без резких провалов между утром и вечером.';
}

function joinThemes(themes: { name: string; n: number }[], limit = 3): string {
  const names = themes.slice(0, limit).map(t => t.name);
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} и ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}`;
}

function quoteOr(samples: string[], fallback: string): string {
  const q = samples.find(s => String(s || '').trim().length >= 20);
  return q ? `«${clampText(q, 160)}»` : fallback;
}

export function buildAnalyticalNarrative(input: Omit<AnalyticalProfile, 'narrative'>): AnalyticalNarrative {
  const touchRatio = input.activity.touchpointsTotal > 0
    ? input.activity.touchpointsDone / input.activity.touchpointsTotal
    : null;
  const engage = engagementLabel({
    touchRatio,
    kopTotal: input.kopilka.total,
    exchangeTotal: input.exchange.questionsCount + input.exchange.answersCount,
    afterTotal: input.afterBlocks.total,
  });

  const themePool = [
    ...input.kopilka.themes,
    ...input.exchange.themes,
    ...input.afterBlocks.themes,
  ];
  const themeMerged = new Map<string, number>();
  for (const t of themePool) {
    themeMerged.set(t.name, (themeMerged.get(t.name) || 0) + t.n);
  }
  const topThemes = [...themeMerged.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 4);
  const themesLine = joinThemes(topThemes);

  const pointALine = input.pointA[0]?.a
    ? `На входе звучало: «${clampText(input.pointA[0].a, 140)}».`
    : '';

  const introParts = [
    `${input.person.name} — участник направления «${input.person.direction}», группа ${input.person.group}.`,
    `По следам смены (${input.person.from} — ${input.person.to}) видно ${engage}.`,
    pointALine,
    themesLine
      ? `Сквозные темы участия: ${themesLine}.`
      : 'Сквозные темы ещё не успели сложиться в явный кластер — зато остались точечные наблюдения.',
  ].filter(Boolean);
  const intro = introParts.join(' ');

  const zone = dominantZone(input.state.zoneCounts);
  const energy = energyDynamicsText(input.state.days);
  const roleLine = input.roles.length
    ? `В ролевых экспериментах пробовали: ${[...new Set(input.roles.map(r => r.role))].slice(0, 4).join(', ')}.`
    : '';
  const afterLine = input.afterBlocks.items[0]
    ? `После блоков особенно откликнулось: ${quoteOr([input.afterBlocks.items[0].text], 'образовательные смыслы смены')} (${input.afterBlocks.items[0].event}).`
    : input.afterBlocks.total
      ? `Зафиксировано ${input.afterBlocks.total} осмыслений после образовательных блоков.`
      : 'Осмысления после блоков почти не оставляли следа в приложении — возможно, проживание шло устно.';
  const reasonsLine = input.state.topReasons.length
    ? `В причинах состояния чаще звучало: ${input.state.topReasons.slice(0, 3).map(r => `«${clampText(r, 80)}»`).join(', ')}.`
    : '';
  const path = [
    `Путь на форуме складывался из ежедневных отметок состояния, точек осмысления и практики.`,
    touchRatio != null
      ? `По точкам программы закрыто ${input.activity.touchpointsDone} из ${input.activity.touchpointsTotal} (${Math.round(touchRatio * 100)}%).`
      : 'Точки программы закрывались выборочно.',
    `Баллы «Путь»: ${input.activity.pathPoints}, «Опыт»: ${input.activity.experiencePoints}.`,
    input.activity.dirAvgPath != null
      ? `Для сравнения, среднее по направлению — ${Math.round(input.activity.dirAvgPath)} по «Пути» и ${Math.round(input.activity.dirAvgExp ?? 0)} по «Опыту».`
      : '',
    zone ? `В эмоциональной карте чаще встречалась зона «${zone}».` : '',
    energy,
    reasonsLine,
    roleLine,
    afterLine,
    input.activity.lastActiveAt
      ? `Последняя активность: ${input.activity.lastActiveAt}${input.activity.lastActivePhase ? ` (${input.activity.lastActivePhase})` : ''}.`
      : '',
  ].filter(Boolean).join(' ');

  const valuesHints: string[] = [];
  if (topThemes.some(t => /наставнич|молод/i.test(t.name))) valuesHints.push('забота о росте коллег');
  if (topThemes.some(t => /воспитат|ценност|патриот/i.test(t.name))) valuesHints.push('ценностная работа');
  if (topThemes.some(t => /цифр|ИИ|платформ/i.test(t.name))) valuesHints.push('открытость к новым инструментам');
  if (topThemes.some(t => /родител|семь/i.test(t.name))) valuesHints.push('внимание к семье и окружению ученика');
  if (topThemes.some(t => /мотивац|осмыслен/i.test(t.name))) valuesHints.push('поиск смысла в обучении');
  if (input.exchange.answersCount >= 2) valuesHints.push('готовность делиться опытом');
  if (input.kopilka.toWork + input.kopilka.later >= 2) valuesHints.push('практическая направленность');
  if (!valuesHints.length) valuesHints.push('наблюдательность', 'профессиональная любознательность');

  const meanings = [
    'Смыслы и ценности проступают в вопросах, ответах, копилке и осмыслениях после блоков.',
    themesLine ? `Чаще всего в фокусе оказывались: ${themesLine}.` : '',
    input.exchange.questionsCount
      ? `В «Обмене опытом» задано вопросов: ${input.exchange.questionsCount}. ${quoteOr(input.exchange.questionSamples, 'Вопросы были о рабочих трудностях и методике.')}`
      : 'Собственных вопросов в обмене опытом почти не было — диалог шёл через ответы или офлайн.',
    input.exchange.answersCount
      ? `Ответов коллегам: ${input.exchange.answersCount}. ${quoteOr(input.exchange.answerSamples, 'В ответах видно готовность предлагать рабочие решения.')}`
      : '',
    input.kopilka.quotes[0]
      ? `Из копилки звучит: «${clampText(input.kopilka.quotes[0].text, 180)}».`
      : input.kopilka.total
        ? `В копилке ${input.kopilka.total} записей — рефлексия шла регулярно.`
        : '',
    `Проявленные ценности: ${valuesHints.slice(0, 4).join(', ')}.`,
  ].filter(Boolean).join(' ');

  const strengths: { title: string; evidence: string }[] = [];
  if (touchRatio != null && touchRatio >= 0.55) {
    strengths.push({
      title: 'Настойчивость в пути',
      evidence: `Закрыто ${Math.round(touchRatio * 100)}% доступных точек осмысления — привычка доводить контур дня до конца.`,
    });
  }
  if (input.kopilka.idea + input.kopilka.toWork >= 2) {
    strengths.push({
      title: 'Генератор практических идей',
      evidence: `В копилке ${input.kopilka.idea} идей и ${input.kopilka.toWork} пометок «в работу» — мысль быстро переводится в действие.`,
    });
  }
  if (input.exchange.answersCount >= 2) {
    strengths.push({
      title: 'Открытость к диалогу',
      evidence: `${input.exchange.answersCount} ответов в обмене опытом: готовность делиться и поддерживать коллег.`,
    });
  }
  if (input.afterBlocks.items.some(i => i.text.length >= 80) || input.afterBlocks.total >= 3) {
    strengths.push({
      title: 'Глубокий аналитик',
      evidence: `Осмысления после блоков (${input.afterBlocks.total}) показывают способность удерживать суть и формулировать вывод.`,
    });
  }
  const riskN = input.state.zoneCounts.find(z => z.zone === 'Риск')?.n || 0;
  const riseN = (input.state.zoneCounts.find(z => z.zone === 'Подъём')?.n || 0)
    + (input.state.zoneCounts.find(z => z.zone === 'Включение')?.n || 0);
  if (input.state.days.filter(d => d.morning || d.day_ || d.evening).length >= 2 && riseN >= riskN) {
    strengths.push({
      title: 'Стрессоустойчивость',
      evidence: 'Даже при нагрузке смены эмоциональная карта чаще оставалась в рабочих зонах, а не в затяжном риске.',
    });
  }
  if (input.roles.filter(r => r.result && !/не получилось/i.test(r.result)).length >= 1) {
    strengths.push({
      title: 'Готовность экспериментировать',
      evidence: 'Ролевые пробы доведены до результата — это признак гибкости и смелости пробовать другую рамку поведения.',
    });
  }
  if (!strengths.length) {
    strengths.push({
      title: 'Наблюдательность',
      evidence: 'Даже при небольшом цифровом следе видно умение замечать важное и формулировать личный запрос.',
    });
    strengths.push({
      title: 'Профессиональная любознательность',
      evidence: pointALine || 'Участник приехал с вопросами к себе и к практике — это уже точка роста.',
    });
  }

  const lessonCore = themesLine
    ? `главный урок смены — держать в фокусе «${topThemes[0].name}» и переводить услышанное в маленькие шаги`
    : 'главный урок смены — не копить впечатления, а превращать одно наблюдение в одно действие';

  const proTip = input.kopilka.toWork || input.nextStep
    ? `В профессии начните с конкретного шага${input.nextStep ? `: «${clampText(input.nextStep, 160)}»` : ' из пометок «в работу»'} — лучше один формат на ближайший месяц, чем список на год.`
    : 'В профессии выберите один формат или одну практику с форума и проведите её в первые две недели после возвращения.';

  const personalTip = riskN >= 2 || /усталост|недосып|раздраж/i.test(input.state.topReasons.join(' '))
    ? 'В личном развитии стоит заранее планировать восстановление: короткий ритуал после насыщенного дня (прогулка, тишина, разговор без задач) защищает от накопленной усталости.'
    : 'В личном развитии поддерживайте привычку вечерней фиксации: одна мысль и один следующий шаг — этого достаточно, чтобы форумный ритм не растворился.';

  const resume = [
    `Итог. Для ${input.person.name.split(' ')[0] || 'участника'} ${lessonCore}.`,
    proTip,
    personalTip,
    input.nextStepWhen ? `Ориентир по сроку: ${input.nextStepWhen}.` : '',
  ].filter(Boolean).join(' ');

  const closing = themesLine
    ? `Ваш вклад на «Машуке» — это живой профессиональный разговор о ${topThemes[0].name.toLowerCase()}. Заберите его в свою команду и сделайте видимым для других.`
    : 'Ваш вклад на «Машуке» — честное присутствие и готовность думать о практике. Пусть следующий шаг будет маленьким, но сделанным.';

  const tagLine = input.kopilka.favoriteTags.slice(0, 5).map(t => t.tag);
  const quotes = [
    ...input.kopilka.quotes.slice(0, 2).map(q => q.text),
    ...input.afterBlocks.items.slice(0, 2).map(i => i.text),
    ...input.exchange.answerSamples.slice(0, 1),
  ].map(q => clampText(q, 200)).filter(Boolean).slice(0, 3);

  return {
    intro,
    path,
    meanings,
    strengths: strengths.slice(0, 5),
    resume,
    closing,
    snapshot: {
      tags: tagLine.length ? tagLine : ['(теги почти не использовались)'],
      quotes,
      energy,
    },
  };
}
