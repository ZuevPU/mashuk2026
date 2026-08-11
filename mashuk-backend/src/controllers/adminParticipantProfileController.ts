import type { Response } from 'express';
import type { AdminRequest } from '../middlewares/adminAuth.js';
import { buildFinalProfileHtml } from '../services/participantFinalProfileBuild.js';
import { buildAnalyticalProfileHtml } from '../services/participantAnalyticalProfileBuild.js';
import { buildDataDrivenProfileHtml } from '../services/participantDataDrivenProfileBuild.js';

/** GET /admin/participants/:id/profile — готовый HTML итогового профиля. */
export const getAdminParticipantFinalProfile = async (
  req: AdminRequest,
  res: Response,
): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid participant id' });
    return;
  }
  try {
    const built = await buildFinalProfileHtml(id);
    if (!built) {
      res.status(404).json({ error: 'Participant not found' });
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Profile-Mode', built.mode);
    res.setHeader('X-Profile-Pages', String(built.pagesHint));
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(built.html);
  } catch (err) {
    console.error('getAdminParticipantFinalProfile:', err);
    res.status(500).json({ error: 'Failed to build participant profile' });
  }
};

/** GET /admin/participants/:id/profile-2 — аналитический HTML-профиль (методология). */
export const getAdminParticipantAnalyticalProfile = async (
  req: AdminRequest,
  res: Response,
): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid participant id' });
    return;
  }
  try {
    const built = await buildAnalyticalProfileHtml(id);
    if (!built) {
      res.status(404).json({ error: 'Participant not found' });
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Profile-Pages', String(built.pagesHint));
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(built.html);
  } catch (err) {
    console.error('getAdminParticipantAnalyticalProfile:', err);
    res.status(500).json({ error: 'Failed to build analytical participant profile' });
  }
};

/** GET /admin/participants/:id/profile-3 — Data-driven HTML-профиль. */
export const getAdminParticipantDataDrivenProfile = async (
  req: AdminRequest,
  res: Response,
): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid participant id' });
    return;
  }
  try {
    const built = await buildDataDrivenProfileHtml(id);
    if (!built) {
      res.status(404).json({ error: 'Participant not found' });
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Profile-Pages', String(built.pagesHint));
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(built.html);
  } catch (err) {
    console.error('getAdminParticipantDataDrivenProfile:', err);
    res.status(500).json({ error: 'Failed to build data-driven participant profile' });
  }
};
