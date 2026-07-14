/**
 * Операционный bootstrap перед сменой:
 * startDate / currentDay, шаблон 7×7, согласия, группы,
 * push-шаблоны, publish дней 1–3, проверка Точки Б.
 *
 * Запуск: npx tsx src/db/ops-bootstrap.ts
 */
import 'dotenv/config';
import { and, eq, sql } from 'drizzle-orm';
import { db } from './index.js';
import {
  forumSettings, questions, consentTexts, participantGroups,
  pushTemplates, medals, scheduleDays, scheduleDayVersions, events,
  dayFocus, pedagogicalRoles, dayExperiments, tasks,
} from './schema.js';
import { TOUCHPOINT_SLOTS, windowsForDay } from '../services/touchpointTemplates.js';
import { ROLE_CATALOG } from '../services/roleService.js';

async function ensureForumSettings() {
  const [settings] = await db.select().from(forumSettings).limit(1);
  const startDate = settings?.startDate || new Date('2026-08-12T00:00:00+03:00');
  if (!settings) {
    await db.insert(forumSettings).values({
      currentDay: 1,
      totalDays: 8,
      startDate,
      groupAssignMode: 'list',
      kbUnlockThreshold: 4,
      kbUnlockDisabled: false,
      sectionsVisibility: { home: true, program: true, tasks: true, questions: true, profile: true },
    });
    console.log('forum_settings created (day 1 / 8, start 2026-08-12).');
    return startDate;
  }
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if ((settings.totalDays ?? 0) < 8) patch.totalDays = 8;
  if (!settings.startDate) patch.startDate = startDate;
  if (!settings.groupAssignMode) patch.groupAssignMode = 'list';
  if (settings.kbUnlockThreshold == null) patch.kbUnlockThreshold = 4;
  if (Object.keys(patch).length > 1) {
    await db.update(forumSettings).set(patch).where(eq(forumSettings.id, settings.id));
    console.log('forum_settings updated:', patch);
  } else {
    console.log(`forum_settings ok: day ${settings.currentDay}/${settings.totalDays}, start=${settings.startDate?.toISOString()}`);
  }
  return (patch.startDate as Date) || settings.startDate || startDate;
}

async function ensureTouchpoints7x7(startDate: Date) {
  const existing = await db.select().from(questions);
  const hasD1Morning = existing.some(
    q => q.dayNumber === 1 && q.title === 'Утренняя проверка состояния',
  );
  if (hasD1Morning) {
    const count = existing.filter(q =>
      q.title === 'Утренняя проверка состояния' || q.block === 'Точки осмысления' || q.block === 'Итоги дня' || q.block === 'Проверка состояния',
    ).length;
    console.log(`Touchpoints already present (~${count} related rows).`);
    return;
  }

  let created = 0;
  for (let day = 1; day <= 7; day++) {
    for (const slot of TOUCHPOINT_SLOTS) {
      if (existing.some(q => q.dayNumber === day && q.title === slot.title)) continue;
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
      created++;
    }
  }
  console.log(`Touchpoint template 7×7 created: ${created} questions.`);
}

async function ensurePointB() {
  const [pb] = await db.select().from(questions)
    .where(and(eq(questions.block, 'Точка Б'), eq(questions.status, 'published')))
    .limit(1);
  if (pb) {
    console.log(`Точка Б ok: id=${pb.id}, day=${pb.dayNumber}`);
    return;
  }
  await db.insert(questions).values({
    title: 'Точка Б',
    text: 'Финальная рефлексия: ответь на те же 5 вопросов, что на входе, и выбери сильную роль и роль роста.',
    type: 'open',
    block: 'Точка Б',
    status: 'published',
    publishTime: new Date(),
    points: 30,
    dayNumber: 8,
  });
  console.log('Точка Б question created for day 8.');
}

