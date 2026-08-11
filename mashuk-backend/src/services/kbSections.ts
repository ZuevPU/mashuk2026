/** Разделы базы знаний (фиксированный каталог). */

export const KB_SECTIONS = [
  {
    key: 'thematic',
    label: 'Тематические направления',
    color: '#2F6FED',
    tint: '#EAF1FF',
    hasDirections: true,
  },
  {
    key: 'lessons_important',
    label: 'Уроки о важном',
    color: '#C45C26',
    tint: '#FFF1E8',
    hasDirections: false,
  },
  {
    key: 'open_lessons',
    label: 'Открытые уроки',
    color: '#0F8A5F',
    tint: '#E8F7F0',
    hasDirections: false,
    subsections: [
      { key: 'open', label: 'Открытые уроки' },
      { key: 'practices', label: 'Педагогические / наставнические практики' },
      { key: 'reverse', label: 'Уроки наоборот' },
    ],
  },
] as const;

export type KbSectionKey = (typeof KB_SECTIONS)[number]['key'];
export type KbSubsectionKey = 'open' | 'practices' | 'reverse';

const SECTION_KEYS = new Set<string>(KB_SECTIONS.map(s => s.key));
const SUBSECTION_KEYS = new Set<string>(['open', 'practices', 'reverse']);

/** Порядок типов артефактов внутри одной темы. */
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

export function isKbSectionKey(v: unknown): v is KbSectionKey {
  return typeof v === 'string' && SECTION_KEYS.has(v);
}

export function isKbSubsectionKey(v: unknown): v is KbSubsectionKey {
  return typeof v === 'string' && SUBSECTION_KEYS.has(v);
}

export function normalizeKbSection(raw: unknown): KbSectionKey | null {
  if (raw == null || raw === '') return null;
  const v = String(raw).trim();
  return isKbSectionKey(v) ? v : null;
}

export function normalizeKbSubsection(
  section: KbSectionKey | null,
  raw: unknown,
): KbSubsectionKey | null {
  if (section !== 'open_lessons') return null;
  if (raw == null || raw === '') return null;
  const v = String(raw).trim();
  return isKbSubsectionKey(v) ? v : null;
}

export function kbSectionMeta(key: string | null | undefined) {
  return KB_SECTIONS.find(s => s.key === key) ?? null;
}

export function kbSubsectionLabel(section: string | null | undefined, sub: string | null | undefined): string | null {
  if (section !== 'open_lessons' || !sub) return null;
  const sec = KB_SECTIONS.find(s => s.key === 'open_lessons');
  const found = sec && 'subsections' in sec
    ? sec.subsections.find(x => x.key === sub)
    : undefined;
  return found?.label ?? sub;
}

export function materialTypeRank(type: string | null | undefined): number {
  if (!type) return 99;
  return TYPE_RANK[type.toLowerCase()] ?? 80;
}

export type KbSortableMaterial = {
  kbSection?: string | null;
  kbSubsection?: string | null;
  direction?: string | null;
  topicTitle?: string | null;
  speakerName?: string | null;
  sortOrder?: number | null;
  type?: string | null;
  title?: string | null;
  id?: number;
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

/** Стабильная сортировка: раздел → подраздел → направление → тема → тип → sortOrder → id. */
export function compareKbMaterials(a: KbSortableMaterial, b: KbSortableMaterial): number {
  return (
    sectionRank(a.kbSection) - sectionRank(b.kbSection)
    || subsectionRank(a.kbSubsection) - subsectionRank(b.kbSubsection)
    || (a.direction || '').localeCompare(b.direction || '', 'ru')
    || (a.topicTitle || a.title || '').localeCompare(b.topicTitle || b.title || '', 'ru')
    || (a.speakerName || '').localeCompare(b.speakerName || '', 'ru')
    || materialTypeRank(a.type) - materialTypeRank(b.type)
    || (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    || (a.id ?? 0) - (b.id ?? 0)
  );
}

export function topicGroupKey(m: {
  topicTitle?: string | null;
  title?: string | null;
  speakerName?: string | null;
  speakerIds?: unknown;
}): string {
  const topic = (m.topicTitle || m.title || '').trim().toLowerCase();
  const ids = Array.isArray(m.speakerIds)
    ? [...m.speakerIds].map(Number).filter(Number.isFinite).sort((a, b) => a - b).join(',')
    : '';
  const speaker = (m.speakerName || '').trim().toLowerCase();
  return `${topic}\0${ids || speaker}`;
}

export function publicKbSectionsCatalog() {
  return KB_SECTIONS.map(s => ({
    key: s.key,
    label: s.label,
    color: s.color,
    tint: s.tint,
    hasDirections: s.hasDirections,
    subsections: 'subsections' in s
      ? s.subsections.map(x => ({ key: x.key, label: x.label }))
      : [],
  }));
}
