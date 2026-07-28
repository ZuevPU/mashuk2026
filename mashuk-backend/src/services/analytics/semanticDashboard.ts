import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { answers, clubMatches, forumClubs, questions } from '../../db/schema.js';
import { isPublishedStatus } from '../publishStatus.js';
import { inferReflectionDepth } from '../reflectionDepth.js';
import { synthesizeSemanticLayers, isGigachatConfigured } from '../gigachatService.js';
import { semanticV2Enabled } from './refreshScheduler.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { loadCohortParticipants } from './cohort.js';
import { topReasonTokens } from './zoneDistribution.js';

export async function buildSemanticDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  if (!semanticV2Enabled()) {
    return {
      enabled: false,
      message: 'Смысловая аналитика (этап 2). Установите SEMANTIC_ANALYTICS_V2=true',
    };
  }

  const cohort = await loadCohortParticipants(filters, req);
  const ids = new Set(cohort.map(p => p.id));
  const allAns = await db.select().from(answers);
  const filtered = allAns.filter(a => ids.has(a.participantId));
  const qList = (await db.select().from(questions)).filter(q => isPublishedStatus(q.status));
  const qMap = new Map(qList.map(q => [q.id, q]));

  const depths: Record<string, number> = {};
  const texts: string[] = [];
  for (const a of filtered) {
    const text = typeof a.answerData === 'string' ? a.answerData : JSON.stringify(a.answerData ?? '');
    const d = inferReflectionDepth(text) || '—';
    depths[d] = (depths[d] || 0) + 1;
    if (text.length > 30) texts.push(text);
  }

  const semantic = await synthesizeSemanticLayers({ depths, sampleTexts: texts, day: filters.day ?? undefined });

  const wordFreq = topReasonTokens(texts, 30);

  return {
    enabled: true,
    gigachat: isGigachatConfigured(),
    professionalShift: { summary: semantic.summary, source: semantic.source },
    languageTracker: { topTerms: wordFreq },
    depthLayers: semantic.layers,
    dailyObservation: semantic.summary,
  };
}

export async function buildClubsDashboard(_filters: AnalyticsFilters, _req?: AdminRequest) {
  if (!semanticV2Enabled()) {
    return { enabled: false, clubs: [], matches: [] };
  }
  const clubs = await db.select().from(forumClubs).where(eq(forumClubs.isActive, true));
  const matches = await db.select().from(clubMatches).orderBy(desc(clubMatches.createdAt)).limit(200);
  return { enabled: true, clubs, matches };
}
