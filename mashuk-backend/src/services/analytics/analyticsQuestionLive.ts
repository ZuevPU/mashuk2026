/**
 * Для штаба/аналитики: вопрос уже «выходил в эфир».
 * Не путать с мини-приложением: сюда входят archived/hidden после окна,
 * иначе ответы прошлых дней пропадают из дашбордов.
 */
import { getMoscowPhase } from '../timePhase.js';

function publishTimeMs(publishTime: Date | string | null | undefined): number | null {
  if (publishTime == null) return null;
  const t = publishTime instanceof Date ? publishTime : new Date(publishTime);
  return Number.isFinite(t.getTime()) ? t.getTime() : null;
}

/**
 * Включать в аналитику:
 * - published с publishTime ≤ now (или без publishTime)
 * - archived (история ответов)
 * - hidden, если окно уже наступало (или publishTime не задан)
 * Исключать: draft и published с будущим publishTime (засеянные слоты).
 */
export function isQuestionLiveForAnalytics(
  q: {
    status?: string | null;
    isHidden?: boolean | null;
    publishTime?: Date | string | null;
  },
  now = new Date(),
): boolean {
  const status = (q.status || 'published').toLowerCase();
  if (status === 'draft') return false;

  const openedAt = publishTimeMs(q.publishTime);
  const notOpenedYet = openedAt != null && openedAt > now.getTime();

  if (status === 'archived') {
    // Архив всегда для истории; будущий publishTime у архива не бывает на практике.
    return true;
  }

  if (status !== 'published') return false;

  // Ещё не открывшийся слот — не считаем (фикс «ложного» дня 5).
  if (notOpenedYet) return false;

  // isHidden после закрытия окна — ответы остаются в аналитике.
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
