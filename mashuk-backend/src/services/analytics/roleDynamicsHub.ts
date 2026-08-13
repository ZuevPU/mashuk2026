import { inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { participantDayState } from '../../db/schema.js';
import { listPedagogicalRoleOptions } from '../roleService.js';
import {
  buildRoleJourney,
  emptyRoleJourney,
  latestRoleOf,
  type RoleJourneyPack,
  type RolePersonSnap,
} from './roleJourney.js';

export type RoleShare = {
  roleKey: string;
  name: string;
  count: number;
  pct: number;
};

export type RoleDayShares = {
  day: number;
  n: number;
  cells: RoleShare[];
};

export type RoleInsight = {
  metric: string;
  text: string;
};

/** Цвета полос как в макете штаба. */
export const ROLE_BAR_COLORS: Record<string, string> = {
  meaning_researcher: '#F2B27A',
  content_packer: '#E8C4B8',
  practice_realizer: '#E07A3D',
  process_navigator: '#E6C35C',
  communication_guide: '#7DB8A8',
  environment_keeper: '#A8B8D8',
};

/** Порядок строк в графике «Динамика всех шести ролей». */
export const ROLE_DISPLAY_ORDER = [
  'meaning_researcher',
  'content_packer',
  'practice_realizer',
  'process_navigator',
  'communication_guide',
  'environment_keeper',
] as const;

const THINKING_KEYS = new Set(['meaning_researcher', 'content_packer']);
const ACTION_KEYS = new Set(['practice_realizer', 'process_navigator']);

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function sharesFromCounts(
  counts: Map<string, number>,
  n: number,
  roles: { roleKey: string; name: string }[],
): RoleShare[] {
  return roles.map(r => {
    const count = counts.get(r.roleKey) || 0;
    return {
      roleKey: r.roleKey,
      name: r.name,
      count,
      pct: n ? round1((count / n) * 100) : 0,
    };
  });
}

function buildInsights(
  forumByDay: RoleDayShares[],
  roles: { roleKey: string; name: string }[],
): RoleInsight[] {
  if (forumByDay.length < 2) {
    return [{
      metric: '—',
      text: 'Нужно минимум два дня с ролями, чтобы увидеть сдвиг соотношения.',
    }];
  }

  const first = forumByDay[0];
  const last = forumByDay[forumByDay.length - 1];
  const nameOf = (key: string) => roles.find(r => r.roleKey === key)?.name || key;

  const deltas = roles.map(r => {
    const a = first.cells.find(c => c.roleKey === r.roleKey)?.pct ?? 0;
    const b = last.cells.find(c => c.roleKey === r.roleKey)?.pct ?? 0;
    return { roleKey: r.roleKey, name: r.name, from: a, to: b, delta: round1(b - a) };
  });

  const insights: RoleInsight[] = [];

  const drop = [...deltas].sort((a, b) => a.delta - b.delta)[0];
  if (drop && drop.delta < -1) {
    const wasTop = first.cells.every(c => c.roleKey === drop.roleKey || c.pct <= drop.from);
    insights.push({
      metric: `${drop.delta} п.п.`,
      text: wasTop
        ? `«${drop.name}» перестал быть доминирующим выбором.`
        : `Доля «${drop.name}» снизилась сильнее остальных (${drop.from}% → ${drop.to}%).`,
    });
  }

  const rise = [...deltas].sort((a, b) => b.delta - a.delta)[0];
  if (rise && rise.delta > 1 && rise.from > 0) {
    const mult = round1(rise.to / rise.from);
    insights.push({
      metric: mult >= 1.5 ? `×${String(mult).replace('.', ',')}` : `+${rise.delta} п.п.`,
      text: mult >= 1.5
        ? `Выросла доля «${rise.name}»: участники перешли от осмысления к пробе.`
        : `Доля «${rise.name}» выросла с ${rise.from}% до ${rise.to}%.`,
    });
  } else if (rise && rise.delta > 1) {
    insights.push({
      metric: `+${rise.delta} п.п.`,
      text: `Сильнее всего выросла доля «${rise.name}» (до ${rise.to}%).`,
    });
  }

  let pivotDay: number | null = null;
  for (const row of forumByDay) {
    let think = 0;
    let act = 0;
    for (const c of row.cells) {
      if (THINKING_KEYS.has(c.roleKey)) think += c.pct;
      if (ACTION_KEYS.has(c.roleKey)) act += c.pct;
    }
    if (Math.abs(think - act) <= 3 && think > 0 && act > 0) {
      pivotDay = row.day;
      break;
    }
  }
  if (pivotDay != null) {
    insights.push({
      metric: `день ${pivotDay}`,
      text: 'Точка разворота: роли действия впервые сравнялись с ролями мышления.',
    });
  } else {
    const lastThink = last.cells.filter(c => THINKING_KEYS.has(c.roleKey)).reduce((s, c) => s + c.pct, 0);
    const lastAct = last.cells.filter(c => ACTION_KEYS.has(c.roleKey)).reduce((s, c) => s + c.pct, 0);
    const lead = lastAct >= lastThink ? 'действия' : 'мышления';
    const leadNames = last.cells
      .filter(c => (lead === 'действия' ? ACTION_KEYS : THINKING_KEYS).has(c.roleKey))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 2)
      .map(c => nameOf(c.roleKey));
    insights.push({
      metric: `${round1(Math.abs(lastAct - lastThink))} п.п.`,
      text: `К дню ${last.day} лидируют роли ${lead}${leadNames.length ? ` («${leadNames.join('», «')}»)` : ''}.`,
    });
  }

  return insights.slice(0, 3);
}

/**
 * Стартовые роли (pedagogicalRole) + динамика долей по дням
 * (activeRoleKey дня, иначе старт) — форум целиком и по направлениям.
 */
