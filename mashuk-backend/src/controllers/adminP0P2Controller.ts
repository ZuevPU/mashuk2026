import { Response } from 'express';
import { asc, count, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  answers, clubMatches, consentTexts, eventAttendance, events, materials,
  participantDayState, participantGroups, participants, piggybank, pointsLog, pushQueue, pushTemplates,
  questions, scheduleDayVersions, scheduleDays, taskSubmissions, tasks,
  userMedals, medals,
} from '../db/schema.js';
import { AdminRequest } from '../middlewares/adminAuth.js';
import { logAdminAction } from '../services/adminActionsLog.js';
import { deactivateOtherConsents } from './consentsController.js';
import { evaluateAllMedals } from '../services/medalEvaluator.js';
import { clubMatchNightly, isGigachatConfigured, synthesizeOutcomes } from '../services/gigachatService.js';
import { generateQrToken, buildTaskQrUrl, buildEventQrUrl, buildParticipantQrUrl } from '../services/qrService.js';
import { env } from '../config/env.js';
import { inferReflectionDepth } from '../services/reflectionDepth.js';
import { EVENING_SCALE_KEYS } from '../services/touchpointTemplates.js';

// ─── Consents CRUD ───────────────────────────────────────────

export const crudConsents = {
  list: async (_req: AdminRequest, res: Response) => {
    res.json({ consents: await db.select().from(consentTexts).orderBy(desc(consentTexts.createdAt)) });
  },
  create: async (req: AdminRequest, res: Response) => {
    const { kind, version, title, body, isActive } = req.body;
    if (!kind || !version || !title || !body) {
      res.status(400).json({ error: 'kind, version, title, body required' });
      return;
    }
    const [row] = await db.insert(consentTexts).values({
      kind,
      version: Number(version),
      title,
      body,
      isActive: !!isActive,
    }).returning();
    if (row.isActive) await deactivateOtherConsents(kind, row.id);
    await logAdminAction({ req, actionType: 'consent_create', section: 'consents', objectId: row.id, newValue: row });
    res.json({ consent: row });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [updated] = await db.update(consentTexts).set(req.body).where(eq(consentTexts.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    if (updated.isActive) await deactivateOtherConsents(updated.kind, updated.id);
    res.json({ consent: updated });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [deleted] = await db.delete(consentTexts).where(eq(consentTexts.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ ok: true });
  },
};

// ─── Groups CRUD ─────────────────────────────────────────────

export const crudGroups = {
  list: async (_req: AdminRequest, res: Response) => {
    const groups = await db.select().from(participantGroups).orderBy(asc(participantGroups.id));
    const withCounts = await Promise.all(groups.map(async (g) => {
      const [c] = await db.select({ c: count() }).from(participants).where(eq(participants.groupId, g.id));
      return { ...g, membersCount: Number(c?.c ?? 0) };
    }));
    res.json({ groups: withCounts });
  },
  create: async (req: AdminRequest, res: Response) => {
    const { name, directionId, capacity } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: 'name required' }); return; }
    const [g] = await db.insert(participantGroups).values({
      name: name.trim(),
      directionId: directionId ? Number(directionId) : null,
      capacity: capacity != null ? Number(capacity) : 30,
    }).returning();
    res.json({ group: g });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [updated] = await db.update(participantGroups).set(req.body).where(eq(participantGroups.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    // sync group_name on participants
    await db.update(participants).set({ groupName: updated.name }).where(eq(participants.groupId, id));
    res.json({ group: updated });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    await db.update(participants).set({ groupId: null, groupName: null }).where(eq(participants.groupId, id));
    const [deleted] = await db.delete(participantGroups).where(eq(participantGroups.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ ok: true });
  },
};

// ─── Schedule publish ────────────────────────────────────────

export const publishScheduleDay = async (req: AdminRequest, res: Response): Promise<void> => {
  const dayNumber = Number(req.body.dayNumber ?? req.params.dayNumber);
  if (!dayNumber) { res.status(400).json({ error: 'dayNumber required' }); return; }

  const dayEvents = await db.select().from(events).where(eq(events.dayNumber, dayNumber));
  const versions = await db.select().from(scheduleDayVersions)
    .where(eq(scheduleDayVersions.dayNumber, dayNumber))
    .orderBy(desc(scheduleDayVersions.version));
  const nextVersion = (versions[0]?.version ?? 0) + 1;

  const [snap] = await db.insert(scheduleDayVersions).values({
    dayNumber,
    version: nextVersion,
    eventsSnapshot: dayEvents,
    publishedByAdminId: req.adminId ?? null,
  }).returning();

  const [existingDay] = await db.select().from(scheduleDays).where(eq(scheduleDays.dayNumber, dayNumber)).limit(1);
  if (existingDay) {
    await db.update(scheduleDays).set({ isPublished: true, publishedAt: new Date() })
      .where(eq(scheduleDays.id, existingDay.id));
  } else {
    await db.insert(scheduleDays).values({ dayNumber, isPublished: true, publishedAt: new Date() });
  }

  await db.update(events).set({ dayPublished: true, isPublished: true })
    .where(eq(events.dayNumber, dayNumber));

  const { clearCache } = await import('../services/cache.js');
  clearCache(`events_day_${dayNumber}`);

  await logAdminAction({
    req, actionType: 'schedule_publish', section: 'events', objectId: dayNumber,
    newValue: { version: nextVersion, events: dayEvents.length }, isCritical: true,
  });

  res.json({ ok: true, version: snap, eventsCount: dayEvents.length });
};

export const listScheduleVersions = async (req: AdminRequest, res: Response): Promise<void> => {
  const day = req.query.day ? Number(req.query.day) : null;
  let rows = await db.select().from(scheduleDayVersions).orderBy(desc(scheduleDayVersions.publishedAt));
  if (day) rows = rows.filter(r => r.dayNumber === day);
  const days = await db.select().from(scheduleDays);
  res.json({ versions: rows, days });
};

// ─── Push templates + queue ───────────────────────────────────

export const crudPushTemplates = {
  list: async (_req: AdminRequest, res: Response) => {
    res.json({ templates: await db.select().from(pushTemplates).orderBy(asc(pushTemplates.key)) });
  },
  create: async (req: AdminRequest, res: Response) => {
    const { key, title, body, slotKey, isActive } = req.body;
    if (!key || !body) { res.status(400).json({ error: 'key and body required' }); return; }
    const [t] = await db.insert(pushTemplates).values({
      key, title, body, slotKey, isActive: isActive !== false,
    }).returning();
    res.json({ template: t });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [updated] = await db.update(pushTemplates)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(pushTemplates.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ template: updated });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [deleted] = await db.delete(pushTemplates).where(eq(pushTemplates.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ ok: true });
  },
};

