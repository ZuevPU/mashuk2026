import { Response } from 'express';
import { AdminRequest } from '../middlewares/adminAuth.js';
import { logAdminAction } from '../services/adminActionsLog.js';
import {
  activateShift,
  archiveShift,
  clearSandboxParticipantData,
  copyParticipantsToShift,
  copyShiftProgram,
  createShift,
  deactivateShift,
  getShiftById,
  listShifts,
  previewCopyShift,
  publishShift,
  resolveActiveShift,
  resolveAdminShiftId,
  SHIFT_COPY_MODULES,
  type ShiftCopyModule,
  unpublishShift,
  updateShift,
} from '../services/shiftService.js';

function parseCopyModules(raw: unknown): ShiftCopyModule[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const allowed = new Set<string>(SHIFT_COPY_MODULES);
  const modules = raw
    .map(v => String(v))
    .filter((m): m is ShiftCopyModule => allowed.has(m));
  return modules.length ? modules : undefined;
}

export const listAdminShifts = async (_req: AdminRequest, res: Response): Promise<void> => {
  const rows = await listShifts();
  const active = await resolveActiveShift();
  const activeShiftIds = rows.filter(s => s.status === 'active').map(s => s.id);
  res.json({
    shifts: rows,
    activeShiftId: active?.id ?? null,
    activeShiftIds,
  });
};

/** Короткий список для шапки и форм. Нужен любому админу, не только с правом «Форум». */
export const listAdminShiftOptions = async (_req: AdminRequest, res: Response): Promise<void> => {
  const rows = await listShifts();
  const active = await resolveActiveShift();
  res.json({
    shifts: rows.map(s => ({
      id: s.id,
      name: s.name,
      code: s.code,
      status: s.status,
      isSandbox: s.isSandbox === true,
    })),
    activeShiftId: active?.id ?? null,
  });
};

export const getAdminShift = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const shift = await getShiftById(id);
  if (!shift) {
    res.status(404).json({ error: 'Shift not found' });
    return;
  }
  res.json({ shift });
};

export const createAdminShift = async (req: AdminRequest, res: Response): Promise<void> => {
  const name = String(req.body.name || '').trim();
  if (!name) {
    res.status(400).json({ error: 'name required' });
    return;
  }
  const code = String(req.body.code || '').trim();
  const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
  const totalDaysRaw = req.body.totalDays != null ? Number(req.body.totalDays) : 8;
  const totalDays = Number.isFinite(totalDaysRaw)
    ? Math.min(14, Math.max(1, Math.round(totalDaysRaw)))
    : 8;
  try {
    const shift = await createShift({
      code: code || undefined,
      name,
      startDate,
      totalDays,
      isSandbox: req.body.isSandbox === true,
    });
    await logAdminAction({
      req,
      actionType: 'shift_create',
      section: 'forum',
      objectId: shift.id,
      newValue: { code: shift.code, name },
    });
    res.json({ shift });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Create failed' });
  }
};

export const updateAdminShift = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const body = req.body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of [
    'name', 'code', 'startDate', 'totalDays', 'currentDay', 'status',
    'shiftLabel', 'recommendationThreshold', 'sectionsVisibility', 'groupAssignMode',
    'kbUnlockThreshold', 'kbUnlockDisabled', 'kbPastDaysPolicy',
    'pushBlockTypes', 'pushNightSlotEnabled', 'teamConfirmHoursDefault',
    'eveningQuestionnaireConfig', 'eveningQuestionnaireByDay', 'forumWrapQuestionnaireConfig', 'answerConfirmation',
    'exchangeLimits',
    'profileProgressWeights', 'pdfTemplate', 'recommendationTemplates',
    'roleDiagnosticsConfig', 'leaderboardScopes',
  ]) {
    if (body[key] !== undefined) {
      patch[key] = key === 'startDate' && body[key] ? new Date(String(body[key])) : body[key];
    }
  }
  if (patch.status === 'active') {
    res.status(400).json({ error: 'Use POST /shifts/:id/activate to activate a shift' });
    return;
  }
  try {
    const shift = await updateShift(id, patch);
    if (!shift) {
      res.status(404).json({ error: 'Shift not found' });
      return;
    }
    await logAdminAction({
      req,
      actionType: 'shift_update',
      section: 'forum',
      objectId: id,
      newValue: { keys: Object.keys(patch) },
    });
    res.json({ shift });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Update failed' });
  }
};

export const activateAdminShift = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const demoteRaw = req.body?.demoteTo;
  const demoteTo = demoteRaw === 'ready' || demoteRaw === 'archived' ? demoteRaw : null;
  try {
    const result = await activateShift(id, { demoteTo });
    await logAdminAction({
      req,
      actionType: 'shift_activate',
      section: 'forum',
      objectId: id,
      newValue: { demoteTo, previousId: result.previous?.id ?? null },
      isCritical: true,
    });
    res.json({
      shift: result.active,
      previous: result.previous,
      message: 'Смена активирована. Участники этой смены видят программу. Другие активные смены не снимаются.',
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Activate failed' });
  }
};

export const publishAdminShift = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  try {
    const shift = await publishShift(id);
    await logAdminAction({
      req,
      actionType: 'shift_publish',
      section: 'forum',
      objectId: id,
    });
    res.json({ shift, message: 'Смена опубликована. В неё можно регистрироваться.' });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Publish failed' });
  }
};

