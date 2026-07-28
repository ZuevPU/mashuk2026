import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { answers, questions } from '../../db/schema.js';
import { emotionIdToZone } from '../emotionZones.js';
import { isPublishedStatus } from '../publishStatus.js';
import { TOUCHPOINT_SLOTS } from '../touchpointTemplates.js';
import { answerText } from './exportCommon.js';
import { loadDayAnswerRows } from './dayExport.js';
import { EXPORT_TOUCHPOINT_FILTERS, touchpointTypeForQuestion } from './touchpointFilter.js';

export async function computeDayExportStats(day: number) {
  const dayQuestions = await db.select().from(questions).where(eq(questions.dayNumber, day));
  const published = dayQuestions.filter(q => isPublishedStatus(q.status));
  const answerRows = await loadDayAnswerRows(day);
  const answeredQIds = new Set(answerRows.map(r => r.a.questionId));

  const byType: Record<string, { questions: number; answers: number }> = {};
  for (const f of EXPORT_TOUCHPOINT_FILTERS) {
    if (f === 'all') continue;
    byType[f] = { questions: 0, answers: 0 };
  }
  for (const q of published) {
    const tp = touchpointTypeForQuestion(q);
    if (!byType[tp]) byType[tp] = { questions: 0, answers: 0 };
    byType[tp].questions += 1;
    if (answeredQIds.has(q.id)) byType[tp].answers += 1;
  }

  const emotionZones: Record<string, number> = {};
  for (const r of answerRows) {
    const tp = r.q ? touchpointTypeForQuestion(r.q) : '';
    if (tp !== 'checkin') continue;
    const text = answerText(r.a.answerData);
    let emotion: string | null = null;
    try {
      const data = JSON.parse(text) as { emotion?: string };
      emotion = data.emotion ?? null;
    } catch {
      /* plain text */
    }
    if (emotion) {
      const zone = emotionIdToZone(emotion);
      if (zone) emotionZones[zone] = (emotionZones[zone] || 0) + 1;
    }
  }

  const touchpointTotal = published.filter(q =>
    TOUCHPOINT_SLOTS.some(s => s.title === q.title),
  ).length || TOUCHPOINT_SLOTS.length;
  const participantsAnswered = new Set(answerRows.map(r => r.a.participantId)).size;

  return {
    day,
    touchpointQuestions: touchpointTotal,
    publishedQuestions: published.length,
    answerRows: answerRows.length,
    participantsWithAnswers: participantsAnswered,
    byTouchpointType: byType,
    emotionZones,
  };
}
