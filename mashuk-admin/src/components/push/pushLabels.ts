/** Человекочитаемые подписи для раздела «Уведомления» — без технических ключей в UI. */

export const PUSH_AUTO_SCHEDULE = [
  {
    time: '08:00',
    slotKey: 'slot_0800',
    title: 'Утро',
    description: 'Проверка состояния в начале дня. Если участник пропустил — мягкое напоминание через 30 мин.',
  },
  {
    time: '13:00',
    slotKey: 'slot_1300',
    title: 'День',
    description: 'Дневные точки: осмысление направления и проверка состояния (две задачи в одном сообщении).',
  },
  {
    time: '16:00',
    slotKey: 'slot_1600',
    title: 'После урока',
    description: 'Рефлексия после занятия — короткая запись в приложении.',
  },
  {
    time: '18:30',
    slotKey: 'slot_1830',
    title: 'Вечер',
    description: 'Вечерняя проверка состояния и осмысление дня.',
  },
  {
    time: '22:00',
    slotKey: 'slot_2200',
    title: 'Итоги дня',
    description: 'Финальная анкета дня. До 22:00 раздел «Итоги» в приложении не открывается.',
  },
  {
    time: '23:00',
    slotKey: 'slot_2300',
    title: 'Спокойной ночи',
    description: 'Опциональное сообщение перед сном. Включается переключателем ниже.',
    optional: true as boolean,
  },
] as const;

/** Что бот отправляет сам — справка для организатора (редактируется только там, где указано). */
export const PUSH_SYSTEM_EVENTS = [
  {
    group: 'Точки дня (вопросы)',
    items: [
      'В начале окна каждого опубликованного вопроса — напоминание открыть точку.',
      'Если участник не ответил — одно мягкое напоминание через 30 минут.',
      'Тексты зависят от названия вопроса; время окна задаётся при публикации вопроса.',
    ],
  },
  {
    group: 'Программа форума',
    items: [
      'За 10–15 минут до ключевого блока — напоминание о начале (если у события включено «Push-напоминание»).',
      'Для других типов блоков — настраивается галочками ниже.',
    ],
  },
  {
    group: 'Задания',
    items: [
      'Новое задание — если при публикации включён «Push при публикации».',
      'Отправка на проверку, одобрение, отклонение — участнику автоматически.',
      'Командное задание — запрос подтверждения каждому члену команды.',
    ],
  },
  {
    group: 'Медали и уровни',
    items: [
      'Автоматическая или ручная медаль — поздравление участнику.',
      'Переход на новый уровень Пути или Опыта — короткое уведомление.',
    ],
  },
  {
    group: 'Обмен и организация',
    items: [
      'Ответ на вопрос в «Обмене опытом».',
      'Ответ организаторов в обращении.',
      'Пересмотр начислений баллов администратором.',
    ],
  },
] as const;

export function pushTriggerLabel(triggerType: string | null | undefined): string {
  if (!triggerType) return '—';
  const t = triggerType.trim();

  const slotMatch = t.match(/^auto_slot_(\d{4})$/i);
  if (slotMatch) {
    const key = `slot_${slotMatch[1]}`;
    return PUSH_AUTO_SCHEDULE.find(s => s.slotKey === key)?.title
      ? `${PUSH_AUTO_SCHEDULE.find(s => s.slotKey === key)!.title} · авто`
      : `Авто-слот ${slotMatch[1].slice(0, 2)}:${slotMatch[1].slice(2)}`;
  }
  if (t.startsWith('auto_retry_slot_')) {
    return 'Повтор · пропущенная точка дня';
  }
  if (t.startsWith('touchpoint_open_')) return 'Открытие точки дня';
  if (t.startsWith('touchpoint_retry_')) return 'Напоминание · точка дня';
  if (t.startsWith('event_reminder_')) return 'Программа · скоро начнётся';
  if (t === 'task_publish' || t.startsWith('transactional_task_pending')) return 'Задание · на проверке';
  if (t === 'transactional_task_approved') return 'Задание · принято';
  if (t === 'transactional_task_rejected') return 'Задание · не принято';
  if (t.startsWith('team_confirm_')) return 'Командное задание · подтверждение';
  if (t.startsWith('team_expired_')) return 'Командное задание · истекло';
  if (t.startsWith('transactional_medal') || t === 'medal_award') return 'Медаль';
  if (t === 'transactional_level_up') return 'Новый уровень';
  if (t === 'transactional_exchange_answer_received') return 'Обмен опытом · ответ';
  if (t === 'org_reply') return 'Ответ организаторов';
  if (t.startsWith('points_revoke') || t.startsWith('points_bulk_revoke')) return 'Пересмотр баллов';
  if (t.startsWith('question_publish')) return 'Новый вопрос дня';
  if (t.startsWith('admin_campaign_')) return 'Рассылка администратора';
  if (t.startsWith('admin_test_')) return 'Тестовая отправка';
  if (t.startsWith('admin_manual') || t.startsWith('admin_bulk') || t === 'manual') return 'Сообщение от администратора';
  if (t.startsWith('queue_')) return 'Из очереди';
  return t;
}

export function deliveryStatusShort(status: string | null | undefined): string {
  if (!status) return '—';
  if (status === 'sent_mini') return '✓ Доставлено в приложение';
  if (status === 'sent_community') return '✓ Личное сообщение VK';
  if (status.startsWith('skipped_opt_out')) return 'Отключено участником';
  if (status.startsWith('skipped_no_vk')) return 'Нет VK ID';
  if (status.startsWith('skipped_no_token') || status.startsWith('skipped_no_service')) {
    return 'Не настроены ключи VK';
  }
  if (status.includes(';')) {
    if (/community_probe:sent_community/.test(status)) return '✓ Mini + ЛС сообщества';
    if (/community_probe:/.test(status) && /sent_mini/.test(status)) {
      return '✓ Mini; ЛС: ошибка (см. подсказку)';
    }
    if (/(^|;\s*)sent_community/.test(status)) return '✓ Личное сообщение VK';
    if (/(^|;\s*)sent_mini/.test(status)) return '✓ Доставлено в приложение';
    if (/code_2|code_3|rate|лимит/i.test(status)) return 'Лимит VK → ошибка ЛС';
    return 'Ошибка mini → ЛС';
  }
  if (/code_2|за последний час/i.test(status)) return 'Лимит VK (час)';
  if (/code_3|сутк/i.test(status)) return 'Лимит VK (сутки)';
  if (status.startsWith('error:')) return 'Ошибка доставки';
  if (status.startsWith('batch:')) return `Рассылка (${status.slice(6)})`;
  return status.length > 40 ? `${status.slice(0, 39)}…` : status;
}
