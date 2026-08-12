import type { AdminRequest } from '../../middlewares/adminAuth.js';
import {
  collectEveningExportRows,
  formatEveningFieldValue,
  type EveningExportRow,
} from '../exports/eveningExportData.js';
import { fullName } from '../exports/exportCommon.js';
import { roleLabel } from '../exports/exportLabels.js';
import type { EveningField } from '../eveningQuestionnaireConfig.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { resolveDayRange } from './analyticsQuery.js';
import { loadCohortParticipants } from './cohort.js';
import { getForumSettings } from '../helpers.js';
import { buildEveningDaySeries, forumSeriesDays } from './dayComparison.js';
import { buildPracticeRecommendNps } from './practiceRecommendNps.js';

/** Эти поля сворачиваем в таблицу NPS по практикам — не дублируем графиком. */
const PRACTICE_NPS_FIELD_KEYS = new Set(['recommendYes', 'recommendScore', 'practiceEvent', 'practiceName']);

function isPracticeNpsField(f: { key: string; type: string; label?: string }): boolean {
  if (PRACTICE_NPS_FIELD_KEYS.has(f.key)) return true;
  // Любое «События программы + оценка 1–10» — источник строк таблицы.
  if (f.type === 'program_event') return true;
  return false;
}

export type EveningAnswerRow = {
  participantId: number;
  name: string;
  direction: string;
  group: string;
  day: number;
  answer: string | number;
  filledAt: string | null;
};

export type EveningQuestionStat = {
  key: string;
  label: string;
  type: string;
  answered: number;
  avg?: number | null;
  distribution: { label: string; count: number; pct: number }[];
  answers: EveningAnswerRow[];
};

function coerceYesNo(value: unknown): 'Да' | 'Нет' | null {
  if (value === true || value === 'true' || value === 'yes' || value === 1 || value === '1') return 'Да';
  if (value === false || value === 'false' || value === 'no' || value === 0 || value === '0') return 'Нет';
  return null;
}

function toAnswerRow(
  r: EveningExportRow,
  field: EveningField,
): EveningAnswerRow | null {
  const answer = formatEveningFieldValue(field, r.ratings, r.tomorrowRoleKey);
  if (answer === '' || answer == null) return null;
  return {
    participantId: r.participantId,
    name: fullName(r.p),
    direction: r.directionName ?? r.p.direction ?? '',
    group: r.p.groupName ?? '',
    day: r.dayNumber,
    answer,
    filledAt: r.filledAt ? r.filledAt.toISOString() : null,
  };
}

function buildDistribution(
  counts: Map<string, number>,
  total: number,
): { label: string; count: number; pct: number }[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
    .map(([label, count]) => ({
      label,
      count,
      pct: total ? Math.round((count / total) * 1000) / 10 : 0,
    }));
}

function aggregateField(field: EveningField, rows: EveningExportRow[]): EveningQuestionStat {
  const answers: EveningAnswerRow[] = [];
  const counts = new Map<string, number>();
  let sum = 0;
  let nNum = 0;
  const isScale = field.type === 'scale_1_5' || field.type === 'scale_1_10';
  const maxScale = field.type === 'scale_1_10' ? 10 : 5;

  for (const r of rows) {
    const row = toAnswerRow(r, field);
    if (!row) continue;
    answers.push(row);

    if (isScale) {
      const raw = r.ratings[field.key];
      const num = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(num) && num >= 1 && num <= maxScale) {
        sum += num;
        nNum += 1;
        const label = String(num);
        counts.set(label, (counts.get(label) || 0) + 1);
      }
      continue;
    }

    if (field.type === 'yes_no') {
      const yn = coerceYesNo(r.ratings[field.key]);
      if (yn) counts.set(yn, (counts.get(yn) || 0) + 1);
      continue;
    }

    if (field.type === 'role_select' || field.key === 'tomorrowRoleKey') {
      const key = r.tomorrowRoleKey
        ?? (typeof r.ratings[field.key] === 'string' ? String(r.ratings[field.key]) : '');
      const label = roleLabel(key) || String(row.answer);
      if (label) counts.set(label, (counts.get(label) || 0) + 1);
      continue;
    }

    if (field.type === 'choice' || field.type === 'program_event') {
      const label = String(row.answer);
      counts.set(label, (counts.get(label) || 0) + 1);
      continue;
    }

    // text / experiment_text — distribution by presence only; full list in answers
  }

  // Stable order for scale histograms
  let distribution = buildDistribution(counts, answers.length);
  if (isScale) {
    const ordered: { label: string; count: number; pct: number }[] = [];
    for (let i = 1; i <= maxScale; i++) {
      const label = String(i);
      const count = counts.get(label) || 0;
      ordered.push({
        label,
        count,
        pct: answers.length ? Math.round((count / answers.length) * 1000) / 10 : 0,
      });
    }
    distribution = ordered;
  } else if (field.type === 'yes_no') {
    distribution = ['Да', 'Нет'].map(label => {
      const count = counts.get(label) || 0;
      return {
        label,
        count,
        pct: answers.length ? Math.round((count / answers.length) * 1000) / 10 : 0,
      };
    });
  }

  return {
    key: field.key,
    label: field.label || field.key,
    type: field.type,
    answered: answers.length,
    avg: isScale && nNum ? Math.round((sum / nNum) * 10) / 10 : null,
    distribution,
    answers,
  };
}

