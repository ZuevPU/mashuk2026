import { eq } from 'drizzle-orm';
import type { Response } from 'express';
import { db } from '../../db/index.js';
import { dayExperiments, participantDayState, participants } from '../../db/schema.js';
import { addReadmeSheet, fullName } from './exportCommon.js';
import {
  dayModeLabel,
  experimentStatusLabel,
  roleLabel,
  roleLabelsList,
} from './exportLabels.js';
import { createWorkbook, sendWorkbook } from './workbook.js';

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
  addReadmeSheet(wb, ['Роли и эксперименты по смене. Роли — русские названия.']);

  const byDay = wb.addWorksheet('По дням');
  byDay.addRow([
    'ID участника', 'Направление', 'Группа', 'День', 'Роль на входе', 'Активная роль', 'Режим дня',
    'Статус эксперимента', 'Название эксперимента', 'Текст эксперимента', 'Результат эксперимента', 'Роль на завтра',
  ]);
  for (const r of roleRows) {
    const exp = r.s.activeRoleKey
      ? expMap.get(`${r.s.dayNumber}:${r.s.activeRoleKey}`)
      : undefined;
    const ratings = r.s.eveningRatings as Record<string, unknown> | null;
    byDay.addRow([
      r.p?.id, r.p?.direction, r.p?.groupName, r.s.dayNumber,
      roleLabel(r.p?.pedagogicalRole),
      roleLabel(r.s.activeRoleKey),
      dayModeLabel(r.p?.pedagogicalRole, r.s.activeRoleKey),
      experimentStatusLabel(r.s.experimentStatus),
      exp?.title ?? '', exp?.body ?? '',
      ratings?.experimentResult ?? '',
      roleLabel(r.s.tomorrowRoleKey),
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
  traj.addRow(['ID участника', 'ФИО', 'Старт', 'День 1', 'День 2', 'День 3', 'День 4', 'День 5', 'День 6', 'День 7']);
  for (const p of allP) {
    const states = byParticipant.get(p.id) || [];
    const byDayNum: Record<number, string> = {};
    for (const s of states) byDayNum[s.s.dayNumber] = roleLabel(s.s.activeRoleKey);
    traj.addRow([
      p.id, fullName(p), roleLabel(p.pedagogicalRole),
      byDayNum[1] || '', byDayNum[2] || '', byDayNum[3] || '', byDayNum[4] || '',
      byDayNum[5] || '', byDayNum[6] || '', byDayNum[7] || '',
    ]);
  }

  const dist = wb.addWorksheet('Распределение ролей');
  dist.addRow(['День', 'Направление', 'Роль', 'Количество']);
  const counts = new Map<string, number>();
  for (const r of roleRows) {
    if (!r.s.activeRoleKey) continue;
    const key = `${r.s.dayNumber}|${r.p?.direction ?? ''}|${r.s.activeRoleKey}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const [key, count] of counts) {
    const [day, direction, role] = key.split('|');
    dist.addRow([day, direction, roleLabel(role), count]);
  }

  const fin = wb.addWorksheet('Способ действия D7');
  fin.addRow([
    'ID участника', 'ФИО', 'Роль на входе', 'Число исследованных ролей', 'Исследованные роли',
    'Сильная роль', 'Роль роста', 'Следующий эксперимент',
  ]);
  for (const p of allP) {
    const states = byParticipant.get(p.id) || [];
    const explored = [...new Set(states.filter(s => s.s.activeRoleKey).map(s => s.s.activeRoleKey!))];
    fin.addRow([
      p.id, fullName(p), roleLabel(p.pedagogicalRole), explored.length, roleLabelsList(explored),
      roleLabel(p.strongRole), roleLabel(p.growthRole), p.nextExperiment,
    ]);
  }

  await sendWorkbook(res, wb, 'roles_experiments.xlsx');
}
