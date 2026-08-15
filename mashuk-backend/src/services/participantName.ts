import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { participants } from '../db/schema.js';
import { batchFetchVkUserProfiles, fetchVkUserProfile } from './vkUserProfile.js';

const PLACEHOLDER_FULL = new Set([
  'тест пользователь',
  'test user',
]);

export function sanitizePersonName(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 255);
}

const PERSON_NAME_RE = /^[\p{L}][\p{L}\s.'’-]*$/u;

export function parseEditablePersonName(
  first: unknown,
  last: unknown,
): { firstName: string; lastName: string } | { error: string } {
  const firstName = sanitizePersonName(first);
  const lastName = sanitizePersonName(last);
  if (!firstName || !lastName) {
    return { error: 'Укажите имя и фамилию' };
  }
  if (isPlaceholderDisplayName(firstName, lastName)) {
    return { error: 'Укажите своё имя, а не тестовое' };
  }
  if (!PERSON_NAME_RE.test(firstName) || !PERSON_NAME_RE.test(lastName)) {
    return { error: 'Имя и фамилия могут содержать только буквы' };
  }
  return { firstName, lastName };
}

export function isPlaceholderDisplayName(
  firstName?: string | null,
  lastName?: string | null,
): boolean {
  const first = sanitizePersonName(firstName).toLowerCase();
  const last = sanitizePersonName(lastName).toLowerCase();
  const full = `${first} ${last}`.trim();
  if (!full) return false;
  return PLACEHOLDER_FULL.has(full)
    || (first === 'тест' && last === 'пользователь')
    || (first === 'test' && last === 'user');
}

export function pickPersonName(opts: {
  vkFirstName?: string | null;
  vkLastName?: string | null;
  clientFirstName?: string | null;
  clientLastName?: string | null;
}): { firstName: string; lastName: string; ok: boolean } {
  const vkFirst = sanitizePersonName(opts.vkFirstName);
  const vkLast = sanitizePersonName(opts.vkLastName);
  const clientFirst = sanitizePersonName(opts.clientFirstName);
  const clientLast = sanitizePersonName(opts.clientLastName);
  const clientIsPlaceholder = isPlaceholderDisplayName(clientFirst, clientLast);

  const firstName = vkFirst || (clientIsPlaceholder ? '' : clientFirst);
  const lastName = vkLast || (clientIsPlaceholder ? '' : clientLast);
  return {
    firstName,
    lastName,
    ok: Boolean(firstName && lastName && !isPlaceholderDisplayName(firstName, lastName)),
  };
}

export async function resolveOnboardingName(
  vkId: number,
  clientFirstName: string,
  clientLastName: string,
): Promise<{ firstName: string; lastName: string } | { error: string }> {
  const vk = await fetchVkUserProfile(vkId);
  const picked = pickPersonName({
    vkFirstName: vk?.firstName,
    vkLastName: vk?.lastName,
    clientFirstName,
    clientLastName,
  });
  if (!picked.ok) {
    return {
      error: 'Не удалось получить имя из ВКонтакте. Закройте мини-приложение и откройте снова.',
    };
  }
  return { firstName: picked.firstName, lastName: picked.lastName };
}

type NamedRow = {
  id: number;
  vkId: number;
  firstName?: string | null;
  lastName?: string | null;
};

export async function repairPlaceholderNames<T extends NamedRow>(rows: T[]): Promise<T[]> {
  const targets = rows.filter(p =>
    p.vkId > 1 && isPlaceholderDisplayName(p.firstName, p.lastName),
  );
  if (!targets.length) return rows;

  const profiles = await batchFetchVkUserProfiles(targets.map(p => p.vkId));
  const patched = new Map<number, { firstName: string; lastName: string }>();
  for (const row of targets) {
    const profile = profiles.get(row.vkId);
    const picked = pickPersonName({
      vkFirstName: profile?.firstName,
      vkLastName: profile?.lastName,
      clientFirstName: row.firstName,
      clientLastName: row.lastName,
    });
    if (!picked.ok) continue;
    patched.set(row.id, { firstName: picked.firstName, lastName: picked.lastName });
  }
  if (!patched.size) return rows;

  await Promise.all([...patched.entries()].map(([id, name]) =>
    db.update(participants).set(name).where(eq(participants.id, id)),
  ));

  return rows.map(row => {
    const name = patched.get(row.id);
    return name ? { ...row, ...name } : row;
  });
}

export async function healParticipantPlaceholderName<T extends NamedRow>(
  row: T | null | undefined,
): Promise<T | null> {
  if (!row || row.vkId <= 1 || !isPlaceholderDisplayName(row.firstName, row.lastName)) {
    return row ?? null;
  }
  const [healed] = await repairPlaceholderNames([row]);
  return healed ?? row;
}

export async function repairAllPlaceholderNames(limit = 200): Promise<number> {
  const rows = await db.select({
    id: participants.id,
    vkId: participants.vkId,
    firstName: participants.firstName,
    lastName: participants.lastName,
  }).from(participants).where(and(
    isNull(participants.selfDeletedAt),
    sql`${participants.vkId} > 1`,
    or(
      and(eq(participants.firstName, 'Тест'), eq(participants.lastName, 'Пользователь')),
      and(eq(participants.firstName, 'тест'), eq(participants.lastName, 'пользователь')),
    ),
  )).limit(limit);
  const healed = await repairPlaceholderNames(rows);
  return healed.filter((row, i) =>
    row.firstName !== rows[i]?.firstName || row.lastName !== rows[i]?.lastName,
  ).length;
}
