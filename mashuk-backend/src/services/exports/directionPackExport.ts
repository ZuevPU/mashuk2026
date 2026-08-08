import type { Response } from 'express';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { resolveAnalyticsFilters } from '../analytics/analyticsQuery.js';
import { buildDirectionDashboard } from '../analytics/directionDashboard.js';
import { addReadmeSheet } from './exportCommon.js';
import { createWorkbook, sendWorkbook } from './workbook.js';

export async function writeDirectionPackExport(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  if (!filters.direction?.trim()) {
    res.status(400).json({ error: 'Выберите направление (query direction) для выгрузки пакета.' });
    return;
  }

  const raw = await buildDirectionDashboard(filters, req);
  if (raw.requiresDirection || !('kpi' in raw) || !raw.kpi) {
    res.status(400).json({ error: 'Выберите направление для выгрузки пакета.' });
    return;
  }
  const data = raw as Extract<Awaited<ReturnType<typeof buildDirectionDashboard>>, { kpi: object }>;

  const dayPart = filters.day != null && filters.day > 0 ? `d${filters.day}` : 'shift';
  const dirSlug = filters.direction.trim().replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40);

  const wb = await createWorkbook();
  addReadmeSheet(wb, [
    'Полный пакет аналитики направления (Direction Command Center).',
    `Направление: ${data.direction}.`,
    data.header?.dayLabel ? `Срез: ${data.header.dayLabel}.` : '',
    data.header?.calendarDate ? `Дата: ${data.header.calendarDate}.` : '',
    filters.group ? `Группа: ${filters.group}.` : '',
    'Листы: KPI, Участники, Не заполнили, По группам, State checks, Evening, After blocks, Активность, Портрет.',
  ].filter(Boolean));

  const kpi = wb.addWorksheet('KPI');
  kpi.addRow(['Метрика', 'Значение']);
  const k = data.kpi;
  const rows: [string, string | number | null | undefined][] = [
    ['Направление', data.direction],
    ['Срез', data.header?.dayLabel],
    ['Зарегистрировано', k.registered],
    ['Активны', k.activeToday],
    ['Охват активности %', k.touchpointCoveragePct],
    ['Средняя энергия', k.avgEnergy],
    ['Риск + усталость %', k.riskFatiguePct],
    ['Сдали evening', k.eveningSubmitted],
    ['Охват evening %', k.eveningFillPct],
    ['После блоков — участников', k.afterBlocksSubmitted],
    ['Охват после блоков %', k.afterBlocksFillPct],
    ['State check — участников', k.stateCheckSubmitted],
    ['Охват state check %', k.stateCheckFillPct],
    ['Форум: активность %', data.forumCompare?.activityRatePct],
    ['Направление: активность %', data.forumCompare?.directionActivityRatePct],
  ];
  for (const [label, value] of rows) {
    kpi.addRow([label, value ?? '']);
  }

  const people = wb.addWorksheet('Участники');
  people.addRow(['ID', 'ФИО', 'Группа', 'Evening', 'После блоков', 'State check']);
  for (const p of data.participants ?? []) {
    people.addRow([
      p.participantId,
      p.name,
      p.group,
      p.filledEvening ? 'да' : 'нет',
      p.filledAfterBlocks ? 'да' : 'нет',
      p.filledStateCheck ? 'да' : 'нет',
    ]);
  }

  const missing = wb.addWorksheet('Не заполнили');
  missing.addRow(['Тип', 'ID', 'ФИО', 'Группа']);
  for (const p of data.ops?.missingEvening ?? []) {
    missing.addRow(['Evening', p.participantId, p.name, p.group]);
  }
  for (const p of data.ops?.missingAfterBlocks ?? []) {
    missing.addRow(['После блоков', p.participantId, p.name, p.group]);
  }
  for (const p of data.ops?.missingStateCheck ?? []) {
    missing.addRow(['State check', p.participantId, p.name, p.group]);
  }

  const groups = wb.addWorksheet('По группам');
  groups.addRow([
    'Группа', 'Зарегистрировано',
    'Evening', 'Evening %',
    'После блоков', 'После блоков %',
    'State check', 'State check %',
  ]);
  for (const g of data.ops?.byGroup ?? []) {
    groups.addRow([
      g.group, g.registered,
      g.evening, g.eveningFillPct,
      g.afterBlocks, g.afterBlocksFillPct,
      g.stateCheck, g.stateCheckFillPct,
    ]);
  }

  const sc = wb.addWorksheet('State checks');
  sc.addRow(['Вопрос', 'День', 'Участник', 'Группа', 'Фаза', 'Эмоция', 'Зона', 'Энергия', 'Причина']);
  for (const q of data.stateCheck?.questions ?? []) {
    for (const a of q.answers ?? []) {
      sc.addRow([
        q.label,
        q.day ?? '',
        a.name,
        a.group,
        a.timePoint ?? '',
        a.emotion ?? '',
        a.emotionZone ?? '',
        a.energy ?? '',
        a.answer ?? '',
      ]);
    }
  }

  const ev = wb.addWorksheet('Evening');
  ev.addRow(['Вопрос', 'Участник', 'Группа', 'День', 'Ответ']);
  for (const q of data.evening?.questions ?? []) {
    for (const a of q.answers ?? []) {
      ev.addRow([q.label, a.name, a.group, a.day, String(a.answer ?? '')]);
    }
  }

  const ab = wb.addWorksheet('After blocks');
  ab.addRow(['Вопрос', 'Участник', 'Группа', 'Блок', 'Ответ']);
  for (const q of data.afterBlocks?.questions ?? []) {
    for (const a of q.answers ?? []) {
      ab.addRow([q.label, a.name, a.group, a.eventTitle ?? '', a.answer ?? '']);
    }
  }

  const act = wb.addWorksheet('Активность');
  act.addRow(['Ранг', 'ID', 'ФИО', 'Направление', 'Баллы']);
  for (const r of data.activity?.ratingTop ?? []) {
    act.addRow([r.rank ?? '', r.id, r.name, r.direction ?? data.direction, r.points ?? '']);
  }

  const portrait = wb.addWorksheet('Портрет');
  portrait.addRow(['Тип', 'Токен / цитата', 'Счёт']);
  for (const t of data.portrait?.goalTopTokens ?? []) {
    const token = typeof t === 'object' && t && 'token' in t ? String((t as { token: string }).token) : String(t);
    const count = typeof t === 'object' && t && 'count' in t ? (t as { count: number }).count : '';
    portrait.addRow(['Цель (точка А)', token, count]);
  }
  for (const t of data.portrait?.themeTokens ?? []) {
    portrait.addRow(['Тема ответов', t.token, t.count]);
  }
  for (const q of data.portrait?.quotes ?? []) {
    portrait.addRow(['Цитата', q.text, '']);
  }

  await sendWorkbook(res, wb, `direction_${dirSlug}_${dayPart}.xlsx`);
}
