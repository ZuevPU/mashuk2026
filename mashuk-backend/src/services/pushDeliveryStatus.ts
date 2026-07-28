/** Человекочитаемая расшифровка delivery_status для админки и логов поддержки. */
export function describeDeliveryStatus(status: string): string {
  if (status === 'sent_mini') {
    return 'Доставлено: push мини-приложения (notifications.send)';
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
  if (lower.includes('notifications are disabled') || lower.includes('notification')) {
    return 'VK: у пользователя выключены уведомления мини-приложения — «Разрешить уведомления VK» в профиле';
  }
  if (lower.includes("can't send messages") || lower.includes('901') || lower.includes('917')) {
    return 'VK: нельзя написать в ЛС — пользователь не писал сообществу или закрыл сообщения';
  }
  if (lower.includes('access denied') || lower.includes('invalid access')) {
    return 'VK: неверный или просроченный токен — проверьте ключи в .env.production и перезапустите backend';
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
