/** Смена 2: повторный выбор интересов для уже зарегистрированных участников. */

export function isSecondShift(shift: { code?: string | null; name?: string | null } | null | undefined): boolean {
  if (!shift) return false;
  if (String(shift.code || '').trim().toLowerCase() === 'shift2') return true;
  return /смена\s*2\b/i.test(String(shift.name || ''));
}

export function normalizeInterestList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const tag = String(item ?? '').trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export function countValidInterests(interests: unknown, allowed: Set<string>): number {
  if (allowed.size === 0) return 0;
  return normalizeInterestList(interests).filter(tag => allowed.has(tag)).length;
}

export function needsShift2InterestsReselection(opts: {
  onboardingCompleted: boolean;
  shift: { code?: string | null; name?: string | null } | null | undefined;
  interestsReselectedAt?: Date | string | null;
  interests: unknown;
  interestMin: number;
  allowedTags: Set<string>;
}): boolean {
  if (!opts.onboardingCompleted) return false;
  if (!isSecondShift(opts.shift)) return false;
  if (opts.allowedTags.size === 0) return false;
  const valid = countValidInterests(opts.interests, opts.allowedTags);
  if (valid < Math.max(1, opts.interestMin)) return true;
  return !opts.interestsReselectedAt;
}
