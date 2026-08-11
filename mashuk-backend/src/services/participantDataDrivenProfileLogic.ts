/**
 * Data-driven профиль участника (Профиль 3):
 * поведение → психографика → рекомендации, с архетипом и сравнительными метриками.
 */

import { clampText, type ProfileZone } from './participantFinalProfileLogic.js';
import type { AnalyticalProfile } from './participantAnalyticalProfileLogic.js';
import {
  dominantZone,
  energyDynamicsText,
  engagementLabel,
} from './participantAnalyticalProfileLogic.js';

export type DataDrivenProfile = Omit<AnalyticalProfile, 'narrative'> & {
  ranking: {
    pathRank: number | null;
    expRank: number | null;
    cohortSize: number;
    pathCompare: string;
    expCompare: string;
  };
  energyByPhase: {
    morning: number | null;
    day: number | null;
    evening: number | null;
  };
  narrative: DataDrivenNarrative;
};

export type DataDrivenNarrative = {
  overview: string;
  archetype: string;
  archetypeWhy: string;
  behavior: string;
  psychographic: string;
  recommendations: string[];
  insight: string;
  closing: string;
  snapshot: {
    tags: string[];
    quotes: string[];
    energy: string;
    ranks: string;
  };
};

export type Archetype =
  | 'Генератор идей'
  | 'Практик-решатель'
  | 'Эмпатичный коммуникатор'
  | 'Рефлексирующий стратег'
  | 'Наблюдательный участник'
  | 'Системный организатор';

export function compareToAverage(value: number, avg: number | null, label: string): string {
  if (avg == null || !Number.isFinite(avg) || avg <= 0) {
    return `${label}: ${value}`;
  }
  const ratio = value / avg;
  if (ratio >= 1.35) return `${label} заметно выше среднего по направлению (${value} vs ~${Math.round(avg)})`;
  if (ratio >= 1.1) return `${label} выше среднего по направлению (${value} vs ~${Math.round(avg)})`;
  if (ratio <= 0.7) return `${label} ниже среднего по направлению (${value} vs ~${Math.round(avg)})`;
  if (ratio <= 0.9) return `${label} чуть ниже среднего по направлению (${value} vs ~${Math.round(avg)})`;
  return `${label} около среднего по направлению (${value} ≈ ${Math.round(avg)})`;
}

export function rankBand(rank: number | null, cohortSize: number, metric: string): string {
  if (rank == null || cohortSize < 8) return '';
  const fromTop = rank / cohortSize;
  if (fromTop <= 0.05 || rank <= 3) return `входит в топ-${Math.min(5, Math.max(rank, 3))} по «${metric}» в направлении`;
  if (fromTop <= 0.1) return `входит в топ-10% по «${metric}» в направлении`;
  if (fromTop <= 0.25) return `в верхней четверти по «${metric}»`;
  if (fromTop <= 0.5) return `в середине рейтинга по «${metric}»`;
  return `пока ниже медианы по «${metric}» — запас роста в цифровом контуре`;
}

