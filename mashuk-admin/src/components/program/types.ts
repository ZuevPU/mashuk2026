export type ProgramEvent = {
  id: number;
  title: string;
  description?: string | null;
  descriptionHtml?: string | null;
  place?: string | null;
  dayNumber?: number | null;
  timeSlot?: string | null;
  tags?: string[] | null;
  isPublished?: boolean | null;
  dayPublished?: boolean | null;
  pushReminder?: boolean | null;
  blockType?: string | null;
  isKeyBlock?: boolean | null;
  hasSubSessions?: boolean | null;
  audienceType?: string | null;
  audienceDirectionId?: number | null;
  speakerIds?: number[] | null;
  sortOrder?: number | null;
  children?: ProgramEvent[];
  speakers?: { id: number; name: string; credentials?: string | null; initials?: string | null }[];
};

export type ThematicTag = { id: number; name: string };

export type ProgramPlace = { id: number; name: string };

export type ProgramBlockType = { id: number; key: string; name: string; sortOrder?: number };

export type ProgramSpeaker = { id: number; name: string; credentials?: string | null; initials?: string | null };

export type ScheduleDayRow = {
  id: number;
  dayNumber: number;
  isPublished?: boolean;
  displayLabel?: string | null;
  calendarDate?: string | null;
  shiftNumber?: number | null;
};

export const BLOCK_TYPE_OPTIONS: { value: string; labelKey: string }[] = [
  { value: 'session', labelKey: 'block_session' },
  { value: 'plenary', labelKey: 'block_plenary' },
  { value: 'workshop', labelKey: 'block_workshop' },
  { value: 'break', labelKey: 'block_break' },
  { value: 'key_block', labelKey: 'block_key_block' },
];

/** Parse "09:00" or "09:00-10:30" into start/end HH:MM */
export function parseTimeSlot(slot: string | null | undefined): { start: string; end: string } {
  if (!slot?.trim()) return { start: '09:00', end: '10:30' };
  const normalized = slot.replace(/\u2013|\u2014/g, '-');
  const parts = normalized.split('-').map(p => p.trim());
  const start = parts[0]?.match(/\d{1,2}:\d{2}/)?.[0] || '09:00';
  const end = parts[1]?.match(/\d{1,2}:\d{2}/)?.[0] || '';
  return { start, end: end || addMinutes(start, 90) };
}

/** Like parseTimeSlot, but empty slot → empty fields (optional nested time). */
export function parseOptionalTimeSlot(slot: string | null | undefined): { start: string; end: string } {
  if (!slot?.trim()) return { start: '', end: '' };
  return parseTimeSlot(slot);
}

/** Max nesting: root block → nested subblocks (must match backend MAX_EVENT_DEPTH). */
export const MAX_PROGRAM_NEST_DEPTH = 4;

export function nestLevelLabel(depth: number): string {
  if (depth <= 1) return 'Блок';
  return 'Подблок';
}

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

export function buildTimeSlot(start: string, end: string): string {
  if (!start) return '';
  if (end && end !== start) return `${start}-${end}`;
  return start;
}

export function eventVisibilityLabel(e: ProgramEvent): 'draft' | 'waiting_day' | 'visible' {
  if (!e.isPublished) return 'draft';
  if (!e.dayPublished) return 'waiting_day';
  return 'visible';
}

export function groupEventsBySlot(events: ProgramEvent[]): Map<string, ProgramEvent[]> {
  const sorted = [...events].sort((a, b) => (a.timeSlot || '').localeCompare(b.timeSlot || '') || a.id - b.id);
  const map = new Map<string, ProgramEvent[]>();
  for (const e of sorted) {
    const slot = e.timeSlot?.trim() || 'Без времени';
    if (!map.has(slot)) map.set(slot, []);
    map.get(slot)!.push(e);
  }
  return map;
}
