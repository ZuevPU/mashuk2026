import { and, inArray, isNull } from 'drizzle-orm';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { db } from '../../db/index.js';
import { piggybank } from '../../db/schema.js';
import { getForumSettings } from '../helpers.js';
import { isOrganizerDirection } from '../leaderboardQuery.js';
import {
  entryTags,
  normalizePiggybankSource,
} from '../piggybankDict.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { loadCohortParticipants } from './cohort.js';
import {
  FUNNEL_STAGES,
  LADDER_ORDER,
  TAG_ORDER,
  hasActionTag,
  isAutoBookmark,
  ladderBucket,
  median,
  mskHour,
  round1,
  topShareCounts,
} from './piggybankHubMetrics.js';

type Row = {
  id: number;
  participantId: number;
  text: string;
  source: string | null;
  forumDay: number | null;
  isHidden: boolean | null;
  isViolation: boolean | null;
  createdAt: Date | null;
  tags: string[];
  auto: boolean;
  action: boolean;
};

function buildDaySlice(rows: Row[], cohortById: Map<number, { direction: string }>, registered: number) {
  const records = rows.length;
  const manualRows = rows.filter(r => !r.auto);
  const autoRows = rows.filter(r => r.auto);
  const peopleIds = new Set(rows.map(r => r.participantId));
  const manualPeopleIds = new Set(manualRows.map(r => r.participantId));

  const tagCountsManual = Object.fromEntries(TAG_ORDER.map(t => [t, 0])) as Record<string, number>;
  const tagCountsAuto = Object.fromEntries(TAG_ORDER.map(t => [t, 0])) as Record<string, number>;
  const tagLensManual: Record<string, number[]> = Object.fromEntries(TAG_ORDER.map(t => [t, []]));

  for (const r of manualRows) {
    for (const t of r.tags) {
      if (t in tagCountsManual) {
        tagCountsManual[t] += 1;
        tagLensManual[t].push((r.text || '').length);
      }
    }
  }
  for (const r of autoRows) {
    for (const t of r.tags) {
      if (t in tagCountsAuto) tagCountsAuto[t] += 1;
    }
  }

  const tagsManual = TAG_ORDER.map(tag => ({
    tag,
    n: tagCountsManual[tag],
    med: Math.round(median(tagLensManual[tag])),
  }));
  const tagsAuto = TAG_ORDER.map(tag => ({
    tag,
    n: tagCountsAuto[tag],
  }));

  const funnel = FUNNEL_STAGES.map(stage => ({
    name: stage.name,
    n: stage.tags.reduce((sum, t) => sum + tagCountsManual[t], 0),
  }));

  // Sources — только собственные заметки, строка от 8 записей
  const srcMap = new Map<string, Row[]>();
  for (const r of manualRows) {
    const src = normalizePiggybankSource(r.source) || 'не указан';
    if (!srcMap.has(src)) srcMap.set(src, []);
    srcMap.get(src)!.push(r);
  }
  const sources = [...srcMap.entries()]
    .map(([src, list]) => {
      const actN = list.filter(r => r.action).length;
      const authors = new Set(list.map(r => r.participantId)).size;
      return {
        src,
        n: list.length,
        people: authors,
        act: round1((actN / Math.max(1, list.length)) * 100),
        med: Math.round(median(list.map(r => (r.text || '').length))),
      };
    })
    .filter(s => s.n >= 8 || s.src === 'не указан')
    .sort((a, b) => b.act - a.act || b.n - a.n || a.src.localeCompare(b.src, 'ru'));

  // Удержание по собственным заметкам
  const byPidManual = new Map<number, number>();
  for (const r of manualRows) {
    byPidManual.set(r.participantId, (byPidManual.get(r.participantId) || 0) + 1);
  }
  const counts = [...byPidManual.values()];
  const ladderMap = Object.fromEntries(LADDER_ORDER.map(n => [n, 0])) as Record<string, number>;
  for (const c of counts) ladderMap[ladderBucket(c)] += 1;
  const ladder = LADDER_ORDER.map(name => ({ name, n: ladderMap[name] }));

  const oneShare = counts.length
    ? Math.round((counts.filter(c => c === 1).length / counts.length) * 100)
    : 0;
  const concentration = {
    people: counts.length,
    one: oneShare,
    top10: topShareCounts(counts, 10),
    top20: topShareCounts(counts, 20),
    median: Math.round(median(counts)),
    max: counts.length ? Math.max(...counts) : 0,
  };

  // Направления
  const dirReg = new Map<string, number>();
  for (const [, p] of cohortById) {
    if (isOrganizerDirection(p.direction)) continue;
    dirReg.set(p.direction, (dirReg.get(p.direction) || 0) + 1);
  }
  const dirPeople = new Map<string, Set<number>>();
  const dirAll = new Map<string, number>();
  const dirManual = new Map<string, number>();
  const dirAct = new Map<string, number>();
  for (const r of rows) {
    const dir = cohortById.get(r.participantId)?.direction || '—';
    if (isOrganizerDirection(dir)) continue;
    if (!dirPeople.has(dir)) dirPeople.set(dir, new Set());
    dirPeople.get(dir)!.add(r.participantId);
    dirAll.set(dir, (dirAll.get(dir) || 0) + 1);
    if (!r.auto) {
      dirManual.set(dir, (dirManual.get(dir) || 0) + 1);
      if (r.action) dirAct.set(dir, (dirAct.get(dir) || 0) + 1);
    }
  }
  const dirs = [...dirReg.entries()]
    .map(([dir, reg]) => {
      const people = dirPeople.get(dir)?.size ?? 0;
      const manual = dirManual.get(dir) || 0;
      const actN = dirAct.get(dir) || 0;
      return {
        dir,
        reg,
        people,
        cov: round1((people / Math.max(1, reg)) * 100),
        n: dirAll.get(dir) || 0,
        manual,
        perPerson: people ? round1(manual / people) : 0,
        act: round1((actN / Math.max(1, manual)) * 100),
      };
    })
    .filter(d => d.reg >= 1)
    .sort((a, b) => b.cov - a.cov || a.dir.localeCompare(b.dir, 'ru'));

  // Часы
  const hourMap = new Map<number, { manual: number; auto: number }>();
  for (let h = 0; h < 24; h++) hourMap.set(h, { manual: 0, auto: 0 });
  for (const r of rows) {
    if (!r.createdAt) continue;
    const h = mskHour(r.createdAt);
    const slot = hourMap.get(h)!;
    if (r.auto) slot.auto += 1;
    else slot.manual += 1;
  }
  const hours = [...hourMap.entries()]
    .map(([h, v]) => ({ h, manual: v.manual, auto: v.auto }))
    .filter(h => h.manual + h.auto > 0);

  const actionShare = manualRows.length
    ? round1((manualRows.filter(r => r.action).length / manualRows.length) * 100)
    : 0;
  const returnedShare = counts.length
    ? round1((counts.filter(c => c >= 2).length / counts.length) * 100)
    : 0;

  const hidden = rows.filter(r => r.isHidden).length;
  const violations = rows.filter(r => r.isViolation).length;

  return {
    meta: {
      records,
      manual: manualRows.length,
      auto: autoRows.length,
      people: peopleIds.size,
      peopleManual: manualPeopleIds.size,
      registered,
      medManual: Math.round(median(manualRows.map(r => (r.text || '').length))),
      medAuto: Math.round(median(autoRows.map(r => (r.text || '').length))),
      coveragePct: round1((peopleIds.size / Math.max(1, registered)) * 100),
      actionShare,
      returnedShare,
      hidden,
      violations,
    },
    tagsManual,
    tagsAuto,
    funnel,
    sources,
    concentration,
    ladder,
    dirs,
    hours,
  };
}

