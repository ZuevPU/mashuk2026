import { Response } from 'express';
import { and, desc, eq, gt, isNull, lte, or, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import { homeNotices } from '../db/schema.js';
import { AdminRequest } from '../middlewares/adminAuth.js';
import { resolveActiveShiftId, resolveAdminShiftId } from '../services/shiftService.js';

const STATUSES = new Set(['draft', 'published', 'archived']);

function parseOptionalDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function normalizeImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(u => String(u ?? '').trim())
    .filter(u => /^https?:\/\//.test(u) || u.startsWith('/uploads/'));
}

function toPublicNotice(row: typeof homeNotices.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    body: row.body ?? '',
    ctaUrl: row.ctaUrl ?? null,
    ctaLabel: row.ctaLabel ?? null,
    imageUrls: Array.isArray(row.imageUrls) ? row.imageUrls : [],
  };
}

async function archiveOtherPublished(shiftId: number, keepId?: number) {
  const cond = keepId != null
    ? and(eq(homeNotices.shiftId, shiftId), eq(homeNotices.status, 'published'), ne(homeNotices.id, keepId))
    : and(eq(homeNotices.shiftId, shiftId), eq(homeNotices.status, 'published'));
  await db.update(homeNotices)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(cond!);
}

export async function getActiveHomeNotice(shiftId?: number, now = new Date()) {
  const sid = shiftId ?? await resolveActiveShiftId();
  const [row] = await db.select().from(homeNotices)
    .where(and(
      eq(homeNotices.shiftId, sid),
      eq(homeNotices.status, 'published'),
      or(isNull(homeNotices.visibleFrom), lte(homeNotices.visibleFrom, now)),
      or(isNull(homeNotices.visibleUntil), gt(homeNotices.visibleUntil, now)),
    ))
    .orderBy(desc(homeNotices.publishedAt), desc(homeNotices.id))
    .limit(1);
  return row ? toPublicNotice(row) : null;
}

export const listHomeNotices = async (req: AdminRequest, res: Response): Promise<void> => {
  try {
    const shiftId = await resolveAdminShiftId(req);
    const rows = await db.select().from(homeNotices)
      .where(eq(homeNotices.shiftId, shiftId))
      .orderBy(desc(homeNotices.updatedAt), desc(homeNotices.id));
    res.json({ notices: rows });
  } catch (error) {
    console.error('listHomeNotices:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getHomeNotice = async (req: AdminRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const shiftId = await resolveAdminShiftId(req);
    const [row] = await db.select().from(homeNotices)
      .where(and(eq(homeNotices.id, id), eq(homeNotices.shiftId, shiftId)))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ notice: row });
  } catch (error) {
    console.error('getHomeNotice:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createHomeNotice = async (req: AdminRequest, res: Response): Promise<void> => {
  try {
    const shiftId = await resolveAdminShiftId(req);
    const title = String(req.body.title ?? '').trim();
    if (!title) {
      res.status(400).json({ error: 'title required' });
      return;
    }
    let status = String(req.body.status ?? 'draft');
    if (!STATUSES.has(status)) status = 'draft';

    const body = String(req.body.body ?? '');
    const ctaUrl = req.body.ctaUrl != null && String(req.body.ctaUrl).trim()
      ? String(req.body.ctaUrl).trim()
      : null;
    const ctaLabel = req.body.ctaLabel != null && String(req.body.ctaLabel).trim()
      ? String(req.body.ctaLabel).trim().slice(0, 120)
      : null;
    const imageUrls = normalizeImageUrls(req.body.imageUrls);
    const visibleFrom = parseOptionalDate(req.body.visibleFrom);
    const visibleUntil = parseOptionalDate(req.body.visibleUntil);
    if (req.body.visibleFrom !== undefined && visibleFrom === undefined) {
      res.status(400).json({ error: 'Invalid visibleFrom' });
      return;
    }
    if (req.body.visibleUntil !== undefined && visibleUntil === undefined) {
      res.status(400).json({ error: 'Invalid visibleUntil' });
      return;
    }

    if (status === 'published') {
      await archiveOtherPublished(shiftId);
    }

    const now = new Date();
    const [row] = await db.insert(homeNotices).values({
      shiftId,
      title,
      body,
      ctaUrl,
      ctaLabel,
      imageUrls,
      status,
      publishedAt: status === 'published' ? now : null,
      visibleFrom: visibleFrom ?? null,
      visibleUntil: visibleUntil ?? null,
      createdAt: now,
      updatedAt: now,
    }).returning();

    res.json({ notice: row });
  } catch (error) {
    console.error('createHomeNotice:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateHomeNotice = async (req: AdminRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const shiftId = await resolveAdminShiftId(req);
    const [existing] = await db.select().from(homeNotices)
      .where(and(eq(homeNotices.id, id), eq(homeNotices.shiftId, shiftId)))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const patch: Partial<typeof homeNotices.$inferInsert> = { updatedAt: new Date() };

    if (req.body.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title) {
        res.status(400).json({ error: 'title required' });
        return;
      }
      patch.title = title;
    }
    if (req.body.body !== undefined) patch.body = String(req.body.body);
    if (req.body.ctaUrl !== undefined) {
      const v = String(req.body.ctaUrl ?? '').trim();
      patch.ctaUrl = v || null;
    }
    if (req.body.ctaLabel !== undefined) {
      const v = String(req.body.ctaLabel ?? '').trim();
      patch.ctaLabel = v ? v.slice(0, 120) : null;
    }
    if (req.body.imageUrls !== undefined) {
      patch.imageUrls = normalizeImageUrls(req.body.imageUrls);
    }
    if (req.body.visibleFrom !== undefined) {
      const d = parseOptionalDate(req.body.visibleFrom);
      if (d === undefined) {
        res.status(400).json({ error: 'Invalid visibleFrom' });
        return;
      }
      patch.visibleFrom = d;
    }
    if (req.body.visibleUntil !== undefined) {
      const d = parseOptionalDate(req.body.visibleUntil);
      if (d === undefined) {
        res.status(400).json({ error: 'Invalid visibleUntil' });
        return;
      }
      patch.visibleUntil = d;
    }
    if (req.body.status !== undefined) {
      const status = String(req.body.status);
      if (!STATUSES.has(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
      }
      patch.status = status;
      if (status === 'published') {
        await archiveOtherPublished(shiftId, id);
        if (!existing.publishedAt || existing.status !== 'published') {
          patch.publishedAt = new Date();
        }
      }
    }

    const [row] = await db.update(homeNotices)
      .set(patch)
      .where(eq(homeNotices.id, id))
      .returning();
    res.json({ notice: row });
  } catch (error) {
    console.error('updateHomeNotice:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteHomeNotice = async (req: AdminRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const shiftId = await resolveAdminShiftId(req);
    const [deleted] = await db.delete(homeNotices)
      .where(and(eq(homeNotices.id, id), eq(homeNotices.shiftId, shiftId)))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('deleteHomeNotice:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