export const unpublishAdminShift = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  try {
    const shift = await unpublishShift(id);
    await logAdminAction({
      req,
      actionType: 'shift_unpublish',
      section: 'forum',
      objectId: id,
    });
    res.json({ shift, message: 'Публикация снята.' });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Unpublish failed' });
  }
};

export const deactivateAdminShift = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  try {
    const shift = await deactivateShift(id);
    await logAdminAction({
      req,
      actionType: 'shift_deactivate',
      section: 'forum',
      objectId: id,
    });
    res.json({ shift, message: 'Активность смены снята. Программа для участников этой смены скрыта.' });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Deactivate failed' });
  }
};

export const archiveAdminShift = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  try {
    const shift = await archiveShift(id);
    if (!shift) {
      res.status(404).json({ error: 'Shift not found' });
      return;
    }
    await logAdminAction({
      req,
      actionType: 'shift_archive',
      section: 'forum',
      objectId: id,
    });
    res.json({ shift });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Archive failed' });
  }
};

export const previewCopyAdminShift = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const targetRaw = req.query.targetShiftId;
  const targetId = targetRaw != null && String(targetRaw) !== '' ? Number(targetRaw) : null;
  const preview = await previewCopyShift(id);
  const { previewCopyModules, SHIFT_COPY_MODULES: modules } = await import('../services/shiftCopy.js');
  const modulePreview = await previewCopyModules(id, Number.isInteger(targetId) ? targetId : null);
  res.json({
    preview,
    modules: modules,
    ...modulePreview,
    summary: `Будет скопировано: ${preview.events} событий, ${preview.questions} вопросов, ${preview.tasks} заданий, ${preview.materials} материалов, ${preview.scheduleDays} дней расписания.`,
  });
};

export const copyAdminShift = async (req: AdminRequest, res: Response): Promise<void> => {
  const sourceId = Number(req.params.id);
  const code = String(req.body.code || '').trim();
  const name = String(req.body.name || '').trim();
  if (!name) {
    res.status(400).json({ error: 'name required' });
    return;
  }
  const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
  try {
    const result = await copyShiftProgram({
      sourceId,
      code: code || undefined,
      name,
      startDate,
      modules: parseCopyModules(req.body?.modules),
      confirmReplace: true,
      adminId: req.adminId ?? null,
    });
    await logAdminAction({
      req,
      actionType: 'shift_copy',
      section: 'forum',
      objectId: result.shift.id,
      newValue: { sourceId, preview: result.preview },
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Copy failed' });
  }
};

export const copyIntoAdminShift = async (req: AdminRequest, res: Response): Promise<void> => {
  const sourceId = Number(req.params.id);
  const targetId = Number(req.body?.targetShiftId);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    res.status(400).json({ error: 'targetShiftId required' });
    return;
  }
  try {
    const result = await copyShiftProgram({
      sourceId,
      targetId,
      modules: parseCopyModules(req.body?.modules),
      confirmReplace: req.body?.confirmReplace === true,
      adminId: req.adminId ?? null,
    });
    await logAdminAction({
      req,
      actionType: 'shift_copy_into',
      section: 'forum',
      objectId: targetId,
      newValue: { sourceId, preview: result.preview },
      isCritical: true,
    });
    res.json({
      ...result,
      message: `Структура скопирована в смену «${result.shift.name}»`,
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Copy failed' });
  }
};

export const clearSandboxAdminShift = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const confirm = String(req.body?.confirm || '');
  if (confirm !== 'CLEAR_SANDBOX') {
    res.status(400).json({ error: 'Подтвердите очистку: body.confirm = "CLEAR_SANDBOX"' });
    return;
  }
  try {
    const result = await clearSandboxParticipantData(id);
    await logAdminAction({
      req,
      actionType: 'shift_clear_sandbox',
      section: 'forum',
      objectId: id,
      newValue: result,
      isCritical: true,
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Clear failed' });
  }
};

export const copyParticipantsAdminShift = async (req: AdminRequest, res: Response): Promise<void> => {
  const sourceShiftId = await resolveAdminShiftId(req);
  const targetShiftId = Number(req.body?.targetShiftId);
  const participantIds = Array.isArray(req.body?.participantIds)
    ? req.body.participantIds.map(Number)
    : [];
  if (!Number.isInteger(targetShiftId) || targetShiftId <= 0) {
    res.status(400).json({ error: 'targetShiftId required' });
    return;
  }
  try {
    const result = await copyParticipantsToShift({
      sourceShiftId,
      targetShiftId,
      participantIds,
    });
    await logAdminAction({
      req,
      actionType: 'participants_copy_to_shift',
      section: 'participants',
      objectId: targetShiftId,
      newValue: {
        sourceShiftId,
        targetShiftId,
        requested: participantIds.length,
        ...result,
      },
      isCritical: true,
    });
    res.json({
      ...result,
      message: `Скопировано: ${result.copied}. Пропущено: ${result.skipped}. Не найдено: ${result.notFound}.`,
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Participant transfer failed' });
  }
};
