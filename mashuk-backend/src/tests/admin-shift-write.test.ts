import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { getAdminAuthHeaders, getAdminBearerToken } from './adminTestHelper.js';
import { db } from '../db/index.js';
import { materials, medals, questions, tasks } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { copyShiftModules } from '../services/shiftCopy.js';
import { createShift } from '../services/shiftService.js';

describe('admin shift write isolation', { skip: !process.env.DATABASE_URL }, () => {
  const app = createApp();

  it('refuses material create without a selected shift', async () => {
    const token = await getAdminBearerToken(app);
    const res = await request(app)
      .post('/api/admin/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'P1 no header' });
    assert.equal(res.status, 400, res.text);
  });

  it('refuses to patch a material from another shift', async () => {
    const authA = await getAdminAuthHeaders(app);
    const other = await createShift({ name: `P1-idor-${Date.now()}` });

    const mat = await request(app)
      .post('/api/admin/materials')
      .set(authA)
      .send({ title: 'P1 idor material', status: 'draft' });
    assert.ok([200, 201].includes(mat.status), mat.text);
    const materialId = Number(mat.body.material?.id);
    assert.ok(materialId > 0);

    const patched = await request(app)
      .patch(`/api/admin/materials/${materialId}`)
      .set({ ...authA, 'X-Admin-Shift-Id': String(other.id) })
      .send({ title: 'should not apply' });
    assert.equal(patched.status, 404);

    await db.delete(materials).where(eq(materials.id, materialId));
  });

  it('refuses task create without a selected shift', async () => {
    const token = await getAdminBearerToken(app);
    const res = await request(app)
      .post('/api/admin/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'P2 no header' });
    assert.equal(res.status, 400, res.text);
  });

  it('refuses push send without a selected shift', async () => {
    const token = await getAdminBearerToken(app);
    const res = await request(app)
      .post('/api/admin/push/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'P2 no header push' });
    assert.equal(res.status, 400, res.text);
  });

  it('refuses to patch a task from another shift', async () => {
    const authA = await getAdminAuthHeaders(app);
    const other = await createShift({ name: `P2-idor-task-${Date.now()}` });

    const created = await request(app)
      .post('/api/admin/tasks')
      .set(authA)
      .send({ title: 'P2 idor task', status: 'draft' });
    assert.ok([200, 201].includes(created.status), created.text);
    const taskId = Number(created.body.task?.id);
    assert.ok(taskId > 0);

    const patched = await request(app)
      .patch(`/api/admin/tasks/${taskId}`)
      .set({ ...authA, 'X-Admin-Shift-Id': String(other.id) })
      .send({ title: 'should not apply' });
    assert.equal(patched.status, 404);

    await db.delete(tasks).where(eq(tasks.id, taskId));
  });

  it('returns hub today for the header shift', async () => {
    const auth = await getAdminAuthHeaders(app);
    const res = await request(app)
      .get('/api/admin/analytics/hub/today?day=2')
      .set(auth);
    assert.equal(res.status, 200, res.text);
    assert.equal(Number(res.body.shiftId), Number(auth['X-Admin-Shift-Id']));
    assert.ok(Array.isArray(res.body.notifyItems));
    assert.equal(typeof res.body.dayPublished, 'boolean');
  });

  it('archives target knowledge and deletes questions/tasks on copy-into replace', async () => {
    const stamp = Date.now();
    const source = await createShift({ name: `P1-copy-src-${stamp}` });
    const target = await createShift({ name: `P1-copy-dst-${stamp}` });

    const [kept] = await db.insert(materials).values({
      shiftId: target.id,
      title: 'P1 keep-me',
      status: 'published',
    }).returning({ id: materials.id });
    const [oldQ] = await db.insert(questions).values({
      shiftId: target.id,
      title: 'P1 old question',
      text: 'old',
      type: 'open',
    }).returning({ id: questions.id });
    const [oldT] = await db.insert(tasks).values({
      shiftId: target.id,
      title: 'P1 old task',
    }).returning({ id: tasks.id });

    await copyShiftModules({
      sourceId: source.id,
      targetId: target.id,
      modules: ['knowledge', 'questions', 'tasks'],
      confirmReplace: true,
    });

    const [row] = await db.select().from(materials).where(eq(materials.id, kept.id)).limit(1);
    assert.ok(row, 'target material must remain');
    assert.equal(row.status, 'archived');

    const goneQ = await db.select().from(questions).where(eq(questions.id, oldQ.id)).limit(1);
    assert.equal(goneQ.length, 0);

    const goneT = await db.select().from(tasks).where(eq(tasks.id, oldT.id)).limit(1);
    assert.equal(goneT.length, 0);

    await db.delete(materials).where(eq(materials.shiftId, target.id));
    await db.delete(questions).where(eq(questions.shiftId, target.id));
    await db.delete(tasks).where(eq(tasks.shiftId, target.id));
  });

  it('hides another shift medal and returns 404 on patch/award', async () => {
    const authA = await getAdminAuthHeaders(app);
    const other = await createShift({ name: `P3-idor-medal-${Date.now()}` });

    const created = await request(app)
      .post('/api/admin/medals')
      .set(authA)
      .send({ name: 'P3 shift medal', awardType: 'manual' });
    assert.ok([200, 201].includes(created.status), created.text);
    const medalId = Number(created.body.medal?.id);
    assert.ok(medalId > 0);

    const listed = await request(app)
      .get('/api/admin/medals')
      .set({ ...authA, 'X-Admin-Shift-Id': String(other.id) });
    assert.equal(listed.status, 200, listed.text);
    const ids = (listed.body.medals || []).map((m: { id: number }) => Number(m.id));
    assert.equal(ids.includes(medalId), false);

    const patched = await request(app)
      .patch(`/api/admin/medals/${medalId}`)
      .set({ ...authA, 'X-Admin-Shift-Id': String(other.id) })
      .send({ name: 'should not apply' });
    assert.equal(patched.status, 404);

    const awarded = await request(app)
      .post('/api/admin/medals/award')
      .set({ ...authA, 'X-Admin-Shift-Id': String(other.id) })
      .send({ participantId: 1, medalId });
    assert.equal(awarded.status, 404);

    await db.delete(medals).where(eq(medals.id, medalId));
  });

  it('refuses kb open-shift before the last day', async () => {
    const auth = await getAdminAuthHeaders(app);
    const early = await createShift({ name: `P3-kb-early-${Date.now()}`, totalDays: 8 });

    const res = await request(app)
      .post('/api/admin/kb/open-shift')
      .set({ ...auth, 'X-Admin-Shift-Id': String(early.id) })
      .send({});
    assert.equal(res.status, 409, res.text);
    assert.match(String(res.body.error || ''), /последний день/);
  });

  it('refuses participant create and rating recalc without a selected shift', async () => {
    const token = await getAdminBearerToken(app);
    const participant = await request(app)
      .post('/api/admin/participants')
      .set('Authorization', `Bearer ${token}`)
      .send({ vkId: 9_000_003, firstName: 'P3', lastName: 'NoHeader' });
    assert.equal(participant.status, 400, participant.text);

    const recalc = await request(app)
      .post('/api/admin/rating/recalculate-all')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    assert.equal(recalc.status, 400, recalc.text);
  });
});
