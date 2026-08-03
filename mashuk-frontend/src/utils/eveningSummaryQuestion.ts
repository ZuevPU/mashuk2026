/** True for the daily «Итоговая анкета» touchpoint stub (slot 7 / Итоги дня). */
export function isEveningDaySummaryQuestion(q: {
  title?: string | null;
  block?: string | null;
  text?: string | null;
}): boolean {
  const block = (q.block || '').toLowerCase();
  const title = (q.title || '').toLowerCase();
  if (block.includes('итоги дня')) return true;
  if (/итоговая анкета/i.test(q.title || '')) return true;
  if (title.includes('итоги дня')) return true;
  return false;
}

export function isPointBQuestion(q: {
  title?: string | null;
  block?: string | null;
}): boolean {
  const block = (q.block || '').toLowerCase();
  const title = (q.title || '').toLowerCase();
  if (block.includes('точка б')) return true;
  if (/точка\s*б/i.test(q.title || '')) return true;
  if (title.includes('point b')) return true;
  return false;
}