async function ensureContent() {
  if ((await db.select().from(consentTexts).limit(1)).length === 0) {
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
  } else {
    console.log('Consent texts ok.');
  }

  if ((await db.select().from(participantGroups).limit(1)).length === 0) {
    await db.insert(participantGroups).values([
      { name: 'Группа А', capacity: 30 },
      { name: 'Группа Б', capacity: 30 },
      { name: 'Группа В', capacity: 30 },
    ]);
    console.log('Groups seeded.');
  } else {
    console.log('Groups ok.');
  }

  if ((await db.select().from(pushTemplates).limit(1)).length === 0) {
    await db.insert(pushTemplates).values([
      { key: 'slot_0800', slotKey: 'slot_0800', title: 'Утро', body: 'Доброе утро! 1 минута на проверку состояния', isActive: true },
      { key: 'slot_1300', slotKey: 'slot_1300', title: 'День', body: 'Две задачи дня: осмысление направления и проверка состояния', isActive: true },
      { key: 'slot_1600', slotKey: 'slot_1600', title: 'После урока', body: 'На каком уроке был? Коротко зафиксируй', isActive: true },
      { key: 'slot_1830', slotKey: 'slot_1830', title: 'Вечер', body: 'Вечерняя проверка состояния и осмысление', isActive: true },
      { key: 'slot_2200', slotKey: 'slot_2200', title: 'Итог', body: 'Финал дня — оцени и поделись', isActive: true },
      { key: 'slot_2300', slotKey: 'slot_2300', title: 'Ночь', body: 'Спокойной ночи! Если остались мысли — запиши в копилку', isActive: true },
    ]);
    console.log('Push templates seeded.');
  } else {
    console.log('Push templates ok.');
  }

  if ((await db.select().from(medals).limit(1)).length === 0) {
    await db.insert(medals).values([
      { name: 'Первый шаг', description: 'Выполнено ≥1 задание', conditionRule: 'tasks_completed>=1', awardType: 'auto', level: 'bronze', category: 'tasks' },
      { name: 'Копилка идей', description: '≥20 записей в копилке', conditionRule: 'piggybank_count>=20', awardType: 'auto', level: 'silver', category: 'piggybank' },
      { name: 'Рефлексивный', description: '≥10 ответов на вопросы', conditionRule: 'answers_count>=10', awardType: 'auto', level: 'bronze', category: 'reflection' },
      { name: 'Путь 100', description: '≥100 баллов Пути', conditionRule: 'path_points>=100', awardType: 'auto', level: 'gold', category: 'points' },
    ]);
    console.log('Medals seeded.');
  } else {
    console.log('Medals ok.');
  }

  for (const role of ROLE_CATALOG) {
    const [existing] = await db.select().from(pedagogicalRoles).where(eq(pedagogicalRoles.roleKey, role.roleKey)).limit(1);
    if (!existing) await db.insert(pedagogicalRoles).values(role);
  }

  if ((await db.select().from(dayExperiments).limit(1)).length === 0) {
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
}

/** Опубликовать дни 1–3 расписания (снимок событий) */
async function ensureDemoEvents() {
  const existing = await db.select().from(events);
  const need: { dayNumber: number; title: string; place: string; hour: number }[] = [
    { dayNumber: 2, title: 'Утренний круг', place: 'Площадка у озера', hour: 9 },
    { dayNumber: 2, title: 'Работа по направлению', place: 'Шатёр', hour: 11 },
    { dayNumber: 2, title: 'Уроки о важном', place: 'Конференц-зал', hour: 15 },
    { dayNumber: 3, title: 'Мастерская направления', place: 'Шатёр', hour: 10 },
    { dayNumber: 3, title: 'Открытые уроки', place: 'Классные пространства', hour: 14 },
    { dayNumber: 3, title: 'Вечерняя атмосферная программа', place: 'Главная сцена', hour: 20 },
  ];
  let created = 0;
  for (const e of need) {
    if (existing.some(x => x.dayNumber === e.dayNumber && x.title === e.title)) continue;
    const start = new Date(`2026-08-${11 + e.dayNumber}T${String(e.hour).padStart(2, '0')}:00:00+03:00`);
    const end = new Date(start.getTime() + 90 * 60_000);
    await db.insert(events).values({
      title: e.title,
      place: e.place,
      dayNumber: e.dayNumber,
      startTime: start,
      endTime: end,
      isPublished: true,
      dayPublished: true,
      tags: ['программа'],
      pushReminder: true,
    });
    created++;
  }
  if (created) console.log(`Demo events added: ${created}`);
  else console.log('Demo events ok.');
}

async function ensureDemoTasks() {
  const existing = await db.select().from(tasks);
  const need = [
    { title: 'Познакомься с участником другого направления', category: 'Полезные знакомства', points: 20, dayNumber: 1, confirmationType: 'auto', autoConfirm: true },
    { title: 'Напиши пост о форуме', category: 'Медиа', points: 30, dayNumber: 1, confirmationType: 'post_url', autoConfirm: false, answerType: 'text' },
    { title: 'Зафиксируй идею эксперимента', category: 'Образование', points: 25, dayNumber: 3, confirmationType: 'text_photo', autoConfirm: true },
    { title: 'Скан QR на площадке', category: 'Организация', points: 15, dayNumber: 2, confirmationType: 'qr', autoConfirm: true },
  ];
  let created = 0;
  for (const t of need) {
    if (existing.some(x => x.title === t.title)) continue;
    await db.insert(tasks).values({
      ...t,
      publishTime: new Date(),
      description: t.title,
    });
    created++;
  }
  if (created) console.log(`Demo tasks added: ${created}`);
  else console.log('Demo tasks ok.');
}

/** Опубликовать дни 1–3 расписания (снимок событий) */
async function publishScheduleDays(days: number[]) {
  for (const dayNumber of days) {
    const [existing] = await db.select().from(scheduleDays).where(eq(scheduleDays.dayNumber, dayNumber)).limit(1);
    const dayEvents = await db.select().from(events).where(eq(events.dayNumber, dayNumber));
    if (existing?.isPublished) {
      console.log(`Schedule day ${dayNumber} already published (${dayEvents.length} events).`);
      continue;
    }
    if (existing) {
      await db.update(scheduleDays)
        .set({ isPublished: true, publishedAt: new Date() })
        .where(eq(scheduleDays.id, existing.id));
    } else {
      await db.insert(scheduleDays).values({ dayNumber, isPublished: true, publishedAt: new Date() });
    }
    await db.update(events).set({ dayPublished: true, isPublished: true }).where(eq(events.dayNumber, dayNumber));
    const versions = await db.select().from(scheduleDayVersions).where(eq(scheduleDayVersions.dayNumber, dayNumber));
    const nextVersion = versions.length + 1;
    await db.insert(scheduleDayVersions).values({
      dayNumber,
      version: nextVersion,
      eventsSnapshot: dayEvents,
    });
    console.log(`Schedule day ${dayNumber} published (v${nextVersion}, ${dayEvents.length} events).`);
  }
}

async function printSummary() {
  const [settings] = await db.select().from(forumSettings).limit(1);
  const [{ count: qCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(questions);
  const [{ count: gCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(participantGroups);
  const [{ count: cCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(consentTexts);
  const [{ count: tCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(pushTemplates);
  const published = await db.select().from(scheduleDays).where(eq(scheduleDays.isPublished, true));

  console.log('\n=== OPS BOOTSTRAP SUMMARY ===');
  console.log(`currentDay=${settings?.currentDay} totalDays=${settings?.totalDays}`);
  console.log(`startDate=${settings?.startDate?.toISOString()}`);
  console.log(`groupAssignMode=${settings?.groupAssignMode} kbThreshold=${settings?.kbUnlockThreshold}`);
  console.log(`questions=${qCount} groups=${gCount} consents=${cCount} pushTemplates=${tCount}`);
  console.log(`publishedDays=${published.map(d => d.dayNumber).join(',') || 'none'}`);
  console.log('=============================\n');
}

async function main() {
  console.log('Ops bootstrap starting...');
  const startDate = await ensureForumSettings();
  await ensureTouchpoints7x7(startDate);
  await ensurePointB();
  await ensureContent();
  await ensureDemoEvents();
  await ensureDemoTasks();
  await publishScheduleDays([1, 2, 3]);
  await printSummary();
  console.log('Ops bootstrap complete.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
