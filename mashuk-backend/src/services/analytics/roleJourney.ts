const THINKING = new Set(['meaning_researcher', 'content_packer']);
const ACTION = new Set(['practice_realizer', 'process_navigator']);

export const ROLE_SHORT_LABEL: Record<string, string> = {
  meaning_researcher: 'Смыслы',
  content_packer: 'Упаковка',
  practice_realizer: 'Практика',
  process_navigator: 'Навигация',
  communication_guide: 'Диалог',
  environment_keeper: 'Среда',
};

export type RoleFamily = 'thinking' | 'action' | 'people' | 'none';

export type RoleChangeKey = 'refined' | 'stayed' | 'shifted' | 'unknown';

export type RolePersonSnap = {
  start: string | null;
  now: string | null;
};

export type RoleJourneyBucket = {
  key: RoleChangeKey;
  label: string;
  count: number;
  pct: number;
};

export type RoleJourneyNow = {
  roleKey: string;
  name: string;
  short: string;
  count: number;
  pct: number;
};

export type RoleJourneyHelped = {
  label: string;
  pct: number;
  count: number;
};

export type RoleJourney = {
  n: number;
  whatHappened: RoleJourneyBucket[];
  now: RoleJourneyNow[];
  nowN: number;
  dominant: { roleKey: string; name: string; short: string; pct: number; count: number } | null;
  helped: RoleJourneyHelped[];
  conclusion: string;
};

export type RoleJourneyPack = {
  forum: RoleJourney;
  byDirection: { direction: string; journey: RoleJourney }[];
};

const WHAT_HAPPENED: { key: RoleChangeKey; label: string }[] = [
  { key: 'refined', label: 'Роль уточнилась' },
  { key: 'stayed', label: 'Роль осталась прежней' },
  { key: 'shifted', label: 'Выбрали другую ось' },
  { key: 'unknown', label: 'Роль пока не выбрана' },
];

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pct(count: number, n: number): number {
  return n ? round1((count / n) * 100) : 0;
}

export function roleFamily(key: string | null | undefined): RoleFamily {
  if (!key) return 'none';
  if (THINKING.has(key)) return 'thinking';
  if (ACTION.has(key)) return 'action';
  return 'people';
}

export function classifyRoleChange(start: string | null, now: string | null): RoleChangeKey {
  if (!start) return 'unknown';
  if (!now || start === now) return 'stayed';
  if (roleFamily(start) === roleFamily(now)) return 'refined';
  return 'shifted';
}

export function emptyRoleJourney(roles: { roleKey: string; name: string }[] = []): RoleJourney {
  return {
    n: 0,
    whatHappened: WHAT_HAPPENED.map(row => ({ ...row, count: 0, pct: 0 })),
    now: roles.map(r => ({
      roleKey: r.roleKey,
      name: r.name,
      short: ROLE_SHORT_LABEL[r.roleKey] || r.name,
      count: 0,
      pct: 0,
    })),
    nowN: 0,
    dominant: null,
    helped: [],
    conclusion: 'Пока нет среза ролей, чтобы описать сдвиг.',
  };
}

function buildConclusion(
  happened: RoleJourneyBucket[],
  dominant: RoleJourney['dominant'],
  helped: RoleJourneyHelped[],
): string {
  const lead = [...happened].sort((a, b) => b.pct - a.pct)[0];
  const role = dominant ? `«${dominant.name}»` : 'роль ещё не сложилась';
  const toAction = helped.find(h => h.label === 'Перешли к действию');

  let text: string;
  if (!lead || lead.pct === 0) {
    text = `Среди тех, у кого роль уже видна, чаще всего ${role}.`;
  } else if (lead.key === 'stayed') {
    text = `У большинства роль сохранилась относительно старта; самая частая точка сейчас — ${role}.`;
  } else if (lead.key === 'refined') {
    text = `Чаще роль уточнилась внутри той же оси, а не сменилась целиком; сейчас лидирует ${role}.`;
  } else if (lead.key === 'shifted') {
    text = `Участники чаще сменили ось роли (мышление / действие / люди), чем остались в стартовой; сейчас лидирует ${role}.`;
  } else {
    text = `Стартовая роль ещё не зафиксирована у заметной доли; среди тех, кто уже в роли, чаще всего ${role}.`;
  }

  if (toAction && toAction.pct >= 15 && lead?.key !== 'shifted') {
    text += ' Заметная доля уже перешла к ролям действия.';
  }
  return text;
}

/**
 * Снимок «старт → сейчас» для макета штаба: что произошло с ролью,
 * где участники сейчас, что чаще случается.
 */
export function buildRoleJourney(
  people: RolePersonSnap[],
  roles: { roleKey: string; name: string }[],
): RoleJourney {
  const n = people.length;
  if (!n) return emptyRoleJourney(roles);

  const happenedCounts: Record<RoleChangeKey, number> = {
    refined: 0,
    stayed: 0,
    shifted: 0,
    unknown: 0,
  };
  const nowCounts = new Map<string, number>();
  let nowN = 0;
  let toAction = 0;
  let toPeople = 0;
  let switched = 0;
  let stayed = 0;

  for (const p of people) {
    happenedCounts[classifyRoleChange(p.start, p.now)] += 1;
    if (p.now) {
      nowN += 1;
      nowCounts.set(p.now, (nowCounts.get(p.now) || 0) + 1);
    }
    if (p.start && p.now && p.start !== p.now) switched += 1;
    if (p.start && p.now && p.start === p.now) stayed += 1;
    if (roleFamily(p.start) === 'thinking' && roleFamily(p.now) === 'action') toAction += 1;
    if (roleFamily(p.now) === 'people') toPeople += 1;
  }

  const whatHappened = WHAT_HAPPENED.map(row => ({
    ...row,
    count: happenedCounts[row.key],
    pct: pct(happenedCounts[row.key], n),
  }));

  const now: RoleJourneyNow[] = roles.map(r => {
    const count = nowCounts.get(r.roleKey) || 0;
    return {
      roleKey: r.roleKey,
      name: r.name,
      short: ROLE_SHORT_LABEL[r.roleKey] || r.name,
      count,
      pct: pct(count, nowN),
    };
  });

  const top = [...now].sort((a, b) => b.count - a.count)[0];
  const dominant = top && top.count > 0
    ? {
        roleKey: top.roleKey,
        name: top.name,
        short: top.short,
        pct: top.pct,
        count: top.count,
      }
    : null;

  const helped = [
    { label: 'Перешли к действию', count: toAction, pct: pct(toAction, n) },
    { label: 'Уточнили роль', count: happenedCounts.refined, pct: pct(happenedCounts.refined, n) },
    { label: 'Совпала со стартом', count: stayed, pct: pct(stayed, n) },
    { label: 'Выбрали роль людей', count: toPeople, pct: pct(toPeople, n) },
    { label: 'Сменили роль', count: switched, pct: pct(switched, n) },
  ]
    .filter(row => row.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);

  return {
    n,
    whatHappened,
    now,
    nowN,
    dominant,
    helped,
    conclusion: buildConclusion(whatHappened, dominant, helped),
  };
}

export function latestRoleOf(
  pid: number,
  days: number[],
  activeByPidDay: Map<string, string>,
  start: string | null,
): string | null {
  for (let i = days.length - 1; i >= 0; i--) {
    const key = activeByPidDay.get(`${pid}:${days[i]}`);
    if (key) return key;
  }
  return start;
}