export const enqueuePush = async (req: AdminRequest, res: Response): Promise<void> => {
  const { text, templateId, scheduledAt, target, participantIds } = req.body;
  let body = text;
  if (templateId) {
    const [t] = await db.select().from(pushTemplates).where(eq(pushTemplates.id, Number(templateId))).limit(1);
    if (t) body = t.body;
  }
  if (!body?.trim()) { res.status(400).json({ error: 'text or templateId required' }); return; }
  const when = scheduledAt ? new Date(scheduledAt) : new Date();
  const [row] = await db.insert(pushQueue).values({
    templateId: templateId ? Number(templateId) : null,
    text: body.trim(),
    scheduledAt: when,
    status: 'pending',
    target: target || 'all',
    participantIds: participantIds || null,
    createdByAdminId: req.adminId ?? null,
  }).returning();
  res.json({ item: row });
};

export const listPushQueue = async (_req: AdminRequest, res: Response): Promise<void> => {
  res.json({ queue: await db.select().from(pushQueue).orderBy(desc(pushQueue.createdAt)).limit(100) });
};

// ─── Day export XLSX / multi-CSV ─────────────────────────────

function toCsvSection(name: string, header: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [
    `### SHEET: ${name}`,
    header.map(esc).join(','),
    ...rows.map(r => r.map(esc).join(',')),
    '',
  ].join('\n');
}