export async function buildPiggybankHubDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  const settings = await getForumSettings(filters.shiftId);
  const currentDay = settings.currentDay ?? 1;
  const day = Math.min(8, Math.max(1, filters.day ?? currentDay));

  const cohort = await loadCohortParticipants(filters, req);
  const registeredRows = cohort.filter(
    p => p.onboardingCompletedAt && !isOrganizerDirection(p.direction),
  );
  const ids = registeredRows.map(p => p.id);
  const cohortById = new Map(
    registeredRows.map(p => [p.id, { direction: (p.direction || '—').trim() || '—' }]),
  );
  const registered = registeredRows.length;

  const raw = ids.length
    ? await db.select({
      id: piggybank.id,
      participantId: piggybank.participantId,
      text: piggybank.text,
      source: piggybank.source,
      forumDay: piggybank.forumDay,
      isHidden: piggybank.isHidden,
      isViolation: piggybank.isViolation,
      createdAt: piggybank.createdAt,
      tag: piggybank.tag,
      tags: piggybank.tags,
    }).from(piggybank).where(and(
      inArray(piggybank.participantId, ids),
      isNull(piggybank.deletedAt),
    ))
    : [];

  const all: Row[] = raw.map(r => {
    const tags = entryTags(r);
    const auto = isAutoBookmark(r.text);
    return {
      id: r.id,
      participantId: r.participantId,
      text: r.text || '',
      source: r.source,
      forumDay: r.forumDay,
      isHidden: r.isHidden,
      isViolation: r.isViolation,
      createdAt: r.createdAt,
      tags,
      auto,
      action: !auto && hasActionTag(tags),
    };
  });

  const dayRows = all.filter(r => (r.forumDay ?? 0) === day);
  const slice = buildDaySlice(dayRows, cohortById, registered);

  const daySeries = [1, 2, 3, 4, 5, 6, 7, 8].map(d => {
    const rows = all.filter(r => (r.forumDay ?? 0) === d);
    if (!rows.length && d !== day) {
      return { day: d, coveragePct: null, returnedShare: null, actionShare: null };
    }
    const s = buildDaySlice(rows, cohortById, registered);
    return {
      day: d,
      coveragePct: rows.length || d === day ? s.meta.coveragePct : null,
      returnedShare: rows.length ? s.meta.returnedShare : null,
      actionShare: rows.length ? s.meta.actionShare : null,
    };
  });

  // Не отдаём тексты заметок — только длины уже сведены в медианы
  return {
    filters,
    currentForumDay: currentDay,
    meta: {
      day,
      ...slice.meta,
      now: new Date().toISOString(),
    },
    tagsManual: slice.tagsManual,
    tagsAuto: slice.tagsAuto,
    funnel: slice.funnel,
    sources: slice.sources,
    concentration: slice.concentration,
    ladder: slice.ladder,
    dirs: slice.dirs,
    hours: slice.hours,
    privacy: [
      {
        title: 'Панель показывает',
        text: 'Агрегаты использования: охват, удержание, теги, источники, время. Ни одного текста заметки.',
      },
      {
        title: 'Никогда не выводится',
        text: 'Записи с тегом «контакт». В них личные телефоны и имена — чужие персональные данные без согласия владельцев.',
      },
      {
        title: 'Только по согласию',
        text: 'Кнопка «поделиться с методистами» на самой записи. Согласие даёт автор, а не администратор.',
      },
      {
        title: 'В методический отчёт',
        text: 'Обезличенные формулировки идей и вопросов — после согласия и ручного отбора. Это материал дня 8, а не оперативная панель.',
      },
      {
        title: 'Модерация',
        text: slice.meta.hidden || slice.meta.violations
          ? `Сейчас скрыто ${slice.meta.hidden}, нарушений ${slice.meta.violations}.`
          : `Поля «скрыто» и «нарушение» пусты по всем ${slice.meta.records} записям дня. Механизм есть — повода не было.`,
      },
    ],
    daySeries,
    exportPath: '/exports/piggybank?format=xlsx',
  };
}
