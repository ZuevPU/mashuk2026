/** Московское время и фазы дня (ТЗ v11) */

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** До 02:00 МСК считаем «операционным» предыдущий календарный день (догон точек). */
export const FORUM_DAY_ROLLOVER_HOUR_MSK = 2;

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

/** Календарный ключ для номера дня форума (сдвиг до 02:00 МСК). */
export function getForumOperationalDateKey(now = new Date()): string {
  const parts = getMoscowParts(now);
  if (parts.hours >= FORUM_DAY_ROLLOVER_HOUR_MSK) return parts.dateKey;
  const msk = new Date(now.getTime() + MSK_OFFSET_MS);
  msk.setUTCDate(msk.getUTCDate() - 1);
  const y = msk.getUTCFullYear();
  const mo = String(msk.getUTCMonth() + 1).padStart(2, '0');
  const d = String(msk.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/** утро < 09:30 · день 09:30–20:00 · вечер ≥ 20:00 */
export function getMoscowPhase(now = new Date()): 'morning' | 'day' | 'evening' {
  const { totalMinutes } = getMoscowParts(now);
  if (totalMinutes < 9 * 60 + 30) return 'morning';
  if (totalMinutes < 20 * 60) return 'day';
  return 'evening';
}

/** Окно итоговой анкеты по умолчанию: с 22:00 МСК (см. opensAtMsk в конфиге смены). */
export function isEveningWrapWindow(now = new Date()): boolean {
  const { totalMinutes } = getMoscowParts(now);
  return totalMinutes >= 22 * 60;
}

/** Какую «Проверку состояния» показывать первой на главной (МСК). */
export type StateCheckPhase = 'утро' | 'день' | 'вечер' | 'ночь';

export function getPreferredStateCheckPhase(now = new Date()): StateCheckPhase {
  const { totalMinutes } = getMoscowParts(now);
  if (totalMinutes < 13 * 60) return 'утро';
  if (totalMinutes < 18 * 60) return 'день';
  if (totalMinutes < 22 * 60) return 'вечер';
  return 'ночь';
}

const STATE_CHECK_PRIORITY: Record<StateCheckPhase, ('утро' | 'день' | 'вечер')[]> = {
  утро: ['утро', 'день', 'вечер'],
  день: ['день', 'утро', 'вечер'],
  вечер: ['вечер', 'день', 'утро'],
  ночь: ['вечер', 'день', 'утро'],
};

/** Порядок timePoint для незакрытых проверок состояния текущего дня. */
export function stateCheckTimePointOrder(now = new Date()): ('утро' | 'день' | 'вечер')[] {
  return STATE_CHECK_PRIORITY[getPreferredStateCheckPhase(now)];
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
  const nowKey = getForumOperationalDateKey(now);
  const startUtc = Date.parse(`${startParts.dateKey}T00:00:00+03:00`);
  const nowUtc = Date.parse(`${nowKey}T00:00:00+03:00`);
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
/** Календарная дата дня форума (подпись для UI, МСК). */
export function getForumDayDateLabel(
  startDate: Date | null | undefined,
  dayNumber: number,
): string | null {
  if (!startDate || dayNumber < 1) return null;
  const startParts = getMoscowParts(startDate);
  const baseMs = Date.parse(`${startParts.dateKey}T12:00:00+03:00`);
  if (Number.isNaN(baseMs)) return null;
  const dayMs = baseMs + (dayNumber - 1) * 86_400_000;
  return new Date(dayMs).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Moscow',
  });
}

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

/** День для «сейчас / будущее» в расписании: календарь по startDate, без завышенного admin currentDay. */
export function resolveLiveScheduleDay(
  settings: { currentDay?: number | null; totalDays?: number | null; startDate?: Date | null },
  now = new Date(),
): number {
  const adminDay = settings.currentDay ?? 1;
  const total = settings.totalDays ?? 8;
  const startDate = settings.startDate ?? null;
  if (startDate) {
    const startParts = getMoscowParts(startDate);
    const nowKey = getForumOperationalDateKey(now);
    const startUtc = Date.parse(`${startParts.dateKey}T00:00:00+03:00`);
    const nowUtc = Date.parse(`${nowKey}T00:00:00+03:00`);
    if (!Number.isNaN(startUtc) && !Number.isNaN(nowUtc)) {
      const calendarDay = Math.floor((nowUtc - startUtc) / 86_400_000) + 1;
      // Calendar controls live status only during the configured shift window.
      // Before/after that window, the admin-selected day is the reliable source
      // (important for live rehearsals and shifts with a stale startDate).
      if (calendarDay >= 1 && calendarDay <= total) return calendarDay;
    }
  }
  if (adminDay >= 1 && adminDay <= total) return adminDay;
  return resolveEffectiveCurrentDay(settings, now);
}

/**
 * Calendar date to use for the live schedule's wall clock.
 * During the configured shift window it follows startDate. Outside that
 * window the admin-selected live day is treated as running today.
 */
export function resolveLiveScheduleDateKey(
  settings: { currentDay?: number | null; totalDays?: number | null; startDate?: Date | null },
  liveScheduleDay: number,
  now = new Date(),
  explicitDayDate?: Date | null,
): string {
  const total = settings.totalDays ?? 8;
  const startDate = settings.startDate ?? null;
  if (startDate) {
    const startParts = getMoscowParts(startDate);
    const nowKey = getForumOperationalDateKey(now);
    const startUtc = Date.parse(`${startParts.dateKey}T00:00:00+03:00`);
    const nowUtc = Date.parse(`${nowKey}T00:00:00+03:00`);
    if (!Number.isNaN(startUtc) && !Number.isNaN(nowUtc)) {
      const calendarDay = Math.floor((nowUtc - startUtc) / 86_400_000) + 1;
      if (calendarDay >= 1 && calendarDay <= total) {
        if (explicitDayDate) return getMoscowParts(explicitDayDate).dateKey;
        const liveDateMs = startUtc + (liveScheduleDay - 1) * 86_400_000;
        return getMoscowParts(new Date(liveDateMs)).dateKey;
      }
    }
  }
  return getForumOperationalDateKey(now);
}

/**
 * Day whose published events drive «Сейчас» / «Далее» on Home and the default
 * day in Program.
 *
 * Target = effective forum day (max of admin currentDay and calendar).
 * Among published days, pick the latest published day ≤ target.
 * If the next day after target is already published, prefer it — so publishing
 * day N+1 opens that day on Home/Program without leaving day 1 stuck.
 */
export function resolveLiveProgramDay(
  settings: { currentDay?: number | null; totalDays?: number | null; startDate?: Date | null },
  publishedDays: number[],
  now = new Date(),
): number {
  const target = resolveEffectiveCurrentDay(settings, now);
  const published = [...new Set(publishedDays.filter(d => Number.isInteger(d) && d > 0))].sort((a, b) => a - b);
  if (!published.length) return target;

  const nextPublished = target + 1;
  if (published.includes(nextPublished)) return nextPublished;

  const atOrBeforeTarget = published.filter(d => d <= target);
  if (atOrBeforeTarget.length) return atOrBeforeTarget[atOrBeforeTarget.length - 1];

  // All published days are after the target (early publish) — show earliest.
  return published[0];
}

/**
 * Forum day for Home focus / touchpoints / question list.
 * Aligns with published schedule so publishing day N does not leave
 * yesterday's points visible when currentDay lag or cache is stale.
 */
export function resolveParticipantForumDay(
  settings: { currentDay?: number | null; totalDays?: number | null; startDate?: Date | null },
  publishedDays: number[],
  now = new Date(),
): number {
  return Math.max(
    resolveEffectiveCurrentDay(settings, now),
    resolveLiveProgramDay(settings, publishedDays, now),
  );
}

/**
 * Как долго можно отвечать после closeTime:
 * - hard_close — сразу закрыть (проверка состояния)
 * - until_midnight — до 00:00 МСК дня окна (точки осмысления)
 * - until_day_rollover — до смены форумного дня (~02:00 МСК), как раньше
 * - until_admin — не закрывается само; убирает только админ (после блоков)
 */
export type LateAnswerPolicy = 'hard_close' | 'until_midnight' | 'until_day_rollover' | 'until_admin';

export function lateAnswerPolicyForQuestion(q: {
  type?: string | null;
  block?: string | null;
  title?: string | null;
  reflectionKind?: string | null;
  questionKind?: string | null;
}): LateAnswerPolicy {
  const block = (q.block || '').trim().toLowerCase();
  const title = (q.title || '').toLowerCase();
  const kind = String(q.reflectionKind || q.questionKind || '').toLowerCase();

  if (
    q.type === 'checkin'
    || kind === 'state_check'
    || block === 'проверка состояния'
    || block.includes('проверк')
  ) {
    return 'hard_close';
  }

  // «После блоков» / практики — висят, пока админ не снимет с публикации
  if (kind === 'after_blocks' || kind === 'practices_vote') {
    return 'until_admin';
  }

  if (
    kind === 'after_event'
    || block === 'точки осмысления'
    || block.includes('точки осмысления')
    || title.includes('осмысление')
  ) {
    return 'until_midnight';
  }

  return 'until_day_rollover';
}

/** 00:00 МСК следующего календарного дня после даты closeTime (или сам closeTime, если он уже полночь). */
export function moscowAnswerDeadline(closeTime: Date): Date {
  const p = getMoscowParts(closeTime);
  if (p.totalMinutes === 0) {
    return new Date(closeTime.getTime());
  }
  const [y, m, d] = p.dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0) - MSK_OFFSET_MS);
}

