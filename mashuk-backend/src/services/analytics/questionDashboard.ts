import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { answers, directions, participants, questions } from '../../db/schema.js';
import { emotionIdToZone } from '../emotionZones.js';
import { parseCheckinPayload } from './zoneDistribution.js';
import { isStateCheckQuestion } from './questionKindDashboard.js';
import { stateCheckPhaseFromQuestion } from './analyticsQuestionLive.js';
import {
  PHASE_RU,
  ZONE_ORDER,
  ZONE_RU,
  countThemes,
  isPsychoReason,
  quotePolarity,
  type PhaseKey,
  type ZoneKey,
} from './stateDashboardMetrics.js';

export type QuestionDashConclusion = { h: string; p: string; a: string };

export type QuestionDashQuote = {
  text: string;
  meta: string;
  phase: string;
  phaseKey: PhaseKey;
  zone: string;
  zoneKey: ZoneKey | null;
  dir: string;
  polarity: 'pos' | 'neg' | 'neu';
};

export type ZoneDirHeatCell = { n: number; pct: number };
export type ZoneDirHeatRow = {
  direction: string;
  total: number;
  cells: ZoneDirHeatCell[];
};

export type QuestionDashboard = {
  question: {
    id: number;
    title: string;
    text: string;
    questionKind: string | null;
    type: string;
    dayNumber: number | null;
    timePoint: string | null;
    isStateCheck: boolean;
  };
  totals: {
    answers: number;
    uniqueParticipants: number;
    registered: number;
    fillRatePct: number;
  };
  byDirection: Array<{
    direction: string;
    answers: number;
    uniqueParticipants: number;
    registered: number;
    fillRatePct: number;
  }>;
  state: null | {
    zones: Array<{ key: ZoneKey; label: string; n: number; pct: number }>;
    heatmap: {
      zones: Array<{ key: ZoneKey; label: string }>;
      rows: ZoneDirHeatRow[];
    };
    summary: QuestionDashConclusion;
    quotes: QuestionDashQuote[];
    quotesTotal: number;
    themesNeg: Array<{ name: string; n: number }>;
    themesPos: Array<{ name: string; n: number }>;
    negCount: number;
    posCount: number;
    reasons: number;
    psychoCount: number;
  };
};

type HeatRowIn = { direction: string; zone: ZoneKey | null };

export function buildZoneDirectionHeatmap(rows: HeatRowIn[]): {
  zones: Array<{ key: ZoneKey; label: string }>;
  rows: ZoneDirHeatRow[];
} {
  const zones = ZONE_ORDER.map(key => ({ key, label: ZONE_RU[key] }));
  const byDir = new Map<string, Record<ZoneKey, number>>();
  for (const row of rows) {
    const dir = (row.direction || '—').trim() || '—';
    if (!byDir.has(dir)) {
      byDir.set(dir, { lift: 0, engagement: 0, neutral: 0, fatigue: 0, risk: 0 });
    }
    if (row.zone) byDir.get(dir)![row.zone] += 1;
  }
  const out = [...byDir.entries()]
    .map(([direction, counts]) => {
      const total = ZONE_ORDER.reduce((s, k) => s + counts[k], 0);
      return {
        direction,
        total,
        cells: ZONE_ORDER.map(k => ({
          n: counts[k],
          pct: total ? Math.round((counts[k] / total) * 1000) / 10 : 0,
        })),
      };
    })
    .sort((a, b) => b.total - a.total || a.direction.localeCompare(b.direction, 'ru'));
  return { zones, rows: out };
}

