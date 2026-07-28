/** Единые тексты подтверждения необратимого удаления в админке. */
export const CONFIRM_DELETE_ENTITY = 'Точно удалить? Действие необратимо.';

export function confirmDelete(message: string = CONFIRM_DELETE_ENTITY): boolean {
  return window.confirm(message);
}

export const CONFIRM_DELETE_PARTICIPANT =
  'Удалить участника безвозвратно? Все данные регистрации будут сброшены.';

export const CONFIRM_DELETE_EVENT = 'Удалить событие? Действие необратимо.';
export const CONFIRM_DELETE_SUBTOPIC = 'Удалить под-тему?';
