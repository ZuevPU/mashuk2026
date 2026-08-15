import { Response } from 'express';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { events, participants, pointsLog } from '../db/schema.js';
import type { AdminRequest } from '../middlewares/adminAuth.js';
import type { ParticipantRequest } from '../middlewares/requireParticipant.js';
import {
  eveningProgramEventFields,
  eveningScheduleApiFields,
  filterEveningConfigForDirection,
  formatEveningScheduleHint,
  isForcePublishedActive,
  mergeEveningScheduleFromRequest,
  stripHiddenEveningFieldValues,
  stripPointBFromEveningConfig,
  type EveningQuestionnaireConfig,
} from '../services/eveningQuestionnaireConfig.js';
import {
  collectEveningProgramPickTree,
  filterEventsForEveningProgramPick,
} from '../services/eveningProgramPickTree.js';
import {
  defaultForumWrapConfig,
  isForumWrapOpen,
  resolveForumWrapConfig,
} from '../services/forumWrapQuestionnaire.js';
import { getForumSettings } from '../services/helpers.js';
import { awardPoints } from '../services/pointsService.js';
import {
  clearShiftCaches,
  getShiftById,
  resolveAdminShiftId,
  shiftOpsToForumShape,
  updateShift,
} from '../services/shiftService.js';


const ratingsValue = z.union([
  z.string().max(4000),
  z.number(),
  z.boolean(),
  z.null(),
  z.object({
    items: z.array(z.object({
      eventId: z.coerce.number().int().positive(),
      eventTitle: z.string().max(500),
      parentEventId: z.coerce.number().int().positive().nullable().optional(),
      parentEventTitle: z.string().max(500).nullable().optional(),
      score: z.coerce.number().int().min(1).max(10),
    })),
  }),
]);

const submitSchema = z.object({
  ratings: z.record(ratingsValue).default({}),
});

const draftSchema = z.object({
  step: z.coerce.number().int().min(0).max(20),
  form: z.record(z.unknown()).default({}),
});

function applyPublishFlags(
  next: EveningQuestionnaireConfig,
  existing: EveningQuestionnaireConfig,
  forcePublishedRaw: unknown,
  forceUnpublishedRaw: unknown,
): EveningQuestionnaireConfig {
  const hasForcePub = forcePublishedRaw === true || forcePublishedRaw === false;
  const hasForceUnpub = forceUnpublishedRaw === true || forceUnpublishedRaw === false;
  if (!hasForcePub && !hasForceUnpub) return next;

  let forcePublished = hasForcePub ? forcePublishedRaw === true : !!existing.forcePublished;
  let forceUnpublished = hasForceUnpub ? forceUnpublishedRaw === true : !!existing.forceUnpublished;
  if (forcePublishedRaw === true) forceUnpublished = false;
  if (forceUnpublishedRaw === true) forcePublished = false;
  if (forcePublishedRaw === false && forceUnpublishedRaw === false) {
    forcePublished = false;
    forceUnpublished = false;
  }
  const {
    forcePublished: _fp,
    forcePublishedAt: _fpa,
    forceUnpublished: _fu,
    ...rest
  } = next;
  const keepAt = forcePublished
    && forcePublishedRaw !== true
    && existing.forcePublishedAt
    ? existing.forcePublishedAt
    : undefined;
  return {
    ...rest,
    ...(forcePublished ? {
      forcePublished: true,
      forcePublishedAt: forcePublishedRaw === true ? new Date().toISOString() : keepAt,
    } : {}),
    ...(forceUnpublished ? { forceUnpublished: true } : {}),
  };
}

export async function getAdminForumWrapQuestionnaire(req: AdminRequest, res: Response): Promise<void> {
  const shiftId = await resolveAdminShiftId(req);
  const shift = await getShiftById(shiftId);
  const settings = shift ? shiftOpsToForumShape(shift) : null;
  const config = resolveForumWrapConfig(settings as never);
  const hasOwnConfig = !!(settings?.forumWrapQuestionnaireConfig
    && Array.isArray((settings.forumWrapQuestionnaireConfig as EveningQuestionnaireConfig).steps)
    && (settings.forumWrapQuestionnaireConfig as EveningQuestionnaireConfig).steps.length);
  res.json({
    shiftId,
    config,
    defaultConfig: defaultForumWrapConfig(),
    ...eveningScheduleApiFields(config, 1),
    forcePublished: isForcePublishedActive(config),
    forceUnpublished: !!config.forceUnpublished,
    hasOwnConfig,
    isOpenNow: isForumWrapOpen(config, new Date(), settings as never),
  });
}

