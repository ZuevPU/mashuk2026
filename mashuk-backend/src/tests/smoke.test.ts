import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { getAdminBearerToken } from './adminTestHelper.js';

describe('smoke', () => {
  const app = createApp();

  it('GET / returns ok', async () => {
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  it('GET /health/ready returns db status', async () => {
    const res = await request(app).get('/health/ready');
    if (process.env.DATABASE_URL) {
      assert.equal(res.status, 200);
      assert.equal(res.body.db, 'connected');
    } else {
      assert.equal(res.status, 503);
    }
  });

  it('GET /api/admin/participants without token returns 401', async () => {
    const res = await request(app).get('/api/admin/participants');
    assert.equal(res.status, 401);
  });

  it('GET /api/auth/me', async () => {
    const res = await request(app).get('/api/auth/me');
    if (process.env.SKIP_VK_SIGN === 'true') {
      assert.equal(res.status, 200);
      assert.ok(['ok', 'needs_registration'].includes(res.body.status));
    } else {
      assert.equal(res.status, 401);
    }
  });
});

describe('smoke with database', { skip: !process.env.DATABASE_URL }, () => {
  const app = createApp();

  it('GET /api/auth/me with test vk id', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('X-Test-Vk-Id', '1');
    assert.ok([200, 404].includes(res.status));
  });

  it('POST /api/admin/login with valid credentials', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ login: 'zuev', password: 'ZuevPu26' });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.admin.login, 'zuev');
  });

  it('GET /api/admin/participants with token', async () => {
    const token = await getAdminBearerToken(app);
    const res = await request(app)
      .get('/api/admin/participants')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.participants));
  });

  it('GET /api/admin/tasks with token', async () => {
    const token = await getAdminBearerToken(app);
    const res = await request(app)
      .get('/api/admin/tasks')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.tasks));
  });

  it('PATCH /api/admin/events/999999 returns 404', async () => {
    const token = await getAdminBearerToken(app);
    const res = await request(app)
      .patch('/api/admin/events/999999')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'x' });
    assert.equal(res.status, 404);
  });

  it('POST /api/admin/tasks without title returns 400', async () => {
    const token = await getAdminBearerToken(app);
    const res = await request(app)
      .post('/api/admin/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ points: 10 });
    assert.equal(res.status, 400);
  });

  it('POST draft task then publish', async () => {
    const token = await getAdminBearerToken(app);
    const created = await request(app)
      .post('/api/admin/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `Smoke task ${Date.now()}`,
        status: 'draft',
        dayNumbers: [1],
        confirmationMethods: ['photo'],
      });
    assert.equal(created.status, 200);
    assert.equal(created.body.task?.status, 'draft');
    const id = created.body.task?.id;
    const published = await request(app)
      .patch(`/api/admin/tasks/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'published', publishTime: new Date().toISOString() });
    assert.equal(published.status, 200);
    assert.equal(published.body.task?.status, 'published');
    const listed = await request(app)
      .get('/api/admin/tasks?status=draft')
      .set('Authorization', `Bearer ${token}`);
    assert.ok(!listed.body.tasks.some((t: { id: number }) => t.id === id));
  });

  it('GET /api/admin/questions with filters', async () => {
    const token = await getAdminBearerToken(app);
    const res = await request(app)
      .get('/api/admin/questions?status=published')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.questions));
    assert.ok(typeof res.body.totalCount === 'number');
    if (res.body.questions.length) {
      assert.ok('answerCount' in res.body.questions[0]);
    }
  });

  it('POST admin question, duplicate, copy-selected', async () => {
    const token = await getAdminBearerToken(app);
    const created = await request(app)
      .post('/api/admin/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `Smoke Q ${Date.now()}`,
        text: 'Текст',
        questionKind: 'extra',
        answerType: 'text',
        dayNumbers: [1],
        status: 'draft',
      });
    assert.equal(created.status, 200);
    const id = created.body.question?.id;
    assert.ok(id);

    const dup = await request(app)
      .post(`/api/admin/questions/${id}/duplicate`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    assert.equal(dup.status, 200);
    assert.notEqual(dup.body.question?.id, id);

    const copied = await request(app)
      .post('/api/admin/questions/copy-selected')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [id], targetDay: 2 });
    assert.equal(copied.status, 200);
    assert.ok(copied.body.count >= 1);

    await request(app)
      .delete(`/api/admin/questions/${dup.body.question.id}`)
      .set('Authorization', `Bearer ${token}`);
  });

  it('GET exchange source list', async () => {
    const token = await getAdminBearerToken(app);
    const res = await request(app)
      .get('/api/admin/questions?source=exchange')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.source, 'exchange');
    assert.ok(Array.isArray(res.body.questions));
  });

  it('GET /api/admin/exports/day/stats and day XLSX with export role', async () => {
    const token = await getAdminBearerToken(app);
    const stats = await request(app)
      .get('/api/admin/exports/day/stats?day=1')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(stats.status, 200);
    assert.equal(stats.body.day, 1);
    assert.ok(stats.body.byTouchpointType);

    const book = await request(app)
      .get('/api/admin/exports/day?day=1&type=all')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(book.status, 200);
    assert.ok(
      (book.headers['content-type'] || '').includes('spreadsheet') ||
      (book.headers['content-type'] || '').includes('octet-stream'),
    );
  });

  it('GET /api/admin/analytics/meta and pulse dashboard', async () => {
    const token = await getAdminBearerToken(app);
    const meta = await request(app)
      .get('/api/admin/analytics/meta')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(meta.status, 200);
    assert.ok(meta.body.refreshMs);
    assert.ok(Array.isArray(meta.body.dashboardCatalog));
    assert.equal(meta.body.dashboardCatalog.length, 10);

    const pulse = await request(app)
      .get('/api/admin/analytics/dashboards/pulse?mode=day&day=1')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(pulse.status, 200);
    assert.ok(pulse.body.activity);
    assert.ok(pulse.body.emotionalPulse);
  });

  it('GET /exports/meta and POST /exports/custom', async () => {
    const token = await getAdminBearerToken(app);
    const meta = await request(app)
      .get('/api/admin/exports/meta')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(meta.status, 200);
    assert.ok(Array.isArray(meta.body.sources));
    assert.ok(meta.body.sources.some((s: { id: string }) => s.id === 'participant_activity_wide'));

    const created = await request(app)
      .post('/api/admin/exports/custom')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source: 'participants',
        title: 'smoke-custom',
        columns: ['id', 'full_name', 'direction'],
        params: {},
      });
    assert.equal(created.status, 201);
    assert.equal(created.body.status, 'ready');
    assert.ok(created.body.id);

    const dl = await request(app)
      .get(`/api/admin/exports/history/${created.body.id}/download`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(dl.status, 200);

    const wide = await request(app)
      .post('/api/admin/exports/custom')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source: 'participant_activity_wide',
        title: 'smoke-wide-day',
        columns: ['id', 'full_name', 'checkin_done', 'evening_done'],
        params: { day: 1 },
      });
    assert.equal(wide.status, 201);
    assert.equal(wide.body.status, 'ready');
    const wideDl = await request(app)
      .get(`/api/admin/exports/history/${wide.body.id}/download`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(wideDl.status, 200);

    const wideDirect = await request(app)
      .get('/api/admin/exports/participant-activity-wide?day=1')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(wideDirect.status, 200);

    const hist = await request(app)
      .get('/api/admin/exports/history?limit=5')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(hist.status, 200);
    assert.ok(Array.isArray(hist.body.items));
  });
});
