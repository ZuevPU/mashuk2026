/**
 * Уведомления мини-приложения и ЛС сообщества — только руками:
 * Система → Уведомления, «Оповестить» у вопроса, задания, итогов дня/форума,
 * «Создать уведомление», отложенная очередь, которую поставил админ.
 *
 * Всё остальное (слоты, публикация, догонялки, программа, заявка, медаль,
 * команда, обмен, уровень) не шлёт ни push, ни messages.send.
 */
export const AUTO_CONTENT_PUSH_ENABLED: boolean = false;

export function allowAutoContentPush(): boolean {
  return AUTO_CONTENT_PUSH_ENABLED;
}

/** Очередь push_queue: слать только то, что поставил админ. */
export function isAdminQueuedPush(createdByAdminId: number | null | undefined): boolean {
  return createdByAdminId != null && createdByAdminId > 0;
}

/** Триггеры, которые админ нажал сам (вкладка уведомлений / вопросы / задания / итоги). */
export function isManualAdminPushTrigger(triggerType: string): boolean {
  const t = (triggerType || '').trim();
  if (!t) return false;
  if (t === 'manual' || t === 'evening_questionnaire_notify' || t === 'forum_wrap_questionnaire_notify') {
    return true;
  }
  return (
    /^admin_manual_/.test(t)
    || /^admin_bulk_/.test(t)
    || /^admin_campaign_/.test(t)
    || /^queue_\d+$/.test(t)
    || /^question_notify_/.test(t)
    || /^task_notify_/.test(t)
    || /^event_notify_/.test(t)
    || /^evening_questionnaire_notify_d\d+$/.test(t)
  );
}

export function allowOutgoingPush(triggerType: string): boolean {
  if (allowAutoContentPush()) return true;
  return isManualAdminPushTrigger(triggerType);
}
