import { getRoleMeta } from '../roleService.js';

/**
 * Max rows for sync participant exports.
 * Default: no cap (all rows). Set PARTICIPANT_EXPORT_MAX_ROWS to a positive number to clamp.
 * Set EXPORT_MAX_PARTICIPANTS for ZIP archives (same default: unlimited).
 */
export function participantExportMaxRows(): number | null {
  const raw = process.env.PARTICIPANT_EXPORT_MAX_ROWS;
  if (raw == null || raw === '' || raw === '0' || raw.toLowerCase() === 'unlimited') {
    return null;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export function archiveExportMaxParticipants(): number | null {
  const raw = process.env.EXPORT_MAX_PARTICIPANTS;
  if (raw == null || raw === '' || raw === '0' || raw.toLowerCase() === 'unlimited') {
    return null;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export function roleLabel(roleKey: string | null | undefined): string {
  if (!roleKey) return '';
  return getRoleMeta(roleKey)?.name ?? roleKey;
}

export function roleLabelsList(keys: Array<string | null | undefined>): string {
  return keys.map(roleLabel).filter(Boolean).join(', ');
}

export function dayModeLabel(startRole: string | null | undefined, active: string | null | undefined): string {
  if (!active || !startRole) return '';
  return active === startRole ? 'Исследует свою роль' : 'Усиливает другую роль';
}

export function experimentStatusLabel(status: string | null | undefined): string {
  switch (String(status ?? '').toLowerCase()) {
    case 'none': return 'Нет';
    case 'in_progress': return 'В процессе';
    case 'done': return 'Выполнен';
    case 'skipped': return 'Пропущен';
    default: return status ? String(status) : '';
  }
}

export function submissionStatusLabel(status: string | null | undefined): string {
  switch (String(status ?? '').toLowerCase()) {
    case 'pending': return 'На проверке';
    case 'pending_team': return 'Ожидает команду';
    case 'approved': return 'Принято';
    case 'rejected': return 'Отклонено';
    case 'expired': return 'Истекло';
    default: return status ? String(status) : '';
  }
}

/** Russian column headers for full participants workbook/CSV. */
export const PARTICIPANTS_FULL_HEADERS_RU = [
  'ID',
  'ФИО',
  'VK ID',
  'Возраст',
  'Направление',
  'Группа',
  'Место работы',
  'Должность',
  'Дата регистрации',
  'Последняя активность',
  'Заблокирован',
  'Баллы Путь',
  'Баллы Опыт',
  'Бонусные баллы',
  'Суммарный рейтинг',
  'Уровень Путь',
  'Уровень Опыт',
  'Идеи в копилке',
  'Согласие ПД',
  'Согласие аналитика',
  'Версия согласия ПД',
  'Версия согласия аналитика',
  'Дата согласия',
  'Точка А (ответы)',
  'Точка Б (ответы)',
  'Роль на входе',
  'Сильная роль',
  'Роль роста',
  'Следующий эксперимент',
  'Интересы',
  'Ответы диагностики',
] as const;
