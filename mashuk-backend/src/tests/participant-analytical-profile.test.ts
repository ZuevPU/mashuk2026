import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAnalyticalNarrative,
  classifyThemes,
  engagementLabel,
  energyDynamicsText,
  type AnalyticalProfile,
} from '../services/participantAnalyticalProfileLogic.js';
import { renderAnalyticalProfileHtml } from '../services/participantAnalyticalProfileBuild.js';

function sampleBase(): Omit<AnalyticalProfile, 'narrative'> {
  return {
    person: {
      name: 'Анна Иванова',
      direction: 'Педагогика',
      shift: 'Смена 1',
      group: 'А',
      from: '1 августа',
      to: '8 августа',
      days: 8,
    },
    activity: {
      pathPoints: 120,
      experiencePoints: 80,
      touchpointsDone: 18,
      touchpointsTotal: 24,
      lastActiveAt: '7 августа',
      lastActivePhase: 'вечер',
      dirAvgPath: 90,
      dirAvgExp: 70,
    },
    exchange: {
      questionsCount: 1,
      answersCount: 3,
      questionSamples: ['Как работать с мотивацией подростков при выгорании?'],
      answerSamples: ['Предлагаю короткие ритуалы успеха и разговор без оценки.'],
      themes: [{ name: 'Мотивация и осмысленность обучения', n: 2 }],
    },
    kopilka: {
      total: 9,
      thought: 3,
      idea: 3,
      toWork: 2,
      later: 1,
      question: 1,
      favoriteTags: [{ tag: 'идея', n: 3 }, { tag: 'в работу', n: 2 }],
      quotes: [{ text: 'Сделать банк форматов открытых уроков для сентября', tag: 'в работу', src: 'Направление' }],
      themes: [{ name: 'Форматы занятий и мастер-классов', n: 3 }],
    },
    state: {
      days: [
        { day: 1, morning: 'Включение', evening: 'Подъём', reasons: ['вдохновение от команды'] },
        { day: 2, morning: 'Нейтраль', evening: 'Усталость', reasons: ['недосып'] },
      ],
      zoneCounts: [
        { zone: 'Подъём', n: 1 },
        { zone: 'Включение', n: 1 },
        { zone: 'Усталость', n: 1 },
        { zone: 'Нейтраль', n: 1 },
      ],
      topReasons: ['недосып', 'вдохновение от команды'],
    },
    afterBlocks: {
      total: 4,
      items: [{ event: 'Открытый урок', text: 'Заберу формат круга ценностей в свой класс' }],
      themes: [{ name: 'Воспитательные практики и ценности', n: 2 }],
    },
    pointA: [{ q: 'Зачем приехали?', a: 'Найти 5 форматов работы с классом' }],
    nextStep: 'провести круг ценностей на первом классном часе',
    nextStepWhen: 'первая неделя сентября',
    roles: [{ day: 2, role: 'Наблюдатель', result: 'Получилось естественно' }],
  };
}

describe('participantAnalyticalProfileLogic', () => {
  it('classifies themes from lexicon', () => {
    const themes = classifyThemes([
      'Наставничество молодых педагогов',
      'Мотивация учеников к осмысленному обучению',
    ], 3);
    assert.ok(themes.length >= 1);
  });

  it('engagement and energy helpers', () => {
    assert.equal(engagementLabel({
      touchRatio: 0.8, kopTotal: 9, exchangeTotal: 4, afterTotal: 4,
    }), 'высокий уровень вовлечённости');
    const energy = energyDynamicsText([
      { day: 1, morning: 'Подъём', evening: 'Усталость', reasons: [] },
      { day: 2, morning: 'Включение', evening: 'Усталость', reasons: [] },
    ]);
    assert.match(energy, /утро|вечеру|энерг/i);
  });

  it('builds narrative with required sections', () => {
    const n = buildAnalyticalNarrative(sampleBase());
    assert.ok(n.intro.includes('Анна'));
    assert.ok(n.path.length > 40);
    assert.ok(n.meanings.length > 40);
    assert.ok(n.strengths.length >= 2);
    assert.ok(n.resume.length > 40);
    assert.ok(n.closing.length > 20);
    assert.ok(n.snapshot.tags.includes('идея'));
  });

  it('renders html with injected profile json', () => {
    const base = sampleBase();
    const profile: AnalyticalProfile = { ...base, narrative: buildAnalyticalNarrative(base) };
    const html = renderAnalyticalProfileHtml(profile);
    assert.match(html, /Аналитический профиль/);
    assert.match(html, /Анна Иванова/);
    assert.ok(!html.includes('__PROFILE_JSON__'));
  });
});
