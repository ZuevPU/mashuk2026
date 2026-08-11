import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AnalyticalProfile } from '../services/participantAnalyticalProfileLogic.js';
import {
  buildDataDrivenNarrative,
  compareToAverage,
  resolveArchetype,
  rankBand,
  type DataDrivenProfile,
} from '../services/participantDataDrivenProfileLogic.js';
import { renderDataDrivenProfileHtml } from '../services/participantDataDrivenProfileBuild.js';

function sampleBase(): Omit<AnalyticalProfile, 'narrative'> {
  return {
    person: {
      name: 'Борис Петров',
      direction: 'Педагогика',
      shift: 'Смена 1',
      group: 'Б',
      from: '1 августа',
      to: '8 августа',
      days: 8,
    },
    activity: {
      pathPoints: 140,
      experiencePoints: 95,
      touchpointsDone: 20,
      touchpointsTotal: 24,
      lastActiveAt: '10 августа',
      lastActivePhase: 'день',
      dirAvgPath: 90,
      dirAvgExp: 70,
    },
    exchange: {
      questionsCount: 2,
      answersCount: 4,
      questionSamples: ['Как снизить стресс у молодых педагогов?'],
      answerSamples: ['Делаем короткие круги поддержки после сложных уроков.'],
      themes: [{ name: 'Наставничество и работа с молодыми педагогами', n: 3 }],
    },
    kopilka: {
      total: 10,
      thought: 2,
      idea: 4,
      toWork: 3,
      later: 1,
      question: 1,
      favoriteTags: [{ tag: 'идея', n: 4 }, { tag: 'в работу', n: 3 }],
      quotes: [{ text: 'Запущу банк мини-практик для наставников', tag: 'в работу', src: 'Клуб' }],
      themes: [{ name: 'Наставничество и работа с молодыми педагогами', n: 4 }],
    },
    state: {
      days: [
        { day: 3, morning: 'Включение', day_: 'Подъём', evening: 'Усталость', reasons: ['вдохновение', 'недосып'] },
      ],
      zoneCounts: [
        { zone: 'Подъём', n: 1 },
        { zone: 'Включение', n: 1 },
        { zone: 'Усталость', n: 1 },
      ],
      topReasons: ['вдохновение', 'недосып'],
    },
    afterBlocks: {
      total: 5,
      items: [{ event: 'Урок о важном', text: 'Заберу формат разговора о ценностях в свою школу' }],
      themes: [{ name: 'Воспитательные практики и ценности', n: 2 }],
    },
    pointA: [{ q: 'Зачем?', a: 'Найти рабочие форматы наставничества' }],
    nextStep: 'провести круг наставников в сентябре',
    nextStepWhen: 'сентябрь',
    roles: [{ day: 3, role: 'Фасилитатор', result: 'Получилось естественно' }],
  };
}

describe('participantDataDrivenProfileLogic', () => {
  it('resolves idea-heavy archetype', () => {
    const { archetype } = resolveArchetype(sampleBase());
    assert.ok(['Генератор идей', 'Практик-решатель', 'Эмпатичный коммуникатор'].includes(archetype));
  });

  it('compare and rank helpers', () => {
    assert.match(compareToAverage(140, 90, 'Путь'), /выше среднего/);
    assert.match(rankBand(2, 40, 'Опыт'), /топ/);
  });

  it('builds data-driven narrative sections', () => {
    const base = sampleBase();
    const n = buildDataDrivenNarrative({
      base,
      ranking: {
        pathRank: 2,
        expRank: 3,
        cohortSize: 40,
        pathCompare: compareToAverage(140, 90, 'Путь'),
        expCompare: compareToAverage(95, 70, 'Опыт'),
      },
      energyByPhase: { morning: 7, day: 9, evening: 5 },
    });
    assert.ok(n.overview.includes('Борис'));
    assert.ok(n.archetype.length > 3);
    assert.ok(n.behavior.length > 40);
    assert.ok(n.psychographic.length > 40);
    assert.ok(n.recommendations.length >= 3);
    assert.match(n.snapshot.energy, /утро — 7/);
  });

  it('renders html', () => {
    const base = sampleBase();
    const ranking = {
      pathRank: 2,
      expRank: 3,
      cohortSize: 40,
      pathCompare: 'Путь выше среднего',
      expCompare: 'Опыт выше среднего',
    };
    const energyByPhase = { morning: 7, day: 9, evening: 5 };
    const profile: DataDrivenProfile = {
      ...base,
      ranking,
      energyByPhase,
      narrative: buildDataDrivenNarrative({ base, ranking, energyByPhase }),
    };
    const html = renderDataDrivenProfileHtml(profile);
    assert.match(html, /Data-driven профиль/);
    assert.match(html, /Борис Петров/);
    assert.ok(!html.includes('__PROFILE_JSON__'));
  });
});
