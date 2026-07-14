/**
 * Качественный ориентир глубины рефлексии (v1, без баллов 1–3).
 * Не показывать участнику как оценку — только аналитикам/выгрузкам.
 */
export type ReflectionDepthLabel =
  | 'Фиксация события'
  | 'Личный вывод'
  | 'Перенос в практику'
  | null;

const PRACTICE_MARKERS = /(?:в\s+класс|на\s+уроке|попробую|буду\s+примен|внедр|с\s+ученик|в\s+практик|в\s+работ[уе]|перенес)/i;
const PERSONAL_MARKERS = /(?:я\s+|мне\s+|понял|осознал|почувствовал|для\s+меня|мой\s+|моя\s+)/i;

export function inferReflectionDepth(text: string | null | undefined): ReflectionDepthLabel {
  if (!text || !String(text).trim()) return null;
  const t = String(text).trim();
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words < 8) return 'Фиксация события';
  if (PRACTICE_MARKERS.test(t)) return 'Перенос в практику';
  if (words >= 25 || PERSONAL_MARKERS.test(t)) return 'Личный вывод';
  return 'Фиксация события';
}
