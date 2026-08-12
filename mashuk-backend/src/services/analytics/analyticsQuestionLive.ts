/**
 * Для штаба/аналитики: вопрос «в эфире», а не просто status=published
 * с будущим publishTime (как у засеянных точек до окна).
 */
import { getMoscowPhase } from '../timePhase.js';

export function isQuestionLiveForAnalytics(
  q: {
    status?: string | null;
    isHidden?: boolean | null;
    publishTime?: Date | string | null;
  },
  now = new Date(),
): boolean {
  if (q.isHidden === true) return false;
  if (q.status !== 'published') return false;
  if (q.publishTime != null) {
    const t = q.publishTime instanceof Date ? q.publishTime : new Date(q.publishTime);
    if (Number.isFinite(t.getTime()) && t.getTime() > now.getTime()) return false;
  }
  return true;
}

export function stateCheckPhaseForAnswer(createdAt: Date | null): 'morning' | 'day' | 'evening' {
  if (!createdAt) return getMoscowPhase();
  return getMoscowPhase(createdAt);
}

/**
 * Фаза проверки состояния.
 * Сначала название (Утренняя/Дневная/Вечерняя) — в payload часто лежит
 * дефолт «утро» с клиента, который перебивает реальный слот.
 */
export function stateCheckPhaseFromQuestion(
  q: { timePoint?: string | null; title?: string | null },
  createdAt?: Date | null,
): 'morning' | 'day' | 'evening' {
  const title = (q.title || '').toLowerCase();
  if (/вечерн|\bвечер\b/.test(title)) return 'evening';
  if (/дневн|днём|днем|обед|\bдень\b/.test(title)) return 'day';
  if (/утрен|\bутро\b/.test(title)) return 'morning';

  const tp = (q.timePoint || '').toLowerCase().trim();
  if (tp === 'evening' || tp.includes('вечер')) return 'evening';
  if (tp === 'day' || tp === 'afternoon' || tp.includes('день') || tp.includes('дневн')) return 'day';
  if (tp === 'morning' || tp.includes('утро')) return 'morning';

  return stateCheckPhaseForAnswer(createdAt ?? null);
}
