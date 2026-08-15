import { and, eq, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  answers,
  directions,
  participantDayState,
  participants,
  questions,
} from '../db/schema.js';
import type { AdminRequest } from '../middlewares/adminAuth.js';
import { logAdminAction } from './adminActionsLog.js';
import {
  filterEveningConfigForDirection,
  isEveningDisplayField,
  resolveEveningConfigForDay,
  stripHiddenEveningFieldValues,
  type EveningField,
} from './eveningQuestionnaireConfig.js';
import { asEveningRatings } from './exports/eveningExportData.js';
import { getForumSettings } from './helpers.js';
import { questionMatchesDay } from './questionAdminHelpers.js';
import { listPedagogicalRoleOptions } from './roleService.js';

export function isForumResultsScoreEditor(_login?: string | null): boolean {
  return false;
}

export async function canSilentEditEveningForm(_req?: AdminRequest): Promise<boolean> {
  return false;
}

function displayName(p: { firstName?: string | null; lastName?: string | null; id: number }): string {
  const name = `${p.firstName || ''} ${p.lastName || ''}`.replace(/\s+/g, ' ').trim();
  return name || `#${p.id}`;
}

export async function getAdminEveningForm(participantId: number, req: AdminRequest) {
  const [row] = await db.select({
    p: participants,
    dirName: directions.name,
  })
    .from(participants)
    .leftJoin(directions, eq(participants.directionId, directions.id))
    .where(eq(participants.id, participantId))
    .limit(1);
  if (!row) return null;

  const settings = await getForumSettings(row.p.shiftId);
  const states = await db.select().from(participantDayState)
    .where(eq(participantDayState.participantId, participantId));
  const submitted = states
    .filter(s => s.eveningRatings && typeof s.eveningRatings === 'object')
    .sort((a, b) => a.dayNumber - b.dayNumber);
  if (!submitted.length) return null;

  const roles = await listPedagogicalRoleOptions();
  const days = submitted.map(state => {
    const raw = resolveEveningConfigForDay(settings as never, state.dayNumber);
    const config = filterEveningConfigForDirection(raw, row.p.directionId);
    const fields = (config.steps || [])
      .flatMap(step => step.fields)
      .filter(f => !isEveningDisplayField(f));
    const ratings = asEveningRatings(state.eveningRatings) || {};
    return {
      dayNumber: state.dayNumber,
      filledAt: typeof ratings._submittedAt === 'string' ? ratings._submittedAt : (state.updatedAt?.toISOString() ?? null),
      tomorrowRoleKey: state.tomorrowRoleKey,
      ratings,
      fields,
    };
  });

  return {
    canEdit: false,
    participant: {
      id: row.p.id,
      name: displayName(row.p),
      direction: row.dirName || row.p.direction || '—',
      group: row.p.groupName || '—',
      directionId: row.p.directionId,
    },
    days,
    roles: roles.map(r => ({ roleKey: r.roleKey, name: r.name })),
  };
}

async function syncEveningSummaryAnswer(
  participantId: number,
  shiftId: number,
  dayNumber: number,
  ratings: Record<string, unknown>,
): Promise<void> {
  const summaryConds = [
    eq(questions.status, 'published'),
    or(
      eq(questions.block, 'Итоги дня'),
      eq(questions.questionKind, 'day_summary'),
      eq(questions.reflectionKind, 'evening_summary'),
    )!,
    eq(questions.shiftId, shiftId),
  ];
  const candidates = await db.select().from(questions).where(and(...summaryConds));
  const summaryQ = candidates.filter(q => !q.isHidden).find(q => questionMatchesDay(q, dayNumber))
    ?? candidates.filter(q => !q.isHidden).find(q => q.dayNumber === dayNumber)
    ?? null;
  if (!summaryQ) return;

  const [existing] = await db.select().from(answers)
    .where(and(
      eq(answers.participantId, participantId),
      eq(answers.questionId, summaryQ.id),
    ))
    .limit(1);
  const wordCount = String(ratings.mainThesis || ratings.freeNote || '')
    .split(/\s+/).filter(Boolean).length;
  if (!existing) {
    await db.insert(answers).values({
      participantId,
      questionId: summaryQ.id,
      answerData: ratings,
      questionTextSnapshot: summaryQ.text,
      pointsAwarded: 0,
      wordCount,
    });
    return;
  }
  await db.update(answers)
    .set({ answerData: ratings, wordCount })
    .where(eq(answers.id, existing.id));
}

export async function patchAdminEveningForm(
  participantId: number,
  body: { dayNumber: number; ratings: Record<string, unknown>; tomorrowRoleKey?: string | null },
  req: AdminRequest,
): Promise<{ ok: true } | { error: string; status: number }> {
  if (!(await canSilentEditEveningForm(req))) {
    return { error: 'Insufficient permissions', status: 403 };
  }

  const [p] = await db.select().from(participants).where(eq(participants.id, participantId)).limit(1);
  if (!p) return { error: 'Not found', status: 404 };

  const [state] = await db.select().from(participantDayState)
    .where(and(
      eq(participantDayState.participantId, participantId),
      eq(participantDayState.dayNumber, body.dayNumber),
    ))
    .limit(1);
  if (!state?.eveningRatings || typeof state.eveningRatings !== 'object') {
    return { error: 'Анкета за этот день ещё не сдана', status: 400 };
  }

  const settings = await getForumSettings(p.shiftId);
  const raw = resolveEveningConfigForDay(settings as never, body.dayNumber);
  const config = filterEveningConfigForDirection(raw, p.directionId);
  const allFields: EveningField[] = (config.steps || []).flatMap(s => s.fields);
  const existing = asEveningRatings(state.eveningRatings) || {};
  const submittedAt = existing._submittedAt;
  const merged: Record<string, unknown> = {
    ...existing,
    ...stripHiddenEveningFieldValues(body.ratings, allFields),
  };
  if (submittedAt != null) merged._submittedAt = submittedAt;
  delete merged._adminEdited;
  delete merged._adminEditedAt;

  const tomorrowRoleKey = body.tomorrowRoleKey !== undefined
    ? body.tomorrowRoleKey
    : (typeof merged.tomorrowRoleKey === 'string' ? merged.tomorrowRoleKey : state.tomorrowRoleKey);

  await db.update(participantDayState)
    .set({
      eveningRatings: merged,
      tomorrowRoleKey: tomorrowRoleKey ?? null,
    })
    .where(eq(participantDayState.id, state.id));

  await syncEveningSummaryAnswer(participantId, p.shiftId, body.dayNumber, merged);

  await logAdminAction({
    req,
    actionType: 'evening_form_silent_edit',
    section: 'analytics',
    objectId: participantId,
    oldValue: { dayNumber: body.dayNumber, ratings: existing },
    newValue: { dayNumber: body.dayNumber, ratings: merged },
    comment: 'Тихая правка итоговой анкеты',
  });

  return { ok: true };
}
