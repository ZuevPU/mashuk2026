import { Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { consentTexts } from '../db/schema.js';
import { VkAuthRequest } from '../middlewares/vkAuth.js';

/** GET /consents/active — активные тексты согласий (ПД + аналитика) */
export const getActiveConsents = async (_req: VkAuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await db.select().from(consentTexts).where(eq(consentTexts.isActive, true));
    const pd = rows.find(r => r.kind === 'pd') ?? null;
    const analytics = rows.find(r => r.kind === 'analytics') ?? null;
    res.json({
      pd: pd ? { version: pd.version, title: pd.title, body: pd.body } : {
        version: 1,
        title: 'Согласие на обработку персональных данных',
        body: 'Я согласен(на) на обработку персональных данных в целях участия в форуме «Машук».',
      },
      analytics: analytics ? { version: analytics.version, title: analytics.title, body: analytics.body } : {
        version: 1,
        title: 'Согласие на аналитику',
        body: 'Я согласен(на) на обезличенную аналитику ответов для улучшения программы форума.',
      },
    });
  } catch (error) {
    console.error('getActiveConsents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export async function getActiveConsentVersions(): Promise<{ pd: number; analytics: number }> {
  const rows = await db.select().from(consentTexts).where(eq(consentTexts.isActive, true));
  return {
    pd: rows.find(r => r.kind === 'pd')?.version ?? 1,
    analytics: rows.find(r => r.kind === 'analytics')?.version ?? 1,
  };
}

export async function deactivateOtherConsents(kind: string, exceptId: number): Promise<void> {
  const rows = await db.select().from(consentTexts).where(and(eq(consentTexts.kind, kind), eq(consentTexts.isActive, true)));
  for (const r of rows) {
    if (r.id !== exceptId) {
      await db.update(consentTexts).set({ isActive: false }).where(eq(consentTexts.id, r.id));
    }
  }
}
