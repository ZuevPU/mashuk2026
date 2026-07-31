import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  answers, clubMatches, forumClubs, participants, piggybank, questions,
} from '../../db/schema.js';
import { isPublishedStatus } from '../publishStatus.js';
import { resolveActiveShiftId } from '../shiftService.js';

const DEFAULT_CLUBS = [
  {
    id: 'club_future',
    name: 'Будущее',
    description: 'Будущее образования, ожидания изменений, новые вызовы, образ школы будущего',
    sortOrder: 1,
  },
  {
    id: 'club_human',
    name: 'Образование вокруг человека',
    description: 'Человек в центре образования, среда, отношения, развитие личности',
    sortOrder: 2,
  },
  {
    id: 'club_unity',
    name: 'Единство',
    description: 'Единство, сообщество, команда, сотрудничество, общие ценности',
    sortOrder: 3,
  },
];

export type TextFragment = {
  participantId: number;
  answerId: number | null;
  sourceType: string;
  text: string;
  snippet: string;
};

function clubKeywords(description: string, name: string): string[] {
  const raw = `${description} ${name}`.toLowerCase();
  return [...new Set(raw.split(/[\s,.;:!?«»"()\-—/]+/).filter(w => w.length > 3))].slice(0, 24);
}

function scoreFragment(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) score += 1;
  }
  return score;
}

export async function ensureDefaultForumClubs(): Promise<void> {
  const existing = await db.select({ id: forumClubs.id }).from(forumClubs);
  if (existing.length > 0) return;
  for (const c of DEFAULT_CLUBS) {
    await db.insert(forumClubs).values({
      id: c.id,
      name: c.name,
      description: c.description,
      isActive: true,
      sortOrder: c.sortOrder,
    });
  }
}

async function collectFragments(shiftId?: number | null): Promise<TextFragment[]> {
  const conditions = [isNotNull(participants.onboardingCompletedAt)];
  if (shiftId != null) conditions.push(eq(participants.shiftId, shiftId));
  const onboarded = await db.select({ id: participants.id })
    .from(participants)
    .where(and(...conditions));
  const ids = onboarded.map(p => p.id);
  if (!ids.length) return [];

  const fragments: TextFragment[] = [];
  const qRows = shiftId != null
    ? await db.select().from(questions).where(eq(questions.shiftId, shiftId))
    : await db.select().from(questions);
  const qList = qRows.filter(q => isPublishedStatus(q.status));
  const qMap = new Map(qList.map(q => [q.id, q]));

  const ansRows = await db.select().from(answers).where(inArray(answers.participantId, ids));
  for (const a of ansRows) {
    const text = typeof a.answerData === 'string'
      ? a.answerData
      : JSON.stringify(a.answerData ?? '');
    if (text.trim().length < 12) continue;
    const q = qMap.get(a.questionId);
    fragments.push({
      participantId: a.participantId,
      answerId: a.id,
      sourceType: q?.block ? String(q.block) : (q?.reflectionKind ?? 'reflection'),
      text,
      snippet: text.slice(0, 280),
    });
  }

  const pigRows = await db.select().from(piggybank).where(inArray(piggybank.participantId, ids));
  for (const e of pigRows) {
    if (!e.text?.trim() || e.text.length < 8) continue;
    fragments.push({
      participantId: e.participantId,
      answerId: null,
      sourceType: 'piggybank',
      text: e.text,
      snippet: e.text.slice(0, 280),
    });
  }

  return fragments;
}

/** Nightly fragment × club keyword match (heuristics only). */
export async function clubFragmentMatchNightly(): Promise<{ inserted: number }> {
  await ensureDefaultForumClubs();
  const clubs = await db.select().from(forumClubs).where(eq(forumClubs.isActive, true));
  if (!clubs.length) return { inserted: 0 };

  const clubKw = clubs.map(c => ({
    id: c.id,
    name: c.name,
    keywords: clubKeywords(c.description || '', c.name),
  }));

  let shiftId: number | null = null;
  try {
    shiftId = await resolveActiveShiftId();
  } catch {
    shiftId = null;
  }

  const fragments = await collectFragments(shiftId);
  await db.delete(clubMatches);

  const topPerClub = new Map<string, { frag: TextFragment; score: number; clubId: string; clubName: string }[]>();

  for (const frag of fragments) {
    for (const club of clubKw) {
      const score = scoreFragment(frag.text, club.keywords);
      if (score < 1) continue;
      const list = topPerClub.get(club.id) || [];
      list.push({ frag, score, clubId: club.id, clubName: club.name });
      topPerClub.set(club.id, list);
    }
  }

  let inserted = 0;
  for (const [clubId, list] of topPerClub) {
    const sorted = list.sort((a, b) => b.score - a.score).slice(0, 80);
    for (const item of sorted) {
      await db.insert(clubMatches).values({
        participantId: item.frag.participantId,
        answerId: item.frag.answerId,
        clubId,
        similarity: Math.min(99, 35 + item.score * 12),
        verdict: `Совпадение с «${item.clubName}» (${item.score} ключ.)`,
        sourceType: item.frag.sourceType,
        snippet: item.frag.snippet,
      });
      inserted += 1;
    }
  }

  return { inserted };
}

export async function listClubMatchesForDashboard(clubId?: string | null, limit = 100) {
  if (clubId) {
    return db.select().from(clubMatches)
      .where(eq(clubMatches.clubId, clubId))
      .orderBy(desc(clubMatches.similarity))
      .limit(limit);
  }
  return db.select().from(clubMatches)
    .orderBy(desc(clubMatches.similarity))
    .limit(limit);
}
