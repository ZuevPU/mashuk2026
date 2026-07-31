import { eq, and } from 'drizzle-orm';
import type { Response } from 'express';
import { db } from '../../db/index.js';
import { dayExperiments, participantDayState, participants } from '../../db/schema.js';
import { addReadmeSheet, fullName } from './exportCommon.js';
import { createWorkbook, sendWorkbook } from './workbook.js';

function dayMode(startRole: string | null | undefined, active: string | null | undefined): string {
  if (!active || !startRole) return '';
  return active === startRole ? 'explore_own' : 'boost_other';
}

export async function writeRolesExperimentsExport(res: Response): Promise<void> {
  const roleRows = await db.select({ s: participantDayState, p: participants })
    .from(participantDayState)
    .leftJoin(participants, eq(participantDayState.participantId, participants.id));
  const experiments = await db.select().from(dayExperiments);

  const expMap = new Map<string, typeof experiments[0]>();
  for (const e of experiments) {
    expMap.set(`${e.dayNumber}:${e.roleKey}`, e);
  }

  const wb = await createWorkbook();
  addReadmeSheet(wb, ['Роли и эксперименты по смене.']);

  const byDay = wb.addWorksheet('По дням');
  byDay.addRow([
    'participant_id', 'direction', 'group', 'day', 'start_role', 'active_role', 'day_mode',
    'experiment_status', 'experiment_title', 'experiment_body', 'experiment_result', 'tomorrow_role',
  ]);
  for (const r of roleRows) {
    const exp = r.s.activeRoleKey
      ? expMap.get(`${r.s.dayNumber}:${r.s.activeRoleKey}`)
      : undefined;
    const ratings = r.s.eveningRatings as Record<string, unknown> | null;
    byDay.addRow([
      r.p?.id, r.p?.direction, r.p?.groupName, r.s.dayNumber, r.p?.pedagogicalRole,
      r.s.activeRoleKey, dayMode(r.p?.pedagogicalRole, r.s.activeRoleKey),
      r.s.experimentStatus, exp?.title ?? '', exp?.body ?? '',
      ratings?.experimentResult ?? '', r.s.tomorrowRoleKey,
    ]);
  }

  const allP = await db.select().from(participants);
  const byParticipant = new Map<number, typeof roleRows>();
  for (const r of roleRows) {
    const id = r.p?.id;
    if (!id) continue;
    if (!byParticipant.has(id)) byParticipant.set(id, []);
    byParticipant.get(id)!.push(r);
  }
  const traj = wb.addWorksheet('Путь ролей участника');
  traj.addRow(['participant_id', 'name', 'start', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7']);
  for (const p of allP) {
    const states = byParticipant.get(p.id) || [];
    const byDayNum: Record<number, string> = {};
    for (const s of states) byDayNum[s.s.dayNumber] = s.s.activeRoleKey || '';
    traj.addRow([
      p.id, fullName(p), p.pedagogicalRole,
      byDayNum[1] || '', byDayNum[2] || '', byDayNum[3] || '', byDayNum[4] || '',
      byDayNum[5] || '', byDayNum[6] || '', byDayNum[7] || '',
    ]);
  }

  const dist = wb.addWorksheet('Распределение ролей');
  dist.addRow(['day', 'direction', 'role_key', 'count']);
  const counts = new Map<string, number>();
  for (const r of roleRows) {
    if (!r.s.activeRoleKey) continue;
    const key = `${r.s.dayNumber}|${r.p?.direction ?? ''}|${r.s.activeRoleKey}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const [key, count] of counts) {
    const [day, direction, role] = key.split('|');
    dist.addRow([day, direction, role, count]);
  }

  const fin = wb.addWorksheet('Способ действия D7');
  fin.addRow(['participant_id', 'name', 'start_role', 'explored_roles_count', 'explored_roles', 'strong_role', 'growth_role', 'next_experiment']);
  for (const p of allP) {
    const states = byParticipant.get(p.id) || [];
    const explored = [...new Set(states.filter(s => s.s.activeRoleKey).map(s => s.s.activeRoleKey!))];
    fin.addRow([
      p.id, fullName(p), p.pedagogicalRole, explored.length, explored.join(', '),
      p.strongRole, p.growthRole, p.nextExperiment,
    ]);
  }

  await sendWorkbook(res, wb, 'roles_experiments.xlsx');
}
