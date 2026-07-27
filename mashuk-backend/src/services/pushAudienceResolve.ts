import { and, eq, gte, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import { directions, participants } from '../db/schema.js';

export type AudienceType = 'all' | 'direction' | 'group' | 'ids' | 'rule';

export type AudienceRuleCondition = {
  field: 'directionId' | 'groupId' | 'pedagogicalRole' | 'isBlocked';
  cmp: 'eq' | 'neq';
  value: string | number | boolean;
};

export type AudienceRule = {
  op: 'and';
  conditions: AudienceRuleCondition[];
};

export type AudiencePayload = {
  directionId?: number;
  directionIds?: number[];
  groupId?: number;
  participantIds?: number[];
  rule?: AudienceRule;
};

const onboarded = and(
  isNotNull(participants.onboardingCompletedAt),
  isNull(participants.selfDeletedAt),
);

export async function resolvePushAudience(
  audienceType: string,
  payload: AudiencePayload | null | undefined,
): Promise<number[]> {
  const p = payload ?? {};

  if (audienceType === 'ids' && Array.isArray(p.participantIds) && p.participantIds.length) {
    const ids = p.participantIds.map(Number).filter(n => !Number.isNaN(n));
    const rows = await db.select({ id: participants.id }).from(participants)
      .where(and(inArray(participants.id, ids), onboarded));
    return rows.map(r => r.id);
  }

  if (audienceType === 'direction' && p.directionId) {
    const [dir] = await db.select().from(directions).where(eq(directions.id, p.directionId)).limit(1);
    const cond = dir
      ? or(eq(participants.directionId, p.directionId), eq(participants.direction, dir.name))
      : eq(participants.directionId, p.directionId);
    const rows = await db.select({ id: participants.id }).from(participants)
      .where(and(cond, onboarded));
    return rows.map(r => r.id);
  }

  if (audienceType === 'group' && p.groupId) {
    const rows = await db.select({ id: participants.id }).from(participants)
      .where(and(eq(participants.groupId, p.groupId), onboarded));
    return rows.map(r => r.id);
  }

  if (audienceType === 'rule' && p.rule?.conditions?.length) {
    const rows = await db.select().from(participants).where(onboarded);
    return rows.filter(row => matchRule(row, p.rule!)).map(r => r.id);
  }

  const rows = await db.select({ id: participants.id }).from(participants).where(onboarded);
  return rows.map(r => r.id);
}

function matchRule(
  row: typeof participants.$inferSelect,
  rule: AudienceRule,
): boolean {
  if (rule.op !== 'and') return true;
  return rule.conditions.every(c => {
    let actual: string | number | boolean | null;
    switch (c.field) {
      case 'directionId':
        actual = row.directionId;
        break;
      case 'groupId':
        actual = row.groupId;
        break;
      case 'pedagogicalRole':
        actual = row.pedagogicalRole ?? '';
        break;
      case 'isBlocked':
        actual = !!row.isBlocked;
        break;
      default:
        return true;
    }
    const v = c.value;
    if (c.cmp === 'neq') return actual !== v;
    return actual === v;
  });
}

export function formatAudienceLabel(audienceType: string, payload: AudiencePayload | null | undefined): string {
  const p = payload ?? {};
  switch (audienceType) {
    case 'all':
      return 'Все';
    case 'direction':
      return p.directionId ? `Направление #${p.directionId}` : 'Направление';
    case 'group':
      return p.groupId ? `Группа #${p.groupId}` : 'Группа';
    case 'ids':
      return Array.isArray(p.participantIds) ? `Список (${p.participantIds.length})` : 'Список ID';
    case 'rule':
      return 'Правило';
    default:
      return audienceType;
  }
}

/** Activity filter helper for rule extension */
export async function participantIdsActiveSince(since: Date): Promise<Set<number>> {
  const rows = await db.select({ id: participants.id }).from(participants)
    .where(and(onboarded, gte(participants.lastActiveAt, since)));
  return new Set(rows.map(r => r.id));
}