function filterAnswersByType(
  rows: { q: typeof questions.$inferSelect | null }[],
  type: string | null,
) {
  if (!type || type === 'all') return rows;
  return rows.filter(r => {
    const block = (r.q?.block || '').toLowerCase();
    const t = (r.q?.type || '').toLowerCase();
    const title = (r.q?.title || '').toLowerCase();
    if (type === 'checkin' || type === 'проверка') {
      return block.includes('проверка') || t === 'checkin';
    }
    if (type === 'direction' || type === 'направление') {
      return block.includes('направлен') || (block.includes('осмыслен') && !title.includes('урока'));
    }
    if (type === 'lessons' || type === 'уроки') {
      return title.includes('урока') || block.includes('урок');
    }
    if (type === 'evening' || type === 'итоги') {
      return block.includes('итог') || block.includes('вечер');
    }
    if (type === 'point_a' || type === 'точка_а') {
      return block.includes('целеполагание') || block.includes('точка а');
    }
    if (type === 'point_b' || type === 'точка_б') {
      return block.includes('точка б');
    }
    return true;
  });
}

export const exportDayWorkbook = async (req: AdminRequest, res: Response): Promise<void> => {
  const day = Number(req.query.day) || 1;
  const type = (req.query.type as string | undefined)?.toLowerCase() || 'all';

  const dayQuestions = await db.select().from(questions).where(eq(questions.dayNumber, day));
  const qIds = new Set(dayQuestions.map(q => q.id));
  const allAns = await db.select({ a: answers, p: participants, q: questions })
    .from(answers)
    .leftJoin(participants, eq(answers.participantId, participants.id))
    .leftJoin(questions, eq(answers.questionId, questions.id));
  let dayAns = allAns.filter(r => r.q && qIds.has(r.q.id));
  dayAns = filterAnswersByType(dayAns, type) as typeof dayAns;

  const dayEvents = await db.select().from(events).where(eq(events.dayNumber, day));
  const dayTasks = await db.select().from(tasks).where(eq(tasks.dayNumber, day));
  const dayMats = await db.select().from(materials).where(eq(materials.dayNumber, day));
  const subs = await db.select({ s: taskSubmissions, p: participants, t: tasks })
    .from(taskSubmissions)
    .leftJoin(participants, eq(taskSubmissions.participantId, participants.id))
    .leftJoin(tasks, eq(taskSubmissions.taskId, tasks.id));
  const daySubs = subs.filter(r => r.t && (r.t.dayNumber === day || dayTasks.some(t => t.id === r.t!.id)));

  const roleRows = await db.select({ s: participantDayState, p: participants })
    .from(participantDayState)
    .leftJoin(participants, eq(participantDayState.participantId, participants.id));
  const dayRoles = roleRows.filter(r => r.s.dayNumber === day);
  const allParticipants = await db.select().from(participants);

  // Prefer exceljs if installed
  try {
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const sheetAns = wb.addWorksheet('Ответы');
    sheetAns.addRow(['id', 'participant', 'direction', 'question', 'block', 'answer', 'words', 'depth']);
    for (const r of dayAns) {
      const text = typeof r.a.answerData === 'string' ? r.a.answerData : JSON.stringify(r.a.answerData);
      sheetAns.addRow([
        r.a.id,
        `${r.p?.firstName ?? ''} ${r.p?.lastName ?? ''}`.trim(),
        r.p?.direction,
        r.q?.title,
        r.q?.block,
        text,
        r.a.wordCount,
        inferReflectionDepth(text),
      ]);
    }
    const sheetEv = wb.addWorksheet('События');
    sheetEv.addRow(['id', 'title', 'place', 'start', 'end']);
    for (const e of dayEvents) sheetEv.addRow([e.id, e.title, e.place, e.startTime?.toISOString(), e.endTime?.toISOString()]);
    const sheetTasks = wb.addWorksheet('Задания');
    sheetTasks.addRow(['id', 'title', 'points', 'confirmation']);
    for (const t of dayTasks) sheetTasks.addRow([t.id, t.title, t.points, t.confirmationType]);
    const sheetSubs = wb.addWorksheet('Сдачи');
    sheetSubs.addRow(['id', 'participant', 'task', 'status', 'points']);
    for (const r of daySubs) {
      sheetSubs.addRow([
        r.s.id,
        `${r.p?.firstName ?? ''} ${r.p?.lastName ?? ''}`.trim(),
        r.t?.title,
        r.s.status,
        r.s.pointsAwarded,
      ]);
    }
    const sheetMat = wb.addWorksheet('Материалы');
    sheetMat.addRow(['id', 'title', 'type', 'direction', 'url']);
    for (const m of dayMats) sheetMat.addRow([m.id, m.title, m.type, m.direction, m.url]);

    const sheetRoles = wb.addWorksheet('Роли по дням');
    sheetRoles.addRow([
      'participant_id', 'name', 'direction', 'group', 'day',
      'start_role', 'active_role', 'tomorrow_role', 'experiment_status',
    ]);
    for (const r of dayRoles) {
      sheetRoles.addRow([
        r.p?.id,
        `${r.p?.firstName ?? ''} ${r.p?.lastName ?? ''}`.trim(),
        r.p?.direction,
        r.p?.groupName,
        r.s.dayNumber,
        r.p?.pedagogicalRole,
        r.s.activeRoleKey,
        r.s.tomorrowRoleKey,
        r.s.experimentStatus,
      ]);
    }
    // Also trajectory sheet: one row per participant with days 1-7
    const byParticipant = new Map<number, typeof roleRows>();
    for (const r of roleRows) {
      const id = r.p?.id;
      if (!id) continue;
      if (!byParticipant.has(id)) byParticipant.set(id, []);
      byParticipant.get(id)!.push(r);
    }
    const sheetTraj = wb.addWorksheet('Траектория ролей');
    sheetTraj.addRow(['participant_id', 'name', 'start_role', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'strong', 'growth']);
    for (const p of allParticipants) {
      const states = byParticipant.get(p.id) || [];
      const byDay: Record<number, string> = {};
      for (const s of states) {
        byDay[s.s.dayNumber] = s.s.activeRoleKey || s.s.tomorrowRoleKey || '';
      }
      sheetTraj.addRow([
        p.id,
        `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
        p.pedagogicalRole,
        byDay[1] || '', byDay[2] || '', byDay[3] || '', byDay[4] || '',
        byDay[5] || '', byDay[6] || '', byDay[7] || '',
        p.strongRole, p.growthRole,
      ]);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=day_${day}_${type}.xlsx`);
    await wb.xlsx.write(res);
    return;
  } catch {
    // fallback: multi-section CSV
  }

  const csv = [
    toCsvSection('Ответы',
      ['id', 'participant', 'direction', 'question', 'block', 'answer', 'words'],
      dayAns.map(r => [
        r.a.id,
        `${r.p?.firstName ?? ''} ${r.p?.lastName ?? ''}`.trim(),
        r.p?.direction,
        r.q?.title,
        r.q?.block,
        typeof r.a.answerData === 'string' ? r.a.answerData : JSON.stringify(r.a.answerData),
        r.a.wordCount,
      ]),
    ),
    toCsvSection('События',
      ['id', 'title', 'place'],
      dayEvents.map(e => [e.id, e.title, e.place]),
    ),
    toCsvSection('Задания',
      ['id', 'title', 'points'],
      dayTasks.map(t => [t.id, t.title, t.points]),
    ),
    toCsvSection('Сдачи',
      ['id', 'participant', 'task', 'status'],
      daySubs.map(r => [
        r.s.id,
        `${r.p?.firstName ?? ''} ${r.p?.lastName ?? ''}`.trim(),
        r.t?.title,
        r.s.status,
      ]),
    ),
    toCsvSection('Материалы',
      ['id', 'title', 'url'],
      dayMats.map(m => [m.id, m.title, m.url]),
    ),
    toCsvSection('Роли',
      ['participant', 'day', 'active', 'tomorrow', 'start'],
      dayRoles.map(r => [
        `${r.p?.firstName ?? ''} ${r.p?.lastName ?? ''}`.trim(),
        r.s.dayNumber,
        r.s.activeRoleKey,
        r.s.tomorrowRoleKey,
        r.p?.pedagogicalRole,
      ]),
    ),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=day_${day}_${type}.csv`);
  res.send('\uFEFF' + csv);
};

export const getParticipantCard = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [p] = await db.select().from(participants).where(eq(participants.id, id)).limit(1);
  if (!p) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const [userAnswers, userSubs, userPoints, userMedalsRows, dayStates] = await Promise.all([
    db.select({ a: answers, q: questions })
      .from(answers)
      .leftJoin(questions, eq(answers.questionId, questions.id))
      .where(eq(answers.participantId, id)),
    db.select({ s: taskSubmissions, t: tasks })
      .from(taskSubmissions)
      .leftJoin(tasks, eq(taskSubmissions.taskId, tasks.id))
      .where(eq(taskSubmissions.participantId, id)),
    db.select().from(pointsLog).where(eq(pointsLog.participantId, id)).orderBy(desc(pointsLog.createdAt)).limit(50),
    db.select({ um: userMedals, m: medals })
      .from(userMedals)
      .leftJoin(medals, eq(userMedals.medalId, medals.id))
      .where(eq(userMedals.participantId, id)),
    db.select().from(participantDayState).where(eq(participantDayState.participantId, id)),
  ]);

  res.json({
    participant: p,
    answers: userAnswers.map(r => ({
      id: r.a.id,
      questionTitle: r.q?.title,
      block: r.q?.block,
      dayNumber: r.q?.dayNumber,
      answerData: r.a.answerData,
      createdAt: r.a.createdAt,
    })),
    submissions: userSubs.map(r => ({
      id: r.s.id,
      taskTitle: r.t?.title,
      status: r.s.status,
      pointsAwarded: r.s.pointsAwarded,
      createdAt: r.s.submittedAt,
    })),
    points: userPoints,
    medals: userMedalsRows.map(r => ({
      id: r.um.id,
      name: r.m?.name,
      level: r.m?.level,
      awardedAt: r.um.awardedAt,
    })),
    dayStates,
  });
};

// ─── Real PDF ────────────────────────────────────────────────

export const buildParticipantPdf = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const { pdfWhitelist } = await import('../db/schema.js');
  const [wl] = await db.select().from(pdfWhitelist).where(eq(pdfWhitelist.participantId, id)).limit(1);
  if (!wl?.enabled) {
    res.status(403).json({ error: 'Participant not on PDF whitelist' });
    return;
  }
  const [p] = await db.select().from(participants).where(eq(participants.id, id)).limit(1);
  if (!p) { res.status(404).json({ error: 'Not found' }); return; }
  const ans = await db.select().from(answers).where(eq(answers.participantId, id));
  const um = await db.select().from(userMedals).where(eq(userMedals.participantId, id));
  const pig = await db.select().from(piggybank).where(eq(piggybank.participantId, id));

  let outcomesText = '';
  if (p.outcomesEdited) {
    outcomesText = typeof p.outcomesEdited === 'string' ? p.outcomesEdited : JSON.stringify(p.outcomesEdited);
  } else if (isGigachatConfigured()) {
    const texts = ans.map(a => typeof a.answerData === 'string' ? a.answerData : JSON.stringify(a.answerData)).filter(Boolean) as string[];
    outcomesText = (await synthesizeOutcomes(texts)) || '';
  }

  const lines = [
    `Итоговый профиль: ${p.firstName} ${p.lastName}`,
    `Направление: ${p.direction || '—'}`,
    `Группа: ${p.groupName || '—'}`,
    `Роль: ${p.pedagogicalRole || '—'}`,
    `Путь: ${p.pathPoints} · Опыт: ${p.experiencePoints}`,
    `Точка А: ${JSON.stringify(p.goalAnswers || [])}`,
    `Точка Б: ${JSON.stringify(p.pointBAnswers || [])}`,
    `Что получилось: ${outcomesText || '—'}`,
    `Медалей: ${um.length}`,
    `Записей в копилке: ${pig.length}`,
  ];

  try {
    const PDFDocument = (await import('pdfkit')).default;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=profile_${id}.pdf`);
    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);
    doc.fontSize(16).text('Машук 2026 — итоговый профиль', { underline: true });
    doc.moveDown();
    doc.fontSize(11);
    for (const line of lines) {
      doc.text(line, { paragraphGap: 6 });
    }
    if (Array.isArray(p.goalAnswers) && Array.isArray(p.pointBAnswers)) {
      doc.moveDown().fontSize(13).text('Сравнение А → Б', { underline: true });
      doc.fontSize(10);
      const a = p.goalAnswers as string[];
      const b = p.pointBAnswers as string[];
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        doc.text(`Вопрос ${i + 1}`);
        doc.text(`Было: ${a[i] || '—'}`);
        doc.text(`Стало: ${b[i] || '—'}`);
        doc.moveDown(0.5);
      }
    }
    if (p.strongRole || p.growthRole) {
      doc.moveDown().fontSize(13).text('Роли', { underline: true });
      doc.fontSize(10).text(`Сильная: ${p.strongRole || '—'} · Рост: ${p.growthRole || '—'}`);
      if (p.nextExperiment) doc.text(`Следующий эксперимент: ${p.nextExperiment}`);
    }
    if (pig.length > 0) {
      doc.moveDown().fontSize(13).text('Копилка (фрагмент)', { underline: true });
      doc.fontSize(9);
      for (const e of pig.slice(0, 15)) {
        doc.text(`#${e.tag} · ${e.source}: ${(e.text || '').slice(0, 120)}`);
      }
    }
    doc.end();
    return;
  } catch {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=profile_${id}.txt`);
    res.send('\uFEFF' + lines.join('\n'));
  }
};

// ─── QR download helper ──────────────────────────────────────

export const generateAndDownloadQr = async (req: AdminRequest, res: Response): Promise<void> => {
  const { type, id } = req.body as { type: 'task' | 'event' | 'participant'; id: number };
  const token = generateQrToken();
  const base = env.PUBLIC_URL || 'https://example.com';
  let url = '';
  if (type === 'task') {
    await db.update(tasks).set({ qrToken: token }).where(eq(tasks.id, id));
    url = buildTaskQrUrl(base, id, token);
  } else if (type === 'event') {
    await db.update(events).set({ qrToken: token }).where(eq(events.id, id));
    url = buildEventQrUrl(base, id, token);
  } else if (type === 'participant') {
    await db.update(participants).set({ qrToken: token }).where(eq(participants.id, id));
    url = buildParticipantQrUrl(base, id, token);
  } else {
    res.status(400).json({ error: 'type must be task|event|participant' });
    return;
  }
  res.json({
    token,
    url,
    downloadHint: `Откройте URL или сгенерируйте QR-картинку по ссылке: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`,
    qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`,
  });
};

