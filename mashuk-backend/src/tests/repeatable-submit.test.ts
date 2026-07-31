import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { getAdminBearerToken } from './adminTestHelper.js';

const E2E_VK_ID = 999002;

describe('repeatable task submit flow', { skip: !process.env.DATABASE_URL }, () => {
  const app = createApp();
  let adminAuth: Record<string, string>;

  before(async () => {
    const token = await getAdminBearerToken(app);
    adminAuth = { Authorization: `Bearer ${token}` };
  });

  it('allows multiple submissions until daily limit', async () => {
    const headers = { 'X-Test-Vk-Id': String(E2E_VK_ID) };

    const list = await request(app).get('/api/admin/participants').set(adminAuth);
    let participant = list.body.participants?.find((p: { vkId: number }) => p.vkId === E2E_VK_ID);
    if (!participant) {
      const dirs = await request(app).get('/api/directions');
      const directionId = dirs.body.directions?.[0]?.id;
      assert.ok(directionId);
      const onboarding = await request(app)
        .post('/api/auth/onboarding')
        .set('X-Test-Vk-Id', String(E2E_VK_ID))
        .send({
          firstName: 'Rep',
          lastName: 'Test',
          age: 25,
          directionId,
          workplace: 'E2E',
          pedagogicalRole: 'teacher',
          groupId: null,
          consentIds: [],
        });
      assert.equal(onboarding.status, 200, JSON.stringify(onboarding.body));
      const list2 = await request(app).get('/api/admin/participants').set(adminAuth);
      participant = list2.body.participants?.find((p: { vkId: number }) => p.vkId === E2E_VK_ID);
    }
    assert.ok(participant?.id);

    const created = await request(app)
      .post('/api/admin/tasks')
      .set(adminAuth)
      .send({
        title: `E2E Repeatable ${Date.now()}`,
        shortDescription: 'repeatable anticheat test',
        points: 3,
        dayNumbers: [1],
        status: 'published',
        executionType: 'repeatable',
        dailyRepeatLimit: 2,
        confirmationMethods: ['photo'],
        requiresModeration: false,
        autoConfirm: true,
        allowRetry: true,
      });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const taskId = created.body.task?.id ?? created.body.id;
    assert.ok(taskId);

    try {
      const first = await request(app)
        .post(`/api/tasks/${taskId}/submit`)
        .set(headers)
        .send({ answerText: 'first', photoUrl: 'https://example.com/1.jpg' });
      assert.equal(first.status, 200, JSON.stringify(first.body));

      const second = await request(app)
        .post(`/api/tasks/${taskId}/submit`)
        .set(headers)
        .send({ answerText: 'second', photoUrl: 'https://example.com/2.jpg' });
      assert.equal(second.status, 200, JSON.stringify(second.body));

      const third = await request(app)
        .post(`/api/tasks/${taskId}/submit`)
        .set(headers)
        .send({ answerText: 'third', photoUrl: 'https://example.com/3.jpg' });
      assert.equal(third.status, 400);
      assert.match(String(third.body.error || ''), /лимит/i);

      const tasksRes = await request(app).get('/api/tasks?filter=all').set(headers);
      assert.equal(tasksRes.status, 200);
      const row = tasksRes.body.tasks?.find((t: { id: number }) => t.id === taskId);
      assert.ok(row);
      assert.equal(row.todayCompletedCount, 2);
      assert.equal(row.status, 'done');
    } finally {
      await request(app).delete(`/api/admin/tasks/${taskId}`).set(adminAuth);
    }
  });
});
