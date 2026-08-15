import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { dayExperiments } from '../db/schema.js';
import { ROLE_KEYS, type RoleKey } from './roleService.js';

export type AdviceStatus = 'draft' | 'published';

export type DayAdviceRow = {
  dayNumber: number;
  roleKey: string;
  title: string;
  body?: string | null;
  hint?: string | null;
  title2?: string | null;
  body2?: string | null;
  hint2?: string | null;
  title3?: string | null;
  body3?: string | null;
  hint3?: string | null;
  status: AdviceStatus;
};

const ROLE_ORDER = new Map(ROLE_KEYS.map((k, i) => [k, i]));

export function validateAdvicePayload(raw: {
  dayNumber: unknown;
  roleKey: unknown;
  title?: unknown;
  body?: unknown;
  hint?: unknown;
  title2?: unknown;
  body2?: unknown;
  hint2?: unknown;
  title3?: unknown;
  body3?: unknown;
  hint3?: unknown;
  status?: unknown;
}): { ok: true; data: DayAdviceRow } | { ok: false; error: string } {
  const dayNumber = Number(raw.dayNumber);
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 7) {
    return { ok: false, error: 'dayNumber must be 1–7' };
  }
  const roleKey = String(raw.roleKey || '').trim();
  if (!(ROLE_KEYS as readonly string[]).includes(roleKey)) {
    return { ok: false, error: 'Invalid roleKey' };
  }
  const body = raw.body == null || raw.body === '' ? null : String(raw.body).trim();
  if (!body) return { ok: false, error: 'body required' };
  if (body.length > 500) return { ok: false, error: 'body max 500 characters' };
  // title в БД notNull — берём из текста (заголовок в UI больше не используется)
  const titleRaw = String(raw.title || '').trim();
  const title = (titleRaw || body).slice(0, 60);
  const hint = null;

  const body2 = raw.body2 == null || raw.body2 === '' ? null : String(raw.body2).trim();
  if (body2 && body2.length > 500) return { ok: false, error: 'body2 max 500 characters' };
  const title2 = body2 ? (String(raw.title2 || '').trim() || body2).slice(0, 60) : null;
  const hint2 = null;

  const body3 = raw.body3 == null || raw.body3 === '' ? null : String(raw.body3).trim();
  if (body3 && body3.length > 500) return { ok: false, error: 'body3 max 500 characters' };
  const title3 = body3 ? (String(raw.title3 || '').trim() || body3).slice(0, 60) : null;
  const hint3 = null;

  const statusRaw = raw.status == null || raw.status === '' ? 'draft' : String(raw.status);
  if (statusRaw !== 'draft' && statusRaw !== 'published') {
    return { ok: false, error: 'status must be draft or published' };
  }
  return {
    ok: true,
    data: {
      dayNumber,
      roleKey,
      title,
      body,
      hint,
      title2,
      body2,
      hint2,
      title3,
      body3,
      hint3,
      status: statusRaw as AdviceStatus,
    },
  };
}

export function sortAdviceList<T extends { dayNumber: number; roleKey: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.dayNumber !== b.dayNumber) return a.dayNumber - b.dayNumber;
    return (ROLE_ORDER.get(a.roleKey as RoleKey) ?? 99) - (ROLE_ORDER.get(b.roleKey as RoleKey) ?? 99);
  });
}