export function resolveArchetype(input: Omit<AnalyticalProfile, 'narrative'>): {
  archetype: Archetype;
  why: string;
} {
  const ideaScore = input.kopilka.idea + input.kopilka.toWork;
  const exchangeScore = input.exchange.answersCount * 2 + input.exchange.questionsCount;
  const reflectScore = input.afterBlocks.total + input.kopilka.thought + input.kopilka.question;
  const practiceScore = input.kopilka.toWork + input.kopilka.later
    + (input.nextStep ? 2 : 0)
    + input.afterBlocks.items.filter(i => /заберу|внедр|сдела|провед|примен/i.test(i.text)).length;
  const orgScore = input.roles.length + (input.activity.touchpointsTotal > 0
    ? input.activity.touchpointsDone / input.activity.touchpointsTotal
    : 0) * 4;

  const scores: Array<{ a: Archetype; s: number; why: string }> = [
    {
      a: 'Генератор идей',
      s: ideaScore * 1.4,
      why: `В копилке ${input.kopilka.idea} идей и ${input.kopilka.toWork} пометок «в работу» — мысль быстро превращается в предложение.`,
    },
    {
      a: 'Практик-решатель',
      s: practiceScore * 1.5,
      why: 'В текстах и тегах преобладает перевод в действие: «в работу», «на будущее», конкретные шаги после блоков.',
    },
    {
      a: 'Эмпатичный коммуникатор',
      s: exchangeScore * 1.3,
      why: `В обмене опытом ${input.exchange.questionsCount} вопросов и ${input.exchange.answersCount} ответов — опора на диалог и поддержку коллег.`,
    },
    {
      a: 'Рефлексирующий стратег',
      s: reflectScore * 1.2,
      why: `Осмысления после блоков (${input.afterBlocks.total}) и записи-мысли показывают привычку сначала понять, потом действовать.`,
    },
    {
      a: 'Системный организатор',
      s: orgScore,
      why: 'Ровные точки пути и ролевые пробы говорят о дисциплине контура и умении удерживать рамку дня.',
    },
    {
      a: 'Наблюдательный участник',
      s: 1,
      why: 'Цифровой след точечный: участник больше наблюдает и отбирает, чем генерирует поток записей.',
    },
  ];

  scores.sort((a, b) => b.s - a.s);
  const top = scores[0];
  return { archetype: top.a, why: top.why };
}

