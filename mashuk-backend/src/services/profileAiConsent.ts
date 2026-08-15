import { and, inArray, isNotNull, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { participantDayState, participants } from '../db/schema.js';
import {
  resolveEveningConfigForDay,
  type EveningField,
} from './eveningQuestionnaireConfig.js';

const CONSENT_LABEL = 'Я даю согласие на автоматизированную обработку моих текстовых ответов (включая использование технологий искусственного интеллекта) для формирования моего итогового профиля участия в форуме';

function norm(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function isProfileAiConsentField(field: Pick<EveningField, 'key' | 'type' | 'label'>): boolean {
  if (field.type === 'info_text') return false;
  if (field.type !== 'yes_no' && field.type !== 'choice') return false;
  const blob = norm(`${field.key} ${field.label}`);
  if (norm(field.label) === norm(CONSENT_LABEL)) return true;
  const hasConsent = /соглас/.test(blob);
  const hasAuto = /автоматизирован/.test(blob);
  const hasAi = /искусственн|интеллект/.test(blob);
  const hasProfile = /итогового профиля/.test(blob);
  return (hasConsent && (hasAuto || hasAi || hasProfile)) || (hasAuto && hasAi);
}

export function looksLikeConsentKey(key: string): boolean {
  return /consent|согласи|ai.?profile|profile.?ai|ии.?профиль/i.test(key);
}

export function parseYesNoAnswer(raw: unknown): boolean | null {
  if (raw === true || raw === 1) return true;
  if (raw === false || raw === 0) return false;
  if (typeof raw === 'string') {
    const t = raw.trim().toLowerCase();
    if (t === 'true' || t === 'yes' || t === '1' || t === 'да') return true;
    if (t === 'false' || t === 'no' || t === '0' || t === 'нет') return false;
  }
  return null;
}

export function collectProfileAiConsentFields(
  settings: Parameters<typeof resolveEveningConfigForDay>[0],
  days: number[] = [1, 2, 3, 4, 5, 6, 7, 8],
): EveningField[] {
  const seen = new Set<string>();
  const fields: EveningField[] = [];
  for (const day of days) {
    const cfg = resolveEveningConfigForDay(settings, day);
    for (const field of (cfg.steps || []).flatMap(s => s.fields)) {
      if (!isProfileAiConsentField(field) || seen.has(field.key)) continue;
      seen.add(field.key);
      fields.push(field);
    }
  }
  return fields;
}

export function collectProfileAiConsentFieldKeys(
  settings: Parameters<typeof resolveEveningConfigForDay>[0],
): string[] {
  return collectProfileAiConsentFields(settings).map(f => f.key);
}

export function extractProfileAiConsent(
  ratings: Record<string, unknown> | null | undefined,
  keys: string[],
): boolean | null {
  if (!ratings || typeof ratings !== 'object') return null;
  for (const key of keys) {
    if (!(key in ratings)) continue;
    const value = parseYesNoAnswer(ratings[key]);
    if (value != null) return value;
  }
  if (!keys.length) {
    for (const [key, raw] of Object.entries(ratings)) {
      if (!looksLikeConsentKey(key)) continue;
      const value = parseYesNoAnswer(raw);
      if (value != null) return value;
    }
  }
  return null;
}

export function pickLatestProfileAiConsent(
  states: Array<{ dayNumber: number; eveningRatings: unknown }>,
  keys: string[],
): boolean | null {
  const sorted = [...states].sort((a, b) => b.dayNumber - a.dayNumber);
  for (const state of sorted) {
    const ratings = state.eveningRatings && typeof state.eveningRatings === 'object'
      ? state.eveningRatings as Record<string, unknown>
      : null;
    const value = extractProfileAiConsent(ratings, keys);
    if (value != null) return value;
  }
  return null;
}

function safeJsonKeys(keys: string[]): string[] {
  return keys.filter(key => /^[a-zA-Z0-9_-]+$/.test(key));
}

/** Подзапрос: 1 = Да, 0 = Нет, NULL = нет ответа. */
export function profileAiConsentOrderExpr(keys: string[]): SQL | null {
  const safe = safeJsonKeys(keys);
  if (!safe.length) return null;

  let valueExpr: SQL = sql`${participantDayState.eveningRatings}->>${sql.raw(`'${safe[0]}'`)}`;
  let hasKey: SQL = sql`${participantDayState.eveningRatings} ? ${sql.raw(`'${safe[0]}'`)}`;
  for (const key of safe.slice(1)) {
    valueExpr = sql`coalesce(${valueExpr}, ${participantDayState.eveningRatings}->>${sql.raw(`'${key}'`)})`;
    hasKey = sql`(${hasKey} OR ${participantDayState.eveningRatings} ? ${sql.raw(`'${key}'`)})`;
  }

  return sql`(
    SELECT CASE
      WHEN lower(${valueExpr}) IN ('true', 'yes', '1', 'да') THEN 1
      WHEN lower(${valueExpr}) IN ('false', 'no', '0', 'нет') THEN 0
      ELSE NULL
    END
    FROM ${participantDayState}
    WHERE ${participantDayState.participantId} = ${participants.id}
      AND ${participantDayState.eveningRatings} IS NOT NULL
      AND (${hasKey})
    ORDER BY ${participantDayState.dayNumber} DESC
    LIMIT 1
  )`;
}

export async function loadProfileAiConsentMap(
  participantIds: number[],
  keys: string[],
): Promise<Map<number, boolean | null>> {
  const map = new Map<number, boolean | null>();
  if (!participantIds.length) return map;

  const rows = await db.select({
    participantId: participantDayState.participantId,
    dayNumber: participantDayState.dayNumber,
    eveningRatings: participantDayState.eveningRatings,
  }).from(participantDayState).where(and(
    inArray(participantDayState.participantId, participantIds),
    isNotNull(participantDayState.eveningRatings),
  ));

  const byParticipant = new Map<number, Array<{ dayNumber: number; eveningRatings: unknown }>>();
  for (const row of rows) {
    const list = byParticipant.get(row.participantId) ?? [];
    list.push(row);
    byParticipant.set(row.participantId, list);
  }

  for (const id of participantIds) {
    map.set(id, pickLatestProfileAiConsent(byParticipant.get(id) ?? [], keys));
  }
  return map;
}
