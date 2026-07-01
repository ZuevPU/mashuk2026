import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';

const ADMIN_TOKEN = process.env.ADMIN_SECRET || 'dev-admin-secret';
const E2E_VK_ID = 999001;

describe('E2E participant + admin flow', { skip: !process.env.DATABASE_URL }, () => {
  const app = createApp();

  it('cleanup and register E2E participant', async () => {
    const list = await request(app)
      .get('/api/admin/participants')
      .set('X-Admin-Token', ADMIN_TOKEN);
    const existing = list.body.participants?.find((p: { vkId: number }) => p.vkId === E2E_VK_ID);
    if (existing) {
      await request(app)
        .delete(`/api/admin/participants/${existing.id}/registration`)
        .set('X-Admin-Token', ADMIN_TOKEN);
    }

    const dirs = await request(app).get('/api/directions');
    assert.equal(dirs.status, 200);
    const directionId = dirs.body.directions?.[0]?.id;
    assert.ok(directionId);

    const reg = await request(app)
      .post('/api/auth/register')
      .set('X-Test-Vk-Id', String(E2E_VK_ID))
      .send({ firstName: 'E2E', lastName: 'Test', directionId });
    assert.equal(reg.status, 200);
    assert.equal(reg.body.status, 'ok');
  });

  it('participant creates activity', async () => {
    const headers = { 'X-Test-Vk-Id': String(E2E_VK_ID) };

    const questions = await request(app).get('/api/questions').set(headers);
    assert.equal(questions.status, 200);
    const q = questions.body.questions?.find((x: { status: string }) => x.status === 'available');
    if (q) {
      const ans = await request(app)
        .post(`/api/questions/${q.id}/answer`)
        .set(headers)
        .send({ answerData: 'E2E answer' });
      assert.ok([200, 400].includes(ans.status));
    }

    const tasks = await request(app).get('/api/tasks').set(headers);
    assert.equal(tasks.status, 200);
    const task = tasks.body.tasks?.find((t: { status: string }) => t.status === 'available');
    if (task) {
      const sub = await request(app)
        .post(`/api/tasks/${task.id}/submit`)
        .set(headers)
        .send({ answerText: 'E2E task answer' });
      assert.equal(sub.status, 200);
    }

    const piggy = await request(app)
      .post('/api/piggybank/quick')
      .set(headers)
      .send({ tag: 'идея', text: 'E2E piggybank', source: 'собственные размышления' });
    assert.equal(piggy.status, 200);

    const ex = await request(app)
      .post('/api/exchange')
      .set(headers)
      .send({ text: 'E2E exchange question', audience: 'all' });
    assert.equal(ex.status, 200);

    const home = await request(app).get('/api/home').set(headers);
    assert.equal(home.status, 200);
  });

  it('admin sees data, exports CSV, recalculates analytics', async () => {
    const admin = { 'X-Admin-Token': ADMIN_TOKEN };

    const participants = await request(app).get('/api/admin/participants').set(admin);
    assert.ok(participants.body.participants.some((p: { vkId: number }) => p.vkId === E2E_VK_ID));

    const subs = await request(app).get('/api/admin/task-submissions').set(admin);
    assert.equal(subs.status, 200);

    const exchange = await request(app).get('/api/admin/exchange').set(admin);
    assert.equal(exchange.status, 200);
    assert.ok(exchange.body.questions?.some((q: { text: string }) => q.text?.includes('E2E exchange')));

    for (const path of [
      '/exports/participants',
      '/exports/answers',
      '/exports/piggybank',
      '/exports/task-submissions',
      '/exports/exchange',
      '/exports/attendance',
      '/exports/points-log',
    ]) {
      const csv = await request(app).get(`/api/admin${path}`).set(admin);
      assert.equal(csv.status, 200);
    }

    const recalc = await request(app).post('/api/admin/analytics/recalculate').set(admin);
    assert.equal(recalc.status, 200);

    const charts = await request(app).get('/api/admin/analytics/charts').set(admin);
    assert.equal(charts.status, 200);
  });

  it('admin push send writes to push_log', async () => {
    const admin = { 'X-Admin-Token': ADMIN_TOKEN };
    const list = await request(app).get('/api/admin/participants').set(admin);
    const p = list.body.participants.find((x: { vkId: number }) => x.vkId === E2E_VK_ID);
    assert.ok(p);

    const push = await request(app)
      .post('/api/admin/push/send')
      .set(admin)
      .send({ text: 'E2E push test', participantId: p.id });
    assert.equal(push.status, 200);

    const log = await request(app).get('/api/admin/push/log').set(admin);
    assert.equal(log.status, 200);
    assert.ok(log.body.log?.some((l: { text: string }) => l.text === 'E2E push test'));
  });
});
