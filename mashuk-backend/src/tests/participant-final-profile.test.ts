import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assemblePointB,
  buildProfileAiCopy,
  classifyPiggyThemes,
  classifyPiggyThemesDetailed,
  classifyPointATopic,
  classifyPointBItem,
  pairPointAtoB,
  emptyFinalProfile,
  extractCriterionTarget,
  filterProfilePiggy,
  isKopilkaTrash,
  isSubstantiveReflection,
  mapExperimentResult,
  pickCriterionAnswer,
  profileDensity,
  resolveExpRank,
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

  it('filters impression-only reflections', () => {
    assert.equal(isSubstantiveReflection('класс'), false);
    assert.equal(isSubstantiveReflection('очень интересно'), false);
    assert.equal(isSubstantiveReflection('Я бы хотела попробовать ввести игры с детективным сюжетом'), true);
  });

  it('classifies point B slots and assembles them', () => {
    assert.equal(classifyPointBItem('Что произошло с вашей целью за время программы?', 'Достиг(ла) цели'), 'goalOutcome');
    assert.equal(classifyPointBItem('Какой ролью вам было естественно действовать?', 'Реализатор практики'), 'roleNatural');
    const pb = assemblePointB([
      { q: 'Что произошло с вашей целью за время программы?', a: 'Цель изменилась' },
      { q: 'Когда планируете сделать этот шаг?', a: 'Ближайшие 14 дней' },
    ]);
    assert.equal(pb.completed, true);
    assert.equal(pb.goalOutcome, 'Цель изменилась');
    assert.equal(pb.planWhen, 'Ближайшие 14 дней');
  });

  it('pairs point A goal with marked point B follow-up', () => {
    assert.equal(classifyPointATopic('С какой целью ты приехал на Машук?'), 'goal');
    assert.equal(classifyPointATopic('По каким признакам поймёшь, что достиг цели?'), 'criterion');
    const { pairs, leftoverB } = pairPointAtoB(
      [
        { q: 'С какой целью ты приехал на Машук?', a: 'Найти новые форматы занятий', kind: 'open' },
        { q: 'Что ты ожидаешь от других участников?', a: 'Обмен практиками', kind: 'open' },
      ],
      [
        { q: 'Что произошло с вашей целью за время программы?', a: 'Достиг(ла) цели' },
        { q: 'Какой результат вы получили?', a: 'Забрала три формата открытого урока' },
      ],
    );
    assert.equal(pairs[0].aB, 'Забрала три формата открытого урока');
    assert.equal(pairs[0].topic, 'goal');
    assert.ok(leftoverB.some(x => x.a === 'Достиг(ла) цели') || pairs.some(p => p.aB === 'Достиг(ла) цели'));
  });

  it('builds detailed piggy themes and universal AI copy', () => {
    const pack = classifyPiggyThemesDetailed([
      { text: 'Формат открытого урока заберу в школу', tags: ['идея'] },
      { text: 'Мастер-класс как формат занятия с классом', tags: ['идея'] },
      { text: 'Игра Соображариум на площадке', tags: ['идея'] },
    ], 3);
    assert.ok(pack.themes.length >= 1);
    const ai = buildProfileAiCopy({
      roleComments: 2,
      reflectionCount: 3,
      thesisCount: 4,
      touchDone: 16,
      touchTotal: 24,
      roles: ['Реализатор практики', 'Проводник коммуникации'],
      kopilkaTotal: 21,
      toWork: 1,
      themeNames: ['Форматы занятий и мастер-классов'],
      pointBDone: false,
    });
    assert.match(ai.closing, /16 из 24/);
    assert.match(ai.roles, /ваши слова/i);
  });
});

describe('renderFinalProfileHtml', () => {
  it('injects profile json and keeps etalon blocks', () => {
    const profile = emptyFinalProfile();
    profile.person = {
      name: 'Тест Участник',
      direction: 'Флагманы',
      shift: 'Смена 1',
      group: '1А',
      from: '8 августа',
      to: '15 августа',
      days: 8,
    };
    profile.pointA = [{ q: 'Зачем?', a: 'Учиться', kind: 'open' }];
    const html = renderFinalProfileHtml(profile);
    assert.ok(html.includes('Тест Участник'));
    assert.ok(html.includes('const PROFILE = {'));
    assert.ok(html.includes('Твой Машук за 20 секунд'));
    assert.ok(html.includes('Ролевые эксперименты'));
    assert.ok(html.includes('Итог смены'));
    assert.ok(!html.includes('__PROFILE_JSON__'));
    assert.ok(!html.includes('<script>alert'));
  });
});
