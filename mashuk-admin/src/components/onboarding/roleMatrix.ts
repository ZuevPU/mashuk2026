import type { RoleKey } from './roleMatrixTypes';

export type MatrixRow = 'leader' | 'org';
export type MatrixCol = 'thinking' | 'actions' | 'people';

export const ROLE_MATRIX: Record<MatrixRow, Record<MatrixCol, RoleKey>> = {
  leader: {
    thinking: 'meaning_researcher',
    actions: 'practice_realizer',
    people: 'communication_guide',
  },
  org: {
    thinking: 'content_packer',
    actions: 'process_navigator',
    people: 'environment_keeper',
  },
};

export const MATRIX_ROW_LABELS: Record<MatrixRow, string> = {
  leader: 'Лидерский (вовне)',
  org: 'Организационный (внутри группы)',
};

export const MATRIX_COL_LABELS: Record<MatrixCol, string> = {
  thinking: 'Мышление',
  actions: 'Действия',
  people: 'Люди',
};

export const DEFAULT_ROLE_ICONS: Record<RoleKey, string> = {
  meaning_researcher: '🔍',
  practice_realizer: '⚡',
  communication_guide: '🤝',
  content_packer: '📋',
  process_navigator: '🧭',
  environment_keeper: '🌿',
};

export function roleIcon(role: { roleKey: string; iconKey?: string | null }): string {
  const key = role.roleKey as RoleKey;
  return role.iconKey?.trim() || DEFAULT_ROLE_ICONS[key] || '◆';
}

export function essencePreview(text?: string | null, max = 80): string {
  const s = (text || '').trim();
  if (s.length <= max) return s || '—';
  return `${s.slice(0, max)}…`;
}
