import type { AdminRequest } from '../../middlewares/adminAuth.js';
import {
  collectEveningExportRows,
  formatEveningFieldValue,
  type EveningExportRow,
} from '../exports/eveningExportData.js';
import { roleLabel } from '../exports/exportLabels.js';
import type { EveningField } from '../eveningQuestionnaireConfig.js';
import { getForumSettings } from '../helpers.js';
import { hideOrganizerName } from '../leaderboardQuery.js';
import { getForumDayDateLabel, getMoscowParts } from '../timePhase.js';
import { EVENING_SCALE_KEYS } from '../touchpointTemplates.js';
import { buildPracticeRecommendNps, extractPracticeScores } from './practiceRecommendNps.js';
import { buildGoalProgressByDirection, isGoalProgressField } from './goalProgressByDirection.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { resolveDayRange } from './analyticsQuery.js';
import { loadCohortParticipants, restrictToCohort } from './cohort.js';
import {
  buildDirectionDayRatings,
  countNamed,
  directionSpread,
  deviation,
  formalSharePct,
  isDirectionWorkField,
  lowSharePct,
  mean,
  medianLen,
  mergeFieldKeys,
  pickGroupExtremes,
  pickPreferredScaleFields,
  round1,
  round2,
  scaleDist,
  transferIndexPct,
  type GroupAgg,
} from './dayResultsMetrics.js';

const PRACTICE_NPS_FIELD_KEYS = new Set(['recommendYes', 'recommendScore', 'practiceEvent', 'practiceName']);

function isPracticeNpsField(f: { key: string; type: string }): boolean {
  if (PRACTICE_NPS_FIELD_KEYS.has(f.key)) return true;
  return f.type === 'program_event';
}

/** Выбор практики из программы: «Презентации … → Название [10/10]». */
function isPracticePickText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/презентаци\S*.{0,40}практик/i.test(t) && /→/.test(t)) return true;
  if (/→/.test(t) && /\[\s*\d+\s*\/\s*10\s*\]/.test(t)) return true;
  return false;
}

function isScaleField(f: EveningField): boolean {
  return (f.type === 'scale_1_5' || f.type === 'scale_1_10') && !isPracticeNpsField(f);
}

function isOpenTextField(f: EveningField): boolean {
  if (isPracticeNpsField(f) || isScaleField(f)) return false;
  if (f.type === 'yes_no' || f.type === 'role_select' || f.key === 'tomorrowRoleKey') return false;
  if (f.type === 'choice') return false;
  return f.type === 'text' || f.type === 'experiment_text';
}

function numScale(raw: unknown, maxScale: number): number | null {
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num) || num < 1 || num > maxScale) return null;
  return num;
}

function dirOf(r: EveningExportRow): string {
  return (r.directionName || r.p.direction || '—').trim() || '—';
}

function groupOf(r: EveningExportRow): string {
  return (r.p.groupName || '—').trim() || '—';
}

function textOf(field: EveningField, r: EveningExportRow): string {
  const v = formatEveningFieldValue(field, r.ratings, r.tomorrowRoleKey);
  if (v == null || v === '') return '';
  return String(v).trim();
}

function buildDiagnostics(
  fields: EveningField[],
  submitted: EveningExportRow[],
  notes: string[],
): string[] {
  const out = [...notes];
  const housing = fields.find(f => f.key === 'housing');
  const curator = fields.find(f => f.key === 'curator');
  let housingN = 0;
  let curatorN = 0;
  for (const r of submitted) {
    if (numScale(r.ratings.housing, 5) != null) housingN += 1;
    if (numScale(r.ratings.curator, 5) != null) curatorN += 1;
  }
  if (housing && /куратор/i.test(housing.label || '') && housingN > 0) {
    out.push('Ключ housing подписан как «куратор» — возможна путаница с полем curator.');
  }
  if (housingN > 0 && curatorN === 0) {
    out.push('Поле curator пустое при заполненном housing — проверьте, что оценивают (куратор или проживание).');
  }
  const newFieldKeys = fields.filter(f => /^new_field(_\d+)?$/i.test(f.key)).map(f => f.key);
  if (newFieldKeys.length > 1) {
    out.push(`Обнаружены разнесённые поля ${newFieldKeys.join(', ')} — в дашборде склеены по лейблу/семейству.`);
  }
  return out;
}

