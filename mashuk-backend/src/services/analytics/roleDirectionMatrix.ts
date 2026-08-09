import { inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { participantDayState } from '../../db/schema.js';
import { listPedagogicalRoleOptions } from '../roleService.js';

export type RoleDirectionCell = {
  direction: string;
  roleKey: string;
  count: number;
  pct: number;
};

export type RoleDirectionDayMatrix = {
  day: number;
  registeredByDirection: { direction: string; n: number }[];
  cells: RoleDirectionCell[];
};

/**
 * Кросс-срез роль × направление: доля участников направления с ролью, %.
 * Роль дня = activeRoleKey из day_state, иначе pedagogicalRole (старт).
 */
export async function buildRoleDirectionMatrix(
  cohort: {
    id: number;
    direction?: string | null;
    pedagogicalRole?: string | null;
    onboardingCompletedAt?: Date | null;
  }[],
  days: number[],
): Promise<{
  roles: { roleKey: string; name: string }[];
  directions: string[];
  byDay: RoleDirectionDayMatrix[];
}> {
  const roles = await listPedagogicalRoleOptions();
  const roleKeys = roles.map(r => r.roleKey);
  const roleKeySet = new Set(roleKeys);
  const roleMeta = roles.map(r => ({ roleKey: r.roleKey, name: r.name }));

  const registered = cohort.filter(p => p.onboardingCompletedAt);
  const directions = [...new Set(registered.map(p => (p.direction || '—').trim() || '—'))]
    .sort((a, b) => a.localeCompare(b, 'ru'));

  if (!registered.length || !days.length) {
    return {
      roles: roleMeta,
      directions,
      byDay: days.map(day => ({
        day,
        registeredByDirection: directions.map(d => ({ direction: d, n: 0 })),
        cells: directions.flatMap(direction =>
          roleKeys.map(roleKey => ({ direction, roleKey, count: 0, pct: 0 })),
        ),
      })),
    };
  }

  const ids = registered.map(p => p.id);
  const states = await db.select({
    participantId: participantDayState.participantId,
    dayNumber: participantDayState.dayNumber,
    activeRoleKey: participantDayState.activeRoleKey,
  }).from(participantDayState).where(inArray(participantDayState.participantId, ids));

  const activeByPidDay = new Map<string, string>();
  for (const s of states) {
    if (!s.activeRoleKey || !days.includes(s.dayNumber)) continue;
    activeByPidDay.set(`${s.participantId}:${s.dayNumber}`, s.activeRoleKey);
  }

  const byDay: RoleDirectionDayMatrix[] = days.map(day => {
    const dirTotals = new Map<string, number>();
    const counts = new Map<string, number>(); // direction::roleKey

    for (const p of registered) {
      const direction = (p.direction || '—').trim() || '—';
      dirTotals.set(direction, (dirTotals.get(direction) || 0) + 1);
      const roleKey = activeByPidDay.get(`${p.id}:${day}`)
        || p.pedagogicalRole
        || '';
      if (!roleKey || !roleKeySet.has(roleKey)) continue;
      const key = `${direction}::${roleKey}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const cells: RoleDirectionCell[] = [];
    for (const direction of directions) {
      const n = dirTotals.get(direction) || 0;
      for (const roleKey of roleKeys) {
        const count = counts.get(`${direction}::${roleKey}`) || 0;
        cells.push({
          direction,
          roleKey,
          count,
          pct: n ? Math.round((count / n) * 1000) / 10 : 0,
        });
      }
    }

    return {
      day,
      registeredByDirection: directions.map(direction => ({
        direction,
        n: dirTotals.get(direction) || 0,
      })),
      cells,
    };
  });

  return { roles: roleMeta, directions, byDay };
}
