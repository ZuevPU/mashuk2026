import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EVENING_QUESTIONNAIRE_CONFIG,
  copyEveningQuestionnaireContent,
  eveningOvernightAppliesToDay,
  filterEveningConfigForDirection,
  formatEveningScheduleHint,
  getEveningClosesAtMsk,
  getEveningClosesOnDay,
  getEveningOpensAtMsk,
  isEveningOpenForConfig,
  isEveningOpenForDay,
  isFieldForDirection,
  isFieldVisible,
  isEveningDisplayField,
  mergeEveningPublishFlags,
  mergeEveningScheduleFromRequest,
  resolveEveningConfigForDay,
  stripHiddenEveningFieldValues,
  stripPointBFromEveningConfig,
  unpublishClonedQuestionnaire,
  normalizeExperimentStep,
  collectForumFinalEveningFields,
  collectForumFinalEveningFieldDays,
  collectPointBEveningFields,
  collectPointZhEveningFields,
  collectPointZhEveningFieldDays,
  eveningFieldPointKind,
} from '../services/eveningQuestionnaireConfig.js';

describe('eveningQuestionnaireConfig', () => {
  it('default config has experiment on separate step', () => {
    const expStep = DEFAULT_EVENING_QUESTIONNAIRE_CONFIG.steps.find(s => s.id === 'experiment');
    assert.ok(expStep);
    assert.equal(expStep!.fields.some(f => f.key === 'experimentResult'), true);
    const open = DEFAULT_EVENING_QUESTIONNAIRE_CONFIG.steps.find(s => s.id === 'open');
    assert.equal(open!.fields.some(f => f.type === 'experiment_text'), false);
  });

  it('normalizeExperimentStep splits legacy embedded experiment field', () => {
    const legacy = {
      steps: [{
        id: 'open',
        title: 'Выводы',
        fields: [
          { key: 'likedMost', type: 'text' as const, label: 'Liked' },
          { key: 'experimentResult', type: 'experiment_text' as const, label: 'Exp' },
        ],
      }],
    };
    const norm = normalizeExperimentStep(legacy);
    assert.equal(norm.steps.length, 2);
    assert.equal(norm.steps[0].fields.length, 1);
    assert.equal(norm.steps[1].id, 'experiment');
  });

  it('default config has no Point B field', () => {
    const types = DEFAULT_EVENING_QUESTIONNAIRE_CONFIG.steps.flatMap(s => s.fields.map(f => f.type));
    assert.equal(types.includes('point_b_cta'), false);
  });

  it('isEveningOpenForConfig respects opensAtMsk and forcePublished', () => {
    const at2130 = new Date('2026-07-01T18:30:00.000Z'); // 21:30 MSK
    const at2045 = new Date('2026-07-01T17:45:00.000Z'); // 20:45 MSK
    const at0730 = new Date('2026-07-02T04:30:00.000Z'); // 07:30 MSK next day
    assert.equal(
      isEveningOpenForConfig({ steps: [], opensAtMsk: '21:00' }, at2130),
      true,
    );
    assert.equal(
      isEveningOpenForConfig({ steps: [], opensAtMsk: '21:00' }, at2045),
      false,
    );
    assert.equal(
      isEveningOpenForConfig({
        steps: [],
        opensAtMsk: '22:00',
        forcePublished: true,
        forcePublishedAt: '2026-07-01T17:00:00.000Z',
      }, at2045),
      true,
    );
    // Manual «Опубликовать сейчас» stays open after the clock window
    assert.equal(
      isEveningOpenForConfig({ steps: [], opensAtMsk: '22:00', forcePublished: true }, at0730),
      true,
    );
    assert.equal(
      isEveningOpenForConfig({
        steps: [],
        opensAtMsk: '22:00',
        forcePublished: true,
        forcePublishedAt: '2026-07-01T17:00:00.000Z',
      }, at0730),
      true,
    );
    assert.equal(
      isEveningOpenForConfig({ steps: [], opensAtMsk: '22:00' }, at2130, {
        scheduleDayPublished: false,
      }),
      false,
    );
    assert.equal(getEveningOpensAtMsk({ steps: [] }), '22:00');
    assert.equal(getEveningOpensAtMsk({ steps: [], opensAtMsk: '9:05' }), '09:05');
  });

  it('forceUnpublished hides even after schedule or forcePublished', () => {
    const at2130 = new Date('2026-07-01T18:30:00.000Z'); // 21:30 MSK
    assert.equal(
      isEveningOpenForConfig({ steps: [], opensAtMsk: '21:00', forceUnpublished: true }, at2130),
      false,
    );
    assert.equal(
      isEveningOpenForConfig({
        steps: [],
        opensAtMsk: '22:00',
        forcePublished: true,
        forceUnpublished: true,
      }, at2130),
      false,
    );
  });

  it('save without publish flags keeps «Опубликовать сейчас»', () => {
    const existing = {
      steps: [],
      forcePublished: true,
      forcePublishedAt: 'keep',
      noScheduledClose: true,
    };
    const merged = mergeEveningPublishFlags({ steps: [], opensAtMsk: '22:00' }, existing, undefined, undefined);
    assert.equal(merged.forcePublished, true);
    assert.equal(merged.forcePublishedAt, 'keep');
    assert.equal(merged.forceUnpublished, undefined);
  });

  it('empty close time means no auto-unpublish', () => {
    const settings = { startDate: new Date('2026-07-01T00:00:00.000Z'), currentDay: 1, totalDays: 8 };
    const cfg = {
      steps: [] as never[],
      opensAtMsk: '18:00',
      noScheduledClose: true,
      opensOnDay: 1,
    };
    assert.equal(isEveningOpenForDay(cfg, 1, new Date('2026-07-01T14:00:00.000Z'), { settings }), false); // 17:00
    assert.equal(isEveningOpenForDay(cfg, 1, new Date('2026-07-01T15:30:00.000Z'), { settings }), true); // 18:30
    assert.equal(isEveningOpenForDay(cfg, 1, new Date('2026-07-01T21:30:00.000Z'), { settings }), true); // 00:30
    assert.equal(isEveningOpenForDay(cfg, 1, new Date('2026-07-02T04:30:00.000Z'), { settings }), true); // 07:30 next
    assert.equal(getEveningClosesAtMsk(cfg), '');

    const merged = mergeEveningScheduleFromRequest(
      { steps: [], opensAtMsk: '18:00', closesAtMsk: '23:59' },
      { closesAtMsk: '' },
      { steps: [], opensAtMsk: '18:00', closesAtMsk: '23:59' },
    );
    assert.equal(merged.error, undefined);
    assert.equal(merged.config.noScheduledClose, true);
    assert.equal(merged.config.closesAtMsk, undefined);

    const fromSeconds = mergeEveningScheduleFromRequest(
      { steps: [] },
      { closesAtMsk: '23:59:00' },
      { steps: [] },
    );
    assert.equal(fromSeconds.config.closesAtMsk, '23:59');
    assert.equal(fromSeconds.config.noScheduledClose, undefined);
  });

  it('23:59 same-day window stays open until that minute', () => {
    const settings = { startDate: new Date('2026-07-01T00:00:00.000Z'), currentDay: 1, totalDays: 8 };
    const cfg = {
      steps: [] as never[],
      opensAtMsk: '18:00',
      closesAtMsk: '23:59',
      opensOnDay: 1,
      closesOnDay: 1,
    };
    assert.equal(isEveningOpenForDay(cfg, 1, new Date('2026-07-01T20:30:00.000Z'), { settings }), true); // 23:30
    assert.equal(isEveningOpenForDay(cfg, 1, new Date('2026-07-01T20:59:00.000Z'), { settings }), false); // 23:59
  });

  it('preserves publish meta when stripping Point B / normalizing experiment', () => {
    const cfg = {
      opensAtMsk: '21:00',
      forcePublished: true,
      forceUnpublished: true,
      steps: [{
        id: 'open',
        title: 'Выводы',
        fields: [
          { key: 'likedMost', type: 'text' as const, label: 'Liked' },
          { key: 'experimentResult', type: 'experiment_text' as const, label: 'Exp' },
          { key: 'pointB_cta', type: 'point_b_cta' as const, label: 'Точка Б' },
        ],
      }],
    };
    const stripped = stripPointBFromEveningConfig(cfg);
    assert.equal(stripped.opensAtMsk, '21:00');
    assert.equal(stripped.forcePublished, true);
    assert.equal(stripped.forceUnpublished, true);
    assert.equal(stripped.steps[0].fields.some(f => f.type === 'point_b_cta'), false);
    const norm = normalizeExperimentStep(stripped);
    assert.equal(norm.opensAtMsk, '21:00');
    assert.equal(norm.forcePublished, true);
    assert.equal(norm.forceUnpublished, true);
  });

  it('strips point_b_cta from saved configs for days 1–7', () => {
    const withPointB = {
      opensAtMsk: '21:30',
      steps: [{
        id: 'role',
        title: 'Роль',
        fields: [
          { key: 'tomorrowRoleKey', type: 'role_select' as const, label: 'Роль' },
          { key: 'pointB_cta', type: 'point_b_cta' as const, label: 'Точка Б' },
        ],
      }],
    };
    const resolved = resolveEveningConfigForDay(
      { eveningQuestionnaireByDay: { '3': withPointB } } as never,
      3,
    );
    assert.equal(resolved.steps[0].fields.some(f => f.type === 'point_b_cta'), false);
    assert.equal(resolved.opensAtMsk, '21:30');
    assert.equal(stripPointBFromEveningConfig(withPointB).steps[0].fields.length, 1);
  });

  it('default conditional step links practice to program_event pick', () => {
    const step = DEFAULT_EVENING_QUESTIONNAIRE_CONFIG.steps.find(s => s.id === 'conditional');
    assert.ok(step);
    const eventField = step!.fields.find(f => f.key === 'practiceEvent');
    assert.equal(eventField?.type, 'program_event');
    assert.deepEqual(eventField?.visibleWhen, { field: 'practiceYes', equals: true });
    const recommend = step!.fields.find(f => f.key === 'recommendYes');
    assert.deepEqual(recommend?.visibleWhen, { field: 'practiceEvent', equals: '__set__' });
  });

  it('isFieldVisible supports __set__ for program_event answers', () => {
    const score = {
      key: 'score',
      type: 'scale_1_10' as const,
      label: 'Score',
      visibleWhen: { field: 'ev', equals: '__set__' as const },
    };
    assert.equal(isFieldVisible(score, {}), false);
    assert.equal(isFieldVisible(score, { ev: null }), false);
    assert.equal(isFieldVisible(score, {
      ev: { eventId: 12, eventTitle: 'Практика А' },
    }), false);
    assert.equal(isFieldVisible(score, {
      ev: {
        items: [{
          eventId: 12,
          eventTitle: 'Практика А',
          parentEventId: 1,
          parentEventTitle: 'Блок',
          score: 8,
        }],
      },
    }), true);
  });

  it('isFieldVisible shows a follow-up only for the matching choice option', () => {
    const parent = { key: 'pick', type: 'choice' as const, label: 'Pick', options: ['А', 'Б'] };
    const followA = { key: 'qa', type: 'text' as const, label: 'A', visibleWhen: { field: 'pick', equals: 'А' } };
    const followB = { key: 'qb', type: 'text' as const, label: 'B', visibleWhen: { field: 'pick', equals: 'Б' } };
    const fields = [parent, followA, followB];
    assert.equal(isFieldVisible(followA, { pick: 'А' }, fields), true);
    assert.equal(isFieldVisible(followB, { pick: 'А' }, fields), false);
    assert.equal(isFieldVisible(followA, { pick: 'Б' }, fields), false);
    assert.equal(isFieldVisible(followB, { pick: 'Б' }, fields), true);
    assert.equal(isFieldVisible(followA, {}, fields), false);
  });

  it('isFieldVisible ORs several choice options on one follow-up', () => {
    const parent = { key: 'pick', type: 'choice' as const, label: 'Pick', options: ['1', '2', '3', '4', '5', '6'] };
    const follow = {
      key: 'qa',
      type: 'text' as const,
      label: 'A',
      visibleWhen: { field: 'pick', equals: ['1', '2', '3'] },
    };
    const fields = [parent, follow];
    assert.equal(isFieldVisible(follow, { pick: '1' }, fields), true);
    assert.equal(isFieldVisible(follow, { pick: '3' }, fields), true);
    assert.equal(isFieldVisible(follow, { pick: '5' }, fields), false);
    assert.equal(isFieldVisible(follow, {}, fields), false);
  });

  it('isFieldVisible matches the first choice option even with extra spaces', () => {
    const parent = {
      key: 'pick',
      type: 'choice' as const,
      label: 'Pick',
      options: [' Вариант 1', 'Вариант 2'],
    };
    const follow = {
      key: 'qa',
      type: 'text' as const,
      label: 'A',
      visibleWhen: { field: 'pick', equals: ' Вариант 1' },
    };
    const fields = [parent, follow];
    assert.equal(isFieldVisible(follow, { pick: 'Вариант 1' }, fields), true);
    assert.equal(isFieldVisible(follow, { pick: ' Вариант 1 ' }, fields), true);
    assert.equal(isFieldVisible(follow, { pick: 'Вариант 2' }, fields), false);
  });

  it('isFieldVisible hides a nested follow-up when the parent branch is closed', () => {
    const pick = { key: 'pick', type: 'choice' as const, label: 'Pick', options: ['1', '2'] };
    const mid = {
      key: 'mid',
      type: 'yes_no' as const,
      label: 'Mid',
      visibleWhen: { field: 'pick', equals: '1' },
    };
    const nested = {
      key: 'nested',
      type: 'text' as const,
      label: 'Nested',
      visibleWhen: { field: 'mid', equals: true },
    };
    const fields = [pick, mid, nested];
    assert.equal(isFieldVisible(nested, { pick: '1', mid: true }, fields), true);
    assert.equal(isFieldVisible(nested, { pick: '2', mid: true }, fields), false);
  });

  it('isFieldVisible matches number/string and boolean aliases', () => {
    const scaleFollow = {
      key: 'why',
      type: 'text' as const,
      label: 'Why',
      visibleWhen: { field: 'score', equals: '3' },
    };
    assert.equal(isFieldVisible(scaleFollow, { score: 3 }), true);
    const ynFollow = {
      key: 'whyNo',
      type: 'text' as const,
      label: 'Why no',
      visibleWhen: { field: 'trip', equals: false },
    };
    assert.equal(isFieldVisible(ynFollow, { trip: false }), true);
    assert.equal(isFieldVisible(ynFollow, { trip: 'false' }), true);
    assert.equal(isFieldVisible(ynFollow, { trip: true }), false);
  });

  it('stripHiddenEveningFieldValues drops closed-branch answers', () => {
    const pick = { key: 'pick', type: 'choice' as const, label: 'Pick', options: ['1', '2'] };
    const follow = {
      key: 'qa',
      type: 'text' as const,
      label: 'A',
      visibleWhen: { field: 'pick', equals: '1' },
    };
    const stripped = stripHiddenEveningFieldValues(
      { pick: '2', qa: 'leftover from option 1' },
      [pick, follow],
    );
    assert.equal(stripped.pick, '2');
    assert.equal(stripped.qa, undefined);
  });

  it('filters fields by audienceDirectionIds (empty = all)', () => {
    const forAll = { key: 'a', type: 'text' as const, label: 'All' };
    const forOne = {
      key: 'b',
      type: 'text' as const,
      label: 'Dir 5',
      audienceDirectionIds: [5],
    };
    const forTwo = {
      key: 'c',
      type: 'text' as const,
      label: 'Dir 5/7',
      audienceDirectionIds: [5, 7],
    };
    assert.equal(isFieldForDirection(forAll, 5), true);
    assert.equal(isFieldForDirection(forAll, null), true);
    assert.equal(isFieldForDirection(forOne, 5), true);
    assert.equal(isFieldForDirection(forOne, 7), false);
    assert.equal(isFieldForDirection(forOne, null), false);
    assert.equal(isFieldForDirection(forTwo, 7), true);

    const filtered = filterEveningConfigForDirection({
      steps: [
        { id: 's1', title: 'S1', fields: [forAll, forOne] },
        { id: 's2', title: 'S2', fields: [forTwo] },
        { id: 's3', title: 'S3', fields: [forOne] },
      ],
      opensAtMsk: '21:00',
    }, 7);
    assert.equal(filtered.opensAtMsk, '21:00');
    assert.equal(filtered.steps.length, 2);
    assert.deepEqual(filtered.steps[0].fields.map(f => f.key), ['a']);
    assert.deepEqual(filtered.steps[1].fields.map(f => f.key), ['c']);
  });

  it('overnight 00:00–02:00 MSK is opt-in and only for the operational day', () => {
    const at0030 = new Date('2026-07-01T21:30:00.000Z'); // 00:30 MSK 2 July
    const at0130 = new Date('2026-07-01T22:30:00.000Z'); // 01:30 MSK 2 July
    const at0200 = new Date('2026-07-01T23:00:00.000Z'); // 02:00 MSK 2 July
    const cfg = { steps: [] as never[], opensAtMsk: '22:00' };
    assert.equal(isEveningOpenForConfig(cfg, at0030), false);
    assert.equal(isEveningOpenForConfig(cfg, at0030, { allowOvernight: true }), true);
    assert.equal(isEveningOpenForConfig(cfg, at0030, { allowOvernight: false }), false);
    assert.equal(isEveningOpenForConfig(cfg, at0130, { allowOvernight: true }), true);
    assert.equal(isEveningOpenForConfig(cfg, at0200, { allowOvernight: true }), false);

    const start = new Date('2026-07-01T00:00:00+03:00');
    const settings = { startDate: start, currentDay: 1, totalDays: 8 };
    // Operational date before 02:00 MSK is still 1 July → day 1
    assert.equal(eveningOvernightAppliesToDay(1, settings, at0030), true);
    assert.equal(eveningOvernightAppliesToDay(2, settings, at0030), false);
    assert.equal(isEveningOpenForDay(cfg, 1, at0030, { settings }), true);
    assert.equal(isEveningOpenForDay(cfg, 2, at0030, { settings }), false);
    assert.equal(isEveningOpenForDay(cfg, 1, at0130, { settings }), true);
    assert.equal(isEveningOpenForDay(cfg, 1, at0200, { settings }), false);
  });

  it('uses forum day + clock for 22:00 → next day 02:00', () => {
    const start = new Date('2026-07-01T00:00:00+03:00');
    const settings = { startDate: start, currentDay: 3, totalDays: 8 };
    const cfg = {
      steps: [] as never[],
      opensAtMsk: '22:00',
      closesAtMsk: '02:00',
      opensOnDay: 3,
      closesOnDay: 4,
    };
    assert.equal(getEveningClosesAtMsk(cfg), '02:00');
    assert.equal(getEveningClosesOnDay(cfg, 3), 4);
    assert.equal(formatEveningScheduleHint(cfg, 3), 'с 22:00 дня 3 до 02:00 дня 4 МСК');
    assert.equal(isEveningOpenForDay(cfg, 3, new Date('2026-07-03T18:30:00.000Z'), { settings }), false); // 21:30
    assert.equal(isEveningOpenForDay(cfg, 3, new Date('2026-07-03T19:00:00.000Z'), { settings }), true); // 22:00
    assert.equal(isEveningOpenForDay(cfg, 3, new Date('2026-07-03T22:30:00.000Z'), { settings }), true); // 01:30 day 4
    assert.equal(isEveningOpenForDay(cfg, 3, new Date('2026-07-03T23:00:00.000Z'), { settings }), false); // 02:00 day 4
    assert.equal(isEveningOpenForDay(
      { steps: [] as never[], opensAtMsk: '22:00' },
      4,
      new Date('2026-07-03T19:00:00.000Z'),
      { settings },
    ), false);
    assert.equal(isEveningOpenForDay(
      { ...cfg, forcePublished: true },
      3,
      new Date('2026-07-03T23:00:00.000Z'),
      { settings },
    ), true);
  });

  it('same-day close stays on that forum day', () => {
    const start = new Date('2026-07-01T00:00:00+03:00');
    const settings = { startDate: start, currentDay: 2, totalDays: 8 };
    const cfg = {
      steps: [] as never[],
      opensAtMsk: '18:00',
      closesAtMsk: '23:30',
      opensOnDay: 2,
      closesOnDay: 2,
    };
    assert.equal(isEveningOpenForDay(cfg, 2, new Date('2026-07-02T15:00:00.000Z'), { settings }), true); // 18:00
    assert.equal(isEveningOpenForDay(cfg, 2, new Date('2026-07-02T20:40:00.000Z'), { settings }), false); // 23:40
  });

  it('copyEveningQuestionnaireContent copies steps/time, not source publish flags', () => {
    const src = {
      opensAtMsk: '21:15',
      closesAtMsk: '02:00',
      forcePublished: true,
      forcePublishedAt: '2026-07-01T17:00:00.000Z',
      forceUnpublished: true,
      steps: [{
        id: 's',
        title: 'S',
        fields: [
          { key: 'e', type: 'program_event' as const, label: 'E', linkedEventIds: [11, 22] },
          { key: 't', type: 'text' as const, label: 'T' },
        ],
      }],
    };
    const ontoClosed = copyEveningQuestionnaireContent(src, {
      preservePublishFrom: { steps: [], forceUnpublished: true },
    });
    assert.equal(ontoClosed.opensAtMsk, '21:15');
    assert.equal(ontoClosed.closesAtMsk, '02:00');
    assert.equal(ontoClosed.forcePublished, undefined);
    assert.equal(ontoClosed.forcePublishedAt, undefined);
    assert.equal(ontoClosed.forceUnpublished, true);
    assert.deepEqual(ontoClosed.steps[0].fields[0].linkedEventIds, []);
    assert.equal(ontoClosed.steps[0].fields[1].key, 't');

    const ontoForced = copyEveningQuestionnaireContent(src, {
      preservePublishFrom: {
        steps: [],
        forcePublished: true,
        forcePublishedAt: 'keep-me',
      },
    });
    assert.equal(ontoForced.forcePublished, true);
    assert.equal(ontoForced.forcePublishedAt, 'keep-me');
    assert.equal(ontoForced.forceUnpublished, undefined);

    const fresh = copyEveningQuestionnaireContent(src);
    assert.equal(fresh.forcePublished, undefined);
    assert.equal(fresh.forceUnpublished, undefined);
    assert.equal(fresh.opensAtMsk, '21:15');
    assert.equal(fresh.closesAtMsk, '02:00');
  });

  it('unpublishClonedQuestionnaire strips publish flags on config and by-day map', () => {
    const cfg = {
      opensAtMsk: '22:00',
      forcePublished: true,
      forcePublishedAt: '2026-07-01T17:00:00.000Z',
      steps: [{ id: 'open', title: 'Open', fields: [] }],
    };
    const unpublished = unpublishClonedQuestionnaire(cfg) as typeof cfg & { forceUnpublished?: boolean };
    assert.equal(unpublished.forcePublished, undefined);
    assert.equal(unpublished.forcePublishedAt, undefined);
    assert.equal(unpublished.forceUnpublished, true);
    assert.equal(unpublished.opensAtMsk, '22:00');
    assert.equal(unpublished.steps[0].id, 'open');

    const byDay = unpublishClonedQuestionnaire({
      '1': cfg,
      '2': { ...cfg, forcePublished: false },
    }) as Record<string, typeof unpublished>;
    assert.equal(byDay['1'].forceUnpublished, true);
    assert.equal(byDay['1'].forcePublished, undefined);
    assert.equal(byDay['2'].forceUnpublished, true);
  });

  it('keeps formatted info_text blocks as display-only fields', () => {
    const field = {
      key: 'intro',
      type: 'info_text' as const,
      label: 'Перебивка',
      html: '<p><b>Важно</b></p>',
    };
    assert.equal(isEveningDisplayField(field), true);
    assert.equal(isEveningDisplayField({ type: 'text' }), false);
    const copied = copyEveningQuestionnaireContent({
      steps: [{ id: 'open', title: 'Выводы', fields: [field] }],
    });
    assert.equal(copied.steps[0].fields[0].type, 'info_text');
    assert.equal(copied.steps[0].fields[0].html, '<p><b>Важно</b></p>');
  });

  it('collects evening fields marked as forum-final', () => {
    const fields = collectForumFinalEveningFields({
      eveningQuestionnaireByDay: {
        '1': {
          steps: [{
            id: 's',
            title: 'S',
            fields: [
              { key: 'housing', type: 'scale_1_5', label: 'Быт', forumFinal: true },
              { key: 'skip', type: 'text', label: 'Не в итогах' },
              { key: 'intro', type: 'info_text', label: 'Текст', forumFinal: true },
            ],
          }],
        },
        '2': {
          steps: [{
            id: 's',
            title: 'S',
            fields: [
              { key: 'housing', type: 'scale_1_5', label: 'Быт день 2', forumFinal: true },
              { key: 'nps', type: 'scale_1_10', label: 'Рекомендуете коллегам?', forumFinal: true },
            ],
          }],
        },
      },
    } as never);
    assert.equal(fields.length, 2);
    assert.deepEqual(fields.map(f => f.key).sort(), ['housing', 'nps']);
  });

  it('collectForumFinalEveningFields ignores unmarked evening questions', () => {
    const fields = collectForumFinalEveningFields({
      eveningQuestionnaireByDay: {
        '1': {
          steps: [{
            id: 's',
            title: 'S',
            fields: [
              { key: 'likedMost', type: 'text', label: 'Что понравилось' },
              { key: 'tripYes', type: 'yes_no', label: 'Выезд' },
            ],
          }],
        },
      },
    } as never);
    assert.deepEqual(fields.map(f => f.key), []);
  });

  it('collectForumFinalEveningFieldDays keeps only days where the checkbox is on', () => {
    const { daysByKey } = collectForumFinalEveningFieldDays({
      eveningQuestionnaireByDay: {
        '1': {
          steps: [{
            id: 's',
            title: 'S',
            fields: [
              { key: 'housing', type: 'scale_1_5', label: 'Быт', forumFinal: true },
              { key: 'mood', type: 'scale_1_5', label: 'Настроение' },
            ],
          }],
        },
        '2': {
          steps: [{
            id: 's',
            title: 'S',
            fields: [
              { key: 'housing', type: 'scale_1_5', label: 'Быт' },
              { key: 'nps', type: 'scale_1_10', label: 'Рекомендуете?', forumFinal: true },
            ],
          }],
        },
      },
    } as never);
    assert.deepEqual(daysByKey.get('housing'), [1]);
    assert.deepEqual(daysByKey.get('nps'), [2]);
    assert.equal(daysByKey.has('mood'), false);
  });

  it('keeps same-key forum-final questions separate when labels differ', () => {
    const { questions } = collectForumFinalEveningFieldDays({
      eveningQuestionnaireByDay: {
        '1': {
          steps: [{
            id: 's',
            title: 'S',
            fields: [
              { key: 'new_field', type: 'scale_1_5', label: 'Организация питания', forumFinal: true },
            ],
          }],
        },
        '7': {
          steps: [{
            id: 's',
            title: 'S',
            fields: [
              { key: 'new_field', type: 'text', label: 'Что сделать, чтобы оценка стала выше', forumFinal: true },
            ],
          }],
        },
      },
    } as never);
    assert.equal(questions.length, 2);
    assert.equal(questions[0].field.label, 'Организация питания');
    assert.deepEqual(questions[0].days, [1]);
    assert.equal(questions[1].field.label, 'Что сделать, чтобы оценка стала выше');
    assert.deepEqual(questions[1].days, [7]);
    assert.notEqual(questions[0].id, questions[1].id);
  });

  it('classifies Точка Б and Точка Ж independently from forum-final', () => {
    assert.equal(eveningFieldPointKind({ key: 'a', type: 'text', label: 'A', pointB: true }), 'b');
    assert.equal(eveningFieldPointKind({ key: 'b', type: 'text', label: 'B', pointZh: true }), 'zh');
    assert.equal(eveningFieldPointKind({ key: 'c', type: 'text', label: 'C', forumFinal: true }), null);
    assert.equal(eveningFieldPointKind({ key: 'd', type: 'info_text', label: 'D', pointB: true }), null);
  });

  it('collects evening fields marked as Точка Б without mixing forum-final', () => {
    const fields = collectPointBEveningFields({
      eveningQuestionnaireByDay: {
        '1': {
          steps: [{
            id: 's',
            title: 'S',
            fields: [
              { key: 'goal', type: 'text', label: 'Что стало с целью', pointB: true },
              { key: 'housing', type: 'scale_1_5', label: 'Быт', forumFinal: true },
              { key: 'mood', type: 'scale_1_5', label: 'Настроение', pointZh: true },
            ],
          }],
        },
      },
    } as never);
    assert.deepEqual(fields.map(f => f.key), ['goal']);
  });

  it('collects evening fields marked as Точка Ж', () => {
    const fields = collectPointZhEveningFields({
      eveningQuestionnaireByDay: {
        '1': {
          steps: [{
            id: 's',
            title: 'S',
            fields: [
              { key: 'mood', type: 'scale_1_5', label: 'Настроение', pointZh: true },
              { key: 'housing', type: 'scale_1_5', label: 'Быт', forumFinal: true },
              { key: 'skip', type: 'text', label: 'Без метки' },
            ],
          }],
        },
        '3': {
          steps: [{
            id: 's',
            title: 'S',
            fields: [
              { key: 'mood', type: 'scale_1_5', label: 'Настроение', pointZh: true },
            ],
          }],
        },
      },
    } as never);
    assert.deepEqual(fields.map(f => f.key), ['mood']);
    const { daysByKey } = collectPointZhEveningFieldDays({
      eveningQuestionnaireByDay: {
        '1': {
          steps: [{
            id: 's',
            title: 'S',
            fields: [{ key: 'mood', type: 'scale_1_5', label: 'Настроение', pointZh: true }],
          }],
        },
        '3': {
          steps: [{
            id: 's',
            title: 'S',
            fields: [{ key: 'mood', type: 'scale_1_5', label: 'Настроение', pointZh: true }],
          }],
        },
      },
    } as never);
    assert.deepEqual(daysByKey.get('mood'), [1, 3]);
  });
});