// ─── Expanded analytics dashboards ───────────────────────────

export const getExpandedDashboards = async (req: AdminRequest, res: Response): Promise<void> => {
  const mode = (req.query.mode as string) || 'today';
  const day = req.query.day ? Number(req.query.day) : null;

  const allP = await db.select().from(participants);
  const registered = allP.filter(p => p.onboardingCompletedAt).length;
  const roleDist: Record<string, number> = {};
  const directionDist: Record<string, number> = {};
  const groupDist: Record<string, number> = {};
  for (const p of allP) {
    const k = p.pedagogicalRole || 'none';
    roleDist[k] = (roleDist[k] || 0) + 1;
    const d = p.direction || '—';
    directionDist[d] = (directionDist[d] || 0) + 1;
    const g = p.groupName || 'без группы';
    groupDist[g] = (groupDist[g] || 0) + 1;
  }

  const ans = await db.select().from(answers);
  const depths: Record<string, number> = {};
  const energySeries: { day: number; avg: number; n: number }[] = [];
  for (const a of ans) {
    const text = typeof a.answerData === 'string' ? a.answerData : JSON.stringify(a.answerData || '');
    const d = inferReflectionDepth(text) || '—';
    depths[d] = (depths[d] || 0) + 1;
  }

  const dayQs = await db.select().from(questions);
  for (let d = 1; d <= 8; d++) {
    const qIds = new Set(dayQs.filter(q => q.dayNumber === d).map(q => q.id));
    const dayAns = ans.filter(a => qIds.has(a.questionId));
    let sum = 0; let n = 0;
    for (const a of dayAns) {
      const data = a.answerData as { energy?: number } | null;
      if (data && typeof data === 'object' && typeof data.energy === 'number') {
        sum += data.energy;
        n += 1;
      }
    }
    energySeries.push({ day: d, avg: n ? Math.round((sum / n) * 10) / 10 : 0, n });
  }

  const pig = await db.select().from(piggybank);
  const pigTags: Record<string, number> = {};
  for (const e of pig) {
    const t = e.tag || 'прочее';
    pigTags[t] = (pigTags[t] || 0) + 1;
  }

  const approvedTasks = await db.select().from(taskSubmissions).where(eq(taskSubmissions.status, 'approved'));
  const programEvents = await db.select().from(events);
  const allMats = await db.select().from(materials);
  const matsInAnalytics = allMats.filter(m => m.includeInAnalytics !== false);
  const attendance = await db.select().from(eventAttendance);
  const dayStates = await db.select().from(participantDayState);

  const SCALE_LABELS: Record<string, string> = {
    direction: 'Направление',
    lessonsImportant: 'Уроки о важном',
    openLessons: 'Открытые уроки',
    morningHealth: 'Утренняя программа',
    workshops: 'Мастер-классы',
    eveningAtmosphere: 'Вечерняя программа',
    food: 'Питание',
    housing: 'Проживание',
    curator: 'Куратор',
  };

  const scaleSums: Record<string, { sum: number; n: number }> = {};
  for (const key of EVENING_SCALE_KEYS) scaleSums[key] = { sum: 0, n: 0 };
  for (const st of dayStates) {
    const ratings = st.eveningRatings as Record<string, unknown> | null;
    if (!ratings || typeof ratings !== 'object') continue;
    for (const key of EVENING_SCALE_KEYS) {
      const v = ratings[key];
      if (typeof v === 'number' && v >= 1 && v <= 5) {
        scaleSums[key].sum += v;
        scaleSums[key].n += 1;
      }
    }
  }
  const scaleAverages = EVENING_SCALE_KEYS.map(key => ({
    key,
    label: SCALE_LABELS[key] || key,
    avg: scaleSums[key].n ? Math.round((scaleSums[key].sum / scaleSums[key].n) * 10) / 10 : 0,
    responses: scaleSums[key].n,
  }));

  const attendanceByEvent = new Map<number, number>();
  for (const a of attendance) {
    attendanceByEvent.set(a.eventId, (attendanceByEvent.get(a.eventId) || 0) + 1);
  }

  const eventsByAttendance = programEvents
    .map(e => {
      const tags = Array.isArray(e.tags) ? (e.tags as string[]) : [];
      return {
        id: e.id,
        title: e.title,
        dayNumber: e.dayNumber,
        timeSlot: e.timeSlot,
        tags,
        attendance: attendanceByEvent.get(e.id) || 0,
      };
    })
    .sort((a, b) => b.attendance - a.attendance);

  const byTag: Record<string, { events: number; attendance: number }> = {};
  for (const e of eventsByAttendance) {
    const tagList = e.tags.length > 0 ? e.tags : ['без тега'];
    for (const tag of tagList) {
      if (!byTag[tag]) byTag[tag] = { events: 0, attendance: 0 };
      byTag[tag].events += 1;
      byTag[tag].attendance += e.attendance;
    }
  }
  const tagSeries = Object.entries(byTag)
    .map(([tag, v]) => ({ tag, events: v.events, attendance: v.attendance }))
    .sort((a, b) => b.attendance - a.attendance)
    .slice(0, 12);

  const byDaySlot: { day: number; slot: string; events: number; attendance: number }[] = [];
  for (let d = 1; d <= 8; d++) {
    const dayEv = eventsByAttendance.filter(e => e.dayNumber === d);
    const slots = [...new Set(dayEv.map(e => e.timeSlot || 'другое'))];
    for (const slot of slots) {
      const slotted = dayEv.filter(e => (e.timeSlot || 'другое') === slot);
      byDaySlot.push({
        day: d,
        slot,
        events: slotted.length,
        attendance: slotted.reduce((s, e) => s + e.attendance, 0),
      });
    }
  }

  const sampleTexts = ans
    .map(a => (typeof a.answerData === 'string' ? a.answerData : (a.answerData as { text?: string })?.text || ''))
    .filter(t => typeof t === 'string' && t.trim().length > 20)
    .slice(0, 30) as string[];

  const { synthesizeSemanticLayers } = await import('../services/gigachatService.js');
  const semantic = await synthesizeSemanticLayers({ depths, sampleTexts, day });

  res.json({
    mode,
    day,
    pulse: {
      registered,
      totalAnswers: ans.length,
      energySeries,
      completionByDay: energySeries.map(e => ({
        day: e.day,
        answers: ans.filter(a => dayQs.some(q => q.id === a.questionId && q.dayNumber === e.day)).length,
      })),
    },
    portrait: {
      roleDistribution: roleDist,
      directionDistribution: directionDist,
      groupDistribution: groupDist,
    },
    program: {
      eventsCount: programEvents.length,
      publishedDays: (await db.select().from(scheduleDays).where(eq(scheduleDays.isPublished, true))).length,
      materialsCount: matsInAnalytics.length,
      materialsExcludedFromAnalytics: allMats.length - matsInAnalytics.length,
      totalAttendance: attendance.length,
      scaleAverages,
      topEvents: eventsByAttendance.slice(0, 10),
      tagSeries,
      byDaySlot,
    },
    education: {
      scaleAverages,
      topEvents: eventsByAttendance.slice(0, 10),
      tagSeries,
      byDaySlot,
      totalAttendance: attendance.length,
    },
    activity: {
      pathLeaders: allP
        .map(p => ({ name: `${p.firstName} ${p.lastName}`, path: p.pathPoints, exp: p.experiencePoints }))
        .sort((a, b) => (b.path ?? 0) - (a.path ?? 0))
        .slice(0, 10),
      tasksApproved: approvedTasks.length,
      reflectionDepth: depths,
    },
    piggybank: {
      total: pig.length,
      byTag: pigTags,
      series: Object.entries(pigTags).map(([tag, value]) => ({ tag, value })),
    },
    semantic: {
      layers: semantic.layers,
      summary: semantic.summary,
      source: semantic.source,
    },
    gigachat: { configured: isGigachatConfigured() },
  });
};

// ─── Club matching + medals eval ─────────────────────────────

export const runClubMatching = async (req: AdminRequest, res: Response): Promise<void> => {
  const result = await clubMatchNightly();
  await logAdminAction({
    req, actionType: 'club_match', section: 'ai', newValue: result, isCritical: false,
  });
  res.json(result);
};

export const runMedalEvaluation = async (req: AdminRequest, res: Response): Promise<void> => {
  const result = await evaluateAllMedals();
  await logAdminAction({
    req, actionType: 'medal_eval', section: 'medals', newValue: result,
  });
  res.json(result);
};

export const listClubMatches = async (_req: AdminRequest, res: Response): Promise<void> => {
  res.json({ matches: await db.select().from(clubMatches).orderBy(desc(clubMatches.createdAt)).limit(200) });
};