/**
 * Точка осмысления / проверка состояния:
 * - dayNumber < effectiveCurrentDay → locked (день закончился / прошёл)
 * - dayNumber > effectiveCurrentDay → soon
 * - publishTime > now → soon (ещё не открылось)
 * - closeTime < now → overdue или locked в зависимости от LateAnswerPolicy
 */
export function getTouchpointAccess(
  questionDay: number | null | undefined,
  currentDay: number,
  closeTime: Date | null | undefined,
  now = new Date(),
  publishTime?: Date | null,
  latePolicy: LateAnswerPolicy = 'until_day_rollover',
): 'open' | 'overdue' | 'locked' | 'soon' {
  const qDay = questionDay ?? currentDay;

  // Админ закрывает вручную — прошлый день и closeTime не лочат ответ
  if (latePolicy === 'until_admin') {
    if (publishTime && publishTime > now) return 'soon';
    if (qDay > currentDay) return 'soon';
    if (closeTime && closeTime < now) return 'overdue';
    return 'open';
  }

  if (qDay < currentDay) return 'locked';
  if (qDay > currentDay) return 'soon';
  if (publishTime && publishTime > now) return 'soon';
  if (closeTime && closeTime < now) {
    if (latePolicy === 'hard_close') return 'locked';
    if (latePolicy === 'until_midnight') {
      return now >= moscowAnswerDeadline(closeTime) ? 'locked' : 'overdue';
    }
    return 'overdue';
  }
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

export function isSameMoscowCalendarDay(a: Date, b = new Date()): boolean {
  return getMoscowParts(a).dateKey === getMoscowParts(b).dateKey;
}
