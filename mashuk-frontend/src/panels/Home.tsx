import { useState, useEffect } from 'react';
import { Panel, PanelHeader, Group, Spinner, ModalRoot, Snackbar } from '@vkontakte/vkui';
import { UserInfo } from '@vkontakte/vk-bridge';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import { useAppModal } from '../App';
import { HeaderInfo } from '../components/home/HeaderInfo';
import { PriorityAction, NextEventCard, TouchpointsCard, MiniTasksCard, StatsRow } from '../components/home/DashboardCards';
import { QuickCaptureModal } from '../components/QuickCaptureModal';
import { apiGet, apiPost, ApiError } from '../api/client';

type TimeOfDay = 'утро' | 'день' | 'вечер';

interface ScheduleItem {
  kind: string;
  title: string;
  time: string;
  place?: string | null;
}

interface HomeData {
  user: { firstName: string; lastName: string; direction: string };
  currentDay: number;
  totalDays: number;
  currentDate: string;
  dayFocus: { title: string; text?: string; keyQuestion?: string } | null;
  priorityAction: { type: string; title: string; subtitle: string; route: string } | null;
  missedQuestions: { id: number; title: string; closeTime: string; expired?: boolean }[];
  counts: { availableQuestions: number; availableTasks: number; hasNewTasks: boolean };
  points: { path: number; experience: number; ideas: number };
  touchpoints: { completed: number; total: number; message: string; missed?: number };
  schedule?: ScheduleItem[];
}

function detectTimeOfDay(): TimeOfDay {
  const h = new Date().getHours();
  if (h < 12) return 'утро';
  if (h < 18) return 'день';
  return 'вечер';
}