export function buildQuestionStateSummary(input: {
  answers: number;
  reasons: number;
  zones: Array<{ key: ZoneKey; label: string; n: number; pct: number }>;
  heatmapRows: ZoneDirHeatRow[];
  topNegTheme?: string | null;
}): QuestionDashConclusion {
  const { answers, reasons, zones, heatmapRows, topNegTheme } = input;
  if (!answers) {
    return {
      h: 'По этому вопросу ответов ещё нет',
      p: 'Сводку и теплокарту соберём, как только участники отметят состояние.',
      a: 'Проверить, что вопрос опубликован и окно ответа открыто.',
    };
  }

  const dominant = [...zones].sort((a, b) => b.n - a.n)[0];
  const risk = zones.find(z => z.key === 'risk')?.n ?? 0;
  const fatigue = zones.find(z => z.key === 'fatigue')?.n ?? 0;
  const negN = risk + fatigue;
  const negPct = Math.round((negN / answers) * 100);
  const reasonPct = Math.round((reasons / answers) * 100);

  const hottest = heatmapRows
    .filter(r => r.total >= 3)
    .map(r => {
      const riskN = r.cells[ZONE_ORDER.indexOf('risk')]?.n ?? 0;
      const fatN = r.cells[ZONE_ORDER.indexOf('fatigue')]?.n ?? 0;
      return { dir: r.direction, total: r.total, neg: riskN + fatN, negPct: Math.round(((riskN + fatN) / r.total) * 100) };
    })
    .sort((a, b) => b.negPct - a.negPct || b.neg - a.neg)[0];

  const themeBit = topNegTheme && topNegTheme !== 'Прочее'
    ? ` В минусе чаще всего звучит «${topNegTheme}».`
    : '';
  const reasonBit = `Пояснение оставили ${reasons} из ${answers} (${reasonPct}%).`;

  if (hottest && hottest.negPct >= 40 && hottest.neg >= 2) {
    return {
      h: `Минус сконцентрирован в «${hottest.dir}»`,
      p: `По вопросу ${answers} ответов. Доминирует «${dominant?.label ?? 'Нейтраль'}» (${dominant?.pct ?? 0}%). `
        + `В «${hottest.dir}» риск и усталость — ${hottest.neg} из ${hottest.total} (${hottest.negPct}%), `
        + `по смене в минусе ${negPct}%. ${reasonBit}${themeBit}`,
      a: `Прочитать комментарии «${hottest.dir}» в зонах «Риск» и «Усталость» и вынести одно действие куратору.`,
    };
  }

  if (negPct >= 30) {
    return {
      h: `Минус заметный: ${negPct}% в риске и усталости`,
      p: `Собрано ${answers} ответов. Лидирует «${dominant?.label ?? 'Нейтраль'}» (${dominant?.pct ?? 0}%). `
        + `${reasonBit}${themeBit}`,
      a: 'Открыть ленту комментариев с сортировкой «Сначала минус» и выбрать один рычаг на ближайший слот.',
    };
  }

  return {
    h: `Картина ясная: держится «${dominant?.label ?? 'Нейтраль'}»`,
    p: `По вопросу ${answers} ответов, ${dominant?.pct ?? 0}% в зоне «${dominant?.label ?? 'Нейтраль'}». `
      + `Риск и усталость вместе ${negPct}%. ${reasonBit}${themeBit}`,
    a: hottest && hottest.neg > 0
      ? `Точечно посмотреть «${hottest.dir}» — там минус выше, чем в среднем.`
      : 'Держать наблюдение; срочного вмешательства по этой точке нет.',
  };
}

function dirName(dirName: string | null | undefined, legacy: string | null | undefined): string {
  return (dirName || legacy || '—').trim() || '—';
}

function zoneOf(emotion: string | null, zoneRaw: string | null | undefined): ZoneKey | null {
  const raw = (zoneRaw || '').trim().toLowerCase();
  if (raw && (ZONE_ORDER as readonly string[]).includes(raw)) return raw as ZoneKey;
  return emotionIdToZone(emotion);
}

