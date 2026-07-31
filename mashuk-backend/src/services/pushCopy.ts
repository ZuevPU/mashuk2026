/**
 * Тексты transactional / auto push для участников.
 * Держим коротко (лимит VK notifications.send — 254 символа).
 */

export function qTitle(title: string | null | undefined, fallback = 'без названия'): string {
  const t = (title || '').trim() || fallback;
  return t.length > 80 ? `${t.slice(0, 77)}…` : t;
}

export const pushCopy = {
  taskPendingModerator: (title: string) =>
    `Задание «${qTitle(title)}» отправлено на проверку. Напишем, когда играпрактик ответит.`,

  taskPendingTeam: (title: string) =>
    `Командное задание «${qTitle(title)}» ждёт подтверждения участников команды.`,

  taskApproved: (title: string, points?: number | null) => {
    const base = `Задание «${qTitle(title)}» принято`;
    if (points && points > 0) return `${base} · +${points} к опыту`;
    return `${base}. Отличный результат!`;
  },

  taskRejected: (title: string, comment?: string | null) => {
    const base = `Задание «${qTitle(title)}» не принято`;
    const c = (comment || '').trim();
    if (!c) return `${base}. Можно доработать и отправить снова.`;
    const short = c.length > 120 ? `${c.slice(0, 117)}…` : c;
    return `${base}: ${short}`;
  },

  teamConfirmRequest: (title: string) =>
    `Вас добавили в командное задание «${qTitle(title)}». Подтвердите участие в приложении.`,

  teamExpired: (title: string) =>
    `Заявка по заданию «${qTitle(title)}» закрыта — не все подтвердили участие вовремя.`,

  taskPublished: (title: string) =>
    `Новое задание: «${qTitle(title)}». Откройте раздел «Задания».`,

  medalForTask: (medalName: string, taskTitle: string) =>
    `Новая медаль «${qTitle(medalName)}» за задание «${qTitle(taskTitle)}».`,

  medalAwarded: (medalName: string) =>
    `Новая медаль: «${qTitle(medalName)}». Поздравляем!`,

  levelUp: (trackLabel: 'Пути' | 'Опыта', level: number) =>
    `Новый уровень ${trackLabel}: ${level}. Так держать!`,

  exchangeAnswerReceived: () =>
    'На ваш вопрос в «Обмене опытом» ответили. Загляните в приложение.',

  orgReply: (preview: string) => {
    const p = preview.trim().slice(0, 100);
    return p
      ? `Ответ организаторов: ${p}${preview.trim().length > 100 ? '…' : ''}`
      : 'Организаторы ответили на ваше обращение. Откройте приложение.';
  },

  pointsRevoked: (reason: string) =>
    `Начисления пересмотрены: ${reason.trim().slice(0, 160) || 'уточните у организаторов'}`,

  pointsBulkRevoked: (count: number, reason: string) =>
    `Организаторы пересмотрели начисления (${count}): ${reason.trim().slice(0, 140)}`,

  touchpointOpen: (label: string) =>
    `Открыта точка дня: «${qTitle(label)}». Заполните в приложении.`,

  touchpointReminder: (label: string) =>
    `Напоминание: «${qTitle(label)}» ещё можно заполнить.`,

  eventSoon: (title: string, place?: string | null) => {
    const where = place?.trim() ? ` · ${place.trim()}` : '';
    return `Скоро начнётся: «${qTitle(title)}»${where}. Через ~15 минут.`;
  },

  /** Слоты авто-рассылки (fallback, если в БД нет шаблона) */
  slots: {
    slot_0800: {
      text: 'Доброе утро! Утренняя проверка состояния открыта — займёт около минуты.',
      retryText: 'Напоминание: утренняя проверка состояния ещё открыта.',
    },
    slot_1300: {
      text: 'Дневные точки: осмысление направления и проверка состояния. Загляните в приложение.',
      retryText: 'Напоминание: дневные точки ещё можно заполнить.',
    },
    slot_1600: {
      text: 'После урока: коротко зафиксируйте впечатления в приложении.',
      retryText: 'Напоминание: рефлексия после урока ещё открыта.',
    },
    slot_1830: {
      text: 'Вечерняя проверка состояния и осмысление дня открыты.',
      retryText: 'Напоминание: вечерние точки ещё можно заполнить.',
    },
    slot_2200: {
      text: 'Финал дня: оцените день и поделитесь итогами в приложении.',
      retryText: 'Напоминание: итоговая анкета дня ещё открыта до 01:00.',
    },
    slot_2300: {
      text: 'Спокойной ночи! Если остались мысли — запишите их в копилку.',
      retryText: '',
    },
  } as const,
};

/** Старые формулировки слотов — для мягкого обновления в bootstrap */
export const LEGACY_SLOT_BODIES: Record<string, string[]> = {
  slot_0800: ['Доброе утро! 1 минута на проверку состояния'],
  slot_1300: ['Две задачи дня: осмысление направления и проверка состояния'],
  slot_1600: ['На каком уроке был? Коротко зафиксируй'],
  slot_1830: ['Вечерняя проверка состояния и осмысление'],
  slot_2200: [
    'Финал дня — оцени и поделись',
    'Финал дня — оцени и поделись. Откройте главную: #?evening=1',
  ],
  slot_2300: ['Спокойной ночи! Если остались мысли — запиши в копилку'],
};
