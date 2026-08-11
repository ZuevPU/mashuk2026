/** Каталог разделов БЗ — зеркало backend kbSections */

export const KB_SECTIONS = [
  {
    key: 'thematic',
    label: 'Тематические направления',
    color: '#1D5BD6',
    tint: '#DCE8FF',
  },
  {
    key: 'lessons_important',
    label: 'Уроки о важном',
    color: '#7C3AED',
    tint: '#F0E7FF',
  },
  {
    key: 'open_lessons',
    label: 'Открытые уроки',
    color: '#0B7A4F',
    tint: '#D8F5E7',
    subsections: [
      { key: 'open', label: 'Открытые уроки' },
      { key: 'practices', label: 'Педагогические / наставнические практики' },
      { key: 'reverse', label: 'Уроки наоборот' },
    ],
  },
] as const;

export function kbSectionMeta(key: string | null | undefined) {
  return KB_SECTIONS.find(s => s.key === key) ?? null;
}

export function kbSubsectionLabel(section: string | null | undefined, sub: string | null | undefined): string | null {
  if (section !== 'open_lessons' || !sub) return null;
  const sec = KB_SECTIONS.find(s => s.key === 'open_lessons');
  if (!sec || !('subsections' in sec)) return sub;
  return sec.subsections.find(x => x.key === sub)?.label ?? sub;
}
