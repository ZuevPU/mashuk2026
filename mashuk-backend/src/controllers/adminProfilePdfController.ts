import { Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { forumSettings, participantPdfDrafts, pdfWhitelist } from '../db/schema.js';
import { AdminRequest } from '../middlewares/adminAuth.js';
import { clearCache } from '../services/cache.js';
import { gatherProfileBundle, streamProfilePdf } from '../services/profilePdfBuilder.js';
import { DEFAULT_PROFILE_PROGRESS_WEIGHTS } from '../services/profileProgress.js';
import { DEFAULT_RECOMMENDATION_TEMPLATES } from '../services/profileRecommendations.js';

export const getAdminPdfTemplate = async (_req: AdminRequest, res: Response): Promise<void> => {
  const [settings] = await db.select().from(forumSettings).limit(1);
  res.json({
    template: settings?.pdfTemplate ?? { sections: ['cover', 'ab', 'state', 'roles', 'outcomes', 'nextSteps', 'piggybank'] },
    profileProgressWeights: settings?.profileProgressWeights ?? DEFAULT_PROFILE_PROGRESS_WEIGHTS,
    shiftLabel: settings?.shiftLabel ?? 'Смена 1',
    recommendationTemplates: settings?.recommendationTemplates ?? DEFAULT_RECOMMENDATION_TEMPLATES,
  });
};

export const patchAdminPdfTemplate = async (req: AdminRequest, res: Response): Promise<void> => {
  const [existing] = await db.select().from(forumSettings).limit(1);
  if (!existing) {
    res.status(404).json({ error: 'forum_settings missing' });
    return;
  }
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (req.body.pdfTemplate != null) patch.pdfTemplate = req.body.pdfTemplate;
  if (req.body.profileProgressWeights != null) patch.profileProgressWeights = req.body.profileProgressWeights;
  if (req.body.shiftLabel != null) patch.shiftLabel = req.body.shiftLabel;
  if (req.body.recommendationTemplates != null) patch.recommendationTemplates = req.body.recommendationTemplates;
  const [updated] = await db.update(forumSettings).set(patch).where(eq(forumSettings.id, existing.id)).returning();
  clearCache('forumSettings');
  res.json({ settings: updated });
};

export const getAdminParticipantPdfDraft = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [draft] = await db.select().from(participantPdfDrafts)
    .where(eq(participantPdfDrafts.participantId, id)).limit(1);
  const bundle = await gatherProfileBundle(id);
  if (!bundle) {
    res.status(404).json({ error: 'Participant not found' });
    return;
  }
  res.json({
    draft: draft ?? { participantId: id, blocks: {}, status: 'draft' },
    preview: {
      outcomes: bundle.outcomes.bullets,
      nextSteps: bundle.nextSteps,
      actionStyleRoute: bundle.actionStyle.route,
    },
  });
};

export const patchAdminParticipantPdfDraft = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const blocks = (req.body.blocks ?? {}) as Record<string, unknown>;
  const [existing] = await db.select().from(participantPdfDrafts)
    .where(eq(participantPdfDrafts.participantId, id)).limit(1);
  if (existing) {
    const [updated] = await db.update(participantPdfDrafts)
      .set({ blocks, status: 'draft', updatedAt: new Date() })
      .where(eq(participantPdfDrafts.id, existing.id))
      .returning();
    res.json({ draft: updated });
    return;
  }
  const [created] = await db.insert(participantPdfDrafts).values({
    participantId: id,
    blocks,
    status: 'draft',
  }).returning();
  res.json({ draft: created });
};

export const publishAdminParticipantPdf = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const autoWhitelist = req.body.autoWhitelist !== false;
  const [existing] = await db.select().from(participantPdfDrafts)
    .where(eq(participantPdfDrafts.participantId, id)).limit(1);
  const blocks = existing?.blocks ?? {};
  if (existing) {
    await db.update(participantPdfDrafts)
      .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(participantPdfDrafts.id, existing.id));
  } else {
    await db.insert(participantPdfDrafts).values({
      participantId: id,
      blocks,
      status: 'published',
      publishedAt: new Date(),
    });
  }
  if (autoWhitelist) {
    const [wl] = await db.select().from(pdfWhitelist).where(eq(pdfWhitelist.participantId, id)).limit(1);
    if (!wl) {
      await db.insert(pdfWhitelist).values({ participantId: id, enabled: true });
    } else if (!wl.enabled) {
      await db.update(pdfWhitelist).set({ enabled: true, updatedAt: new Date() })
        .where(eq(pdfWhitelist.id, wl.id));
    }
  }
  res.json({ ok: true, published: true });
};

export const previewAdminParticipantPdf = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const bundle = await gatherProfileBundle(id);
  if (!bundle) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const blocks = (bundle.pdf.draftBlocks ?? {}) as Record<string, unknown>;
  await streamProfilePdf(bundle, res, blocks);
};