type BlockStat = {
  key: string;
  label: string;
  n: number;
  mean: number;
  dist: number[];
  top2: number;
  low: number;
  spread: number;
};

function buildBlocks(
  scaleFields: EveningField[],
  submitted: EveningExportRow[],
): BlockStat[] {
  const blocks: BlockStat[] = [];
  for (const f of scaleFields) {
    const maxScale = f.type === 'scale_1_10' ? 10 : 5;
    const vals: number[] = [];
    for (const r of submitted) {
      const n = numScale(r.ratings[f.key], maxScale);
      if (n != null) vals.push(n);
    }
    if (!vals.length) continue;
    const dist = scaleDist(vals, maxScale === 10 ? 10 : 5);
    // для шкалы 1–10 диверг-хребет в UI ждёт 5 сегментов — нормализуем в 5 корзин
    const dist5 = maxScale === 5
      ? dist
      : [
        dist.slice(0, 2).reduce((a, b) => a + b, 0),
        dist.slice(2, 4).reduce((a, b) => a + b, 0),
        dist.slice(4, 6).reduce((a, b) => a + b, 0),
        dist.slice(6, 8).reduce((a, b) => a + b, 0),
        dist.slice(8, 10).reduce((a, b) => a + b, 0),
      ];
    const low = maxScale === 5
      ? lowSharePct(dist)
      : round1(((dist[0] + dist[1] + dist[2]) / vals.length) * 100);
    const top2 = maxScale === 5
      ? round1((((dist[3] ?? 0) + (dist[4] ?? 0)) / vals.length) * 100)
      : round1((((dist[8] ?? 0) + (dist[9] ?? 0)) / vals.length) * 100);

    const byDirMeans: { n: number; mean: number | null }[] = [];
    const dirs = new Map<string, number[]>();
    for (const r of submitted) {
      const n = numScale(r.ratings[f.key], maxScale);
      if (n == null) continue;
      const d = dirOf(r);
      if (!dirs.has(d)) dirs.set(d, []);
      dirs.get(d)!.push(n);
    }
    for (const arr of dirs.values()) {
      byDirMeans.push({ n: arr.length, mean: mean(arr) });
    }

    blocks.push({
      key: f.key,
      label: f.label || f.key,
      n: vals.length,
      mean: mean(vals) ?? 0,
      dist: dist5,
      top2,
      low,
      spread: directionSpread(byDirMeans, 10),
    });
  }
  return blocks;
}

