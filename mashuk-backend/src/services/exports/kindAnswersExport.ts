import type { Response } from 'express';
import {
  collectKindAnswerRows,
  type KindDashboardMode,
} from '../analytics/questionKindDashboard.js';
import type { AnalyticsFilters } from '../analytics/analyticsQuery.js';
import { resolveAnalyticsFilters } from '../analytics/analyticsQuery.js';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { loadCohortParticipants } from '../analytics/cohort.js';
import {
  emotionIdToLabel,
  emotionIdToZone,
  emotionZoneToLabel,
} from '../emotionZones.js';
import { addReadmeSheet } from './exportCommon.js';
import { createWorkbook, sendWorkbook } from './workbook.js';

const PHASE_RU: Record<string, string> = {
  morning: 'Утро',
  day: 'День',
  evening: 'Вечер',
  night: 'Ночь',
  утро: 'Утро',
  день: 'День',
  вечер: 'Вечер',
};

function phaseRu(raw: string | null | undefined): string {
  if (!raw) return '';
  const key = raw.trim().toLowerCase();
  return PHASE_RU[key] || raw;
}

function filtersFromReq(req: AdminRequest): Promise<AnalyticsFilters> {
  return resolveAnalyticsFilters(req);
}

export async function writeKindAnswersExport(
  res: Response,
  mode: KindDashboardMode,
  filters: AnalyticsFilters,
  req?: AdminRequest,
): Promise<void> {
  const { rows: rawRows, questionMeta } = await collectKindAnswerRows(mode, filters);
  const cohort = await loadCohortParticipants(filters, req);
  const cohortIds = new Set(cohort.map(p => p.id));
  const rows = rawRows.filter(r => cohortIds.has(r.participantId));
  const title = mode === 'after_blocks' ? 'После блоков' : 'Проверка состояния';
  const fileStem = mode === 'after_blocks' ? 'after_blocks' : 'state_checks';
  const dayPart = filters.day != null && filters.day > 0 ? `d${filters.day}` : 'shift';

  const registeredByDir = new Map<string, number>();
  for (const p of cohort) {
    if (!p.onboardingCompletedAt) continue;
    const d = (p.direction || '—').trim() || '—';
    registeredByDir.set(d, (registeredByDir.get(d) || 0) + 1);
  }

  const wb = await createWorkbook();
  addReadmeSheet(wb, [
    `Выгрузка «${title}» — полные ответы участников.`,
    mode === 'after_blocks'
      ? 'Лист «Ответы»: 1 строка = одно осмысление по подтеме (если участник выбрал несколько — несколько строк с одним ID ответа).'
      : 'Лист «Ответы»: 1 строка = один ответ.',
    'Лист «По вопросам»: сводка охвата по каждому вопросу.',
    'Лист «По направлениям»: уникальные участники, ответы и % охвата от зарегистрированных.',
    mode === 'after_blocks'
      ? 'Колонки включают событие программы, подтему и текст осмысления.'
      : 'Колонки включают эмоцию, зону, энергию, фазу и причину.',
    `Вопросов в срезе: ${questionMeta.length}.`,
    `Строк ответов: ${rows.length}.`,
    `Уникальных участников с ответом: ${new Set(rows.map(r => r.participantId)).size}.`,
    filters.day ? `День: ${filters.day}.` : 'Дни: по режиму фильтра Insights.',
    filters.direction ? `Направление: ${filters.direction}.` : '',
    filters.group ? `Группа: ${filters.group}.` : '',
  ].filter(Boolean));

  const ws = wb.addWorksheet('Ответы');
  if (mode === 'after_blocks') {
    ws.addRow([
      'ID ответа',
      'ID участника',
      'ФИО',
      'Направление',
      'Группа',
      'День',
      'ID вопроса',
      'Вопрос',
      'ID события',
      'Событие программы',
      'ID подтемы',
      'Подтема',
      'Путь',
      'Ответ',
      'Время (МСК)',
    ]);
    for (const r of rows) {
      const parent = (r.parentEventTitle || '').trim();
      const topic = (r.eventTitle || '').trim();
      const path = parent && topic && parent !== topic
        ? `${parent} → ${topic}`
        : (topic || parent);
      ws.addRow([
        r.answerId,
        r.participantId,
        r.name,
        r.direction,
        r.group,
        r.day,
        r.questionId,
        r.questionTitle,
        r.parentEventId ?? '',
        parent || (topic && !r.parentEventId ? topic : ''),
        r.eventId ?? '',
        parent && topic && parent !== topic ? topic : (parent ? '' : topic),
        path,
        r.answer,
        r.filledAt ?? '',
      ]);
    }
  } else {
    ws.addRow([
      'ID ответа',
      'ID участника',
      'ФИО',
      'Направление',
      'Группа',
      'День',
      'ID вопроса',
      'Вопрос',
      'Фаза',
      'Эмоция',
      'Зона',
      'Энергия',
      'Причина',
      'Время (МСК)',
    ]);
    for (const r of rows) {
      ws.addRow([
        r.answerId,
        r.participantId,
        r.name,
        r.direction,
        r.group,
        r.day,
        r.questionId,
        r.questionTitle,
        phaseRu(r.timePoint),
        emotionIdToLabel(r.emotion) || r.emotion || '',
        emotionZoneToLabel(r.emotionZone)
          || emotionZoneToLabel(emotionIdToZone(r.emotion))
          || r.emotionZone
          || '',
        r.energy ?? '',
        r.answer,
        r.filledAt ?? '',
      ]);
    }
  }

  const byQ = wb.addWorksheet('По вопросам');
  byQ.addRow(['ID вопроса', 'Вопрос', 'День', 'Ответов', 'Уникальных участников']);
  const byQuestion = new Map<number, { title: string; day: number | null; n: number; people: Set<number> }>();
  for (const qm of questionMeta) {
    byQuestion.set(qm.id, { title: qm.title, day: qm.dayNumber, n: 0, people: new Set() });
  }
  for (const r of rows) {
    if (!byQuestion.has(r.questionId)) {
      byQuestion.set(r.questionId, {
        title: r.questionTitle,
        day: r.day,
        n: 0,
        people: new Set(),
      });
    }
    const bucket = byQuestion.get(r.questionId)!;
    bucket.n += 1;
    bucket.people.add(r.participantId);
  }
  for (const [id, b] of [...byQuestion.entries()].sort((a, b) => (a[1].day ?? 99) - (b[1].day ?? 99))) {
    byQ.addRow([id, b.title, b.day ?? '', b.n, b.people.size]);
  }

  const byDir = wb.addWorksheet('По направлениям');
  byDir.addRow(['Направление', 'Заполнили', 'Ответов', 'Зарегистрировано', 'Охват %']);
  const dirMap = new Map<string, { people: Set<number>; n: number }>();
  for (const direction of registeredByDir.keys()) {
    dirMap.set(direction, { people: new Set(), n: 0 });
  }
  for (const r of rows) {
    if (!dirMap.has(r.direction)) dirMap.set(r.direction, { people: new Set(), n: 0 });
    const d = dirMap.get(r.direction)!;
    d.people.add(r.participantId);
    d.n += 1;
  }
  for (const [direction, d] of [...dirMap.entries()].sort((a, b) => b[1].people.size - a[1].people.size)) {
    const registered = registeredByDir.get(direction) ?? 0;
    const fill = registered ? Math.round((d.people.size / registered) * 1000) / 10 : 0;
    byDir.addRow([direction, d.people.size, d.n, registered, fill]);
  }

  await sendWorkbook(res, wb, `${fileStem}_${dayPart}.xlsx`);
}

export async function writeAfterBlocksExport(req: AdminRequest, res: Response): Promise<void> {
  const filters = await filtersFromReq(req);
  await writeKindAnswersExport(res, 'after_blocks', filters, req);
}

export async function writeStateChecksExport(req: AdminRequest, res: Response): Promise<void> {
  const filters = await filtersFromReq(req);
  await writeKindAnswersExport(res, 'state_check', filters, req);
}