export function filterAdviceList<T extends { dayNumber: number; roleKey: string; title: string; body?: string | null; status?: string | null }>(
  list: T[],
  opts: { day?: number | null; roleKey?: string; status?: string; q?: string },
): T[] {
  let out = list;
  if (opts.day) out = out.filter(e => e.dayNumber === opts.day);
  if (opts.roleKey?.trim()) out = out.filter(e => e.roleKey === opts.roleKey!.trim());
  if (opts.status === 'draft' || opts.status === 'published') {
    out = out.filter(e => (e.status || 'published') === opts.status);
  }
  const q = opts.q?.trim().toLowerCase();
  if (q) {
    out = out.filter(e => {
      const hay = `${e.title} ${e.body || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }
  return sortAdviceList(out);
}

export async function upsertDayAdvice(data: DayAdviceRow, shiftId: number) {
  const [existing] = await db.select().from(dayExperiments)
    .where(and(
      eq(dayExperiments.dayNumber, data.dayNumber),
      eq(dayExperiments.roleKey, data.roleKey),
      eq(dayExperiments.shiftId, shiftId),
    ))
    .limit(1);
  if (existing) {
    const [updated] = await db.update(dayExperiments)
      .set({
        title: data.title,
        body: data.body,
        hint: data.hint,
        title2: data.title2,
        body2: data.body2,
        hint2: data.hint2,
        title3: data.title3,
        body3: data.body3,
        hint3: data.hint3,
        status: data.status,
      })
      .where(eq(dayExperiments.id, existing.id))
      .returning();
    return { row: updated!, created: false };
  }
  const [created] = await db.insert(dayExperiments).values({
    shiftId,
    dayNumber: data.dayNumber,
    roleKey: data.roleKey,
    title: data.title,
    body: data.body,
    hint: data.hint,
    title2: data.title2,
    body2: data.body2,
    hint2: data.hint2,
    title3: data.title3,
    body3: data.body3,
    hint3: data.hint3,
    status: data.status,
  }).returning();
  return { row: created!, created: true };
}

export const ADVICE_CSV_HEADER = 'role_key,day_number,title,body,status';

export function adviceCsvTemplate(): string {
  const example = [
    'meaning_researcher',
    '2',
    'Совет дня',
    'Короткий текст совета для участника.',
    'published',
  ].map(v => `"${v.replace(/"/g, '""')}"`).join(',');
  return `${ADVICE_CSV_HEADER}\n${example}\n`;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

export function parseAdviceCsv(text: string): { rows: Record<string, string>[]; errors: string[] } {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const errors: string[] = [];
  if (lines.length === 0) return { rows: [], errors: ['Empty CSV'] };
  const headerParts = parseCsvLine(lines[0]!).map(h => h.toLowerCase());
  const idx = (name: string) => headerParts.indexOf(name);
  const roleIdx = idx('role_key');
  const dayIdx = idx('day_number');
  const titleIdx = idx('title');
  const bodyIdx = idx('body');
  const statusIdx = idx('status');
  if (roleIdx < 0 || dayIdx < 0 || titleIdx < 0) {
    return { rows: [], errors: [`Header must include role_key, day_number, title; got: ${lines[0]}`] };
  }
  const rows: Record<string, string>[] = [];
  for (let li = 1; li < lines.length; li++) {
    const parts = parseCsvLine(lines[li]!);
    rows.push({
      role_key: parts[roleIdx] ?? '',
      day_number: parts[dayIdx] ?? '',
      title: parts[titleIdx] ?? '',
      body: bodyIdx >= 0 ? (parts[bodyIdx] ?? '') : '',
      status: statusIdx >= 0 ? (parts[statusIdx] ?? 'published') : 'published',
      _line: String(li + 1),
    });
  }
  return { rows, errors };
}

export async function importAdviceCsv(text: string, shiftId: number): Promise<{ created: number; updated: number; errors: string[] }> {
  const { rows, errors: parseErrors } = parseAdviceCsv(text);
  let created = 0;
  let updated = 0;
  const errors = [...parseErrors];
  for (const row of rows) {
    const line = row._line || '?';
    const validated = validateAdvicePayload({
      roleKey: row.role_key,
      dayNumber: row.day_number,
      title: row.title,
      body: row.body,
      status: row.status || 'published',
    });
    if (!validated.ok) {
      errors.push(`Line ${line}: ${validated.error}`);
      continue;
    }
    const result = await upsertDayAdvice(validated.data, shiftId);
    if (result.created) created++;
    else updated++;
  }
  return { created, updated, errors };
}

export async function listDayAdviceFromDb(opts: {
  day?: number | null;
  roleKey?: string;
  status?: string;
  q?: string;
  shiftId: number;
}) {
  const list = await db.select().from(dayExperiments)
    .where(eq(dayExperiments.shiftId, opts.shiftId))
    .orderBy(asc(dayExperiments.dayNumber), asc(dayExperiments.roleKey));
  return filterAdviceList(list, opts);
}