function buildHeat(
  blocks: BlockStat[],
  submitted: EveningExportRow[],
): {
  dirs: string[];
  heat: Array<{
    dir: string;
    n: number;
    vals: Array<{ v: number | null; dev: number }>;
    idx: number;
    isForum?: boolean;
  }>;
  forum: {
    dir: string;
    n: number;
    vals: Array<{ v: number | null; dev: number }>;
    idx: number;
    isForum: true;
  } | null;
} {
  const dirMap = new Map<string, EveningExportRow[]>();
  for (const r of submitted) {
    const d = dirOf(r);
    if (!dirMap.has(d)) dirMap.set(d, []);
    dirMap.get(d)!.push(r);
  }
  const heat = [...dirMap.entries()]
    .map(([dir, rows]) => {
      const vals = blocks.map(b => {
        const maxScale = 5;
        const scaleVals: number[] = [];
        for (const r of rows) {
          const n = numScale(r.ratings[b.key], maxScale);
          if (n != null) scaleVals.push(n);
        }
        const v = mean(scaleVals);
        if (v == null) return { v: null as number | null, dev: 0, empty: true as const };
        return { v, dev: deviation(v, b.mean), empty: false as const };
      });
      if (vals.every(v => v.empty)) return null;
      const idxVals = vals.filter(v => !v.empty && v.v != null).map(v => v.v as number);
      return {
        dir,
        n: rows.length,
        vals: vals.map(v => ({ v: v.v, dev: v.dev })),
        idx: mean(idxVals) ?? 0,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => a.idx - b.idx);

  const forum = blocks.length && submitted.length
    ? {
      dir: 'Весь форум',
      n: submitted.length,
      vals: blocks.map(b => ({ v: b.mean as number | null, dev: 0 })),
      idx: mean(blocks.map(b => b.mean)) ?? 0,
      isForum: true as const,
    }
    : null;

  return { dirs: heat.map(h => h.dir), heat, forum };
}

function buildGroups(blocks: BlockStat[], submitted: EveningExportRow[]) {
  const map = new Map<string, EveningExportRow[]>();
  for (const r of submitted) {
    const g = groupOf(r);
    if (!g || g === '—') continue;
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(r);
  }
  const aggs: GroupAgg[] = [];
  for (const [group, rows] of map) {
    const byBlock: GroupAgg['byBlock'] = {};
    const idxVals: number[] = [];
    for (const b of blocks) {
      const vals: number[] = [];
      for (const r of rows) {
        const n = numScale(r.ratings[b.key], 5);
        if (n != null) vals.push(n);
      }
      if (!vals.length) continue;
      const m = mean(vals)!;
      byBlock[b.key] = { mean: m, n: vals.length, label: b.label };
      idxVals.push(m);
    }
    if (!idxVals.length) continue;
    aggs.push({
      group,
      dir: dirOf(rows[0]),
      n: rows.length,
      idx: mean(idxVals)!,
      byBlock,
    });
  }
  return pickGroupExtremes(aggs);
}

function buildOpenQuality(
  fields: EveningField[],
  submitted: EveningExportRow[],
): Array<{ key: string; label: string; n: number; fill: number; junk: number; medLen: number }> {
  const openFields = fields.filter(f =>
    isOpenTextField(f)
    && !/^new_field/i.test(f.key)
    && f.key !== 'experimentResult'
    && !/фиксир/i.test(f.label || ''),
  );
  const submittedN = submitted.length || 1;
  return openFields.map(f => {
    const texts = submitted.map(r => textOf(f, r)).filter(Boolean);
    return {
      key: f.key,
      label: f.label || f.key,
      n: texts.length,
      fill: round1((texts.length / submittedN) * 100),
      junk: formalSharePct(texts),
      medLen: medianLen(texts),
    };
  }).filter(o => o.n > 0 || ['mainThesis', 'likedMost', 'improveTomorrow', 'freeNote', 'understandingChange'].includes(o.key));
}

function buildChoiceBuckets(
  fields: EveningField[],
  submitted: EveningExportRow[],
  pred: (f: EveningField) => boolean,
): { name: string; n: number }[] {
  const matched = fields.filter(pred);
  if (!matched.length) return [];
  const values: string[] = [];
  for (const f of matched) {
    for (const r of submitted) {
      const t = textOf(f, r);
      if (t) values.push(t);
    }
  }
  return countNamed(values);
}

function buildFixation(
  fields: EveningField[],
  submitted: EveningExportRow[],
): { items: { name: string; n: number }[]; n: number; quotes: Array<{ text: string; meta: string }> } {
  const candidates = fields.filter(f =>
    !isPracticeNpsField(f)
    && f.type !== 'scale_1_5'
    && f.type !== 'scale_1_10'
    && f.type !== 'yes_no'
    && f.type !== 'choice'
    && f.type !== 'role_select'
    && (
      /^new_field/i.test(f.key)
      || /фиксир/i.test(f.label || '')
      || /зону роста|способ действия|непривычно/i.test(f.label || '')
    ),
  );
  if (!candidates.length) return { items: [], n: 0, quotes: [] };
  const merged = mergeFieldKeys(candidates.map(f => ({ key: f.key, label: f.label || f.key })));
  const values: string[] = [];
  const quoteRows: Array<{ text: string; meta: string; len: number }> = [];
  const seenPid = new Set<string>();
  for (const [label, keys] of merged.entries()) {
    for (const r of submitted) {
      for (const key of keys) {
        const f = candidates.find(c => c.key === key);
        if (!f) continue;
        const t = textOf(f, r);
        if (!t || isPracticePickText(t)) continue;
        const id = `${r.participantId}:${t}`;
        if (seenPid.has(id)) continue;
        seenPid.add(id);
        values.push(t);
        if (t.length > 20) {
          quoteRows.push({
            text: t.slice(0, 400),
            meta: `${label === '__new_field_merged__' ? 'Фиксация о себе' : label} · ${dirOf(r)}`,
            len: t.length,
          });
        }
        break;
      }
    }
  }
  const quotes = quoteRows
    .sort((a, b) => b.len - a.len)
    .slice(0, 60)
    .map(({ text, meta }) => ({ text, meta }));
  return { items: countNamed(values), n: values.length, quotes };
}

const OPEN_QUOTE_KEYS = new Set([
  'mainThesis', 'understandingChange', 'likedMost', 'improveTomorrow', 'freeNote',
]);

function buildOpenQuotes(
  fields: EveningField[],
  submitted: EveningExportRow[],
): Array<{ text: string; meta: string }> {
  const openFields = fields.filter(f =>
    isOpenTextField(f)
    && !/^new_field/i.test(f.key)
    && f.key !== 'experimentResult'
    && !/фиксир/i.test(f.label || '')
    && (OPEN_QUOTE_KEYS.has(f.key) || f.type === 'text'),
  );
  const pool: Array<{ text: string; meta: string; len: number }> = [];
  const seen = new Set<string>();
  for (const f of openFields) {
    for (const r of submitted) {
      const t = textOf(f, r);
      if (!t || t.length < 40) continue;
      const id = `${r.participantId}:${f.key}:${t.slice(0, 80)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      pool.push({
        text: t.slice(0, 400),
        meta: `${f.label || f.key} · ${dirOf(r)}`,
        len: t.length,
      });
    }
  }
  return pool
    .sort((a, b) => b.len - a.len)
    .slice(0, 60)
    .map(({ text, meta }) => ({ text, meta }));
}

function buildDraftsByDir(
  drafts: EveningExportRow[],
  cohortByDir: Map<string, number>,
): Array<{ dir: string; n: number; pct: number }> {
  const draftDirs = new Map<string, number>();
  for (const r of drafts) {
    const d = dirOf(r);
    draftDirs.set(d, (draftDirs.get(d) || 0) + 1);
  }
  const dirs = new Set([...draftDirs.keys(), ...cohortByDir.keys()]);
  return [...dirs]
    .map(dir => {
      const n = draftDirs.get(dir) || 0;
      const reg = cohortByDir.get(dir) || 0;
      // доля черновиков среди зарегистрированных направления; fallback — среди черновиков+сдавших не считаем
      const pct = reg ? round1((n / reg) * 100) : 0;
      return { dir, n: reg || n, pct };
    })
    .filter(r => r.n > 0 || r.pct > 0)
    .sort((a, b) => b.pct - a.pct || a.dir.localeCompare(b.dir, 'ru'));
}

function buildHours(submitted: EveningExportRow[]): Array<{ h: number; n: number }> {
  const map = new Map<number, number>();
  for (const r of submitted) {
    if (!r.filledAt) continue;
    const { hours } = getMoscowParts(r.filledAt);
    map.set(hours, (map.get(hours) || 0) + 1);
  }
  return [...map.entries()]
    .map(([h, n]) => ({ h, n }))
    .sort((a, b) => a.h - b.h);
}

function dayIndexForRows(blocks: BlockStat[], rows: EveningExportRow[]): number | null {
  if (!blocks.length || !rows.length) return null;
  const perParticipant: number[] = [];
  for (const r of rows) {
    const vals: number[] = [];
    for (const b of blocks) {
      const n = numScale(r.ratings[b.key], 5);
      if (n != null) vals.push(n);
    }
    if (vals.length) perParticipant.push(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return mean(perParticipant);
}

function avgLowForRows(blocks: BlockStat[], rows: EveningExportRow[]): number | null {
  if (!blocks.length || !rows.length) return null;
  const lows: number[] = [];
  for (const b of blocks) {
    const vals: number[] = [];
    for (const r of rows) {
      const n = numScale(r.ratings[b.key], 5);
      if (n != null) vals.push(n);
    }
    if (!vals.length) continue;
    lows.push(lowSharePct(scaleDist(vals, 5)));
  }
  return lows.length ? round1(lows.reduce((a, b) => a + b, 0) / lows.length) : null;
}

export async function buildDayResultsDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  const settings = await getForumSettings(filters.shiftId);
  const currentDay = settings.currentDay ?? 1;
  const days = resolveDayRange(filters, currentDay);
  const dayFilter = days.length === 1 ? days[0] : null;

  const cohort = await loadCohortParticipants(filters, req);

  const { rows, fields, diagnostics } = await collectEveningExportRows({
    shiftId: filters.shiftId,
    day: dayFilter,
    direction: filters.direction ?? undefined,
    group: filters.group ?? undefined,
    ageCategory: filters.ageCategory ?? undefined,
    activityQ: filters.activity ?? undefined,
    includeDrafts: true,
  });

  return assembleHubResultsFromRows({
    filters,
    settings,
    currentDay,
    dayFilter,
    cohort,
    rows,
    fields,
    diagnostics,
    fetchAllDaysForSeries: dayFilter != null,
    exportPath: dayFilter
      ? `/exports/evening-summary?mode=day&day=${dayFilter}`
      : '/exports/evening-summary?mode=shift',
  });
}

export async function assembleHubResultsFromRows(input: {
  filters: AnalyticsFilters;
  settings: Awaited<ReturnType<typeof getForumSettings>>;
  currentDay: number;
  dayFilter: number | null;
  cohort: Awaited<ReturnType<typeof loadCohortParticipants>>;
  rows: EveningExportRow[];
  fields: EveningField[];
  diagnostics: { notes?: string[]; eveningOpenNow?: boolean | null; eveningForceUnpublished?: boolean | null };
  fetchAllDaysForSeries?: boolean;
  skipDaySeries?: boolean;
  directionDays?: Array<{ day: number; label: string }>;
  exportPath?: string | null;
}) {
  const {
    filters, settings, currentDay, dayFilter, cohort, rows, fields, diagnostics,
    fetchAllDaysForSeries, skipDaySeries, directionDays, exportPath,
  } = input;

  const allowed = new Set(cohort.map(p => p.id));
  const cohortSize = cohort.filter(
    p => p.onboardingCompletedAt && !hideOrganizerName(filters.organizers, p.direction),
  ).length;

  const nonOrgRows = restrictToCohort(rows, allowed, r => r.participantId)
    .filter(r => !hideOrganizerName(filters.organizers, r.directionName || r.p.direction));
  const submittedRows = nonOrgRows.filter(r => r.status === 'сдано');
  const draftRows = nonOrgRows.filter(r => r.status === 'черновик');

  const scaleFields = fields.filter(isScaleField);
  // шкалы с данными + канонические ключи, если есть ответы
  const withAnswers = scaleFields.filter(f =>
    submittedRows.some(r => numScale(r.ratings[f.key], f.type === 'scale_1_10' ? 10 : 5) != null),
  );
  // housing часто переименован в «куратора», а curator почти пустой — оставляем одну колонку.
  const activeScales = pickPreferredScaleFields(
    withAnswers,
    key => submittedRows.filter(r => numScale(r.ratings[key], 5) != null
      || numScale(r.ratings[key], 10) != null).length,
  );
  // если конфиг не отфильтровал — предпочитаем порядок EVENING_SCALE_KEYS
  const order = new Map(EVENING_SCALE_KEYS.map((k, i) => [k, i]));
  activeScales.sort((a, b) => (order.get(a.key as never) ?? 99) - (order.get(b.key as never) ?? 99));

  // «Движение к цели» — отдельный блок дашборда, не колонка тепловой карты.
  const programScales = activeScales.filter(f => !isGoalProgressField(f));
  const blocks = buildBlocks(programScales, submittedRows);
  const { dirs, heat, forum: heatForum } = buildHeat(blocks, submittedRows);
  const groups = buildGroups(blocks, submittedRows);

  const dayIndex = blocks.length
    ? round2(blocks.reduce((a, b) => a + b.mean, 0) / blocks.length)
    : null;
  const scaleN = blocks.length ? Math.max(...blocks.map(b => b.n)) : 0;
  const attentionBlocks = blocks.filter(b => b.low >= 10).length;
  const open = buildOpenQuality(fields, submittedRows);
  const formalAvg = open.length
    ? round1(open.reduce((a, o) => a + o.junk, 0) / open.length)
    : 0;

  const experiment = buildChoiceBuckets(
    fields,
    submittedRows,
    f => f.key === 'experimentResult' || f.type === 'experiment_text' || /эксперимент/i.test(f.label || ''),
  );
  // если experiment_text — свободный текст, бакеты будут «шумными»; оставляем топ
  const experimentTop = experiment.slice(0, 12);
  const transferIndex = transferIndexPct(experimentTop);

  const fixation = buildFixation(fields, submittedRows);
  const openQuotes = buildOpenQuotes(fields, submittedRows);
  const goalProgressByDirection = buildGoalProgressByDirection(fields, submittedRows);

  const roles = buildChoiceBuckets(
    fields,
    submittedRows,
    f => f.key === 'tomorrowRoleKey' || f.type === 'role_select',
  );
  // fallback на tomorrowRoleKey колонки строки
  const rolesFinal = roles.length
    ? roles
    : countNamed(submittedRows.map(r => roleLabel(r.tomorrowRoleKey)).filter(Boolean));

  const rolesByDir: Record<string, Record<string, number>> = {};
  for (const r of submittedRows) {
    const d = dirOf(r);
    const role = roleLabel(r.tomorrowRoleKey)
      || String(formatEveningFieldValue(
        { key: 'tomorrowRoleKey', type: 'role_select', label: 'Роль' },
        r.ratings,
        r.tomorrowRoleKey,
      ) || '').trim();
    if (!role) continue;
    if (!rolesByDir[d]) rolesByDir[d] = {};
    rolesByDir[d][role] = (rolesByDir[d][role] || 0) + 1;
  }
  // проценты внутри направления
  for (const d of Object.keys(rolesByDir)) {
    const tot = Object.values(rolesByDir[d]).reduce((a, b) => a + b, 0) || 1;
    for (const role of Object.keys(rolesByDir[d])) {
      rolesByDir[d][role] = round1((rolesByDir[d][role] / tot) * 100);
    }
  }

  const nps = buildPracticeRecommendNps(
    submittedRows.map(r => r.ratings as Record<string, unknown>),
  );
  const practices = (nps.byPractice ?? [])
    .map(p => ({ name: p.practice, n: p.responses, mean: p.avgScore }))
    .sort((a, b) => b.mean - a.mean || b.n - a.n);
  let practiceAttended = 0;
  for (const r of submittedRows) {
    if (extractPracticeScores(r.ratings as Record<string, unknown>).length) practiceAttended += 1;
  }

  const cohortByDir = new Map<string, number>();
  for (const p of cohort) {
    if (!p.onboardingCompletedAt) continue;
    if (hideOrganizerName(filters.organizers, p.direction)) continue;
    const d = (p.direction || '—').trim() || '—';
    cohortByDir.set(d, (cohortByDir.get(d) || 0) + 1);
  }
  const draftByDir = buildDraftsByDir(draftRows, cohortByDir);
  const hours = buildHours(submittedRows);

  // Динамика и матрица направлений
  const totalDays = Math.max(1, Math.min(16, settings.totalDays ?? 8));
  const seriesDays = directionDays?.length
    ? directionDays.map(d => d.day)
    : Array.from({ length: totalDays }, (_, i) => i + 1);
  let allSubmitted = submittedRows;
  let allFields = fields;
  if (fetchAllDaysForSeries) {
    const all = await collectEveningExportRows({
      shiftId: filters.shiftId,
      day: null,
      direction: filters.direction ?? undefined,
      group: filters.group ?? undefined,
      ageCategory: filters.ageCategory ?? undefined,
      activityQ: filters.activity ?? undefined,
      includeDrafts: false,
    });
    allSubmitted = restrictToCohort(all.rows, allowed, r => r.participantId).filter(
      r => r.status === 'сдано' && !hideOrganizerName(filters.organizers, r.directionName || r.p.direction),
    );
    allFields = all.fields;
  }
  const allScales = allFields.filter(f => isScaleField(f) && !isGoalProgressField(f));
  const daySeries = skipDaySeries
    ? []
    : seriesDays.map(day => {
      const dayRows = allSubmitted.filter(r => r.dayNumber === day);
      const dayBlocks = buildBlocks(allScales.length ? allScales : programScales, dayRows);
      return {
        day,
        index: dayIndexForRows(dayBlocks, dayRows),
        lowShare: avgLowForRows(dayBlocks, dayRows),
        submitted: dayRows.length,
      };
    });

  const dirField = allFields.find(isDirectionWorkField)
    ?? fields.find(isDirectionWorkField)
    ?? { key: 'direction', label: 'Работа в рамках тематического направления', type: 'scale_1_5' as const };
  const dirNames = new Set<string>();
  for (const p of cohort) {
    if (!p.onboardingCompletedAt || hideOrganizerName(filters.organizers, p.direction)) continue;
    dirNames.add((p.direction || '—').trim() || '—');
  }
  for (const r of allSubmitted) {
    const d = dirOf(r);
    if (!hideOrganizerName(filters.organizers, d)) dirNames.add(d);
  }
  const directionDayRatings = buildDirectionDayRatings({
    days: directionDays?.length
      ? directionDays
      : seriesDays.map(day => ({
        day,
        label: getForumDayDateLabel(settings.startDate ?? null, day) || `День ${day}`,
      })),
    directions: [...dirNames].sort((a, b) => a.localeCompare(b, 'ru')),
    rows: allSubmitted.map(r => ({
      dayNumber: r.dayNumber,
      direction: dirOf(r),
      ratings: r.ratings,
    })),
    field: dirField,
  });

  const diagNotes = buildDiagnostics(fields, submittedRows, diagnostics.notes ?? []);

  return {
    filters,
    currentForumDay: currentDay,
    meta: {
      day: dayFilter ?? currentDay,
      total: cohortSize,
      submitted: submittedRows.length,
      drafts: draftRows.length,
      scaleN,
      index: dayIndex,
      practiceAttended,
      fillRatePct: cohortSize
        ? round1((submittedRows.length / cohortSize) * 100)
        : 0,
      attentionBlocks,
      formalPct: formalAvg,
      transferIndex,
    },
    blocks,
    dirs,
    heat,
    heatForum,
    worstGroups: groups.worst,
    bestGroups: groups.best,
    roles: rolesFinal,
    rolesByDir,
    experiment: experimentTop,
    fixation: fixation.items,
    fixationN: fixation.n,
    fixationQuotes: fixation.quotes,
    goalProgressByDirection,
    openQuotes,
    practices,
    open,
    draftByDir,
    hours,
    daySeries,
    directionDayRatings,
    diagnostics: {
      notes: diagNotes,
      eveningOpenNow: diagnostics.eveningOpenNow ?? null,
      eveningForceUnpublished: diagnostics.eveningForceUnpublished ?? null,
    },
    exportPath: exportPath ?? undefined,
  };
}