export const HomePanel: React.FC<{
  id: string;
  fetchedUser: UserInfo | null;
  isRegistered: boolean;
  initComplete?: boolean;
}> = ({ id, fetchedUser, isRegistered, initComplete = true }) => {
  const routeNavigator = useRouteNavigator();
  const { setModal } = useAppModal();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [captureTag, setCaptureTag] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(detectTimeOfDay);

  useEffect(() => {
    if (!initComplete) return;
    if (!isRegistered) {
      routeNavigator.push('/registration');
      return;
    }
    setLoading(true);
    setError(null);
    apiGet<HomeData>('/home')
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          routeNavigator.push('/registration');
        } else {
          setError('Не удалось загрузить главную. Проверьте подключение к серверу.');
        }
      })
      .finally(() => setLoading(false));
  }, [isRegistered, initComplete, routeNavigator]);

  const handleQuickSave = async (text: string, tag: string) => {
    await apiPost('/piggybank/quick', { tag, text, source: 'собственные размышления' });
    setSnackbar('Сохранено в копилку');
    setCaptureTag(null);
  };

  useEffect(() => {
    if (captureTag) {
      setModal(
        <ModalRoot activeModal="quick-capture" onClose={() => setCaptureTag(null)}>
          <QuickCaptureModal tag={captureTag} onClose={() => setCaptureTag(null)} onSave={(text) => handleQuickSave(text, captureTag)} />
        </ModalRoot>
      );
    } else {
      setModal(null);
    }
  }, [captureTag, setModal]);

  useEffect(() => {
    return () => setModal(null);
  }, [setModal]);

  if (loading) {
    return (
      <Panel id={id}>
        <PanelHeader>Главная</PanelHeader>
        <Group><Spinner size="l" /></Group>
      </Panel>
    );
  }

  if (error || !data) {
    return (
      <Panel id={id}>
        <PanelHeader>Главная</PanelHeader>
        <Group>
          <div className="m-card" style={{ color: '#C53030' }}>{error || 'Нет данных'}</div>
          <ButtonLike onClick={() => {
            setLoading(true);
            apiGet<HomeData>('/home').then(setData).catch(() => setError('Не удалось загрузить главную.')).finally(() => setLoading(false));
          }}>Повторить</ButtonLike>
        </Group>
      </Panel>
    );
  }

  const d = data;
  const name = d.user?.firstName || fetchedUser?.first_name || '';
  const lastName = d.user?.lastName || fetchedUser?.last_name || '';
  const activeMissed = d.missedQuestions?.filter(q => !q.expired) ?? [];
  const expiredMissed = d.missedQuestions?.filter(q => q.expired) ?? [];
  const schedule = d.schedule ?? [];

  return (
    <Panel id={id}>
      <PanelHeader>Главная</PanelHeader>
      <Group>
        <HeaderInfo
          firstName={name}
          lastName={lastName}
          direction={d.user?.direction || '—'}
          currentDateStr={d.currentDate}
          dayCount={d.currentDay}
          totalDays={d.totalDays}
          focusTitle={d.dayFocus?.title || 'Фокус дня'}
          focusSubtitle={d.dayFocus?.text || ''}
          focusKeyQuestion={d.dayFocus?.keyQuestion}
          progressPercent={(d.currentDay / d.totalDays) * 100}
        />

        <div className="time-sw">
          {(['утро', 'день', 'вечер'] as TimeOfDay[]).map(t => (
            <button key={t} type="button" className={`time-btn ${timeOfDay === t ? 'on' : ''}`} onClick={() => setTimeOfDay(t)}>
              {{ утро: '☀️ Утро', день: '🌤 День', вечер: '🌙 Вечер' }[t]}
            </button>
          ))}
        </div>

        {schedule.length > 0 && timeOfDay !== 'вечер' && (
          <div className="m-nxt">
            <div className="m-nxt-lbl">Расписание</div>
            {schedule.map((ev, i) => (
              <div key={i} className={ev.kind === 'now' ? 'm-now-pulse' : ''} style={{ marginBottom: 6 }}>
                <NextEventCard
                  title={ev.title}
                  time={`${ev.kind === 'now' ? 'СЕЙЧАС · ' : ev.kind === 'soon' ? 'СКОРО · ' : 'ДАЛЕЕ · '}${ev.time}${ev.place ? ` · ${ev.place}` : ''}`}
                  isSoon={ev.kind === 'soon'}
                />
              </div>
            ))}
          </div>
        )}

        {activeMissed.length > 0 && (
          <div className="m-card miss" style={{ background: '#FFF0F0', border: '1.5px solid rgba(229,62,62,.25)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#C53030' }}>
              {activeMissed.length === 1 ? `Пропущено: ${activeMissed[0].title}` : `Пропущено вопросов: ${activeMissed.length}`}
            </div>
            <ButtonLike onClick={() => routeNavigator.push('/questions')}>Перейти →</ButtonLike>
          </div>
        )}

        {expiredMissed.map(q => (
          <div key={q.id} className="m-card" style={{ background: '#F7F7F7', opacity: 0.85 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#888' }}>Недоступно: {q.title}</div>
          </div>
        ))}

        {d.priorityAction && (timeOfDay === 'утро' || timeOfDay === 'день') && (
          <PriorityAction
            tag="⚡ Нужно сейчас"
            title={d.priorityAction.title}
            subtitle={d.priorityAction.subtitle}
            buttonText="Ответить →"
            onClick={() => routeNavigator.push(d.priorityAction!.route)}
          />
        )}

        <div className="m-card" onClick={() => routeNavigator.push('/questions')} style={{ cursor: 'pointer' }}>
          <div className="m-tmi-t">Вопросы</div>
          <div className="m-tmi-s">{d.counts.availableQuestions} доступно</div>
        </div>

        <MiniTasksCard totalCount={d.counts.availableTasks} hasNew={d.counts.hasNewTasks} />

        <TouchpointsCard
          completed={d.touchpoints.completed}
          total={d.touchpoints.total}
          message={d.touchpoints.message}
          missed={d.touchpoints.missed}
        />

        {(timeOfDay === 'день' || timeOfDay === 'вечер') && (
          <div className="m-card">
            <div className="m-now-t">Быстрая фиксация</div>
            <div className="cap-row">
              {[
                { icon: '💡', label: 'Идея', tag: 'идея' },
                { icon: '💭', label: 'Мысль', tag: 'мысль' },
                { icon: '❓', label: 'Вопрос', tag: 'вопрос' },
                { icon: '📇', label: 'Контакт', tag: 'контакт' },
                { icon: '📌', label: 'На будущее', tag: 'на будущее' },
                { icon: '✅', label: 'В работу', tag: 'забрать в работу' },
              ].map(item => (
                <div key={item.tag} className="cap" onClick={() => setCaptureTag(item.tag)}>
                  <span className="ci">{item.icon}</span>
                  <span className="cl">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <StatsRow path={d.points.path} exp={d.points.experience} ideas={d.points.ideas} />
      </Group>

      {snackbar && <Snackbar onClose={() => setSnackbar(null)} onClosed={() => setSnackbar(null)}>{snackbar}</Snackbar>}
    </Panel>
  );
};

const ButtonLike: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <div onClick={onClick} style={{ marginTop: 8, fontSize: 11, color: '#E53E3E', fontWeight: 700, cursor: 'pointer' }}>{children}</div>
);