export async function patchAdminForumWrapQuestionnaire(req: AdminRequest, res: Response): Promise<void> {
  const shiftId = await resolveAdminShiftId(req);
  const current = await getShiftById(shiftId);
  if (!current) {
    res.status(404).json({ error: 'Shift not found' });
    return;
  }
  const existing = resolveForumWrapConfig(shiftOpsToForumShape(current) as never);
  const bodyConfig = req.body.config as EveningQuestionnaireConfig | undefined;
  let next: EveningQuestionnaireConfig = bodyConfig?.steps?.length
    ? stripPointBFromEveningConfig(bodyConfig)
    : { ...existing };

  const schedule = mergeEveningScheduleFromRequest(next, req.body, existing);
  if (schedule.error) {
    res.status(400).json({ error: schedule.error });
    return;
  }
  next = schedule.config;

  next = applyPublishFlags(next, existing, req.body.forcePublished, req.body.forceUnpublished);
  if (!next.steps?.length) {
    res.status(400).json({ error: 'config.steps required' });
    return;
  }

  const updated = await updateShift(shiftId, { forumWrapQuestionnaireConfig: next });
  clearShiftCaches();
  const shape = updated ? shiftOpsToForumShape(updated) : shiftOpsToForumShape(current);
  const resolved = resolveForumWrapConfig(shape as never);
  res.json({
    ok: true,
    shiftId,
    config: resolved,
    ...eveningScheduleApiFields(resolved, 1),
    forcePublished: isForcePublishedActive(resolved),
    forceUnpublished: !!resolved.forceUnpublished,
    hasOwnConfig: true,
    isOpenNow: isForumWrapOpen(resolved, new Date(), shape as never),
  });
}

export async function notifyAdminForumWrapQuestionnaire(req: AdminRequest, res: Response): Promise<void> {
  const shiftId = await resolveAdminShiftId(req);
  const includeCompleted = req.body?.includeCompleted === true
    || String(req.query.includeCompleted || '') === '1';
  const customText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';

  const { resolveBroadcastParticipantIds } = await import('../services/pushAudienceResolve.js');
  const { logAdminAction } = await import('../services/adminActionsLog.js');
  const { sendPushNotification } = await import('../services/pushService.js');

  const allIds = await resolveBroadcastParticipantIds(shiftId);
  let targetIds = allIds;
  if (!includeCompleted && allIds.length) {
    const doneRows = await db.select({ id: participants.id }).from(participants).where(and(
      inArray(participants.id, allIds),
      isNotNull(participants.forumWrapRatings),
    ));
    const done = new Set(doneRows.map(r => r.id));
    targetIds = allIds.filter(id => !done.has(id));
  }

  const text = customText || 'Итоговая анкета форума уже доступна. Откройте главную и заполните — займёт несколько минут.';
  if (targetIds.length) {
    await sendPushNotification(targetIds, text, 'forum_wrap_questionnaire_notify', {
      appLinkHash: '#/?forumWrap=1',
    });
  }

  await logAdminAction({
    req,
    actionType: 'forum_wrap_questionnaire_notify',
    section: 'forum',
    objectId: shiftId,
    newValue: { shiftId, sentTo: targetIds.length, audience: allIds.length, includeCompleted, text },
  });

  res.json({
    ok: true,
    sentTo: targetIds.length,
    audience: allIds.length,
    skippedCompleted: Math.max(0, allIds.length - targetIds.length),
    text,
  });
}

