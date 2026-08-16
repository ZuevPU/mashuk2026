import { useEffect, useState } from 'react';
import { useInsights } from '../insights/InsightsContext';
import { DashCard, DashScreenTitle } from '../analytics/dashboardUi';
import { HubKpiRow } from './HubKpiRow';
import { hubDisplayDay } from './hubQuery';
import { HubLensLayout, type HubNavItem } from './HubSideNav';

type NotifyItem = {
  kind: 'question' | 'task' | 'event' | 'evening' | 'forum_wrap';
  id: number;
  title: string;
  subtitle: string;
  status: string;
  canSend: boolean;
  cannotSendReason: string | null;
  defaultText: string;
  lastSentAt: string | null;
  alreadySentToday: boolean;
};

type TodayData = {
  shiftId: number;
  day: number;
  currentDay: number;
  totalDays: number;
  kbOpenAllTooEarly: boolean;
  dayPublished: boolean;
  dayPublishUnknown: boolean;
  tasksVisible: number;
  tasksTotalDay: number;
  kbLocked: boolean;
  kbUnlockThreshold: number;
  eveningOpen: boolean;
  eveningForcePublished: boolean;
  pendingExchange: number;
  pendingTasks: number;
  events: Array<{ id: number; title: string; place: string | null; published: boolean; attendance: number }>;
  eventsDraft: number;
  notifyItems: NotifyItem[];
};

const NAV: HubNavItem[] = [
  { id: 'hub-today-why', label: 'Почему пусто' },
  { id: 'hub-today-mod', label: 'Модерация' },
  { id: 'hub-today-notify', label: 'Оповестить' },
];

function whyEmpty(data: TodayData): string {
  if (data.dayPublishUnknown) return 'День расписания ещё не заведён — участник не видит программу.';
  if (!data.dayPublished) return 'День не опубликован — таймлайн у участника пустой.';
  if (data.tasksVisible === 0 && data.tasksTotalDay > 0) return 'Задания дня есть, но не опубликованы.';
  if (data.tasksVisible === 0) return 'На этот день нет опубликованных заданий.';
  if (data.kbLocked) return `База знаний ещё заперта (порог ${data.kbUnlockThreshold} точек).`;
  if (!data.eveningOpen) return 'Итоговая анкета дня закрыта. Если мало прошли — «опубликовать сейчас» в Форуме.';
  return 'День открыт. Если у группы пусто — смотрите модерацию и «Оповестить».';
}

