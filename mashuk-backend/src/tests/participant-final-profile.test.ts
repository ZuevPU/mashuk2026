import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPiggyThemes,
  extractCriterionTarget,
  filterProfilePiggy,
  isKopilkaTrash,
  mapExperimentResult,
  pickCriterionAnswer,
  profileDensity,
  resolveExpRank,
  type FinalProfile,
} from '../services/participantFinalProfileLogic.js';
import { renderFinalProfileHtml } from '../services/participantFinalProfileBuild.js';
import { isAutoBookmark } from '../services/analytics/piggybankHubMetrics.js';

describe('participantFinalProfileLogic', () => {
  it('filters trash, contacts and bookmarks from kopilka counters', () => {
    const rows = [
      { text: 'Блок: Направление\nМатериал: X', tags: ['мысль'], createdAt: new Date() },
      { text: '.', tags: ['мысль'], createdAt: new Date() },
      { text: 'ок', tags: ['идея'], createdAt: new Date() },
      { text: 'Иван Петров +7999', tags: ['контакт'], createdAt: new Date() },
      { text: 'Спроектировать сборник практик для сентября', tags: ['в работу'], source: 'Направление', createdAt: new Date('2026-08-10') },
      { text: 'Формат открытого урока заберу в школу', tags: ['идея'], source: 'Открытый урок', createdAt: new Date('2026-08-09') },
      { text: 'коротко', tags: ['мысль'], createdAt: new Date() },
    ];
    const out = filterProfilePiggy(rows, isAutoBookmark);
    assert.equal(out.total, 7);
    assert.equal(out.contacts, 1);
    assert.equal(out.toWork, 1);
    assert.equal(out.idea, 1);
    assert.equal(out.picked.length, 2);
    assert.ok(!out.picked.some(p => /Иван|7999/.test(p.text)));
    assert.ok(!out.usable.some(u => u.text.startsWith('Блок:')));
  });

  it('isKopilkaTrash', () => {
    assert.equal(isKopilkaTrash('.'), true);
    assert.equal(isKopilkaTrash('нет'), true);
    assert.equal(isKopilkaTrash('нормальная мысль про практику'), false);
  });

  it('extracts criterion target and builds found list source', () => {
    assert.equal(extractCriterionTarget('найду 5 форматов'), 5);
    assert.equal(extractCriterionTarget('просто вдохновиться'), null);
    const pick = pickCriterionAnswer([
      { q: 'Зачем?', a: 'Вдохновиться' },
      { q: 'Как поймёшь?', a: 'Взял себе на заметку 5 различных форматов' },
    ]);
    assert.ok(pick);
    assert.equal(pick!.target, 5);
  });

  it('classifies piggy themes by lexicon', () => {
    const themes = classifyPiggyThemes([
      'Наставничество молодых педагогов через пример',
      'Наставник должен любить дело',
      'Открытый урок как формат занятия',
      'Формат мастер-класса по ценностям',
      'Работа с родителями отдельно',
    ], 3);
    assert.ok(themes.length >= 2);
    assert.ok(themes[0].n >= themes[1].n);
  });

  it('maps experiment results without ranking language', () => {
    assert.equal(mapExperimentResult('done', null), 'Получилось естественно');
    assert.equal(mapExperimentResult('none', null), 'Не получилось попробовать');
    assert.equal(mapExperimentResult('in_progress', null), null);
    assert.equal(
      mapExperimentResult('done', 'Получилось, но было непривычно'),
      'Получилось, но было непривычно',
    );
  });

  it('expRank only top bands', () => {
    const cohort = Array.from({ length: 20 }, (_, i) => 100 - i); // 100..81
    assert.equal(resolveExpRank(100, cohort), 'верхние 10%'); // rank 1 / 20
    assert.equal(resolveExpRank(96, cohort), 'верхние 25%'); // rank 5 / 20
    assert.equal(resolveExpRank(85, cohort), '');
    assert.equal(resolveExpRank(50, [1, 2, 3]), '');
  });

  it('density modes', () => {
    assert.equal(profileDensity({
      stateDays: 1, reflectionTotal: 1, kopilkaTotal: 1, contributionAnswers: 1,
    }).mode, 'full');
    assert.equal(profileDensity({
      stateDays: 1, reflectionTotal: 1, kopilkaTotal: 0, contributionAnswers: 0,
    }).mode, 'short');
    assert.equal(profileDensity({
      stateDays: 0, reflectionTotal: 0, kopilkaTotal: 0, contributionAnswers: 0,
    }).mode, 'trace');
  });
});

describe('renderFinalProfileHtml', () => {
  it('injects profile json and keeps template shell', () => {
    const profile: FinalProfile = {
      person: {
        name: 'Тест Участник',
        direction: 'Флагманы',
        shift: 'Смена 1',
        group: '1А',
        from: '8 августа',
        to: '15 августа',
        days: 8,
      },
      pointA: [{ q: 'Зачем?', a: 'Учиться' }],
      pointB: [null],
      criterion: null,
      participation: Array.from({ length: 8 }, (_, i) => ({ day: i + 1, done: null, total: null })),
      state: Array.from({ length: 8 }, (_, i) => ({ day: i + 1 })),
      roles: [],
      kopilka: {
        total: 0, thought: 0, idea: 0, toWork: 0, later: 0, contacts: 0, picked: [], themes: [],
      },
      reflection: { total: 0, transfer: 0, self: 0, thesis: 0, reaction: 0, best: [] },
      contribution: { answers: 0, questions: 0, peopleReached: 0, expRank: '', bestAnswer: '' },
      context: { dirName: 'Флагманы', dirPoints: null, dirOwn: null, dirKop: null },
      nextStep: null,
      nextStepWhen: null,
    };
    const html = renderFinalProfileHtml(profile);
    assert.ok(html.includes('Тест Участник'));
    assert.ok(html.includes('const PROFILE = {'));
    assert.ok(!html.includes('__PROFILE_JSON__'));
    assert.ok(!html.includes('<script>alert'));
  });
});
