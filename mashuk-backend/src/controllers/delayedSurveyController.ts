import { Response } from 'express';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import {
  getPendingDelayedSurvey,
  submitDelayedSurveyResponse,
} from '../services/exports/delayedMeasureService.js';

export const getMyDelayedSurvey = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const pending = await getPendingDelayedSurvey(req.participant!.id);
    if (!pending) {
      res.json({ survey: null });
      return;
    }
    res.json({
      survey: {
        id: pending.id,
        scheduledAt: pending.scheduledAt,
        sentAt: pending.sentAt,
        payload: pending.payload,
        questions: [
          { key: 'stillUsing', label: 'Используете ли вы идеи или практики с форума?', type: 'scale', min: 1, max: 5 },
          { key: 'changes', label: 'Что изменилось в вашей деятельности после форума?', type: 'text' },
          { key: 'recommend', label: 'Порекомендовали бы форум коллегам? (0–10)', type: 'nps', min: 0, max: 10 },
        ],
      },
    });
  } catch (err) {
    console.error('getMyDelayedSurvey:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const respondDelayedSurvey = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const surveyId = Number(req.params.id);
    if (!surveyId) {
      res.status(400).json({ error: 'Invalid survey id' });
      return;
    }
    const response = req.body?.answers ?? req.body?.response ?? req.body;
    if (!response || typeof response !== 'object') {
      res.status(400).json({ error: 'answers required' });
      return;
    }
    const updated = await submitDelayedSurveyResponse(req.participant!.id, surveyId, response as Record<string, unknown>);
    res.json({ survey: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    if (msg === 'Survey not found') { res.status(404).json({ error: msg }); return; }
    if (msg === 'Already completed') { res.status(409).json({ error: msg }); return; }
    if (msg === 'Survey not available') { res.status(403).json({ error: msg }); return; }
    console.error('respondDelayedSurvey:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