export function HubTodayScreen() {
  const { adminFetch, forumDay, meta, setTab } = useInsights();
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const day = hubDisplayDay(forumDay, meta?.currentForumDay || 1);

  const load = () => {
    setLoading(true);
    setErr(null);
    adminFetch(`/analytics/hub/today?day=${day}`)
      .then(res => setData(res as TodayData))
      .catch(e => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [day, adminFetch]);

  const notify = async (item: NotifyItem, force = false) => {
    const key = `${item.kind}:${item.id}`;
    setSending(key);
    try {
      await adminFetch('/push/content-board/send', {
        method: 'POST',
        body: JSON.stringify({
          kind: item.kind,
          id: item.id,
          day: data?.day ?? day,
          text: item.defaultText,
          force,
        }),
      });
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/уже отправлено|ещё раз/i.test(msg) && !force) {
        if (window.confirm(`${msg}\nОтправить ещё раз?`)) {
          await notify(item, true);
          return;
        }
      } else {
        alert(msg);
      }
    } finally {
      setSending(null);
    }
  };

  return (
    <HubLensLayout items={NAV} navLabel="Разделы сегодня">
      <DashScreenTitle
        title="Сегодня на площадке"
        hint="Смена из шапки. Что участник видит сейчас, очередь модерации и ручное «Оповестить»."
      />
      {loading && <p className="adm-muted">Загрузка…</p>}
      {err && <p className="adm-error">{err}</p>}
      {data && (
        <>
          <HubKpiRow
            cols={4}
            items={[
              {
                label: 'День',
                value: data.dayPublished ? 'открыт' : (data.dayPublishUnknown ? 'нет дня' : 'скрыт'),
                sub: `День ${data.day} из ${data.totalDays}`,
                accent: data.dayPublished ? '#0f766e' : '#b91c1c',
              },
              {
                label: 'Задания',
                value: `${data.tasksVisible}`,
                sub: `видны из ${data.tasksTotalDay} на день`,
                accent: data.tasksVisible === 0 ? '#b91c1c' : undefined,
              },
              {
                label: 'БЗ',
                value: data.kbLocked ? 'заперта' : 'открыта',
                sub: data.kbLocked ? `порог ${data.kbUnlockThreshold}` : 'порог снят',
              },
              {
                label: 'Анкета',
                value: data.eveningOpen ? 'открыта' : 'закрыта',
                sub: data.eveningForcePublished ? 'опубликована сейчас' : 'по окну',
                accent: data.eveningOpen ? '#0f766e' : undefined,
              },
            ]}
          />

          <div id="hub-today-why">
            <DashCard title="Почему у группы пусто">
              <p style={{ margin: 0 }}>{whyEmpty(data)}</p>
              {data.kbOpenAllTooEarly && (
                <p className="adm-muted" style={{ margin: '8px 0 0' }}>
                  «Опубликовать всем» по БЗ ещё рано: идёт день {data.currentDay} из {data.totalDays}.
                  Кнопку в Базе знаний не трогайте до последнего дня этой смены.
                </p>
              )}
              {data.events.length > 0 && (
                <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                  {data.events.map(e => (
                    <li key={e.id}>
                      {e.title}
                      {e.place ? ` · ${e.place}` : ''}
                      {` · явка ${e.attendance}`}
                    </li>
                  ))}
                </ul>
              )}
              {data.eventsDraft > 0 && (
                <p className="adm-muted" style={{ margin: '8px 0 0' }}>
                  Черновиков слотов: {data.eventsDraft}.
                </p>
              )}
            </DashCard>
          </div>

          <div id="hub-today-mod">
            <DashCard title="Очередь модерации">
              <p style={{ margin: 0 }}>
                Задания: {data.pendingTasks}. Обмен опытом: {data.pendingExchange}.
              </p>
              <button
                type="button"
                className="adm-btn adm-btn-secondary"
                style={{ marginTop: 10 }}
                onClick={() => setTab('moderation')}
              >
                Открыть модерацию
              </button>
            </DashCard>
          </div>

          <div id="hub-today-notify">
            <DashCard title="Оповестить">
              <p className="adm-muted" style={{ marginTop: 0 }}>
                Тот же ручной канал, что Система → Уведомления. Автослотов нет.
              </p>
              {data.notifyItems.length === 0 && <p className="adm-muted">На этот день нечего оповещать.</p>}
              {data.notifyItems.length > 0 && (
                <div className="adm-table-scroll">
                  <table className="adm-table adm-table-compact">
                    <thead>
                      <tr>
                        <th>Пункт</th>
                        <th>Статус</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.notifyItems.map(item => {
                        const key = `${item.kind}:${item.id}`;
                        return (
                          <tr key={key}>
                            <td>
                              <div>{item.title}</div>
                              <div className="adm-muted">{item.subtitle}</div>
                            </td>
                            <td>
                              {item.status}
                              {item.alreadySentToday ? ' · уже сегодня' : ''}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="adm-btn adm-btn-primary"
                                disabled={!item.canSend || sending === key}
                                onClick={() => notify(item)}
                              >
                                {sending === key ? '…' : 'Оповестить'}
                              </button>
                              {!item.canSend && item.cannotSendReason && (
                                <div className="adm-muted">{item.cannotSendReason}</div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </DashCard>
          </div>
        </>
      )}
    </HubLensLayout>
  );
}
