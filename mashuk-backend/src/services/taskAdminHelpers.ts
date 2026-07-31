import type { tasks } from '../db/schema.js';

export const TASK_CONFIRMATION_METHODS = [
  'qr',
  'photo',
  'link',
  'volunteer',
  'team',
  'moderator',
] as const;

export type TaskConfirmationMethod = (typeof TASK_CONFIRMATION_METHODS)[number];

export const TASK_NOMINATIONS = [
  'sport',
  'creative',
  'media',
  'education',
  'culture',
  'volunteer',
  'team',
  'general',
] as const;

export function methodsFromLegacy(task: {
  confirmationType?: string | null;
  autoConfirm?: boolean | null;
  answerType?: string | null;
}): string[] {
  const ct = task.confirmationType || 'text_photo';
  if (ct === 'qr') return ['qr'];
  if (ct === 'photo') return ['photo'];
  if (ct === 'post_url') return ['link'];
  if (ct === 'team') return ['team'];
  if (ct === 'auto') return [];
  if (ct === 'text_photo') {
    if (task.autoConfirm === false) return ['photo', 'moderator'];
    return ['photo'];
  }
  return ['photo'];
}

export function legacyConfirmationType(methods: string[] | null | undefined): string {
  const m = methods ?? [];
  if (m.includes('team')) return 'team';
  if (m.includes('qr')) return 'qr';
  if (m.includes('link') && !m.includes('photo')) return 'post_url';
  if (m.includes('photo') && m.length === 1) return 'photo';
  if (m.length === 0) return 'auto';
  if (m.includes('link')) return 'post_url';
  return 'text_photo';
}

export function normalizeConfirmationMethods(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(TASK_CONFIRMATION_METHODS);
  return [...new Set(raw.map(v => String(v)).filter(v => allowed.has(v)))];
}

export function normalizeDayNumbers(raw: unknown, fallbackDay?: number | null): number[] {
  if (Array.isArray(raw)) {
    const nums = raw.map(v => Number(v)).filter(n => Number.isInteger(n) && n >= 1 && n <= 8);
    if (nums.length) return [...new Set(nums)].sort((a, b) => a - b);
  }
  if (fallbackDay != null && fallbackDay >= 1) return [fallbackDay];
  return [];
}

export function primaryDayNumber(dayNumbers: number[] | null | undefined, dayNumber?: number | null): number | null {
  if (dayNumbers?.length) return dayNumbers[0] ?? null;
  return dayNumber ?? null;
}

export function taskNeedsModeration(task: Pick<typeof tasks.$inferSelect, 'confirmationMethods' | 'autoConfirm' | 'confirmationType'>): boolean {
  const methods = (task.confirmationMethods?.length ? task.confirmationMethods : methodsFromLegacy(task)) as string[];
  if (methods.includes('moderator')) return true;
  if (methods.length === 0) return false;
  return task.autoConfirm === false;
}

export function taskMethodsForParticipant(task: Pick<typeof tasks.$inferSelect, 'confirmationMethods' | 'confirmationType' | 'autoConfirm'>): string[] {
  const m = task.confirmationMethods;
  if (m && m.length > 0) return m;
  return methodsFromLegacy(task);
}

export function enrichTaskWritePayload(
  body: Record<string, unknown>,
  existing?: Partial<typeof tasks.$inferInsert>,
): Partial<typeof tasks.$inferInsert> {
  const patch = { ...body } as Partial<typeof tasks.$inferInsert>;

  if ('confirmationMethods' in body) {
    const methods = normalizeConfirmationMethods(body.confirmationMethods);
    patch.confirmationMethods = methods;
    patch.confirmationType = legacyConfirmationType(methods);
    if (methods.includes('team')) patch.scopeType = 'team';
    if (methods.includes('moderator')) patch.autoConfirm = false;
    else if (methods.length === 0) patch.autoConfirm = true;
    else patch.autoConfirm = !methods.includes('moderator');
  }

  if ('dayNumbers' in body || 'dayNumber' in body) {
    const dn = normalizeDayNumbers(
      body.dayNumbers,
      body.dayNumber != null ? Number(body.dayNumber) : existing?.dayNumber ?? undefined,
    );
    patch.dayNumbers = dn;
    patch.dayNumber = primaryDayNumber(dn, existing?.dayNumber ?? null);
  }

  if ('requiresModeration' in body && typeof body.requiresModeration === 'boolean') {
    const req = body.requiresModeration as boolean;
    patch.autoConfirm = !req;
    let methods = normalizeConfirmationMethods(
      patch.confirmationMethods ?? existing?.confirmationMethods ?? methodsFromLegacy(existing ?? {}),
    );
    if (req && !methods.includes('moderator')) methods = [...methods, 'moderator'];
    if (!req) methods = methods.filter(x => x !== 'moderator');
    patch.confirmationMethods = methods;
    patch.confirmationType = legacyConfirmationType(methods);
  }

  if ('scopeType' in body && body.scopeType === 'team') {
    let methods = normalizeConfirmationMethods(
      patch.confirmationMethods ?? existing?.confirmationMethods ?? [],
    );
    if (!methods.includes('team')) methods = [...methods, 'team'];
    patch.confirmationMethods = methods;
    patch.confirmationType = 'team';
  }

  return patch;
}

