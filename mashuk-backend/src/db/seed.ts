import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  directions, thematicTags, forumSettings, dayFocus,
  events, tasks, questions, levelsConfig, materials,
  participants, answers, taskSubmissions,
  exchangeQuestions, exchangeAnswers, eventAttendance,
  pedagogicalRoles, dayExperiments,
  consentTexts, participantGroups, medals, pushTemplates,
} from './schema.js';
import { recalculateDailyStats } from '../services/analyticsService.js';
import { ROLE_CATALOG } from '../services/roleService.js';
import { TOUCHPOINT_SLOTS, windowsForDay } from '../services/touchpointTemplates.js';

export async function runSeed() {
  console.log('Seeding database...');

  const existingSettings = await db.select().from(forumSettings).limit(1);
  if (existingSettings.length === 0) {
    await db.insert(directions).values([
      { name: 'Учителя' },
      { name: 'Управление' },
      { name: 'Команда' },
      { name: 'Аналитика' },
      { name: 'Творчество' },
    ]);

    await db.insert(thematicTags).values([
      { name: 'управление' }, { name: 'команда' }, { name: 'коммуникация' },
      { name: 'аналитика' }, { name: 'технологии' }, { name: 'творчество' },
    ]);

    const startDate = new Date('2026-08-12T00:00:00');
    await db.insert(forumSettings).values({
      currentDay: 3,
      totalDays: 8,
      recommendationThreshold: 1,
      startDate,
      sectionsVisibility: { home: true, program: true, tasks: true, questions: true, profile: true },
    });

    const dayTitles = [
      'Знакомство и старт',
      'Смыслы и запросы',
      'Практика и эксперимент',
      'Команды и диалог',
      'Инструменты',
      'Пробы в поле',
      'Сборка опыта',
      'Точка Б · Отъезд',
    ];
    for (let d = 1; d <= 8; d++) {
      await db.insert(dayFocus).values({
        dayNumber: d,
        title: dayTitles[d - 1],
        text: d === 8
          ? 'Финальная рефлексия смены. Дневная программа не запускается.'
          : `Краткое описание фокуса: ${dayTitles[d - 1]}`,
        keyQuestion: d === 8 ? 'Что изменилось за эти 8 дней?' : `Ключевой вопрос дня ${d}?`,
      });
    }

    const now = new Date();
    const day1Start = new Date(now);
    day1Start.setHours(9, 0, 0, 0);

    await db.insert(events).values([
      { title: 'Открытие форума', place: 'Главная сцена', dayNumber: 1, startTime: day1Start, tags: ['управление'] },
      { title: 'Работа по направлению', place: 'Шатёр «Учителя»', dayNumber: 1, startTime: new Date(day1Start.getTime() + 2 * 3600000), tags: ['команда'] },
      { title: 'Уроки о важном', place: 'Конференц-зал', dayNumber: 1, startTime: new Date(day1Start.getTime() + 5 * 3600000), tags: ['коммуникация'] },
      { title: 'Утренний круг', place: 'Площадка у озера', dayNumber: 2, startTime: new Date(day1Start.getTime() + 86400000), tags: ['коммуникация'] },
      { title: 'Мастерская направления', place: 'Шатёр', dayNumber: 3, startTime: new Date(day1Start.getTime() + 2 * 86400000), tags: ['команда'] },
      { title: 'Вечерняя рефлексия', place: 'В боте', dayNumber: 3, startTime: new Date(day1Start.getTime() + 2 * 86400000 + 12 * 3600000), tags: ['аналитика'] },
    ]);

    await db.insert(tasks).values([
      { title: 'Познакомься с участником другого направления', category: 'Нетворкинг', points: 20, dayNumber: 1, publishTime: now, autoConfirm: true, confirmationType: 'auto' },
      { title: 'Напиши пост о форуме', category: 'Медиа', points: 30, dayNumber: 1, publishTime: now, autoConfirm: false, answerType: 'text_and_photo', confirmationType: 'post_url' },
      { title: 'Зафиксируй идею эксперимента', category: 'Образование', points: 25, dayNumber: 3, publishTime: now, autoConfirm: true, confirmationType: 'text_photo' },
      { title: 'Скан QR на площадке', category: 'Организация', points: 15, dayNumber: 2, publishTime: now, autoConfirm: true, confirmationType: 'qr' },
    ]);

    // 7 точек × дни 1–7 с окнами МСК по startDate
    for (let day = 1; day <= 7; day++) {
      for (const slot of TOUCHPOINT_SLOTS) {
        const { publishTime, closeTime } = windowsForDay(startDate, day, slot);
        await db.insert(questions).values({
          title: slot.title,
          text: slot.text,
          type: slot.type,
          block: slot.block,
          status: 'published',
          publishTime,
          closeTime,
          points: slot.points,
          dayNumber: day,
          timePoint: slot.timePoint,
        });
      }
    }

    await db.insert(questions).values([
      {
        title: 'Цель на форум',
        text: 'Какую цель вы ставите перед собой на форуме?',
        type: 'open',
        block: 'Целеполагание',
        status: 'published',
        publishTime: now,
        points: 10,
        dayNumber: 1,
      },
      {
        title: 'Точка Б',
        text: 'Финальная рефлексия: ответь на те же 5 вопросов, что на входе, и выбери сильную роль и роль роста.',
        type: 'open',
        block: 'Точка Б',
        status: 'published',
        publishTime: now,
        points: 30,
        dayNumber: 8,
      },
    ]);

    await db.insert(levelsConfig).values([
      { actionType: 'question_answer', pointsPerUnit: 10, maxAccruals: 100 },
      { actionType: 'task_complete', pointsPerUnit: 20, maxAccruals: 100 },
      { actionType: 'exchange_answer', pointsPerUnit: 5, maxAccruals: 50 },
      { actionType: 'exchange_question', pointsPerUnit: 5, maxAccruals: 30 },
      { actionType: 'piggybank_entry', pointsPerUnit: 3, maxAccruals: 100 },
      { actionType: 'piggybank_idea', pointsPerUnit: 5, maxAccruals: 50 },
      { actionType: 'piggybank_thought', pointsPerUnit: 3, maxAccruals: 50 },
      { actionType: 'piggybank_question', pointsPerUnit: 3, maxAccruals: 50 },
      { actionType: 'evening_complete', pointsPerUnit: 15, maxAccruals: 8 },
      { actionType: 'attendance', pointsPerUnit: 5, maxAccruals: 40 },
      { actionType: 'path_level', pointsPerUnit: 0, levelThresholds: [0, 50, 120, 250, 450, 700, 1000] },
      { actionType: 'exp_level', pointsPerUnit: 0, levelThresholds: [0, 50, 120, 250, 450, 700, 1000] },
    ]);

    await db.insert(materials).values([
      { dayNumber: 1, speakerName: 'Алексей Кравцов', speakerInitials: 'АК', eventTitle: 'Открытие форума', type: 'pdf', title: 'Конспект лекции', description: '3 стр.', url: 'https://example.com/conspect.pdf', isNew: true },
      { dayNumber: 2, speakerName: 'Мария Орлова', speakerInitials: 'МО', eventTitle: 'Утренний круг', type: 'link', title: 'Материалы круга', description: 'Ссылка', url: 'https://example.com/circle', isNew: true },
      { dayNumber: 3, speakerName: 'Игорь Семёнов', speakerInitials: 'ИС', eventTitle: 'Мастерская направления', type: 'pdf', title: 'Рабочая тетрадь', description: '5 стр.', url: 'https://example.com/workbook.pdf', isNew: true },
    ]);

    console.log('Base data seeded.');
  } else {
    console.log('Base data already exists, skipping.');
    const [settings] = existingSettings;
    if ((settings.totalDays ?? 4) < 8) {
      await db.update(forumSettings).set({ totalDays: 8, updatedAt: new Date() }).where(eq(forumSettings.id, settings.id));
      console.log('Upgraded forum_settings.totalDays to 8.');
    }
  }

  // Ensure day_focus rows for days 1–8 exist
  for (let d = 1; d <= 8; d++) {
    const [exists] = await db.select().from(dayFocus).where(eq(dayFocus.dayNumber, d)).limit(1);
    if (!exists) {
      await db.insert(dayFocus).values({
        dayNumber: d,
        title: d === 8 ? 'Точка Б · Отъезд' : `Фокус дня ${d}`,
        text: d === 8 ? 'Финальная рефлексия смены.' : `Краткое описание фокуса для дня ${d}`,
        keyQuestion: d === 8 ? 'Что изменилось за эти 8 дней?' : `Ключевой вопрос дня ${d}?`,
      });
    }
  }

  // Pedagogical roles (idempotent)
  for (const role of ROLE_CATALOG) {
    const [existing] = await db.select().from(pedagogicalRoles).where(eq(pedagogicalRoles.roleKey, role.roleKey)).limit(1);
    if (!existing) {
      await db.insert(pedagogicalRoles).values(role);
    }
  }

  // Day experiments for days 2-7 × all roles (idempotent)
  const existingExp = await db.select().from(dayExperiments).limit(1);
  if (existingExp.length === 0) {
    const rows = [];
    for (let day = 2; day <= 7; day++) {
      for (const role of ROLE_CATALOG) {
        rows.push({
          dayNumber: day,
          roleKey: role.roleKey,
          title: `Эксперимент: ${role.name}`,
          body: `Сегодня попробуй проявить роль «${role.name}» в одном живом взаимодействии на форуме.`,
          hint: role.keywords,
        });
      }
    }
    await db.insert(dayExperiments).values(rows);
    console.log('Day experiments seeded.');
  }

  // Idempotent: развернуть шаблон 7×7 если нет утренней точки Д1
  const [settingsRow] = await db.select().from(forumSettings).limit(1);
  const startForWindows = settingsRow?.startDate || new Date('2026-08-12T00:00:00+03:00');
  if (settingsRow && !settingsRow.startDate) {
    await db.update(forumSettings).set({ startDate: startForWindows, updatedAt: new Date() })
      .where(eq(forumSettings.id, settingsRow.id));
  }
  const existingTouch = await db.select().from(questions);
  const hasTemplate = existingTouch.some(q => q.title === 'Утренняя проверка состояния' && q.dayNumber === 1);
  if (!hasTemplate) {
    for (let day = 1; day <= 7; day++) {
      for (const slot of TOUCHPOINT_SLOTS) {
        const already = existingTouch.find(q => q.dayNumber === day && q.title === slot.title);
        if (already) continue;
        const { publishTime, closeTime } = windowsForDay(startForWindows, day, slot);
        await db.insert(questions).values({
          title: slot.title,
          text: slot.text,
          type: slot.type,
          block: slot.block,
          status: 'published',
          publishTime,
          closeTime,
          points: slot.points,
          dayNumber: day,
          timePoint: slot.timePoint,
        });
      }
    }
    console.log('Touchpoint template 7×7 seeded (idempotent).');
  }

  const [testParticipant] = await db.select().from(participants).where(eq(participants.vkId, 1)).limit(1);
  let participantId: number;
  if (!testParticipant) {
    const [dir] = await db.select().from(directions).where(eq(directions.name, 'Учителя')).limit(1);
    const [created] = await db.insert(participants).values({
      vkId: 1,
      firstName: 'Тест',
      lastName: 'Пользователь',
      age: 34,
      workplace: 'Школа №1',
      position: 'Учитель',
      consentPd: true,
      consentAnalytics: true,
      directionId: dir?.id,
      direction: dir?.name || 'Учителя',
      interests: ['проектная работа', 'подростки', 'осмысленность обучения', 'командная работа учителей', 'открытые уроки'],
      pedagogicalRole: 'practice_realizer',
      goalAnswers: [
        'Найти единомышленников',
        'Практические инструменты',
        'Как встроить проекты в программу',
        'План на четверть',
        'Открытый обмен',
      ],
      roleAnswers: [1, 1, 0, 1, 1, 2],
      onboardingCompletedAt: new Date(),
      pathPoints: 10,
      experiencePoints: 20,
    }).returning();
    participantId = created.id;
    console.log('Test participant vk_id=1 created.');
  } else {
    participantId = testParticipant.id;
    if (!testParticipant.onboardingCompletedAt) {
      await db.update(participants).set({ onboardingCompletedAt: new Date() }).where(eq(participants.id, participantId));
    }
  }

  const existingAnswers = await db.select().from(answers).where(eq(answers.participantId, participantId)).limit(1);
  if (existingAnswers.length === 0) {
    const [q] = await db.select().from(questions).limit(1);
    const [task] = await db.select().from(tasks).limit(1);
    const [event] = await db.select().from(events).limit(1);

    if (q) {
      await db.insert(answers).values({
        participantId,
        questionId: q.id,
        answerData: { interests: ['управление', 'команда'] },
        wordCount: 5,
        pointsAwarded: 10,
      });
    }
    if (task) {
      await db.insert(taskSubmissions).values({
        participantId,
        taskId: task.id,
        answerText: 'Демо-ответ на задание',
        status: 'approved',
        pointsAwarded: task.points ?? 20,
      });
    }
    const [exQ] = await db.insert(exchangeQuestions).values({
      participantId,
      text: 'Как мотивировать подростков?',
      audience: 'all',
      moderationStatus: 'approved',
    }).returning();
    await db.insert(exchangeAnswers).values({
      questionId: exQ.id,
      participantId,
      text: 'Демо-ответ на обмен опытом',
      reactions: { likes: 1, discuss: 0 },
    });
    if (event) {
      await db.insert(eventAttendance).values({ participantId, eventId: event.id });
    }
    console.log('Demo activity data seeded for test participant.');
  }

  const { seedAdminUsers } = await import('./seedAdmins.js');
  await seedAdminUsers();

  // S2–S7 idempotent seeds
  const existingConsents = await db.select().from(consentTexts).limit(1);
  if (existingConsents.length === 0) {
    await db.insert(consentTexts).values([
      {
        kind: 'pd', version: 1, isActive: true,
        title: 'Согласие на обработку персональных данных',
        body: 'Я согласен(на) на обработку персональных данных в целях участия в форуме «Машук».',
      },
      {
        kind: 'analytics', version: 1, isActive: true,
        title: 'Согласие на аналитику',
        body: 'Я согласен(на) на обезличенную аналитику ответов для улучшения программы форума.',
      },
    ]);
    console.log('Consent texts seeded.');
  }

  const existingGroups = await db.select().from(participantGroups).limit(1);
  if (existingGroups.length === 0) {
    await db.insert(participantGroups).values([
      { name: 'Группа А', capacity: 30 },
      { name: 'Группа Б', capacity: 30 },
      { name: 'Группа В', capacity: 30 },
    ]);
    console.log('Participant groups seeded.');
  }

  const existingMedals = await db.select().from(medals).limit(1);
  if (existingMedals.length === 0) {
    await db.insert(medals).values([
      {
        name: 'Первый шаг', description: 'Выполнено ≥1 задание',
        conditionRule: 'tasks_completed>=1', awardType: 'auto', level: 'bronze', category: 'tasks',
      },
      {
        name: 'Копилка идей', description: '≥20 записей в копилке',
        conditionRule: 'piggybank_count>=20', awardType: 'auto', level: 'silver', category: 'piggybank',
      },
      {
        name: 'Рефлексивный', description: '≥10 ответов на вопросы',
        conditionRule: 'answers_count>=10', awardType: 'auto', level: 'bronze', category: 'reflection',
      },
      {
        name: 'Путь 100', description: '≥100 баллов Пути',
        conditionRule: 'path_points>=100', awardType: 'auto', level: 'gold', category: 'points',
      },
    ]);
    console.log('Medals seeded.');
  }

  const existingTpl = await db.select().from(pushTemplates).limit(1);
  if (existingTpl.length === 0) {
    await db.insert(pushTemplates).values(
      [
        { key: 'slot_0800', slotKey: 'slot_0800', title: 'Утро', body: 'Доброе утро! 1 минута на проверку состояния' },
        { key: 'slot_1300', slotKey: 'slot_1300', title: 'День', body: 'Две задачи дня: осмысление направления и проверка состояния' },
        { key: 'slot_1600', slotKey: 'slot_1600', title: 'После урока', body: 'На каком уроке был? Коротко зафиксируй' },
        { key: 'slot_1830', slotKey: 'slot_1830', title: 'Вечер', body: 'Вечерняя проверка состояния и осмысление' },
        { key: 'slot_2200', slotKey: 'slot_2200', title: 'Итог', body: 'Финал дня — оцени и поделись' },
        { key: 'slot_2300', slotKey: 'slot_2300', title: 'Ночь', body: 'Спокойной ночи! Если остались мысли — запиши в копилку' },
      ].map(t => ({ ...t, isActive: true })),
    );
    console.log('Push templates seeded.');
  }

  // Ensure evening_complete rate exists
  const [eveningRate] = await db.select().from(levelsConfig).where(eq(levelsConfig.actionType, 'evening_complete')).limit(1);
  if (!eveningRate) {
    await db.insert(levelsConfig).values({ actionType: 'evening_complete', pointsPerUnit: 15, maxAccruals: 8 });
  }

  const [qrTask] = await db.select().from(tasks).where(eq(tasks.confirmationType, 'qr')).limit(1);
  if (!qrTask) {
    await db.insert(tasks).values({
      title: 'Скан QR на площадке',
      category: 'Организация',
      points: 15,
      dayNumber: 2,
      publishTime: new Date(),
      autoConfirm: true,
      confirmationType: 'qr',
    });
    console.log('QR confirmation task seeded.');
  }

  await recalculateDailyStats();
  console.log('Analytics recalculated.');
  console.log('Seed complete.');
}

const isDirectRun = process.argv[1]?.endsWith('seed.js') || process.argv[1]?.endsWith('seed.ts');
if (isDirectRun) {
  runSeed()
    .then(() => process.exit(0))
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}
