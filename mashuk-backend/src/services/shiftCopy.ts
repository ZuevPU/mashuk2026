import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  adminPushNotifications,
  dayExperiments,
  dayFocus,
  events,
  homeNotices,
  levelsConfig,
  materials,
  medals,
  participantGroups,
  participants,
  questionOptions,
  questions,
  scheduleDays,
  shiftCopyLog,
  shifts,
  tasks,
} from '../db/schema.js';
import {
  generateUniqueShiftCode,
  getShiftById,
  SHIFT_COPY_MODULES,
  type ShiftCopyModule,
  type ShiftRow,
} from './shiftService.js';

export { SHIFT_COPY_MODULES, type ShiftCopyModule };

function rebaseShiftDate(
  value: Date | null,
  sourceStart: Date | null,
  targetStart: Date | null,
): Date | null {
  if (!value || !sourceStart || !targetStart) return null;
  return new Date(value.getTime() + targetStart.getTime() - sourceStart.getTime());
}

export function remapLinkedIds(ids: unknown, map: Map<number, number>): number[] {
  if (!Array.isArray(ids)) return [];
  const out: number[] = [];
  for (const raw of ids) {
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    const mapped = map.get(n);
    if (mapped) out.push(mapped);
  }
  return out;
}

export function remapEveningLinkedEvents(config: unknown, eventIdMap: Map<number, number>): unknown {
  if (!config || typeof config !== 'object') return config;
  const src = config as { steps?: Array<{ fields?: Array<Record<string, unknown>> }> };
  if (Array.isArray(src.steps)) {
    return {
      ...src,
      steps: src.steps.map(step => ({
        ...step,
        fields: (step.fields || []).map(field => (
          field.type === 'program_event'
            ? { ...field, linkedEventIds: remapLinkedIds(field.linkedEventIds, eventIdMap) }
            : field
        )),
      })),
    };
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
    out[key] = remapEveningLinkedEvents(value, eventIdMap);
  }
  return out;
}

export async function listCopiedModules(sourceId: number, targetId: number): Promise<ShiftCopyModule[]> {
  const rows = await db.select({ module: shiftCopyLog.module })
    .from(shiftCopyLog)
    .where(and(
      eq(shiftCopyLog.sourceShiftId, sourceId),
      eq(shiftCopyLog.targetShiftId, targetId),
    ));
  const allowed = new Set<string>(SHIFT_COPY_MODULES);
  return rows
    .map(r => r.module)
    .filter((m): m is ShiftCopyModule => allowed.has(m));
}

export async function moduleOccupancy(shiftId: number): Promise<Record<ShiftCopyModule, number>> {
  const [
    [{ c: eventsCount }],
    [{ c: questionsCount }],
    [{ c: tasksCount }],
    [{ c: materialsCount }],
    [{ c: daysCount }],
    [{ c: focusCount }],
    [{ c: groupsCount }],
    [{ c: experimentsCount }],
    [{ c: pushCount }],
    [{ c: medalsCount }],
    [{ c: levelsCount }],
    [{ c: noticesCount }],
  ] = await Promise.all([
    db.select({ c: count() }).from(events).where(eq(events.shiftId, shiftId)),
    db.select({ c: count() }).from(questions).where(eq(questions.shiftId, shiftId)),
    db.select({ c: count() }).from(tasks).where(eq(tasks.shiftId, shiftId)),
    db.select({ c: count() }).from(materials).where(eq(materials.shiftId, shiftId)),
    db.select({ c: count() }).from(scheduleDays).where(eq(scheduleDays.shiftId, shiftId)),
    db.select({ c: count() }).from(dayFocus).where(eq(dayFocus.shiftId, shiftId)),
    db.select({ c: count() }).from(participantGroups).where(eq(participantGroups.shiftId, shiftId)),
    db.select({ c: count() }).from(dayExperiments).where(eq(dayExperiments.shiftId, shiftId)),
    db.select({ c: count() }).from(adminPushNotifications).where(eq(adminPushNotifications.shiftId, shiftId)),
    db.select({ c: count() }).from(medals).where(eq(medals.shiftId, shiftId)),
    db.select({ c: count() }).from(levelsConfig).where(eq(levelsConfig.shiftId, shiftId)),
    db.select({ c: count() }).from(homeNotices).where(eq(homeNotices.shiftId, shiftId)),
  ]);
  return {
    forum: Number(focusCount) + Number(experimentsCount) + Number(noticesCount),
    program: Number(eventsCount) + Number(daysCount),
    knowledge: Number(materialsCount),
    tasks: Number(tasksCount),
    questions: Number(questionsCount),
    points: Number(levelsCount),
    medals: Number(medalsCount),
    groups: Number(groupsCount),
    pushes: Number(pushCount),
  };
}