export function taskDayNumbers(task: Pick<typeof tasks.$inferSelect, 'dayNumbers' | 'dayNumber'>): number[] {
  if (task.dayNumbers?.length) return task.dayNumbers;
  if (task.dayNumber != null) return [task.dayNumber];
  return [];
}

export function isTaskOnForumDay(task: Pick<typeof tasks.$inferSelect, 'dayNumbers' | 'dayNumber'>, forumDay: number): boolean {
  const days = taskDayNumbers(task);
  if (!days.length) return true;
  return days.includes(forumDay);
}

export function isTaskPublishedVisible(
  task: typeof tasks.$inferSelect,
  now: Date,
): boolean {
  const status = task.status || 'published';
  if (status !== 'published') return false;
  if (task.isHidden) return false;
  if (task.hideUntilPublish && task.publishTime && task.publishTime > now) return false;
  if (task.availableFrom && task.availableFrom > now) return false;
  if (task.availableTo && task.availableTo < now) return false;
  return true;
}

export function isTaskSubmissionOpen(task: typeof tasks.$inferSelect, now: Date): boolean {
  if (task.applicationDeadline && task.applicationDeadline < now) return false;
  if (task.availableTo && task.availableTo < now) return false;
  return true;
}

export function validateTaskSubmissionPayload(
  task: typeof tasks.$inferSelect,
  body: {
    answerText?: string;
    photoUrl?: string | null;
    postUrl?: string;
    teamMemberIds?: unknown;
    qrToken?: string;
  },
): { ok: true } | { ok: false; error: string } {
  const methods = taskMethodsForParticipant(task);
  const answerType = task.answerType || 'text_and_photo';

  if (methods.includes('photo')) {
    if ((answerType === 'photo' || answerType === 'text_and_photo') && !body.photoUrl) {
      return { ok: false, error: 'Требуется фото' };
    }
    if (answerType === 'text' && !body.answerText?.trim() && !body.photoUrl) {
      return { ok: false, error: 'Требуется ответ' };
    }
  }
  if (methods.includes('link') && !body.postUrl?.trim()) {
    return { ok: false, error: 'Требуется ссылка на пост' };
  }
  if (methods.includes('team')) {
    const teamIds = Array.isArray(body.teamMemberIds) ? body.teamMemberIds.map(Number).filter(Boolean) : [];
    if (teamIds.length < 1) return { ok: false, error: 'Укажите участников команды' };
  }
  if (methods.includes('qr')) {
    if (!task.qrToken) return { ok: false, error: 'QR для задания ещё не сгенерирован' };
    if (!body.qrToken || body.qrToken !== task.qrToken) {
      return { ok: false, error: 'Отсканируйте QR задания или дождитесь подтверждения волонтёра' };
    }
  }
  if (methods.length === 0) return { ok: true };
  if (!methods.includes('photo') && !methods.includes('link') && !methods.includes('team') && !methods.includes('qr')) {
    if (!body.answerText?.trim() && !body.photoUrl && !body.postUrl?.trim()) {
      return { ok: false, error: 'Заполните ответ' };
    }
  }
  return { ok: true };
}

export function resolveSubmissionOutcome(
  task: typeof tasks.$inferSelect,
  opts: { qrToken?: string },
): { isTeam: boolean; forceAuto: boolean; status: 'pending' | 'pending_team' | 'approved' } {
  const methods = taskMethodsForParticipant(task);
  const isTeam = methods.includes('team') || task.scopeType === 'team';
  const needsMod = taskNeedsModeration(task);
  const qrOnlyAuto = methods.includes('qr') && opts.qrToken && task.qrToken === opts.qrToken;
  const forceAuto = !isTeam && !needsMod && (methods.length === 0 || qrOnlyAuto || (task.autoConfirm && !methods.includes('moderator')));
  if (isTeam) return { isTeam: true, forceAuto: false, status: 'pending_team' };
  if (forceAuto) return { isTeam: false, forceAuto: true, status: 'approved' };
  return { isTeam: false, forceAuto: false, status: 'pending' };
}
