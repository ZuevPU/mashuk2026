/**
 * Сборка Data-driven HTML-профиля участника (Профиль 3).
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { answers, participants, questions } from '../db/schema.js';
import { isOrganizerDirection } from './leaderboardQuery.js';
import { stateCheckPhaseForAnswer } from './analytics/touchpointMetrics.js';
import { buildAnalyticalProfile } from './participantAnalyticalProfileBuild.js';
import {
  buildDataDrivenNarrative,
  compareToAverage,
  type DataDrivenProfile,
} from './participantDataDrivenProfileLogic.js';
import { PARTICIPANT_DATA_DRIVEN_PROFILE_TEMPLATE } from './participantDataDrivenProfile/templateHtml.js';

function resolvePhase(
  timePoint: string | null | undefined,
  createdAt: Date | null | undefined,
): 'morning' | 'day' | 'evening' {
  const tp = (timePoint || '').toLowerCase();
  if (tp.includes('вечер')) return 'evening';
  if (tp.includes('день')) return 'day';
  if (tp.includes('утро')) return 'morning';
  return stateCheckPhaseForAnswer(createdAt ?? null);
}

function parseEnergy(answerData: unknown): number | null {
  if (!answerData || typeof answerData !== 'object') return null;
  const e = (answerData as { energy?: unknown }).energy;
  const n = typeof e === 'number' ? e : Number(e);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 10) return null;
  return Math.round(n * 10) / 10;
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function rankOf(value: number, cohort: number[]): number | null {
  if (!cohort.length) return null;
  const better = cohort.filter(n => n > value).length;
  return better + 1;
}

export async function buildDataDrivenProfile(participantId: number): Promise<DataDrivenProfile | null> {
  const analytical = await buildAnalyticalProfile(participantId);
  if (!analytical) return null;

  const { narrative: _drop, ...base } = analytical;

  const [p] = await db.select({
    id: participants.id,
    shiftId: participants.shiftId,
    direction: participants.direction,
    pathPoints: participants.pathPoints,
    experiencePoints: participants.experiencePoints,
  }).from(participants).where(eq(participants.id, participantId)).limit(1);
  if (!p) return null;

  const dirName = p.direction || '—';
  const cohortFilter = p.shiftId != null
    ? and(eq(participants.shiftId, p.shiftId), eq(participants.direction, dirName))
    : eq(participants.direction, dirName);
  const cohort = await db.select({
    id: participants.id,
    pathPoints: participants.pathPoints,
    experiencePoints: participants.experiencePoints,
    onboardingCompletedAt: participants.onboardingCompletedAt,
    direction: participants.direction,
  }).from(participants).where(cohortFilter);

  const peers = cohort.filter(
    c => c.onboardingCompletedAt && !isOrganizerDirection(c.direction),
  );
  const pathVals = peers.map(c => c.pathPoints || 0);
  const expVals = peers.map(c => c.experiencePoints || 0);
  const myPath = p.pathPoints || 0;
  const myExp = p.experiencePoints || 0;
  const pathRank = rankOf(myPath, pathVals);
  const expRank = rankOf(myExp, expVals);

  const ranking: DataDrivenProfile['ranking'] = {
    pathRank,
    expRank,
    cohortSize: peers.length,
    pathCompare: compareToAverage(myPath, base.activity.dirAvgPath, 'Путь'),
    expCompare: compareToAverage(myExp, base.activity.dirAvgExp, 'Опыт'),
  };

  const userAnswers = await db.select().from(answers).where(eq(answers.participantId, participantId));
  const qIds = [...new Set(userAnswers.map(a => a.questionId))];
  const qs = qIds.length
    ? await db.select().from(questions).where(inArray(questions.id, qIds))
    : [];
  const qById = new Map(qs.map(q => [q.id, q]));
  const byPhase: Record<'morning' | 'day' | 'evening', number[]> = {
    morning: [],
    day: [],
    evening: [],
  };
  for (const a of userAnswers) {
    const q = qById.get(a.questionId);
    if (!q) continue;
    const isState = q.questionKind === 'state_check'
      || q.type === 'checkin'
      || (q.block || '').toLowerCase().includes('проверк');
    if (!isState) continue;
    const energy = parseEnergy(a.answerData);
    if (energy == null) continue;
    byPhase[resolvePhase(q.timePoint, a.createdAt)].push(energy);
  }
  const energyByPhase = {
    morning: avg(byPhase.morning),
    day: avg(byPhase.day),
    evening: avg(byPhase.evening),
  };

  const narrative = buildDataDrivenNarrative({ base, ranking, energyByPhase });

  return {
    ...base,
    ranking,
    energyByPhase,
    narrative,
  };
}

export function renderDataDrivenProfileHtml(profile: DataDrivenProfile): string {
  const template = PARTICIPANT_DATA_DRIVEN_PROFILE_TEMPLATE;
  const json = JSON.stringify(profile).replace(/</g, '\\u003c');
  if (!template.includes('__PROFILE_JSON__')) {
    throw new Error('data-driven profile template missing __PROFILE_JSON__ placeholder');
  }
  return template.replace('__PROFILE_JSON__', json);
}

export async function buildDataDrivenProfileHtml(participantId: number): Promise<{
  html: string;
  profile: DataDrivenProfile;
  pagesHint: number;
} | null> {
  const profile = await buildDataDrivenProfile(participantId);
  if (!profile) return null;
  const html = renderDataDrivenProfileHtml(profile);
  const pagesHint = 3;
  console.info('[participant-profile-3]', {
    participantId,
    pagesHint,
    name: profile.person.name,
    archetype: profile.narrative.archetype,
  });
  return { html, profile, pagesHint };
}
