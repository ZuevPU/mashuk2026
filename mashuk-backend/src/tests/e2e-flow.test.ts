import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { getAdminBearerToken } from './adminTestHelper.js';

const E2E_VK_ID = 999001;

describe('E2E participant + admin flow', { skip: !process.env.DATABASE_URL }, () => {
  const app = createApp();
  let adminAuth: Record<string, string>;

  before(async () => {
    const token = await getAdminBearerToken(app);
    adminAuth = { Authorization: `Bearer ${token}` };
  });

  it('cleanup and register E2E participant via full onboarding', async () => {
    const list = await request(app)
      .get('/api/admin/participants')
      .set(adminAuth);
    const existing = list.body.participants?.find((p: { vkId: number }) => p.vkId === E2E_VK_ID);
    if (existing) {
      await request(app)
        .delete(`/api/admin/participants/${existing.id}/registration`)
        .set(adminAuth);
    }

    const dirs = await request(app).get('/api/directions');
    assert.equal(dirs.status, 200);
    const directionId = dirs.body.directions?.[0]?.id;
    assert.ok(directionId);

    const meta = await request(app)
      .get('/api/auth/onboarding-meta')
      .set('X-Test-Vk-Id', String(E2E_VK_ID));
    assert.equal(meta.status, 200);
    const groupId = meta.body.groups?.[0]?.id ?? null;
    const consents = await request(app).get('/api/consents/active');
    assert.equal(consents.status, 200);

    const onboarding = await request(app)
      .post('/api/auth/onboarding')
      .set('X-Test-Vk-Id', String(E2E_VK_ID))
      .send({
        firstName: 'E2E',
        lastName: 'Test',
        age: 28,
        directionId,
        workplace: 'Школа E2E',
        position: 'Учитель',
        consentPd: true,
        consentAnalytics: true,
        consentPdVersion: consents.body.pd?.version ?? 1,
        consentAnalyticsVersion: consents.body.analytics?.version ?? 1,
        groupId,
        goalAnswers: [
          'Цель E2E',
          'Инструменты',
          'Запрос направлению',
          'Результат 8 дней',
          'Ожидания от участников',
        ],
        interests: [
          'проектная работа',
          'подростки',
          'осмысленность обучения',
          'командная работа учителей',
          'открытые уроки',
        ],
        roleAnswers: [1, 1, 0, 1, 1, 2],
      });
    assert.equal(onboarding.status, 200, JSON.stringify(onboarding.body));
    assert.equal(onboarding.body.status, 'ok');
    assert.ok(onboarding.body.user?.onboardingCompletedAt || onboarding.body.user?.pedagogicalRole);
    assert.ok(onboarding.body.user?.pedagogicalRole);
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
      .send({ tag: 'идея', text: 'E2E piggybank', source: 'Своя мысль' });
    assert.equal(piggy.status, 200, JSON.stringify(piggy.body));

    const piggyBad = await request(app)
      .post('/api/piggybank/quick')
      .set(headers)
      .send({ tag: 'идея', text: 'no source' });
    assert.equal(piggyBad.status, 400);

    const ex = await request(app)
      .post('/api/exchange')
      .set(headers)
      .send({ text: 'E2E exchange question', audience: 'all' });
    assert.equal(ex.status, 200);

    const home = await request(app).get('/api/home').set(headers);
    assert.equal(home.status, 200);
    assert.ok((home.body.totalDays ?? 0) >= 4);
    assert.ok('eveningQuestionnaire' in home.body);
    assert.ok(['morning', 'day', 'evening'].includes(home.body.timeSlot));
    assert.ok(home.body.ui);

    const profile = await request(app).get('/api/profile').set(headers);
    assert.equal(profile.status, 200);
    assert.ok('finalCard' in profile.body);
    assert.ok('roleTrajectory' in profile.body);

    const kb = await request(app).get('/api/program/knowledge-base?day=3').set(headers);
    assert.equal(kb.status, 200);
    assert.equal(kb.body.requiredTouchpoints, 4);
    assert.ok('touchpointsTotal' in kb.body || 'ruleLabel' in kb.body);
  });

  it('admin roles CRUD and role correction', async () => {
    const roles = await request(app).get('/api/admin/roles').set(adminAuth);
    assert.equal(roles.status, 200);
    assert.ok((roles.body.roles?.length ?? 0) >= 6);

    const exps = await request(app).get('/api/admin/day-experiments').set(adminAuth);
    assert.equal(exps.status, 200);

    const list = await request(app).get('/api/admin/participants').set(adminAuth);
    const p = list.body.participants.find((x: { vkId: number }) => x.vkId === E2E_VK_ID);
    assert.ok(p);

    const patch = await request(app)
      .patch(`/api/admin/participants/${p.id}/role`)
      .set(adminAuth)
      .send({ pedagogicalRole: 'meaning_researcher' });
    assert.equal(patch.status, 200);
    assert.equal(patch.body.participant.pedagogicalRole, 'meaning_researcher');

    const dayExport = await request(app)
      .get('/api/admin/exports/answers?day=1&type=all&depth=1')
      .set(adminAuth);
    assert.equal(dayExport.status, 200);
  });

  it('admin sees data, exports CSV, recalculates analytics', async () => {
    const participants = await request(app).get('/api/admin/participants').set(adminAuth);
    assert.ok(participants.body.participants.some((p: { vkId: number }) => p.vkId === E2E_VK_ID));

    const subs = await request(app).get('/api/admin/task-submissions').set(adminAuth);
    assert.equal(subs.status, 200);

    const exchange = await request(app).get('/api/admin/exchange').set(adminAuth);
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
      const csv = await request(app).get(`/api/admin${path}`).set(adminAuth);
      assert.equal(csv.status, 200);
    }

    const recalc = await request(app).post('/api/admin/analytics/recalculate').set(adminAuth);
    assert.equal(recalc.status, 200);

    const charts = await request(app).get('/api/admin/analytics/charts').set(adminAuth);
    assert.equal(charts.status, 200);
  });

  it('admin push send writes to push_log', async () => {
    const list = await request(app).get('/api/admin/participants').set(adminAuth);
    const p = list.body.participants.find((x: { vkId: number }) => x.vkId === E2E_VK_ID);
    assert.ok(p);

    const push = await request(app)
      .post('/api/admin/push/send')
      .set(adminAuth)
      .send({ text: 'E2E push test', participantId: p.id });
    assert.equal(push.status, 200);

    const log = await request(app).get('/api/admin/push/log').set(adminAuth);
    assert.equal(log.status, 200);
    assert.ok(log.body.log?.some((l: { text: string }) => l.text === 'E2E push test'));
  });

  it('rejects outdated consent version', async () => {
    const staleVk = 999002;
    const dirs = await request(app).get('/api/directions');
    const directionId = dirs.body.directions?.[0]?.id;
    const meta = await request(app)
      .get('/api/auth/onboarding-meta')
      .set('X-Test-Vk-Id', String(staleVk));
    const groupId = meta.body.groups?.[0]?.id ?? null;
    const consents = await request(app).get('/api/consents/active');
    assert.equal(consents.status, 200);
    const currentPd = consents.body.pd?.version ?? 1;

    const bad = await request(app)
      .post('/api/auth/onboarding')
      .set('X-Test-Vk-Id', String(staleVk))
      .send({
        firstName: 'Stale',
        lastName: 'Consent',
        age: 30,
        directionId,
        workplace: 'Школа',
        position: 'Учитель',
        consentPd: true,
        consentAnalytics: true,
        consentPdVersion: currentPd - 1 || 999,
        consentAnalyticsVersion: consents.body.analytics?.version ?? 1,
        groupId,
        goalAnswers: ['a', 'b', 'c', 'd', 'e'],
        interests: [
          'проектная работа',
          'подростки',
          'осмысленность обучения',
          'командная работа учителей',
          'открытые уроки',
        ],
        roleAnswers: [1, 1, 0, 1, 1, 2],
      });
    assert.equal(bad.status, 400);
    assert.match(String(bad.body.error || ''), /согласия/i);
  });

  it('locks past-day touchpoints after currentDay advances', async () => {
    const headers = { 'X-Test-Vk-Id': String(E2E_VK_ID) };
    const before = await request(app).get('/api/admin/forum-settings').set(adminAuth);
    assert.equal(before.status, 200);
    const prevDay = before.body.settings?.currentDay ?? before.body.currentDay ?? 1;

    try {
      const bump = await request(app)
        .patch('/api/admin/forum-settings')
        .set(adminAuth)
        .send({ currentDay: 3 });
      assert.equal(bump.status, 200);

      const qs = await request(app).get('/api/questions').set(headers);
      assert.equal(qs.status, 200);
      const day1 = qs.body.questions?.find((q: { dayNumber: number; block?: string }) =>
        q.dayNumber === 1 && (q.block === 'Точки осмысления' || q.block === 'Проверка состояния' || q.block === 'Итоги дня'),
      );
      assert.ok(day1, 'expected day-1 touchpoint');

      const ans = await request(app)
        .post(`/api/questions/${day1.id}/answer`)
        .set(headers)
        .send({ answerData: 'should be locked' });
      assert.equal(ans.status, 400);
      assert.equal(ans.body.access, 'locked');
    } finally {
      await request(app)
        .patch('/api/admin/forum-settings')
        .set(adminAuth)
        .send({ currentDay: prevDay });
    }
  });

  it('volunteer confirms participant QR task', async () => {
    const headers = { 'X-Test-Vk-Id': String(E2E_VK_ID) };
    const profile = await request(app).get('/api/profile').set(headers);
    assert.equal(profile.status, 200);
    const qrToken = profile.body.qrToken || profile.body.user?.qrToken;
    assert.ok(qrToken, 'participant must have qrToken');

    const tasksRes = await request(app).get('/api/tasks').set(headers);
    assert.equal(tasksRes.status, 200);
    let qrTask = tasksRes.body.tasks?.find((t: { confirmationType?: string }) => t.confirmationType === 'qr');
    if (!qrTask) {
      const adminTasks = await request(app).get('/api/admin/tasks').set(adminAuth);
      qrTask = adminTasks.body.tasks?.find((t: { confirmationType?: string }) => t.confirmationType === 'qr');
    }
    assert.ok(qrTask, 'need a QR confirmation task from ops bootstrap');

    const confirm = await request(app)
      .post('/api/volunteer/confirm')
      .set(adminAuth)
      .send({ participantQrToken: qrToken, taskId: qrTask.id });
    assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
    assert.equal(confirm.body.ok, true);
  });

  it('full day path: evening → Point B → final card → PDF whitelist', async () => {
    const headers = { 'X-Test-Vk-Id': String(E2E_VK_ID) };
    const before = await request(app).get('/api/admin/forum-settings').set(adminAuth);
    const prevDay = before.body.settings?.currentDay ?? before.body.currentDay ?? 1;

    const evening = await request(app)
      .post('/api/day-state/evening')
      .set(headers)
      .send({
        dayNumber: 1,
        ratings: {
          direction: 4,
          lessonsImportant: 4,
          openLessons: 3,
          morningHealth: 4,
          workshops: 4,
          eveningAtmosphere: 5,
          food: 4,
          housing: 4,
          curator: 5,
          mainThesis: 'E2E тезис дня',
          likedMost: 'мастерская',
          improveTomorrow: 'больше пауз',
        },
        tomorrowRoleKey: 'meaning_researcher',
        experimentStatus: 'done',
      });
    assert.ok([200, 400].includes(evening.status), JSON.stringify(evening.body));

    try {
      const bump = await request(app)
        .patch('/api/admin/forum-settings')
        .set(adminAuth)
        .send({ currentDay: 8 });
      assert.equal(bump.status, 200);

      const qs = await request(app).get('/api/questions').set(headers);
      const pointB = qs.body.questions?.find((q: { block?: string; dayNumber?: number }) =>
        q.block === 'Точка Б' || q.dayNumber === 8,
      );
      assert.ok(pointB, 'Точка Б must exist after ops bootstrap');

      const pb = await request(app)
        .post(`/api/questions/${pointB.id}/answer`)
        .set(headers)
        .send({
          answerData: {
            answers: [
              'Что получилось по цели',
              'Какие инструменты взял',
              'Что дало направление',
              'Результат 8 дней',
              'Что дала группа',
            ],
            strongRole: 'meaning_researcher',
            growthRole: 'environment_keeper',
            nextExperiment: 'Провести круг смысла в школе',
            growthWhy: 'Хочу сильнее вести сообщество',
          },
        });
      assert.ok([200, 400].includes(pb.status), JSON.stringify(pb.body));

      const profile = await request(app).get('/api/profile').set(headers);
      assert.equal(profile.status, 200);
      assert.ok('finalCard' in profile.body);

      const list = await request(app).get('/api/admin/participants').set(adminAuth);
      const p = list.body.participants.find((x: { vkId: number }) => x.vkId === E2E_VK_ID);
      assert.ok(p);

      const wl = await request(app)
        .post('/api/admin/pdf-whitelist')
        .set(adminAuth)
        .send({ participantId: p.id, enabled: true });
      assert.equal(wl.status, 200);

      const pdf = await request(app)
        .get(`/api/admin/participants/${p.id}/pdf`)
        .set(adminAuth);
      assert.equal(pdf.status, 200);
      assert.match(String(pdf.headers['content-type'] || ''), /pdf/i);
    } finally {
      await request(app)
        .patch('/api/admin/forum-settings')
        .set(adminAuth)
        .send({ currentDay: prevDay });
    }
  });
});