export type EveningDashboardOptions = {
  /** Штаб · Форум: без дампов ответов по вопросам и без daySeries. */
  slim?: boolean;
};

export async function buildEveningDashboard(
  filters: AnalyticsFilters,
  req?: AdminRequest,
  opts?: EveningDashboardOptions,
) {
  const slim = Boolean(opts?.slim);
  const settings = await getForumSettings();
  const currentDay = settings.currentDay ?? 1;
  const days = resolveDayRange(filters, currentDay);
  const dayFilter = days.length === 1 ? days[0] : null;

  const cohort = await loadCohortParticipants(filters, req);
  const cohortSize = cohort.filter(p => p.onboardingCompletedAt).length;

  const eveningCohortFilters = {
    shiftId: filters.shiftId,
    direction: filters.direction ?? undefined,
    group: filters.group ?? undefined,
    ageCategory: filters.ageCategory ?? undefined,
    activityQ: filters.activity ?? undefined,
    includeDrafts: true as const,
  };

  // Срез дня — для KPI/шкал выбранного дня.
  // Ряды «по дням» грузим без day-фильтра, иначе при day=5 дни 1–4 обнуляются.
  const seriesDays = forumSeriesDays(currentDay);
  const [slicePack, seriesPack] = await Promise.all([
    collectEveningExportRows({ ...eveningCohortFilters, day: dayFilter }),
    dayFilter != null
      ? collectEveningExportRows({ ...eveningCohortFilters, day: null })
      : Promise.resolve(null),
  ]);

  const { rows, fields, diagnostics } = slicePack;
  const submittedRows = rows.filter(r => r.status === 'сдано');
  const draftRows = rows.filter(r => r.status === 'черновик');
  const submitted = submittedRows.length;
  const drafts = draftRows.length;
  const seriesSubmittedRows = seriesPack
    ? seriesPack.rows.filter(r => r.status === 'сдано')
    : submittedRows;
  const fillRatePct = cohortSize
    ? Math.round((submitted / cohortSize) * 1000) / 10
    : 0;

  // Уникальные участники, сдавшие анкету, по направлениям
  const registeredByDir = new Map<string, number>();
  for (const p of cohort) {
    if (!p.onboardingCompletedAt) continue;
    const d = (p.direction || '—').trim() || '—';
    registeredByDir.set(d, (registeredByDir.get(d) || 0) + 1);
  }
  const submittedByDir = new Map<string, Set<number>>();
  for (const r of submittedRows) {
    const d = (r.directionName || r.p.direction || '—').trim() || '—';
    if (!submittedByDir.has(d)) submittedByDir.set(d, new Set());
    submittedByDir.get(d)!.add(r.participantId);
  }
  const allDirs = new Set([...registeredByDir.keys(), ...submittedByDir.keys()]);
  const byDirection = [...allDirs]
    .map(direction => {
      const submittedCount = submittedByDir.get(direction)?.size ?? 0;
      const registered = registeredByDir.get(direction) ?? 0;
      return {
        direction,
        submitted: submittedCount,
        registered,
        fillRatePct: registered
          ? Math.round((submittedCount / registered) * 1000) / 10
          : 0,
      };
    })
    .sort((a, b) => b.submitted - a.submitted || a.direction.localeCompare(b.direction, 'ru'));

  // Skip CTA-only fields without answers; program_event / recommend* → таблица NPS
  const questions = slim
    ? []
    : fields
      .filter(f => f.type !== 'point_b_cta' && !isPracticeNpsField(f))
      .map(f => aggregateField(f, submittedRows))
      .filter(q => q.answered > 0 || fields.some(f => f.key === q.key));

  const practiceRecommendNps = buildPracticeRecommendNps(
    submittedRows.map(r => r.ratings as Record<string, unknown>),
  );

  const scaleFields = fields.filter(
    f => (f.type === 'scale_1_5' || f.type === 'scale_1_10') && !isPracticeNpsField(f),
  );

  function scaleStatsForRows(slice: EveningExportRow[]) {
    const byQuestion = scaleFields.map(f => {
      const maxScale = f.type === 'scale_1_10' ? 10 : 5;
      const vals: number[] = [];
      for (const r of slice) {
        const raw = r.ratings[f.key];
        const num = typeof raw === 'number' ? raw : Number(raw);
        if (Number.isFinite(num) && num >= 1 && num <= maxScale) vals.push(num);
      }
      const n = vals.length;
      const sorted = [...vals].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = n
        ? Math.round(((n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]) * 10)) / 10
        : null;
      const sum = vals.reduce((s, v) => s + v, 0);
      return {
        key: f.key,
        label: f.label || f.key,
        avg: n ? Math.round((sum / n) * 10) / 10 : null as number | null,
        median,
        answered: n,
        max: maxScale,
        type: f.type,
      };
    }).filter(q => q.answered > 0 && q.avg != null) as {
      key: string; label: string; avg: number; median: number | null; answered: number; max: number; type: string;
    }[];

    let allSum = 0;
    let allN = 0;
    for (const q of byQuestion) {
      allSum += q.avg * q.answered;
      allN += q.answered;
    }
    return {
      byQuestion,
      overallAvg: allN ? Math.round((allSum / allN) * 10) / 10 : null,
      answered: allN,
    };
  }

  /** Нормированная оценка программы 0–100 на участника (только сданные анкеты). */
  const participantProgramPct: { participantId: number; avgPct: number; answered: number }[] = slim
    ? []
    : (() => {
      const byPid = new Map<number, { sumPct: number; n: number }>();
      for (const r of submittedRows) {
        let sumPct = 0;
        let n = 0;
        for (const f of scaleFields) {
          const maxScale = f.type === 'scale_1_10' ? 10 : 5;
          const raw = r.ratings[f.key];
          const num = typeof raw === 'number' ? raw : Number(raw);
          if (!Number.isFinite(num) || num < 1 || num > maxScale) continue;
          sumPct += (num / maxScale) * 100;
          n += 1;
        }
        if (!n) continue;
        const prev = byPid.get(r.participantId) ?? { sumPct: 0, n: 0 };
        prev.sumPct += sumPct;
        prev.n += n;
        byPid.set(r.participantId, prev);
      }
      return [...byPid.entries()].map(([participantId, v]) => ({
        participantId,
        avgPct: Math.round((v.sumPct / v.n) * 10) / 10,
        answered: v.n,
      }));
    })();

  const scaleSlice = scaleStatsForRows(submittedRows);
  const scaleAverages = scaleSlice.byQuestion;
  const scaleOverallAvg = scaleSlice.overallAvg;

  const scaleByDay = seriesDays.map(day => {
    const dayRows = seriesSubmittedRows.filter(r => r.dayNumber === day);
    const stats = scaleStatsForRows(dayRows);
    return {
      day,
      overallAvg: stats.overallAvg,
      answered: stats.answered,
      byQuestion: stats.byQuestion,
    };
  });

  const directions = [...new Set([
    ...cohort.map(p => (p.direction || '—').trim() || '—'),
    ...seriesSubmittedRows.map(r => (r.directionName || r.p.direction || '—').trim() || '—'),
  ])].sort((a, b) => a.localeCompare(b, 'ru'));

  const scaleByDirectionDay = seriesDays.flatMap(day =>
    directions.map(direction => {
      const slice = seriesSubmittedRows.filter(r => {
        if (r.dayNumber !== day) return false;
        const d = (r.directionName || r.p.direction || '—').trim() || '—';
        return d === direction;
      });
      const stats = scaleStatsForRows(slice);
      return {
        direction,
        day,
        overallAvg: stats.overallAvg,
        answered: stats.answered,
        byQuestion: stats.byQuestion,
      };
    }),
  );

  /** Средние по шкалам в разрезе направлений за весь выбранный период (без разбивки по дням). */
  const scaleByDirection = directions.map(direction => {
    const slice = submittedRows.filter(r => {
      const d = (r.directionName || r.p.direction || '—').trim() || '—';
      return d === direction;
    });
    const stats = scaleStatsForRows(slice);
    return {
      direction,
      overallAvg: stats.overallAvg,
      answered: stats.answered,
      byQuestion: stats.byQuestion,
    };
  }).filter(r => r.answered > 0);

  const { daySeries, byDirectionDaySeries } = slim
    ? { daySeries: [], byDirectionDaySeries: [] }
    : await buildEveningDaySeries(cohort, seriesDays);

  return {
    filters,
    currentForumDay: currentDay,
    activity: {
      submitted,
      drafts,
      cohortSize,
      fillRatePct,
      totalRows: rows.length,
      byDirection,
      daySeries,
      byDirectionDaySeries,
    },
    daySeries,
    byDirectionDaySeries,
    byDirection,
    questions,
    practiceRecommendNps,
    scaleAverages,
    scaleOverallAvg,
    scaleByDay,
    scaleByDirection,
    scaleByDirectionDay,
    participantProgramPct,
    diagnostics: {
      eveningOpenNow: diagnostics.eveningOpenNow,
      eveningForceUnpublished: diagnostics.eveningForceUnpublished,
      notes: diagnostics.notes,
      withRatings: diagnostics.withRatings,
      withDraftOnly: diagnostics.withDraftOnly,
      answerRowsMatched: diagnostics.answerRowsMatched,
    },
    exportPath: dayFilter
      ? `/exports/evening-summary?mode=day&day=${dayFilter}`
      : '/exports/evening-summary?mode=shift',
  };
}
