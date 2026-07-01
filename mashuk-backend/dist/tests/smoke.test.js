import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
const ADMIN_TOKEN = process.env.ADMIN_SECRET || 'dev-admin-secret';
describe('smoke', () => {
    const app = createApp();
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
        }
        else {
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
        }
        else {
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
    it('GET /api/admin/participants with token', async () => {
        const res = await request(app)
            .get('/api/admin/participants')
            .set('X-Admin-Token', ADMIN_TOKEN);
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.participants));
    });
    it('GET /api/admin/tasks with token', async () => {
        const res = await request(app)
            .get('/api/admin/tasks')
            .set('X-Admin-Token', ADMIN_TOKEN);
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.tasks));
    });
    it('PATCH /api/admin/events/999999 returns 404', async () => {
        const res = await request(app)
            .patch('/api/admin/events/999999')
            .set('X-Admin-Token', ADMIN_TOKEN)
            .send({ title: 'x' });
        assert.equal(res.status, 404);
    });
    it('POST /api/admin/tasks without title returns 400', async () => {
        const res = await request(app)
            .post('/api/admin/tasks')
            .set('X-Admin-Token', ADMIN_TOKEN)
            .send({ points: 10 });
        assert.equal(res.status, 400);
    });
});
