/**
 * Для штаба/аналитики: вопрос уже «выходил в эфир».
 * Не путать с мини-приложением: сюда входят archived/hidden после окна,
 * иначе ответы прошлых дней пропадают из дашбордов.
 */
import { getMoscowPhase } from '../timePhase.js';
import { TOUCHPOINT_SLOTS } from '../touchpointTemplates.js';

function publishTimeMs(publishTime: Date | string | null | undefined): number | null {
  if (publishTime == null) return null;
  const t = publishTime instanceof Date ? publishTime : new Date(publishTime);
  return Number.isFinite(t.getTime()) ? t.getTime() : null;
}

/**
 * Включать в аналитику:
 * - published с publishTime ≤ now (или без publishTime)
 * - archived (история ответов)
 * - isHidden=true всегда (сняли с эфира после ответов; publishTime могли сбить «Пересчитать окна»)
 * Исключать: draft и ещё не открывшиеся published (засеянные слоты).
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
  if (status === 'archived') return true;
  if (status !== 'published') return false;

  // Скрыт админом = уже был в эфире. Не режем по publishTime.
  if (q.isHidden === true) return true;

  const openedAt = publishTimeMs(q.publishTime);
  if (openedAt != null && openedAt > now.getTime()) return false;
  return true;
}

export function stateCheckPhaseForAnswer(createdAt: Date | null): 'morning' | 'day' | 'evening' {
  if (!createdAt) return getMoscowPhase();
  return getMoscowPhase(createdAt);
}

function phaseFromTouchpointSlot(
  title: string | null | undefined,
): 'morning' | 'day' | 'evening' | null {
  const raw = (title || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const slot = TOUCHPOINT_SLOTS.find(s =>
    s.type === 'checkin'
    && (s.title === raw || s.title.toLowerCase() === lower),
  );
  if (!slot) return null;
  if (slot.timePoint === 'утро') return 'morning';
  if (slot.timePoint === 'день') return 'day';
  if (slot.timePoint === 'вечер') return 'evening';
  return null;
}

/** Cyrillic-safe: JS \\b не считает кириллицу «словом». */
function hasPhaseToken(text: string, token: string): boolean {
  const t = text.toLowerCase();
  const re = new RegExp(`(^|[^\\p{L}\\p{N}_])${token}([^\\p{L}\\p{N}_]|$)`, 'iu');
  return re.test(t);
}

/**
 * Фаза проверки состояния.
 * 1) Точный слот из TOUCHPOINT_SLOTS (Утренняя/Дневная/Вечерняя проверка…)
 * 2) Ключевые слова в названии
 * 3) timePoint вопроса (не payload-дефолт «утро»)
 * 4) Время ответа
 */
export function stateCheckPhaseFromQuestion(
  q: { timePoint?: string | null; title?: string | null },
  createdAt?: Date | null,
): 'morning' | 'day' | 'evening' {
  const fromSlot = phaseFromTouchpointSlot(q.title);
  if (fromSlot) return fromSlot;

  const title = (q.title || '').toLowerCase();
  if (title) {
    if (/вечерн/.test(title) || hasPhaseToken(title, 'вечер')) return 'evening';
    // «дневн» раньше голого «день» — «Дневная проверка…»
    if (/дневн|днём|днем|обед|середине дня|середина дня/.test(title) || hasPhaseToken(title, 'день')) {
      return 'day';
    }
    if (/утрен/.test(title) || hasPhaseToken(title, 'утро')) return 'morning';
  }

  const tp = (q.timePoint || '').toLowerCase().trim();
  if (tp === 'evening' || tp.includes('вечер')) return 'evening';
  if (tp === 'day' || tp === 'afternoon' || tp.includes('день') || tp.includes('дневн')) return 'day';
  if (tp === 'morning' || tp.includes('утро')) return 'morning';

  return stateCheckPhaseForAnswer(createdAt ?? null);
}
