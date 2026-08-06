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
  getShiftById,
  listShifts,
  previewCopyShift,
  resolveActiveShift,
  resolveAdminShiftId,
  updateShift,
} from '../services/shiftService.js';

export const listAdminShifts = async (_req: AdminRequest, res: Response): Promise<void> => {
  const rows = await listShifts();
  const active = await resolveActiveShift();
  res.json({
    shifts: rows,
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
  const code = String(req.body.code || '').trim();
  const name = String(req.body.name || '').trim();
  if (!code || !name) {
    res.status(400).json({ error: 'code and name required' });
    return;
  }
  const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
  const totalDays = req.body.totalDays != null ? Number(req.body.totalDays) : 8;
  try {
    const shift = await createShift({
      code,
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
      newValue: { code, name },
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
    'eveningQuestionnaireConfig', 'eveningQuestionnaireByDay', 'answerConfirmation',
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
  const demoteTo = req.body?.demoteTo === 'ready' ? 'ready' as const : 'archived' as const;
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
      message: 'Участники мини-приложения теперь видят программу этой смены и регистрируются в неё.',
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Activate failed' });
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
  const preview = await previewCopyShift(id);
  res.json({
    preview,
    summary: `Будет скопировано: ${preview.events} событий, ${preview.questions} вопросов, ${preview.tasks} заданий, ${preview.materials} материалов, ${preview.scheduleDays} дней расписания.`,
  });
};

export const copyAdminShift = async (req: AdminRequest, res: Response): Promise<void> => {
  const sourceId = Number(req.params.id);
  const code = String(req.body.code || '').trim();
  const name = String(req.body.name || '').trim();
  if (!code || !name) {
    res.status(400).json({ error: 'code and name required' });
    return;
  }
  const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
  try {
    const result = await copyShiftProgram({ sourceId, code, name, startDate });
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
    const result = await copyShiftProgram({ sourceId, targetId });
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
      message: `Перенесено: ${result.copied}. Пропущено: ${result.skipped}. Не найдено: ${result.notFound}.`,
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Participant transfer failed' });
  }
};
