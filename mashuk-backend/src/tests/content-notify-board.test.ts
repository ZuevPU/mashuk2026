import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  alreadySentToday,
  appLinkForContent,
  contentItemKindLabel,
  defaultTextForContent,
  eveningNotifyTrigger,
  questionOpenTriggers,
  sendTriggerForContent,
  taskNotifyTriggers,
} from '../services/contentNotifyBoard.js';
import { touchpointOpenTrigger } from '../services/questionAutoNotify.js';

describe('content notify board helpers', () => {
  it('uses one open trigger for question publish and planner', () => {
    const triggers = questionOpenTriggers(42);
    assert.equal(triggers[0], touchpointOpenTrigger(42));
    assert.equal(sendTriggerForContent('question', 42, 2), 'touchpoint_open_42');
  });

  it('keeps evening trigger per day so day 1 and day 2 do not collide', () => {
    assert.equal(eveningNotifyTrigger(2), 'evening_questionnaire_notify_d2');
    assert.notEqual(eveningNotifyTrigger(1), eveningNotifyTrigger(3));
  });

  it('labels extra and state-check questions', () => {
    assert.equal(contentItemKindLabel('extra'), 'Дополнительные');
    assert.equal(contentItemKindLabel('state_check'), 'Проверка состояния');
  });

  it('builds default texts and deep links', () => {
    assert.match(defaultTextForContent('task', 'Йога', 2), /Йога/);
    assert.match(defaultTextForContent('evening', '', 3), /дня 3/);
    assert.equal(appLinkForContent('question', 9), '#/questions?q=9');
    assert.equal(appLinkForContent('evening', 2), '#/?evening=1');
    assert.deepEqual(taskNotifyTriggers(5), ['task_publish_5', 'task_notify_5']);
  });

  it('detects same Moscow calendar day', () => {
    const morning = new Date('2026-08-16T08:00:00+03:00');
    const evening = new Date('2026-08-16T22:00:00+03:00');
    const nextDay = new Date('2026-08-17T01:00:00+03:00');
    assert.equal(alreadySentToday(morning, evening), true);
    assert.equal(alreadySentToday(morning, nextDay), false);
    assert.equal(alreadySentToday(null, evening), false);
  });
});
