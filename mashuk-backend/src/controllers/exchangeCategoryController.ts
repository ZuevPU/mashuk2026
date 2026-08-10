import { Response } from 'express';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  exchangeCategories,
  exchangeQuestionTags,
  exchangeQuestions,
  exchangeTags,
  participants,
} from '../db/schema.js';
import { AdminRequest } from '../middlewares/adminAuth.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';

function publicCategory(row: typeof exchangeCategories.$inferSelect) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    emoji: row.emoji,
    hint: row.hint,
    sortOrder: row.sortOrder,
    isSystem: row.isSystem,
  };
}

export const listActiveExchangeCategories = async (_req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const rows = await db.select().from(exchangeCategories)
      .where(eq(exchangeCategories.isActive, true))
      .orderBy(asc(exchangeCategories.sortOrder), asc(exchangeCategories.id));
    res.json({
      categories: rows.map(publicCategory),
      minQuestionLen: Number(process.env.EXCHANGE_MIN_QUESTION_LEN) || 60,
      minAnswerLen: Number(process.env.EXCHANGE_MIN_ANSWER_LEN) || 20,
    });
  } catch (error) {
    console.error('listActiveExchangeCategories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const adminListExchangeCategories = async (_req: AdminRequest, res: Response): Promise<void> => {
  const rows = await db.select().from(exchangeCategories)
    .orderBy(asc(exchangeCategories.sortOrder), asc(exchangeCategories.id));
  res.json({ categories: rows });
};

export const adminCreateExchangeCategory = async (req: AdminRequest, res: Response): Promise<void> => {
  const slug = String(req.body.slug || '').trim().toLowerCase();
  const title = String(req.body.title || '').trim();
  if (!slug || !/^[a-z0-9_]{2,32}$/.test(slug)) {
    res.status(400).json({ error: 'slug required (a-z0-9_, 2–32)' });
    return;
  }
  if (!title) {
    res.status(400).json({ error: 'title required' });
    return;
  }
  try {
    const [row] = await db.insert(exchangeCategories).values({
      slug,
      title,
      emoji: req.body.emoji != null ? String(req.body.emoji).slice(0, 8) : null,
      hint: req.body.hint != null ? String(req.body.hint) : null,
      sortOrder: Number(req.body.sortOrder) || 0,
      isActive: req.body.isActive !== false,
      isSystem: false,
    }).returning();
    res.json({ category: row });
  } catch (error) {
    console.error('adminCreateExchangeCategory:', error);
    res.status(400).json({ error: 'Could not create category (slug unique?)' });
  }
};

export const adminUpdateExchangeCategory = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const [existing] = await db.select().from(exchangeCategories).where(eq(exchangeCategories.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const patch: Partial<typeof exchangeCategories.$inferInsert> = {};
  if (req.body.title !== undefined) patch.title = String(req.body.title).trim();
  if (req.body.emoji !== undefined) patch.emoji = String(req.body.emoji).slice(0, 8);
  if (req.body.hint !== undefined) patch.hint = String(req.body.hint);
  if (req.body.sortOrder !== undefined) patch.sortOrder = Number(req.body.sortOrder) || 0;
  if (req.body.isActive !== undefined) {
    if (existing.isSystem && req.body.isActive === false) {
      res.status(400).json({ error: 'System category cannot be deactivated' });
      return;
    }
    patch.isActive = !!req.body.isActive;
  }

  const [row] = await db.update(exchangeCategories).set(patch).where(eq(exchangeCategories.id, id)).returning();
  res.json({ category: row });
};

export const adminDeleteExchangeCategory = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(exchangeCategories).where(eq(exchangeCategories.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (existing.isSystem) {
    res.status(400).json({ error: 'System category cannot be deleted' });
    return;
  }
  const [used] = await db.select({ c: sql<number>`count(*)::int` })
    .from(exchangeQuestions)
    .where(eq(exchangeQuestions.categoryId, id));
  if (Number(used?.c || 0) > 0) {
    res.status(400).json({ error: 'Category is used by questions' });
    return;
  }
  await db.delete(exchangeCategories).where(eq(exchangeCategories.id, id));
  res.json({ ok: true });
};

export const adminListExchangeTags = async (_req: AdminRequest, res: Response): Promise<void> => {
  const rows = await db.select().from(exchangeTags).orderBy(asc(exchangeTags.id));
  res.json({ tags: rows });
};

export const adminBulkExchangeCategory = async (req: AdminRequest, res: Response): Promise<void> => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter((n: number) => Number.isFinite(n) && n > 0) : [];
  const categoryId = Number(req.body.categoryId);
  if (!ids.length || !Number.isFinite(categoryId)) {
    res.status(400).json({ error: 'ids and categoryId required' });
    return;
  }
  const [cat] = await db.select().from(exchangeCategories).where(eq(exchangeCategories.id, categoryId)).limit(1);
  if (!cat) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }
  await db.update(exchangeQuestions)
    .set({
      categoryId,
      classifiedBy: 'moderator',
      categoryConfirmed: true,
    })
    .where(inArray(exchangeQuestions.id, ids));
  res.json({ ok: true, updated: ids.length, categoryId });
};

export const adminModerationQueueExchange = async (req: AdminRequest, res: Response): Promise<void> => {
  const preset = String(req.query.preset || 'needs_category');
  // MVP (review decision B): other OR classified_by = auto
  const rows = await db.select({
    q: exchangeQuestions,
    p: participants,
    c: exchangeCategories,
  }).from(exchangeQuestions)
    .leftJoin(participants, eq(exchangeQuestions.participantId, participants.id))
    .leftJoin(exchangeCategories, eq(exchangeQuestions.categoryId, exchangeCategories.id))
    .where(
      preset === 'needs_category'
        ? sql`(${exchangeCategories.slug} = 'other' OR ${exchangeQuestions.classifiedBy} = 'auto')`
        : eq(exchangeQuestions.moderationStatus, 'pending'),
    )
    .orderBy(
      sql`CASE WHEN ${exchangeCategories.slug} = 'other' THEN 0 WHEN ${exchangeQuestions.classifiedBy} = 'auto' THEN 1 ELSE 2 END`,
      sql`${exchangeQuestions.createdAt} DESC NULLS LAST`,
    )
    .limit(200);

  res.json({
    questions: rows.map(r => ({
      ...r.q,
      authorName: `${r.p?.firstName ?? ''} ${r.p?.lastName ?? ''}`.trim() || '—',
      direction: r.p?.direction ?? null,
      category: r.c ? publicCategory(r.c) : null,
    })),
  });
};

export async function setQuestionTags(questionId: number, tagIds: number[]) {
  await db.delete(exchangeQuestionTags).where(eq(exchangeQuestionTags.questionId, questionId));
  const unique = [...new Set(tagIds.filter(n => Number.isFinite(n) && n > 0))];
  if (!unique.length) return;
  await db.insert(exchangeQuestionTags).values(unique.map(tagId => ({ questionId, tagId })));
}