export async function previewCopyModules(sourceId: number, targetId?: number | null) {
  const sourceCounts = await moduleOccupancy(sourceId);
  const targetCounts = targetId != null ? await moduleOccupancy(targetId) : null;
  const alreadyCopied = targetId != null ? await listCopiedModules(sourceId, targetId) : [];
  return { sourceCounts, targetCounts, alreadyCopied };
}

export async function copyShiftModules(opts: {
  sourceId: number;
  targetId?: number;
  code?: string;
  name?: string;
  startDate?: Date | null;
  modules: ShiftCopyModule[];
  confirmReplace?: boolean;
  adminId?: number | null;
}): Promise<{
  shift: ShiftRow;
  copied: ShiftCopyModule[];
  replaced: ShiftCopyModule[];
  skipped: ShiftCopyModule[];
}> {
  const source = await getShiftById(opts.sourceId);
  if (!source) throw new Error('Source shift not found');
  const requested = [...new Set(opts.modules)].filter((m): m is ShiftCopyModule =>
    (SHIFT_COPY_MODULES as readonly string[]).includes(m),
  );
  if (!requested.length) throw new Error('Выберите хотя бы один блок для копирования');

  return db.transaction(async (tx) => {
    let target: ShiftRow;
    if (opts.targetId != null) {
      if (opts.targetId === opts.sourceId) throw new Error('Source and target shifts must be different');
      const [row] = await tx.select().from(shifts).where(eq(shifts.id, opts.targetId)).limit(1);
      if (!row) throw new Error('Target shift not found');
      target = row;
    } else {
      if (!opts.name?.trim()) throw new Error('name required');
      const code = (opts.code || '').trim() || await generateUniqueShiftCode(opts.name);
      const [created] = await tx.insert(shifts).values({
        code,
        name: opts.name.trim(),
        status: 'draft',
        isPublished: false,
        isSandbox: false,
        startDate: opts.startDate ?? null,
        totalDays: source.totalDays ?? 8,
        currentDay: 1,
        shiftLabel: opts.name.trim(),
      }).returning();
      target = created;
    }

    const alreadyRows = await tx.select({ module: shiftCopyLog.module })
      .from(shiftCopyLog)
      .where(and(
        eq(shiftCopyLog.sourceShiftId, opts.sourceId),
        eq(shiftCopyLog.targetShiftId, target.id),
      ));
    const allowed = new Set<string>(SHIFT_COPY_MODULES);
    const already = alreadyRows
      .map(r => r.module)
      .filter((m): m is ShiftCopyModule => allowed.has(m));
    const skipped = requested.filter(m => already.includes(m));
    const toCopy = requested.filter(m => !already.includes(m));
    if (!toCopy.length) {
      return { shift: target, copied: [], replaced: [], skipped };
    }

    const occupancy = await moduleOccupancy(target.id);
    const replaced = toCopy.filter(m => occupancy[m] > 0);
    if (replaced.length && !opts.confirmReplace) {
      throw new Error(
        `В смене «${target.name}» уже есть данные (${replaced.join(', ')}). `
        + 'Подтвердите замену: данные цели будут стёрты и заменены данными из исходной смены.',
      );
    }

    const eventIdMap = new Map<number, number>();
    const groupIdMap = new Map<number, number>();
    const questionIdMap = new Map<number, number>();
    const medalIdMap = new Map<number, number>();

    const loadExistingEventMap = async () => {
      if (eventIdMap.size) return;
      const srcEvents = await tx.select({ id: events.id, title: events.title, dayNumber: events.dayNumber })
        .from(events).where(eq(events.shiftId, opts.sourceId));
      const dstEvents = await tx.select({ id: events.id, title: events.title, dayNumber: events.dayNumber })
        .from(events).where(eq(events.shiftId, target.id));
      for (const src of srcEvents) {
        const hit = dstEvents.find(d => d.title === src.title && d.dayNumber === src.dayNumber);
        if (hit) eventIdMap.set(src.id, hit.id);
      }
    };

    if (toCopy.includes('medals')) {
      if (replaced.includes('medals')) {
        await tx.delete(medals).where(eq(medals.shiftId, target.id));
      }
      const srcMedals = await tx.select().from(medals).where(eq(medals.shiftId, opts.sourceId));
      for (const m of srcMedals) {
        const { id: oldId, ...rest } = m;
        const [created] = await tx.insert(medals).values({ ...rest, shiftId: target.id }).returning();
        medalIdMap.set(oldId, created.id);
      }
    }

    if (toCopy.includes('groups')) {
      if (replaced.includes('groups')) {
        await tx.update(participants).set({ groupId: null }).where(eq(participants.shiftId, target.id));
        await tx.delete(participantGroups).where(eq(participantGroups.shiftId, target.id));
      }
      const srcGroups = await tx.select().from(participantGroups).where(eq(participantGroups.shiftId, opts.sourceId));
      for (const g of srcGroups) {
        const { id: oldId, ...rest } = g;
        const [created] = await tx.insert(participantGroups).values({ ...rest, shiftId: target.id }).returning();
        groupIdMap.set(oldId, created.id);
      }
    }

    if (toCopy.includes('program')) {
      if (replaced.includes('program')) {
        await tx.update(materials).set({ eventId: null }).where(eq(materials.shiftId, target.id));
        await tx.delete(events).where(eq(events.shiftId, target.id));
        await tx.delete(scheduleDays).where(eq(scheduleDays.shiftId, target.id));
      }
      const srcDays = await tx.select().from(scheduleDays).where(eq(scheduleDays.shiftId, opts.sourceId));
      for (const d of srcDays) {
        const { id: _id, ...rest } = d;
        await tx.insert(scheduleDays).values({
          ...rest,
          shiftId: target.id,
          calendarDate: rebaseShiftDate(d.calendarDate, source.startDate, target.startDate),
          isPublished: false,
          publishedAt: null,
        });
      }
      const srcEvents = await tx.select().from(events).where(eq(events.shiftId, opts.sourceId)).orderBy(asc(events.id));
      const pending = [...srcEvents];
      let guard = 0;
      while (pending.length && guard < srcEvents.length + 5) {
        guard += 1;
        const still: typeof pending = [];
        for (const e of pending) {
          if (e.parentEventId && !eventIdMap.has(e.parentEventId)) {
            still.push(e);
            continue;
          }
          const { id: oldId, qrToken: _q, parentEventId, ...rest } = e;
          const [created] = await tx.insert(events).values({
            ...rest,
            shiftId: target.id,
            isPublished: false,
            dayPublished: false,
            eventDate: rebaseShiftDate(e.eventDate, source.startDate, target.startDate),
            startTime: rebaseShiftDate(e.startTime, source.startDate, target.startDate),
            endTime: rebaseShiftDate(e.endTime, source.startDate, target.startDate),
            parentEventId: parentEventId ? (eventIdMap.get(parentEventId) ?? null) : null,
            qrToken: null,
          }).returning();
          eventIdMap.set(oldId, created.id);
        }
        if (still.length === pending.length) {
          for (const e of still) {
            const { id: oldId, qrToken: _q, parentEventId: _p, ...rest } = e;
            const [created] = await tx.insert(events).values({
              ...rest,
              shiftId: target.id,
              isPublished: false,
              dayPublished: false,
              eventDate: rebaseShiftDate(e.eventDate, source.startDate, target.startDate),
              startTime: rebaseShiftDate(e.startTime, source.startDate, target.startDate),
              endTime: rebaseShiftDate(e.endTime, source.startDate, target.startDate),
              parentEventId: null,
              qrToken: null,
            }).returning();
            eventIdMap.set(oldId, created.id);
          }
          break;
        }
        pending.length = 0;
        pending.push(...still);
      }
    } else if (toCopy.includes('questions') || toCopy.includes('knowledge') || toCopy.includes('forum')) {
      await loadExistingEventMap();
    }

    if (toCopy.includes('forum')) {
      if (replaced.includes('forum')) {
        await tx.delete(dayFocus).where(eq(dayFocus.shiftId, target.id));
        await tx.delete(dayExperiments).where(eq(dayExperiments.shiftId, target.id));
        await tx.delete(homeNotices).where(eq(homeNotices.shiftId, target.id));
      }
      const eveningByDay = remapEveningLinkedEvents(source.eveningQuestionnaireByDay, eventIdMap);
      const eveningCfg = remapEveningLinkedEvents(source.eveningQuestionnaireConfig, eventIdMap);
      const forumWrapCfg = remapEveningLinkedEvents(source.forumWrapQuestionnaireConfig, eventIdMap);
      await tx.update(shifts).set({
        recommendationThreshold: source.recommendationThreshold,
        sectionsVisibility: source.sectionsVisibility,
        groupAssignMode: source.groupAssignMode,
        kbUnlockThreshold: source.kbUnlockThreshold,
        kbUnlockDisabled: source.kbUnlockDisabled,
        kbPastDaysPolicy: source.kbPastDaysPolicy,
        pushBlockTypes: source.pushBlockTypes,
        pushNightSlotEnabled: source.pushNightSlotEnabled,
        teamConfirmHoursDefault: source.teamConfirmHoursDefault,
        eveningQuestionnaireConfig: eveningCfg as typeof source.eveningQuestionnaireConfig,
        eveningQuestionnaireByDay: eveningByDay as typeof source.eveningQuestionnaireByDay,
        forumWrapQuestionnaireConfig: forumWrapCfg as typeof source.forumWrapQuestionnaireConfig,
        answerConfirmation: source.answerConfirmation,
        exchangeLimits: source.exchangeLimits,
        profileProgressWeights: source.profileProgressWeights,
        pdfTemplate: source.pdfTemplate,
        recommendationTemplates: source.recommendationTemplates,
        programRecEmptyNoMatchText: source.programRecEmptyNoMatchText,
        programRecEmptyNoEventsText: source.programRecEmptyNoEventsText,
        roleDiagnosticsConfig: source.roleDiagnosticsConfig,
        leaderboardScopes: source.leaderboardScopes,
        totalDays: source.totalDays,
        currentDay: 1,
        updatedAt: new Date(),
      }).where(eq(shifts.id, target.id));

      const srcFocus = await tx.select().from(dayFocus).where(eq(dayFocus.shiftId, opts.sourceId));
      for (const f of srcFocus) {
        const { id: _id, ...rest } = f;
        await tx.insert(dayFocus).values({ ...rest, shiftId: target.id });
      }
      const srcExperiments = await tx.select().from(dayExperiments).where(eq(dayExperiments.shiftId, opts.sourceId));
      for (const e of srcExperiments) {
        const { id: _id, ...rest } = e;
        await tx.insert(dayExperiments).values({ ...rest, shiftId: target.id });
      }
      const srcNotices = await tx.select().from(homeNotices).where(eq(homeNotices.shiftId, opts.sourceId));
      for (const n of srcNotices) {
        const { id: _id, ...rest } = n;
        await tx.insert(homeNotices).values({
          ...rest,
          shiftId: target.id,
          status: 'draft',
          publishedAt: null,
        });
      }
    }

    if (toCopy.includes('knowledge')) {
      if (replaced.includes('knowledge')) {
        await tx.delete(materials).where(eq(materials.shiftId, target.id));
      }
      const srcMats = await tx.select().from(materials).where(eq(materials.shiftId, opts.sourceId));
      for (const m of srcMats) {
        const { id: _id, ...rest } = m;
        await tx.insert(materials).values({
          ...rest,
          shiftId: target.id,
          eventId: rest.eventId ? (eventIdMap.get(rest.eventId) ?? null) : null,
        });
      }
    }

    if (toCopy.includes('questions')) {
      if (replaced.includes('questions')) {
        const qids = (await tx.select({ id: questions.id }).from(questions).where(eq(questions.shiftId, target.id)))
          .map(r => r.id);
        if (qids.length) {
          await tx.delete(questionOptions).where(inArray(questionOptions.questionId, qids));
        }
        await tx.delete(questions).where(eq(questions.shiftId, target.id));
      }
      if (!groupIdMap.size) {
        const srcGroups = await tx.select({ id: participantGroups.id, name: participantGroups.name })
          .from(participantGroups).where(eq(participantGroups.shiftId, opts.sourceId));
        const dstGroups = await tx.select({ id: participantGroups.id, name: participantGroups.name })
          .from(participantGroups).where(eq(participantGroups.shiftId, target.id));
        for (const g of srcGroups) {
          const hit = dstGroups.find(d => d.name === g.name);
          if (hit) groupIdMap.set(g.id, hit.id);
        }
      }
      const srcQs = await tx.select().from(questions).where(eq(questions.shiftId, opts.sourceId)).orderBy(asc(questions.id));
      for (const q of srcQs) {
        const { id: oldId, ...rest } = q;
        const mappedGroup = rest.audienceGroupId && groupIdMap.has(rest.audienceGroupId)
          ? groupIdMap.get(rest.audienceGroupId)!
          : null;
        const showWhen = rest.showWhen && typeof rest.showWhen === 'object'
          ? {
            ...rest.showWhen,
            questionId: rest.showWhen.questionId && questionIdMap.has(rest.showWhen.questionId)
              ? questionIdMap.get(rest.showWhen.questionId)!
              : rest.showWhen.questionId,
          }
          : rest.showWhen;
        const [created] = await tx.insert(questions).values({
          ...rest,
          shiftId: target.id,
          status: 'draft',
          parentQuestionId: null,
          audienceGroupId: mappedGroup,
          linkedEventIds: remapLinkedIds(rest.linkedEventIds, eventIdMap),
          showWhen,
        }).returning();
        questionIdMap.set(oldId, created.id);
        const optRows = await tx.select().from(questionOptions).where(eq(questionOptions.questionId, oldId));
        for (const o of optRows) {
          const { id: _oid, ...oRest } = o;
          await tx.insert(questionOptions).values({ ...oRest, questionId: created.id });
        }
      }
      for (const q of srcQs) {
        const patches: { parentQuestionId?: number; showWhen?: typeof q.showWhen } = {};
        if (q.parentQuestionId && questionIdMap.has(q.parentQuestionId)) {
          patches.parentQuestionId = questionIdMap.get(q.parentQuestionId)!;
        }
        if (q.showWhen?.questionId && questionIdMap.has(q.showWhen.questionId)) {
          patches.showWhen = { ...q.showWhen, questionId: questionIdMap.get(q.showWhen.questionId)! };
        }
        if (Object.keys(patches).length && questionIdMap.has(q.id)) {
          await tx.update(questions).set(patches).where(eq(questions.id, questionIdMap.get(q.id)!));
        }
      }
    }

    if (toCopy.includes('tasks')) {
      if (replaced.includes('tasks')) {
        await tx.delete(tasks).where(eq(tasks.shiftId, target.id));
      }
      if (!medalIdMap.size) {
        const srcMedals = await tx.select({ id: medals.id, name: medals.name })
          .from(medals).where(eq(medals.shiftId, opts.sourceId));
        const dstMedals = await tx.select({ id: medals.id, name: medals.name })
          .from(medals).where(eq(medals.shiftId, target.id));
        for (const m of srcMedals) {
          const hit = dstMedals.find(d => d.name === m.name);
          if (hit) medalIdMap.set(m.id, hit.id);
        }
      }
      const srcTasks = await tx.select().from(tasks).where(eq(tasks.shiftId, opts.sourceId));
      for (const t of srcTasks) {
        const { id: _id, qrToken: _q, ...rest } = t;
        await tx.insert(tasks).values({
          ...rest,
          shiftId: target.id,
          qrToken: null,
          status: 'draft',
          medalId: rest.medalId ? (medalIdMap.get(rest.medalId) ?? rest.medalId) : null,
          eventTime: rebaseShiftDate(t.eventTime, source.startDate, target.startDate),
          deadline: rebaseShiftDate(t.deadline, source.startDate, target.startDate),
          publishTime: rebaseShiftDate(t.publishTime, source.startDate, target.startDate),
          availableFrom: rebaseShiftDate(t.availableFrom, source.startDate, target.startDate),
          qrValidFrom: rebaseShiftDate(t.qrValidFrom, source.startDate, target.startDate),
          qrValidTo: rebaseShiftDate(t.qrValidTo, source.startDate, target.startDate),
        });
      }
    }

    if (toCopy.includes('points')) {
      if (replaced.includes('points')) {
        await tx.delete(levelsConfig).where(eq(levelsConfig.shiftId, target.id));
      }
      const srcLevels = await tx.select().from(levelsConfig).where(eq(levelsConfig.shiftId, opts.sourceId));
      for (const l of srcLevels) {
        const { id: _id, ...rest } = l;
        await tx.insert(levelsConfig).values({ ...rest, shiftId: target.id });
      }
    }

    if (toCopy.includes('pushes')) {
      if (replaced.includes('pushes')) {
        await tx.delete(adminPushNotifications).where(eq(adminPushNotifications.shiftId, target.id));
      }
      const srcPush = await tx.select().from(adminPushNotifications).where(eq(adminPushNotifications.shiftId, opts.sourceId));
      for (const p of srcPush) {
        const { id: _id, sentAt: _s, deliveredCount: _d, openedCount: _o, triggerFiredAt: _t, ...rest } = p;
        await tx.insert(adminPushNotifications).values({
          ...rest,
          shiftId: target.id,
          status: 'draft',
          programDate: rebaseShiftDate(p.programDate, source.startDate, target.startDate),
          publishAt: rebaseShiftDate(p.publishAt, source.startDate, target.startDate),
          visibleUntil: rebaseShiftDate(p.visibleUntil, source.startDate, target.startDate),
          sentAt: null,
          deliveredCount: 0,
          openedCount: 0,
          triggerFiredAt: null,
        });
      }
    }

    for (const module of toCopy) {
      await tx.insert(shiftCopyLog).values({
        sourceShiftId: opts.sourceId,
        targetShiftId: target.id,
        module,
        copiedByAdminId: opts.adminId ?? null,
      }).onConflictDoUpdate({
        target: [shiftCopyLog.sourceShiftId, shiftCopyLog.targetShiftId, shiftCopyLog.module],
        set: { copiedAt: new Date(), copiedByAdminId: opts.adminId ?? null },
      });
    }

    const [fresh] = await tx.select().from(shifts).where(eq(shifts.id, target.id)).limit(1);
    return { shift: fresh!, copied: toCopy, replaced, skipped };
  });
}