export async function loadForumWrapPayload(
  participant: { id: number; shiftId: number; directionId?: number | null; forumWrapRatings?: unknown; forumWrapDraft?: unknown },
  settings: unknown,
) {
  const rawConfig = resolveForumWrapConfig(settings as never);
  const config = filterEveningConfigForDirection(rawConfig, participant.directionId ?? null);
  const schedule = eveningScheduleApiFields(config, 1);
  const open = isForumWrapOpen(config, new Date(), settings as never);
  const completed = !!(participant.forumWrapRatings && typeof participant.forumWrapRatings === 'object');
  const programEventFieldDefs = eveningProgramEventFields(config);
  let programEventOptions: Record<string, {
    events: ReturnType<typeof collectEveningProgramPickTree>['events'];
    emptyReason: 'none' | 'none_in_program';
  }> = {};
  if (programEventFieldDefs.length > 0) {
    const shiftId = participant.shiftId;
    const shiftEv = shiftId
      ? await db.select().from(events).where(eq(events.shiftId, shiftId))
      : [];
    const published = filterEventsForEveningProgramPick(shiftEv);
    for (const field of programEventFieldDefs) {
      const tree = collectEveningProgramPickTree(
        published,
        field.linkedEventIds,
        settings as never,
        null,
      );
      programEventOptions[field.key] = {
        events: tree.events,
        emptyReason: tree.events.length > 0 ? 'none' : 'none_in_program',
      };
    }
  }
  return {
    available: open && !completed,
    open,
    opensAt: schedule.opensAtMsk,
    closesAt: schedule.closesAtMsk,
    opensOnDay: schedule.opensOnDay,
    closesOnDay: schedule.closesOnDay,
    scheduleHint: schedule.scheduleHint,
    forcePublished: isForcePublishedActive(config),
    forceUnpublished: !!config.forceUnpublished,
    completed,
    askTomorrowRole: false,
    config,
    programEventOptions,
    saved: participant.forumWrapRatings || null,
    savedDraft: participant.forumWrapDraft || null,
  };
}

export async function patchForumWrapDraft(req: ParticipantRequest, res: Response): Promise<void> {
  try {
    const parsed = draftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }
    const p = req.participant!;
    if (p.forumWrapRatings) {
      res.json({ ok: true, draft: p.forumWrapDraft });
      return;
    }
    const draft = {
      step: parsed.data.step,
      form: parsed.data.form,
      updatedAt: new Date().toISOString(),
    };
    const [updated] = await db.update(participants)
      .set({ forumWrapDraft: draft })
      .where(eq(participants.id, p.id))
      .returning({ forumWrapDraft: participants.forumWrapDraft });
    res.json({ ok: true, draft: updated?.forumWrapDraft });
  } catch (error) {
    console.error('patchForumWrapDraft:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function awardForumWrapOnce(participantId: number, forumDay: number): Promise<void> {
  const [existing] = await db.select({ id: pointsLog.id })
    .from(pointsLog)
    .where(and(
      eq(pointsLog.participantId, participantId),
      eq(pointsLog.actionType, 'forum_wrap_complete'),
      isNull(pointsLog.revokedAt),
      sql`${pointsLog.points} > 0`,
    ))
    .limit(1);
  if (existing) return;
  await awardPoints(participantId, 'forum_wrap_complete', undefined, forumDay);
}

export async function submitForumWrapQuestionnaire(req: ParticipantRequest, res: Response): Promise<void> {
  try {
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }
    const p = req.participant!;
    if (p.forumWrapRatings) {
      res.status(400).json({ error: 'Итоговая анкета форума уже отправлена' });
      return;
    }
    const settings = await getForumSettings(p.shiftId);
    const config = resolveForumWrapConfig(settings as never);
    if (!isForumWrapOpen(config, new Date(), settings as never) && process.env.NODE_ENV !== 'test') {
      res.status(400).json({
        error: config.forceUnpublished
          ? 'Итоговая анкета форума снята с публикации'
          : `Итоговая анкета форума доступна ${formatEveningScheduleHint(config, 1)} (или после публикации организатором)`,
      });
      return;
    }
    const allFields = (config.steps || []).flatMap(s => s.fields);
    const ratings: Record<string, unknown> = {
      ...stripHiddenEveningFieldValues(parsed.data.ratings as Record<string, unknown>, allFields),
      _submittedAt: new Date().toISOString(),
    };
    await db.update(participants)
      .set({ forumWrapRatings: ratings, forumWrapDraft: null })
      .where(eq(participants.id, p.id));
    await awardForumWrapOnce(p.id, settings.currentDay ?? 1);
    res.json({ ok: true });
  } catch (error) {
    console.error('submitForumWrapQuestionnaire:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
