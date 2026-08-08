/** Лимит колонок push_log.delivery_status / participant_push_deliveries.vk_delivery_status. */
export const DELIVERY_STATUS_DB_MAX = 255;

/** Обрезка статуса перед записью в БД (полный текст — в server log). */
export function clipDeliveryStatus(status: string, max = DELIVERY_STATUS_DB_MAX): string {
  const s = String(status || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/** Человекочитаемая расшифровка delivery_status для админки и логов поддержки. */
export function describeDeliveryStatus(status: string): string {
  if (status === 'sent_mini') {
    return 'Доставлено: push мини-приложения (notifications.sendMessage)';
  }
  if (status === 'sent_community') {
    return 'Доставлено: личное сообщение от сообщества (messages.send)';
  }
  if (status === 'skipped_no_token' || status === 'skipped_no_service_token') {
    return 'Не отправлено: на сервере не заданы VK_SERVICE_TOKEN / VK_COMMUNITY_TOKEN';
  }
  if (status === 'skipped_no_vk_id') {
    return 'Не отправлено: у участника нет vk_id';
  }
  if (status === 'skipped_opt_out') {
    return 'Не отправлено: участник отключил этот тип уведомлений в профиле';
  }
  if (status.includes('rate_limited')) {
    return 'VK API: превышен лимит запросов — повторите позже';
  }

  if (status.includes(';')) {
    const parts = status.split(';').map(s => describeDeliveryStatus(s.trim()));
    return parts.join(' → ');
  }

  const lower = status.toLowerCase();
  if (/\bcode_2\b/i.test(status) || lower.includes('за последний час') || lower.includes('per hour')) {
    return 'VK: лимит уведомлений мини-приложения за час (code 2) — пробуем ЛС сообщества';
  }
  if (/\bcode_3\b/i.test(status) || (lower.includes('за последн') && lower.includes('сут')) || lower.includes('per day')) {
    return 'VK: лимит уведомлений мини-приложения за сутки (code 3) — пробуем ЛС сообщества';
  }
  if (/\bcode_1\b/i.test(status)) {
    return 'VK: у пользователя выключены уведомления мини-приложения (code 1)';
  }
  if (/\bcode_4\b/i.test(status)) {
    return 'VK: приложение не установлено или пользователь неактивен (code 4)';
  }
  if (lower.includes('unknown method')) {
    return 'VK: неверный метод API уведомлений — нужен notifications.sendMessage и актуальный сервисный ключ приложения';
  }
  if (lower.includes('notifications are disabled') || lower.includes('уведомления приложения отключены')) {
    return 'VK: у пользователя выключены уведомления мини-приложения — «Разрешить уведомления VK» в профиле';
  }
  if (lower.includes('send rate exceeded') || lower.includes('лимит уведомлений')) {
    return 'VK: превышен лимит уведомлений мини-приложения для этого пользователя — пробуем ЛС сообщества';
  }
  if (lower.includes("can't send messages") || lower.includes('without permission') || lower.includes('901') || lower.includes('917')) {
    return 'VK: нельзя написать в ЛС — пользователь не писал сообществу или закрыл сообщения';
  }
  if (lower.includes('access denied') || lower.includes('invalid access')) {
    return 'VK: неверный или просроченный токен — проверьте ключи в .env.production и перезапустите backend';
  }
  if (lower.includes('notification') && lower.includes('disabled')) {
    return 'VK: у пользователя выключены уведомления мини-приложения — «Разрешить уведомления VK» в профиле';
  }

  if (status.startsWith('error:')) {
    return `Ошибка VK: ${status.slice('error:'.length).trim()}`;
  }
  return status;
}

export function isPushDeliveredOk(status: string): boolean {
  return status === 'sent_mini' || status === 'sent_community' || status === 'ok';
}

export function shouldLogPushDeliveryIssue(status: string): boolean {
  if (isPushDeliveredOk(status)) return false;
  if (status.startsWith('skipped_')) return false;
  return true;
}
