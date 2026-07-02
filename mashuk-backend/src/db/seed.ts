import 'dotenv/config';

import { eq } from 'drizzle-orm';

import { db } from '../db/index.js';

import {

  directions, thematicTags, forumSettings, dayFocus,

  events, tasks, questions, levelsConfig, materials,

  participants, adminUsers, answers, taskSubmissions,

  exchangeQuestions, exchangeAnswers, eventAttendance,

} from './schema.js';

import { recalculateDailyStats } from '../services/analyticsService.js';



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



    await db.insert(forumSettings).values({

      currentDay: 1,

      totalDays: 4,

      recommendationThreshold: 1,

      sectionsVisibility: { home: true, program: true, tasks: true, questions: true, profile: true },

    });



    for (let d = 1; d <= 4; d++) {

      await db.insert(dayFocus).values({

        dayNumber: d,

        title: `Фокус дня ${d}`,

        text: `Краткое описание фокуса для дня ${d}`,

        keyQuestion: `Ключевой вопрос дня ${d}?`,

      });

    }



    const now = new Date();

    const day1Start = new Date(now);

    day1Start.setHours(9, 0, 0, 0);



    await db.insert(events).values([

      { title: 'Открытие форума', place: 'Главная сцена', dayNumber: 1, startTime: day1Start, tags: ['управление'] },

      { title: 'Работа по направлению', place: 'Шатёр «Учителя»', dayNumber: 1, startTime: new Date(day1Start.getTime() + 2 * 3600000), tags: ['команда'] },

      { title: 'Уроки о важном', place: 'Конференц-зал', dayNumber: 1, startTime: new Date(day1Start.getTime() + 5 * 3600000), tags: ['коммуникация'] },

    ]).returning();



    await db.insert(tasks).values([

      { title: 'Познакомься с участником другого направления', category: 'Нетворкинг', points: 20, dayNumber: 1, publishTime: now, autoConfirm: true },

      { title: 'Напиши пост о форуме', category: 'Медиа', points: 30, dayNumber: 1, publishTime: now, autoConfirm: false, answerType: 'text_and_photo' },

    ]).returning();



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

        title: 'Как ты сегодня?',

        text: 'Выберите эмоцию и уровень энергии',

        type: 'checkin',

        block: 'Проверка состояния',

        status: 'published',

        publishTime: now,

        timePoint: 'утро',

        points: 5,

        dayNumber: 1,

      },

    ]).returning();



    await db.insert(levelsConfig).values([

      { actionType: 'question_answer', pointsPerUnit: 10, maxAccruals: 50 },

      { actionType: 'task_complete', pointsPerUnit: 20, maxAccruals: 100 },

      { actionType: 'exchange_answer', pointsPerUnit: 5, maxAccruals: 30 },

      { actionType: 'exchange_question', pointsPerUnit: 5, maxAccruals: 20 },

      { actionType: 'piggybank_entry', pointsPerUnit: 3, maxAccruals: 50 },

      { actionType: 'piggybank_idea', pointsPerUnit: 5, maxAccruals: 30 },

      { actionType: 'piggybank_thought', pointsPerUnit: 3, maxAccruals: 30 },

      { actionType: 'piggybank_question', pointsPerUnit: 3, maxAccruals: 30 },

      { actionType: 'path_level', pointsPerUnit: 0, levelThresholds: [0, 100, 250, 500, 1000] },

      { actionType: 'exp_level', pointsPerUnit: 0, levelThresholds: [0, 100, 250, 500, 1000] },

    ]);



    await db.insert(materials).values([

      { dayNumber: 1, speakerName: 'Алексей Кравцов', speakerInitials: 'АК', eventTitle: 'Открытие форума', type: 'pdf', title: 'Конспект лекции', description: '3 стр.', url: 'https://example.com/conspect.pdf' },

    ]);



    console.log('Base data seeded.');
  } else {

    console.log('Base data already exists, skipping.');

  }



  const [testParticipant] = await db.select().from(participants).where(eq(participants.vkId, 1)).limit(1);

  let participantId: number;

  if (!testParticipant) {

    const [dir] = await db.select().from(directions).where(eq(directions.name, 'Учителя')).limit(1);

    const [created] = await db.insert(participants).values({

      vkId: 1,

      firstName: 'Тест',

      lastName: 'Пользователь',

      directionId: dir?.id,

      direction: dir?.name || 'Учителя',

      interests: ['управление', 'команда'],

      pathPoints: 10,

      experiencePoints: 20,

    }).returning();

    participantId = created.id;

    console.log('Test participant vk_id=1 created.');

  } else {

    participantId = testParticipant.id;

  }



  // Demo rows for admin «Данные» tab (idempotent-ish: skip if answers exist for participant)

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



  const [testAdmin] = await db.select().from(adminUsers).where(eq(adminUsers.login, 'admin')).limit(1);

  if (!testAdmin) {

    await db.insert(adminUsers).values({

      login: 'admin',

      passwordHash: 'mashuk-admin-2026',

      role: 'superadmin',

      vkId: 1,

    });

    console.log('Admin user created (login: admin).');

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