export async function buildQuestionDashboard(
  questionId: number,
  adminShiftId: number | null,
): Promise<QuestionDashboard | null> {
  const [q] = await db.select().from(questions).where(eq(questions.id, questionId)).limit(1);
  if (!q) return null;
  if (adminShiftId != null && q.shiftId !== adminShiftId) return null;

  const shiftId = q.shiftId;
  const isStateCheck = isStateCheckQuestion(q);

  const answerRows = await db.select({
    answerId: answers.id,
    participantId: answers.participantId,
    answerData: answers.answerData,
    createdAt: answers.createdAt,
    directionName: directions.name,
    legacyDirection: participants.direction,
  }).from(answers)
    .innerJoin(participants, eq(answers.participantId, participants.id))
    .leftJoin(directions, eq(participants.directionId, directions.id))
    .where(and(
      eq(answers.questionId, questionId),
      isNull(participants.selfDeletedAt),
    ));

  const registeredRows = await db.select({
    id: participants.id,
    onboardingCompletedAt: participants.onboardingCompletedAt,
    directionName: directions.name,
    legacyDirection: participants.direction,
  }).from(participants)
    .leftJoin(directions, eq(participants.directionId, directions.id))
    .where(and(
      eq(participants.shiftId, shiftId),
      isNull(participants.selfDeletedAt),
    ));

  const registeredByDir = new Map<string, number>();
  let registered = 0;
  for (const p of registeredRows) {
    if (!p.onboardingCompletedAt) continue;
    registered += 1;
    const d = dirName(p.directionName, p.legacyDirection);
    registeredByDir.set(d, (registeredByDir.get(d) || 0) + 1);
  }

  const parsed = answerRows.map(r => {
    const payload = parseCheckinPayload(r.answerData) as {
      emotion?: string;
      energy?: number;
      reason?: string;
      emotionZone?: string;
      emotionZoneLabel?: string;
    };
    const emotion = typeof payload.emotion === 'string' ? payload.emotion : null;
    const zone = zoneOf(emotion, payload.emotionZone);
    const reason = typeof payload.reason === 'string' && payload.reason.trim()
      ? payload.reason.trim()
      : '';
    return {
      participantId: r.participantId,
      direction: dirName(r.directionName, r.legacyDirection),
      emotion,
      zone,
      reason,
      createdAt: r.createdAt ?? null,
    };
  });

  const unique = new Set(parsed.map(r => r.participantId));
  const byDirPeople = new Map<string, Set<number>>();
  const byDirAnswers = new Map<string, number>();
  for (const r of parsed) {
    if (!byDirPeople.has(r.direction)) byDirPeople.set(r.direction, new Set());
    byDirPeople.get(r.direction)!.add(r.participantId);
    byDirAnswers.set(r.direction, (byDirAnswers.get(r.direction) || 0) + 1);
  }
  const allDirs = new Set([...registeredByDir.keys(), ...byDirAnswers.keys()]);
  const byDirection = [...allDirs]
    .map(direction => {
      const answersN = byDirAnswers.get(direction) ?? 0;
      const people = byDirPeople.get(direction)?.size ?? 0;
      const reg = registeredByDir.get(direction) ?? 0;
      return {
        direction,
        answers: answersN,
        uniqueParticipants: people,
        registered: reg,
        fillRatePct: reg ? Math.round((people / reg) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.answers - a.answers || a.direction.localeCompare(b.direction, 'ru'));

  const totals = {
    answers: parsed.length,
    uniqueParticipants: unique.size,
    registered,
    fillRatePct: registered ? Math.round((unique.size / registered) * 1000) / 10 : 0,
  };

  let state: QuestionDashboard['state'] = null;
  if (isStateCheck) {
    const zoneCounts: Record<ZoneKey, number> = {
      lift: 0, engagement: 0, neutral: 0, fatigue: 0, risk: 0,
    };
    for (const r of parsed) {
      if (r.zone) zoneCounts[r.zone] += 1;
    }
    const zoned = parsed.filter(r => r.zone).length || parsed.length || 1;
    const zones = ZONE_ORDER.map(key => ({
      key,
      label: ZONE_RU[key],
      n: zoneCounts[key],
      pct: Math.round((zoneCounts[key] / zoned) * 1000) / 10,
    }));
    const heatmap = buildZoneDirectionHeatmap(parsed.map(r => ({ direction: r.direction, zone: r.zone })));

    const reasons = parsed.filter(r => r.reason).length;
    const negTexts = parsed.filter(r => (r.zone === 'risk' || r.zone === 'fatigue') && r.reason).map(r => r.reason);
    const posTexts = parsed.filter(r => r.zone !== 'risk' && r.zone !== 'fatigue' && r.reason).map(r => r.reason);
    const themesNeg = countThemes(negTexts);
    const themesPos = countThemes(posTexts);
    const psychoCount = parsed.filter(r => r.reason && isPsychoReason(r.reason)).length;
    const topNegTheme = themesNeg.find(t => t.name !== 'Прочее')?.name ?? themesNeg[0]?.name ?? null;

    const quotes: QuestionDashQuote[] = parsed
      .filter(r => r.reason && !isPsychoReason(r.reason))
      .map(r => {
        const phase = stateCheckPhaseFromQuestion(
          { timePoint: q.timePoint, title: q.title },
          r.createdAt,
        );
        const zoneLabel = r.zone ? ZONE_RU[r.zone] : '—';
        return {
          text: r.reason.slice(0, 400),
          meta: `${PHASE_RU[phase]} · ${zoneLabel} · ${r.direction}`,
          phase: PHASE_RU[phase],
          phaseKey: phase,
          zone: zoneLabel,
          zoneKey: r.zone,
          dir: r.direction,
          polarity: quotePolarity(r.zone),
        };
      })
      .sort((a, b) => {
        const rank = (p: QuestionDashQuote['polarity']) => (p === 'neg' ? 0 : p === 'neu' ? 1 : 2);
        return rank(a.polarity) - rank(b.polarity);
      });

    state = {
      zones,
      heatmap,
      summary: buildQuestionStateSummary({
        answers: parsed.length,
        reasons,
        zones,
        heatmapRows: heatmap.rows,
        topNegTheme,
      }),
      quotes: quotes.slice(0, 500),
      quotesTotal: quotes.length,
      themesNeg,
      themesPos,
      negCount: negTexts.length,
      posCount: posTexts.length,
      reasons,
      psychoCount,
    };
  }

  return {
    question: {
      id: q.id,
      title: q.title,
      text: q.text,
      questionKind: q.questionKind,
      type: q.type,
      dayNumber: q.dayNumber,
      timePoint: q.timePoint,
      isStateCheck,
    },
    totals,
    byDirection,
    state,
  };
}
