import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { getAdminAuthHeaders, groupIdForDirection, interestsFromOnboardingMeta } from './adminTestHelper.js';
import { TINY_PNG_DATA_URL } from './fixtures/tinyPng.js';

const E2E_VK_ID = 999001;

describe('E2E participant + admin flow', { skip: !process.env.DATABASE_URL }, () => {
  const app = createApp();
  let adminAuth: Record<string, string>;

  before(async () => {
    adminAuth = await getAdminAuthHeaders(app);
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
    const groupId = groupIdForDirection(meta.body.groups, directionId);
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
        region: 'КЧР',
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
        interests: interestsFromOnboardingMeta(meta.body),
        roleAnswers: [1, 1, 0, 1, 1, 2, 0, 3],
      });
    assert.equal(onboarding.status, 200, JSON.stringify(onboarding.body));
    assert.equal(onboarding.body.status, 'ok');
    assert.ok(onboarding.body.user?.onboardingCompletedAt || onboarding.body.user?.pedagogicalRole);
    assert.ok(onboarding.body.user?.pedagogicalRole);
  });

  it('onboarding-meta reflects saved onboarding config', async () => {
    const before = await request(app).get('/api/admin/forum-settings').set(adminAuth);
    assert.equal(before.status, 200);
    const prev = before.body.settings?.roleDiagnosticsConfig;

    const customGoal = `E2E goal ${Date.now()}`;
    const patch = await request(app)
      .patch('/api/admin/forum-settings')
      .set(adminAuth)
      .send({
        roleDiagnosticsConfig: {
          goalQuestions: [customGoal, 'g2', 'g3', 'g4', 'g5'],
        },
      });
    assert.equal(patch.status, 200, JSON.stringify(patch.body));

    const meta = await request(app)
      .get('/api/auth/onboarding-meta')
      .set('X-Test-Vk-Id', String(E2E_VK_ID));
    assert.equal(meta.status, 200);
    assert.equal(
      typeof meta.body.goalQuestions?.[0] === 'string'
        ? meta.body.goalQuestions[0]
        : meta.body.goalQuestions?.[0]?.text,
      customGoal,
    );

    await request(app)
      .patch('/api/admin/forum-settings')
      .set(adminAuth)
      .send({ roleDiagnosticsConfig: prev ?? {} });
  });

  it('participant creates activity', async () => {
    const headers = { 'X-Test-Vk-Id': String(E2E_VK_ID) };

    const questions = await request(app).get('/api/questions').set(headers);
    assert.equal(questions.status, 200);
    const q = questions.body.questions?.find((x: { status: string }) => x.status === 'active');
    if (q) {
      const ans = await request(app)
        .post(`/api/questions/${q.id}/answer`)
        .set(headers)
        .send({ answerData: 'E2E answer' });
      assert.ok([200, 400].includes(ans.status));
    }

    const tasks = await request(app).get('/api/tasks').set(headers);
    assert.equal(tasks.status, 200);
    type TaskRow = {
      status: string;
      id: number;
      confirmationType?: string;
      answerType?: string | null;
    };
    const available = (tasks.body.tasks as TaskRow[] | undefined)?.filter(t => t.status === 'available') ?? [];
    const task =
      available.find(t => t.confirmationType === 'auto')
      ?? available.find(t => (t.confirmationType || 'text_photo') === 'text_photo' && (t.answerType || 'text') === 'text')
      ?? available[0];
    if (task) {
      const payload: { answerText: string; photoUrl?: string; postUrl?: string; qrToken?: string } = {
        answerText: 'E2E task answer',
      };
      const ct = task.confirmationType || 'text_photo';
      const at = task.answerType || 'text_and_photo';
      if (ct === 'post_url') payload.postUrl = 'https://vk.com/wall-1_1';
      if (at === 'photo' || at === 'text_and_photo') {
        const up = await request(app)
          .post('/api/upload')
          .set(headers)
          .send({ dataUrl: TINY_PNG_DATA_URL });
        assert.equal(up.status, 200, JSON.stringify(up.body));
        payload.photoUrl = up.body.url;
      }
      const sub = await request(app)
        .post(`/api/tasks/${task.id}/submit`)
        .set(headers)
        .send(payload);
      assert.ok([200, 400].includes(sub.status), JSON.stringify(sub.body));
    }

    const piggy = await request(app)
      .post('/api/piggybank/quick')
      .set(headers)
      .send({ tags: ['идея', 'в работу'], text: 'E2E piggybank', source: 'Своя мысль' });
    assert.equal(piggy.status, 200, JSON.stringify(piggy.body));

    const piggyList = await request(app).get('/api/piggybank?tag=в работу').set(headers);
    assert.equal(piggyList.status, 200);
    assert.ok(piggyList.body.entries?.some((e: { text?: string }) => e.text === 'E2E piggybank'));

    const piggyExport = await request(app).get('/api/piggybank/export').set(headers);
    assert.equal(piggyExport.status, 200);

    const piggyBad = await request(app)
      .post('/api/piggybank/quick')
      .set(headers)
      .send({ tag: 'идея', text: 'no source' });
    assert.equal(piggyBad.status, 400);

    const piggyContact = await request(app)
      .post('/api/piggybank/quick')
      .set(headers)
      .send({ tags: ['контакт'], text: 'E2E contact only' });
    assert.equal(piggyContact.status, 200, JSON.stringify(piggyContact.body));
    assert.equal(piggyContact.body.entry?.source, null);

    const piggyContactMix = await request(app)
      .post('/api/piggybank/quick')
      .set(headers)
      .send({ tags: ['контакт', 'идея'], text: 'E2E contact mix no source' });
    assert.equal(piggyContactMix.status, 400);

    const cats = await request(app).get('/api/exchange/categories').set(headers);
    assert.equal(cats.status, 200);
    const methodsId = (cats.body.categories || []).find((c: { slug: string }) => c.slug === 'methods')?.id
      || (cats.body.categories || [])[0]?.id;
    assert.ok(methodsId, 'exchange categories seed required');
    const ex = await request(app)
      .post('/api/exchange')
      .set(headers)
      .send({
        text: 'E2E exchange question about lesson structure and activity switch for kids in the classroom.',
        audience: 'all',
        categoryId: methodsId,
      });
    assert.equal(ex.status, 200, JSON.stringify(ex.body));

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
    const firstRole = roles.body.roles[0];
    if (firstRole?.id) {
      const patched = await request(app)
        .patch(`/api/admin/roles/${firstRole.id}`)
        .set(adminAuth)
        .send({ iconKey: '⭐' });
      assert.equal(patched.status, 200);
      assert.equal(patched.body.role.iconKey, '⭐');
    }

    const exps = await request(app).get('/api/admin/day-experiments').set(adminAuth);
    assert.equal(exps.status, 200);

    const upsert = await request(app)
      .post('/api/admin/day-experiments')
      .set(adminAuth)
      .send({
        dayNumber: 2,
        roleKey: 'meaning_researcher',
        title: 'E2E совет',
        body: 'Короткий текст',
        status: 'published',
      });
    assert.equal(upsert.status, 200);
    assert.equal(upsert.body.experiment.status, 'published');

    const filtered = await request(app)
      .get('/api/admin/day-experiments?q=E2E&status=published&day=2&roleKey=meaning_researcher')
      .set(adminAuth);
    assert.equal(filtered.status, 200);
    assert.ok(filtered.body.experiments.some((e: { title: string }) => e.title === 'E2E совет'));

    const tpl = await request(app).get('/api/admin/day-experiments/csv-template').set(adminAuth);
    assert.equal(tpl.status, 200);
    assert.match(String(tpl.text), /role_key/);

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

    const modSummary = await request(app).get('/api/admin/moderation/summary').set(adminAuth);
    assert.equal(modSummary.status, 200);
    assert.ok(typeof modSummary.body.pendingExchange === 'number');

    const queue = await request(app).get('/api/admin/task-submissions?status=pending,pending_team').set(adminAuth);
    assert.equal(queue.status, 200);

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
    assert.equal(charts.status, 410);
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
    const groupId = groupIdForDirection(meta.body.groups, directionId);
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
        region: 'КЧР',
        consentPd: true,
        consentAnalytics: true,
        consentPdVersion: currentPd - 1 || 999,
        consentAnalyticsVersion: consents.body.analytics?.version ?? 1,
        groupId,
        goalAnswers: ['a', 'b', 'c', 'd', 'e'],
        interests: interestsFromOnboardingMeta(meta.body),
        roleAnswers: [1, 1, 0, 1, 1, 2, 0, 3],
      });
    assert.equal(bad.status, 400);
    assert.match(String(bad.body.error || ''), /согласия/i);
  });

  it('locks past-day touchpoints after currentDay advances', async () => {
    const headers = { 'X-Test-Vk-Id': String(E2E_VK_ID) };
    const before = await request(app).get('/api/admin/forum-settings').set(adminAuth);
    assert.equal(before.status, 200);
    const prevDay = before.body.settings?.currentDay ?? before.body.currentDay ?? 1;

    type Q = {
      id: number;
      dayNumber?: number;
      block?: string | null;
      questionKind?: string | null;
      status?: string;
    };
    // after_blocks / practices_vote остаются открытыми до снятия админом — для лока берём state_check / точки
    const isAutoLockTouchpoint = (q: Q) => {
      const kind = String(q.questionKind || '').toLowerCase();
      if (kind === 'after_blocks' || kind === 'practices_vote') return false;
      return q.block === 'Точки осмысления'
        || q.block === 'Проверка состояния'
        || q.block === 'Итоги дня'
        || q.block === 'checkin'
        || kind === 'state_check'
        || kind === 'day_summary';
    };

    const qsBefore = await request(app).get('/api/questions').set(headers);
    assert.equal(qsBefore.status, 200);
    let day1 = (qsBefore.body.questions as Q[] | undefined)?.find(q =>
      q.dayNumber === 1 && isAutoLockTouchpoint(q),
    );
    if (!day1) {
      const adminQs = await request(app).get('/api/admin/questions').set(adminAuth);
      assert.equal(adminQs.status, 200);
      day1 = (adminQs.body.questions as Q[] | undefined)?.find(q =>
        q.dayNumber === 1
        && (q.status === 'published' || !q.status)
        && isAutoLockTouchpoint(q),
      );
    }
    assert.ok(day1, 'expected day-1 auto-locking touchpoint before day bump');

    try {
      const bump = await request(app)
        .patch('/api/admin/forum-settings')
        .set(adminAuth)
        .send({ currentDay: 3 });
      assert.equal(bump.status, 200);

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

    // Ensure QR window (MSK clock) + days allow confirm on any forum day.
    await request(app)
      .patch(`/api/admin/tasks/${qrTask.id}`)
      .set(adminAuth)
      .send({
        dayNumbers: [1, 2, 3, 4, 5, 6, 7, 8],
        dayNumber: 1,
        qrValidFrom: '2000-01-01T00:00:00+03:00',
        qrValidTo: '2000-01-01T23:59:00+03:00',
      });

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
      assert.equal(qs.body.currentDay, 8, JSON.stringify({ currentDay: qs.body.currentDay, count: qs.body.questions?.length }));
      let pointB = qs.body.questions?.find((q: { block?: string; dayNumber?: number }) =>
        q.block === 'Точка Б' || q.dayNumber === 8,
      );
      if (!pointB) {
        const adminQs = await request(app).get('/api/admin/questions').set(adminAuth);
        const adminList = adminQs.body.questions ?? [];
        pointB = adminList.find((q: { block?: string; dayNumber?: number; status?: string }) =>
          (q.block === 'Точка Б' || q.dayNumber === 8) && q.status === 'published',
        );
      }
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
      assert.equal(typeof profile.body.metrics?.abProgress, 'number');
      assert.ok(profile.body.dailyTracker);

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

      const preview = await request(app)
        .get(`/api/admin/participants/${p.id}/pdf-preview`)
        .set(adminAuth);
      assert.equal(preview.status, 200);
      assert.match(String(preview.headers['content-type'] || ''), /pdf/i);
    } finally {
      await request(app)
        .patch('/api/admin/forum-settings')
        .set(adminAuth)
        .send({ currentDay: prevDay });
    }
  });
});
