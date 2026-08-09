import type { Response } from 'express';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { resolveAnalyticsFilters } from '../analytics/analyticsQuery.js';
import { buildParticipantProfileDashboard } from '../analytics/participantProfileDashboard.js';
import { createWorkbook, sendWorkbook } from './workbook.js';

function sheet(wb: Awaited<ReturnType<typeof createWorkbook>>, name: string, headers: string[], rows: unknown[][]) {
  const ws = wb.addWorksheet(name.slice(0, 31));
  ws.addRow(headers);
  for (const row of rows) ws.addRow(row);
  return ws;
}

export async function writeParticipantProfileExport(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  const data = await buildParticipantProfileDashboard(filters, req);
  const wb = await createWorkbook();

  sheet(wb, 'Summary', ['Показатель', 'Значение'], [
    ['Заголовок', data.title],
    ['Участников', data.sample.size],
    ['Полнота данных %', data.sample.dataCompletenessPct],
    ['Активных', data.sample.activeParticipants],
    ['Без данных %', data.sample.noDataPct],
    ['Недостаточно данных', data.sample.insufficientSample ? 'да' : 'нет'],
    ['Резюме', data.typical.summary ?? ''],
    ['Ср. энергия', data.feeling.energy.avg],
    ['Мед. энергия', data.feeling.energy.median],
    ['Ср. точек', data.engagement.touchpoints.avg],
    ['Мед. точек', data.engagement.touchpoints.median],
    ['Программа % max', data.programPerception.overall.overallPct],
    ['Evening %', data.engagement.eveningCoveragePct],
    ['Риск+усталость %', data.feeling.riskFatiguePct],
  ]);

  sheet(wb, 'Feeling', ['День', 'Ср. энергия', 'Медиана', 'Ответов', 'Риск+усталость %'],
    (data.feeling.energyByDay ?? []).map(d => [
      d.day, d.avg, d.median ?? '', d.responses, d.riskFatiguePct ?? '',
    ]));

  sheet(wb, 'Emotions', ['Эмоция', 'Count', 'Pct'],
    (data.feeling.emotions ?? []).map((e: { label: string; count: number; pct: number }) => [e.label, e.count, e.pct]));

  sheet(wb, 'Engagement', ['Точек', 'Участников'],
    (data.engagement.distribution ?? []).map((d: { completed: number; count: number }) => [d.completed, d.count]));

  sheet(wb, 'Directions', ['Направление', 'Участников', 'Ср. точек', 'Медиана', 'Все 7', 'Задания', 'Evening %', 'Охват %'],
    (data.engagement.directionTable ?? []).map((r: {
      direction: string; participants: number; avgTouchpoints: number | null; medianTouchpoints: number | null;
      all7: number; tasks: number | null; eveningFillPct: number | null; coveragePct: number | null;
    }) => [
      r.direction, r.participants, r.avgTouchpoints, r.medianTouchpoints, r.all7, r.tasks, r.eveningFillPct, r.coveragePct,
    ]));

  sheet(wb, 'Program', ['Вопрос', 'Средняя', 'Медиана', 'Шкала', 'Ответов', 'Pct max', 'Δ день', 'Недостаточно'],
    (data.programPerception.questions ?? []).map((q: {
      label: string; avg: number; median: number | null; scale: string; answered: number; avgPct: number;
      deltaPrevDay: number | null; insufficient: boolean;
    }) => [q.label, q.avg, q.median, q.scale, q.answered, q.avgPct, q.deltaPrevDay, q.insufficient ? 'да' : '']));

  sheet(wb, 'Meanings', ['Тип', 'Тема', 'Упоминания', 'Участников', 'Pct участников'], [
    ...((data.meanings.goals ?? []) as { label: string; count: number; uniqueParticipants: number; pct: number | null }[])
      .map(t => ['цели', t.label, t.count, t.uniqueParticipants, t.pct]),
    ...((data.meanings.interests ?? []) as { label: string; count: number; uniqueParticipants: number; pct: number | null }[])
      .map(t => ['интересы', t.label, t.count, t.uniqueParticipants, t.pct]),
    ...((data.meanings.reflectionThemes ?? []) as { label: string; count: number; uniqueParticipants: number; pct: number | null }[])
      .map(t => ['рефлексии', t.label, t.count, t.uniqueParticipants, t.pct]),
    ...((data.meanings.piggyThemes ?? []) as { label: string; count: number; uniqueParticipants: number; pct: number | null }[])
      .map(t => ['копилка', t.label, t.count, t.uniqueParticipants, t.pct]),
  ]);

  sheet(wb, 'Segments', ['Сегмент', 'N', 'Pct', 'Ср. энергия', 'Ср. точек', 'Программа %', 'Задания'],
    (data.segments ?? []).map((s: {
      label: string; count: number; pct: number | null; avgEnergy: number | null;
      avgTouchpoints: number | null; avgProgramPct: number | null; tasksApprox: number | null;
    }) => [s.label, s.count, s.pct, s.avgEnergy, s.avgTouchpoints, s.avgProgramPct, s.tasksApprox]));

  sheet(wb, 'Recommendations', ['Приоритет', 'Рекомендация', 'Основание'],
    (data.recommendations ?? []).map((r: { priority: string; title: string; evidence: string }) => [
      r.priority, r.title, r.evidence,
    ]));

  const dayPart = filters.day != null ? `d${filters.day}` : 'shift';
  await sendWorkbook(res, wb, `participant_profile_${dayPart}.xlsx`);
}
