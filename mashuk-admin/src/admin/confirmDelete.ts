/** Единые тексты подтверждения необратимого удаления в админке. */
export const CONFIRM_DELETE_ENTITY = 'Точно удалить? Действие необратимо.';

export function confirmDelete(message: string = CONFIRM_DELETE_ENTITY): boolean {
  return window.confirm(message);
}

export const CONFIRM_DELETE_PARTICIPANT =
  'Удалить участника БЕЗВОЗВРАТНО из базы?\n\n'
  + 'Запись исчезнет полностью и НЕ появится в списке «Удалили профиль». '
  + 'Если нужно только закрыть доступ — используйте «Исключить из программы».';

export const CONFIRM_REMOVE_FROM_PROGRAM =
  'Исключить участника из программы?\n\n'
  + 'Доступ к приложению закроется, ответы и баллы сохранятся. '
  + 'Участник появится во вкладке «Удалили профиль» — его можно будет восстановить.';

export const CONFIRM_BLOCK_PARTICIPANT =
  'Заблокировать участника? Он увидит экран «Доступ ограничен» и не сможет пользоваться приложением.';

export const CONFIRM_DELETE_EVENT = 'Удалить событие? Действие необратимо.';
export const CONFIRM_DELETE_SUBTOPIC = 'Удалить под-тему?';
