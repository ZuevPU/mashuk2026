/** Московское время и фазы дня (ТЗ v11) */

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Часы/минуты в Europe/Moscow без зависимости от TZ сервера */
export function getMoscowParts(now = new Date()): { hours: number; minutes: number; totalMinutes: number; dateKey: string } {
  const msk = new Date(now.getTime() + MSK_OFFSET_MS);
  const hours = msk.getUTCHours();
  const minutes = msk.getUTCMinutes();
  const y = msk.getUTCFullYear();
  const mo = String(msk.getUTCMonth() + 1).padStart(2, '0');
  const d = String(msk.getUTCDate()).padStart(2, '0');
  return {
    hours,
    minutes,
    totalMinutes: hours * 60 + minutes,
    dateKey: `${y}-${mo}-${d}`,
  };
}

/** утро < 09:30 · день 09:30–20:00 · вечер ≥ 20:00 */
export function getMoscowPhase(now = new Date()): 'morning' | 'day' | 'evening' {
  const { totalMinutes } = getMoscowParts(now);
  if (totalMinutes < 9 * 60 + 30) return 'morning';
  if (totalMinutes < 20 * 60) return 'day';
  return 'evening';
}

/** Окно итоговой анкеты / завершения дня: 22:00–00:00 МСК */
export function isEveningWrapWindow(now = new Date()): boolean {
  const { totalMinutes } = getMoscowParts(now);
  return totalMinutes >= 22 * 60;
}

/**
 * Календарный день форума по startDate (день 1 = дата старта в МСК).
 * После полуночи МСК следующего календарного дня номер растёт.
 */
export function getCalendarForumDay(
  startDate: Date | null | undefined,
  now = new Date(),
  totalDays = 8,
): number | null {
  if (!startDate) return null;
  const startParts = getMoscowParts(startDate);
  const nowParts = getMoscowParts(now);
  const startUtc = Date.parse(`${startParts.dateKey}T00:00:00+03:00`);
  const nowUtc = Date.parse(`${nowParts.dateKey}T00:00:00+03:00`);
  if (Number.isNaN(startUtc) || Number.isNaN(nowUtc)) return null;
  const diff = Math.floor((nowUtc - startUtc) / 86_400_000) + 1;
  if (diff < 1) return 1;
  if (diff > totalDays) return totalDays;
  return diff;
}

/**
 * Эффективный текущий день: max(admin currentDay, календарный день по startDate).
 * После 00:00 МСК прошлый день форума считается завершённым → точки locked.
 */
export function resolveEffectiveCurrentDay(
  settings: { currentDay?: number | null; totalDays?: number | null; startDate?: Date | null },
  now = new Date(),
): number {
  const adminDay = settings.currentDay ?? 1;
  const total = settings.totalDays ?? 8;
  const cal = getCalendarForumDay(settings.startDate ?? null, now, total);
  if (cal == null) return adminDay;
  return Math.min(total, Math.max(adminDay, cal));
}

/**
 * Точка осмысления:
 * - dayNumber < effectiveCurrentDay → locked (день закончился / прошёл)
 * - dayNumber > effectiveCurrentDay → soon
 * - publishTime > now → soon (ещё не открылось)
 * - closeTime < now на текущем дне → overdue (можно до смены дня)
 */
export function getTouchpointAccess(
  questionDay: number | null | undefined,
  currentDay: number,
  closeTime: Date | null | undefined,
  now = new Date(),
  publishTime?: Date | null,
): 'open' | 'overdue' | 'locked' | 'soon' {
  const qDay = questionDay ?? currentDay;
  if (qDay < currentDay) return 'locked';
  if (qDay > currentDay) return 'soon';
  if (publishTime && publishTime > now) return 'soon';
  if (closeTime && closeTime < now) return 'overdue';
  return 'open';
}

export type TouchpointUiStatus = 'pending' | 'active' | 'done' | 'overdue' | 'locked';

export function toTouchpointUiStatus(
  access: ReturnType<typeof getTouchpointAccess>,
  answered: boolean,
): TouchpointUiStatus {
  if (answered) return 'done';
  if (access === 'locked') return 'locked';
  if (access === 'overdue') return 'overdue';
  if (access === 'soon') return 'pending';
  return 'active';
}
