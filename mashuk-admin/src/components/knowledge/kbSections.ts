/** Каталог разделов БЗ — зеркало mashuk-backend/src/services/kbSections.ts */

export const KB_SECTIONS = [
  {
    key: 'thematic',
    label: 'Тематические направления',
    color: '#1D5BD6',
    tint: '#DCE8FF',
    hasDirections: true,
  },
  {
    key: 'lessons_important',
    label: 'Уроки о важном',
    color: '#7C3AED',
    tint: '#F0E7FF',
    hasDirections: false,
  },
  {
    key: 'open_lessons',
    label: 'Открытые уроки',
    color: '#0B7A4F',
    tint: '#D8F5E7',
    hasDirections: false,
    subsections: [
      { key: 'open', label: 'Открытые уроки' },
      { key: 'practices', label: 'Педагогические / наставнические практики' },
      { key: 'reverse', label: 'Уроки наоборот' },
    ],
  },
] as const;

export type KbSectionKey = (typeof KB_SECTIONS)[number]['key'];

export function kbSectionMeta(key: string | null | undefined) {
  return KB_SECTIONS.find(s => s.key === key) ?? null;
}

export function kbSubsectionOptions(section: string | null | undefined) {
  const sec = KB_SECTIONS.find(s => s.key === section);
  return sec && 'subsections' in sec ? [...sec.subsections] : [];
}

export function kbSubsectionLabel(section: string | null | undefined, sub: string | null | undefined): string {
  if (!sub) return '—';
  return kbSubsectionOptions(section).find(s => s.key === sub)?.label ?? sub;
}

const TYPE_RANK: Record<string, number> = {
  presentation: 10,
  pdf: 11,
  document: 12,
  video: 20,
  vk: 21,
  audio: 30,
  notes: 40,
  конспект: 40,
  article: 50,
  links: 60,
  resources: 61,
  link: 62,
};

function sectionRank(key: string | null | undefined): number {
  if (!key) return 90;
  const i = KB_SECTIONS.findIndex(s => s.key === key);
  return i >= 0 ? i : 80;
}

function subsectionRank(key: string | null | undefined): number {
  if (!key) return 0;
  const order = ['open', 'practices', 'reverse'];
  const i = order.indexOf(key);
  return i >= 0 ? i : 50;
}

/** Фамилия для алфавита: первое слово «Фамилия Имя …». */
export function speakerSortKey(name: string | null | undefined): string {
  const s = (name || '').trim();
  if (!s) return '\uffff';
  const primary = s.split(/[;]/)[0]?.trim() || s;
  const surname = primary.split(/\s+/)[0] || primary;
  return surname.toLocaleLowerCase('ru');
}

export function compareKbMaterials(a: {
  kbSection?: string | null;
  kbSubsection?: string | null;
  direction?: string | null;
  topicTitle?: string | null;
  title?: string | null;
  type?: string | null;
  speakerName?: string | null;
  sortOrder?: number | null;
  id?: number;
}, b: typeof a): number {
  return (
    sectionRank(a.kbSection) - sectionRank(b.kbSection)
    || subsectionRank(a.kbSubsection) - subsectionRank(b.kbSubsection)
    || (a.direction || '').localeCompare(b.direction || '', 'ru')
    || speakerSortKey(a.speakerName).localeCompare(speakerSortKey(b.speakerName), 'ru')
    || (a.speakerName || '').localeCompare(b.speakerName || '', 'ru')
    || (a.topicTitle || a.title || '').localeCompare(b.topicTitle || b.title || '', 'ru')
    || (TYPE_RANK[(a.type || '').toLowerCase()] ?? 80) - (TYPE_RANK[(b.type || '').toLowerCase()] ?? 80)
    || (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    || (a.id ?? 0) - (b.id ?? 0)
  );
}