function joinThemes(themes: { name: string; n: number }[], limit = 3): string {
  const names = themes.slice(0, limit).map(t => t.name);
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} и ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}`;
}

function phasePeak(energy: DataDrivenProfile['energyByPhase']): string {
  const entries: Array<{ k: string; v: number }> = [];
  if (energy.morning != null) entries.push({ k: 'утро', v: energy.morning });
  if (energy.day != null) entries.push({ k: 'день', v: energy.day });
  if (energy.evening != null) entries.push({ k: 'вечер', v: energy.evening });
  if (!entries.length) return 'пик активности по энергии в проверках состояния не читается числом';
  entries.sort((a, b) => b.v - a.v);
  const low = [...entries].sort((a, b) => a.v - b.v)[0];
  return `пик энергии — ${entries[0].k} (~${entries[0].v}), спад — ${low.k} (~${low.v})`;
}

function energyLine(energy: DataDrivenProfile['energyByPhase']): string {
  const parts: string[] = [];
  if (energy.morning != null) parts.push(`утро — ${energy.morning}`);
  if (energy.day != null) parts.push(`день — ${energy.day}`);
  if (energy.evening != null) parts.push(`вечер — ${energy.evening}`);
  return parts.length ? parts.join(', ') : 'энергия по фазам почти не зафиксирована';
}

export function buildDataDrivenNarrative(input: {
  base: Omit<AnalyticalProfile, 'narrative'>;
  ranking: DataDrivenProfile['ranking'];
  energyByPhase: DataDrivenProfile['energyByPhase'];
}): DataDrivenNarrative {
  const { base, ranking, energyByPhase } = input;
  const touchRatio = base.activity.touchpointsTotal > 0
    ? base.activity.touchpointsDone / base.activity.touchpointsTotal
    : null;
  const engage = engagementLabel({
    touchRatio,
    kopTotal: base.kopilka.total,
    exchangeTotal: base.exchange.questionsCount + base.exchange.answersCount,
    afterTotal: base.afterBlocks.total,
  });
  const { archetype, why } = resolveArchetype(base);

  const themePool = [...base.kopilka.themes, ...base.exchange.themes, ...base.afterBlocks.themes];
  const merged = new Map<string, number>();
  for (const t of themePool) merged.set(t.name, (merged.get(t.name) || 0) + t.n);
  const topThemes = [...merged.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 4);
  const themesLine = joinThemes(topThemes);

  const pathBand = rankBand(ranking.pathRank, ranking.cohortSize, 'Путь');
  const expBand = rankBand(ranking.expRank, ranking.cohortSize, 'Опыт');

  const overview = [
    `${base.person.name} — направление «${base.person.direction}», группа ${base.person.group}.`,
    `Баллы: Путь ${base.activity.pathPoints}, Опыт ${base.activity.experiencePoints}; точки осмысления ${base.activity.touchpointsDone}/${base.activity.touchpointsTotal || 0}.`,
    ranking.pathCompare + '.',
    ranking.expCompare + '.',
    pathBand ? `${pathBand}.` : '',
    expBand ? `${expBand}.` : '',
    `Поведенческий контур: ${engage}.`,
    `Ключевой архетип по данным: «${archetype}».`,
  ].filter(Boolean).join(' ');

  const tagBits = base.kopilka.favoriteTags.slice(0, 4)
    .map(t => `${t.tag}×${t.n}`)
    .join(', ');
  const groupCue = [
    ...base.afterBlocks.items.map(i => i.text),
    ...base.exchange.answerSamples,
    ...base.kopilka.quotes.map(q => q.text),
  ].some(t => /команд|групп|коллег|вместе|обсуд/i.test(t))
    ? 'В текстах есть следы групповой работы и опоры на коллег.'
    : 'Прямых маркеров групповой динамики мало — вклад мог идти офлайн или через наблюдение.';

  const behavior = [
    'Поведенческий профиль строится только по действиям, а не по самооценке.',
    base.exchange.questionsCount
      ? `Задано вопросов в обмене опытом: ${base.exchange.questionsCount}. Пример: «${clampText(base.exchange.questionSamples[0] || '—', 140)}».`
      : 'Собственных вопросов в обмене почти нет — инициатива проявлялась иначе.',
    base.exchange.answersCount
      ? `Ответов коллегам: ${base.exchange.answersCount}. Пример: «${clampText(base.exchange.answerSamples[0] || '—', 140)}».`
      : 'Ответов в обмене мало: диалоговая площадка использовалась точечно.',
    themesLine ? `Тематические кластеры: ${themesLine}.` : '',
    `Копилка: ${base.kopilka.total} записей${tagBits ? ` (теги: ${tagBits})` : ''}.`,
    base.kopilka.quotes[0]
      ? `Идея к переносу: «${clampText(base.kopilka.quotes[0].text, 160)}» [${base.kopilka.quotes[0].tag}].`
      : '',
    groupCue,
    `Динамика дня: ${phasePeak(energyByPhase)}; ${energyDynamicsText(base.state.days)}`,
    base.activity.lastActivePhase
      ? `Последняя активность тяготеет к фазе «${base.activity.lastActivePhase}».`
      : '',
  ].filter(Boolean).join(' ');

  const zone = dominantZone(base.state.zoneCounts);
  const values: string[] = [];
  if (topThemes.some(t => /наставнич/i.test(t.name))) values.push('наставничество');
  if (topThemes.some(t => /воспитат|ценност/i.test(t.name))) values.push('ценности и воспитание');
  if (topThemes.some(t => /команд/i.test(t.name))) values.push('команда');
  if (topThemes.some(t => /формат|практик|проект/i.test(t.name))) values.push('практическая польза');
  if (topThemes.some(t => /мотивац|осмыслен|саморазвит/i.test(t.name))) values.push('саморазвитие');
  if (base.kopilka.toWork + base.kopilka.later >= 2) values.push('внедряемость');
  if (!values.length) values.push('профессиональная любознательность');

  const recovery = base.state.zoneCounts.some(z => z.zone === 'Усталость' || z.zone === 'Риск')
    ? (energyByPhase.evening != null && energyByPhase.morning != null && energyByPhase.evening >= energyByPhase.morning
      ? 'Стратегия восстановления читается в данных: к вечеру ресурс часто возвращался — помогали смыслы дня и общение.'
      : 'Усталость фиксировалась честно; явной вечерней компенсации в цифрах мало — риск накопления перегруза без ритуала восстановления.')
    : 'Сильных провалов в зонах риска/усталости немного — базовый ресурс удерживался.';

  const psychographic = [
    'Психографика выводится из поведения и формулировок, а не из тестов.',
    base.pointA[0]
      ? `Мотивация на входе: «${clampText(base.pointA[0].a, 160)}».`
      : 'Формальная цель на входе не сохранена — мотивация читается по вопросам и идеям.',
    themesLine
      ? `Движущие темы (что важно): ${themesLine}.`
      : 'Ценностное ядро ещё не сложилось в явный кластер.',
    `Ценности по данным: ${values.slice(0, 4).join(', ')}.`,
    zone ? `Преобладающая эмоциональная зона: «${zone}».` : 'Эмоциональная карта разрежена.',
    base.state.topReasons.length
      ? `Триггеры состояния: ${base.state.topReasons.slice(0, 3).map(r => `«${clampText(r, 70)}»`).join(', ')}.`
      : 'Причины состояния почти не заполнялись.',
    energyDynamicsText(base.state.days),
    recovery,
  ].filter(Boolean).join(' ');

  const insight = base.afterBlocks.items[0]
    ? `Главный инсайт по собственным словам: «${clampText(base.afterBlocks.items[0].text, 200)}» (${base.afterBlocks.items[0].event}).`
    : base.kopilka.quotes[0]
      ? `Главный инсайт из копилки: «${clampText(base.kopilka.quotes[0].text, 200)}».`
      : `Главный инсайт смены для архетипа «${archetype}»: переводить наблюдения в один маленький шаг, а не копить впечатления.`;

  const recommendations: string[] = [];
  if (base.kopilka.toWork || base.nextStep) {
    recommendations.push(
      `Профессионально: внедрите один конкретный шаг${base.nextStep ? ` — «${clampText(base.nextStep, 140)}»` : ' из пометок «в работу»'} в первые две недели после форума.`,
    );
  } else {
    recommendations.push('Профессионально: выберите один формат/приём с открытого урока или блока и проведите его в ближайший рабочий цикл.');
  }
  if (themesLine) {
    recommendations.push(`Профессионально: соберите мини-банк практик по теме «${topThemes[0].name}» — 3 карточки «что / зачем / как за 15 минут».`);
  }
  if (base.exchange.answersCount >= 2) {
    recommendations.push('Коммуникация: сохраните роль отвечающего в профессиональном сообществе — один раз в неделю короткий разбор чужого кейса удерживает экспертность.');
  } else {
    recommendations.push('Коммуникация: задайте один рабочий вопрос коллегам в первую неделю — это продлевает форумный диалог в практику.');
  }
  if (base.state.zoneCounts.some(z => z.zone === 'Усталость' || z.zone === 'Риск')) {
    recommendations.push('Лично: закрепите ритуал восстановления после плотного дня (20–30 минут без задач) — иначе паттерн усталости к вечеру переедет в школьный сентябрь.');
  } else {
    recommendations.push('Лично: сохраните вечернюю микрофиксацию «одна мысль + один шаг» — это поддерживает рефлексивный контур без перегруза.');
  }
  if (archetype === 'Генератор идей' || archetype === 'Рефлексирующий стратег') {
    recommendations.push('Развитие: каждые 5 идей завершайте глаголом действия («провести», «показать», «спросить») — иначе поток наблюдений обгонит внедрение.');
  }

  const closing = `Ваш data-driven путь на «Машуке» — это путь «${archetype}». Данные уже показали, на что вы откликаетесь; следующий шаг — сделать один видимый результат для своей команды.`;

  return {
    overview,
    archetype,
    archetypeWhy: why,
    behavior,
    psychographic,
    recommendations: recommendations.slice(0, 5),
    insight,
    closing,
    snapshot: {
      tags: base.kopilka.favoriteTags.slice(0, 5).map(t => t.tag),
      quotes: [
        ...base.kopilka.quotes.slice(0, 2).map(q => q.text),
        ...base.afterBlocks.items.slice(0, 2).map(i => i.text),
      ].map(q => clampText(q, 200)).filter(Boolean).slice(0, 3),
      energy: energyLine(energyByPhase),
      ranks: [pathBand, expBand].filter(Boolean).join('; ') || 'сравнительный ранг по направлению ещё неустойчив (мало данных когорты)',
    },
  };
}

export function zoneWeight(z?: ProfileZone): number | null {
  if (!z) return null;
  return ({ Подъём: 2, Включение: 1, Нейтраль: 0, Усталость: -1, Риск: -2 } as Record<ProfileZone, number>)[z];
}