export async function buildRoleDynamicsHub(
  cohort: {
    id: number;
    direction?: string | null;
    pedagogicalRole?: string | null;
    onboardingCompletedAt?: Date | null;
  }[],
  days: number[],
): Promise<{
  roles: { roleKey: string; name: string; color: string }[];
  days: number[];
  starting: {
    forum: RoleShare[];
    forumN: number;
    byDirection: { direction: string; n: number; cells: RoleShare[] }[];
  };
  forumByDay: RoleDayShares[];
  byDirection: { direction: string; byDay: RoleDayShares[] }[];
  insights: RoleInsight[];
  journey: RoleJourneyPack;
}> {
  const catalog = await listPedagogicalRoleOptions();
  const byKey = new Map(catalog.map(r => [r.roleKey, r.name]));
  const orderedKeys = [
    ...ROLE_DISPLAY_ORDER.filter(k => byKey.has(k)),
    ...catalog.map(r => r.roleKey).filter(k => !(ROLE_DISPLAY_ORDER as readonly string[]).includes(k)),
  ];
  const roles = orderedKeys.map(roleKey => ({
    roleKey,
    name: byKey.get(roleKey) || roleKey,
    color: ROLE_BAR_COLORS[roleKey] || '#C4B5A0',
  }));
  const roleKeySet = new Set(orderedKeys);

  const registered = cohort.filter(p => p.onboardingCompletedAt);
  const directions = [...new Set(registered.map(p => (p.direction || '—').trim() || '—'))]
    .sort((a, b) => a.localeCompare(b, 'ru'));

  const emptyShares = (): RoleShare[] => sharesFromCounts(new Map(), 0, roles);

  if (!registered.length || !days.length) {
    return {
      roles,
      days,
      starting: { forum: emptyShares(), forumN: 0, byDirection: [] },
      forumByDay: days.map(day => ({ day, n: 0, cells: emptyShares() })),
      byDirection: [],
      insights: [{ metric: '—', text: 'Нет зарегистрированных участников в срезе.' }],
      journey: { forum: emptyRoleJourney(roles), byDirection: [] },
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
    if (!roleKeySet.has(s.activeRoleKey)) continue;
    activeByPidDay.set(`${s.participantId}:${s.dayNumber}`, s.activeRoleKey);
  }

  // —— старт ——
  const startForum = new Map<string, number>();
  const startByDir = new Map<string, Map<string, number>>();
  const startDirN = new Map<string, number>();
  let startForumN = 0;
  for (const p of registered) {
    const direction = (p.direction || '—').trim() || '—';
    startDirN.set(direction, (startDirN.get(direction) || 0) + 1);
    const role = p.pedagogicalRole && roleKeySet.has(p.pedagogicalRole) ? p.pedagogicalRole : null;
    if (!role) continue;
    startForumN += 1;
    startForum.set(role, (startForum.get(role) || 0) + 1);
    if (!startByDir.has(direction)) startByDir.set(direction, new Map());
    const m = startByDir.get(direction)!;
    m.set(role, (m.get(role) || 0) + 1);
  }

  const starting = {
    forumN: startForumN,
    forum: sharesFromCounts(startForum, startForumN, roles),
    byDirection: directions.map(direction => {
      const n = startDirN.get(direction) || 0;
      const withRole = [...(startByDir.get(direction)?.values() ?? [])].reduce((s, v) => s + v, 0);
      return {
        direction,
        n,
        cells: sharesFromCounts(startByDir.get(direction) || new Map(), withRole || n, roles),
      };
    }),
  };

  // —— динамика по дням ——
  const forumByDay: RoleDayShares[] = days.map(day => {
    const counts = new Map<string, number>();
    let n = 0;
    for (const p of registered) {
      const roleKey = activeByPidDay.get(`${p.id}:${day}`)
        || (p.pedagogicalRole && roleKeySet.has(p.pedagogicalRole) ? p.pedagogicalRole : '');
      if (!roleKey) continue;
      n += 1;
      counts.set(roleKey, (counts.get(roleKey) || 0) + 1);
    }
    return { day, n, cells: sharesFromCounts(counts, n, roles) };
  });

  const byDirection = directions.map(direction => {
    const people = registered.filter(p => ((p.direction || '—').trim() || '—') === direction);
    const byDay: RoleDayShares[] = days.map(day => {
      const counts = new Map<string, number>();
      let n = 0;
      for (const p of people) {
        const roleKey = activeByPidDay.get(`${p.id}:${day}`)
          || (p.pedagogicalRole && roleKeySet.has(p.pedagogicalRole) ? p.pedagogicalRole : '');
        if (!roleKey) continue;
        n += 1;
        counts.set(roleKey, (counts.get(roleKey) || 0) + 1);
      }
      return { day, n, cells: sharesFromCounts(counts, n, roles) };
    });
    return { direction, byDay };
  });

  const snapsFor = (
    people: typeof registered,
  ): RolePersonSnap[] => people.map(p => {
    const start = p.pedagogicalRole && roleKeySet.has(p.pedagogicalRole) ? p.pedagogicalRole : null;
    return {
      start,
      now: latestRoleOf(p.id, days, activeByPidDay, start),
    };
  });

  const journey: RoleJourneyPack = {
    forum: buildRoleJourney(snapsFor(registered), roles),
    byDirection: directions.map(direction => {
      const people = registered.filter(p => ((p.direction || '—').trim() || '—') === direction);
      return { direction, journey: buildRoleJourney(snapsFor(people), roles) };
    }),
  };

  return {
    roles,
    days,
    starting,
    forumByDay,
    byDirection,
    insights: buildInsights(forumByDay, roles),
    journey,
  };
}
