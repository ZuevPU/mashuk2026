import { useState, useEffect } from 'react';
import { Panel, PanelHeader, Group, Spinner, ModalRoot, Snackbar, Button, FormItem, CustomSelect, Div } from '@vkontakte/vkui';
import { UserInfo } from '@vkontakte/vk-bridge';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import { useAppModal } from '../App';
import { HeaderInfo } from '../components/home/HeaderInfo';
import {
  PriorityAction, NextEventCard, TouchpointsCard, MiniTasksCard, StatsRow,
  RoleOfDayCard, ExperimentCard,
} from '../components/home/DashboardCards';
import { QuickCaptureModal } from '../components/QuickCaptureModal';
import { apiGet, apiPost, ApiError } from '../api/client';
import { QUICK_CAPTURE_ITEMS } from '../data/piggybank';

type TimeOfDay = 'утро' | 'день' | 'вечер';

interface ScheduleItem {
  kind: string;
  title: string;
  time: string;
  place?: string | null;
}

interface RoleMeta {
  roleKey: string;
  name: string;
  quadrant?: string;
}

interface HomeData {
  user: { firstName: string; lastName: string; direction: string; pedagogicalRole?: string; groupId?: number | null; groupName?: string | null };
  currentDay: number;
  totalDays: number;
  timeSlot?: 'morning' | 'day' | 'evening' | string;
  eveningWrap?: boolean;
  currentDate: string;
  dayFocus: { title: string; text?: string; keyQuestion?: string } | null;
  priorityAction: { type: string; title: string; subtitle: string; route: string } | null;
  roleOfDay: { roleKey: string; name: string; quadrant?: string; essence?: string } | null;
  experiment: {
    title: string;
    body?: string;
    hint?: string;
    status: string;
    roleName?: string;
  } | null;
  eveningQuestionnaire: {
    available: boolean;
    completed: boolean;
    askTomorrowRole?: boolean;
    scales?: { key: string; label: string }[];
    roles: RoleMeta[];
    saved?: Record<string, unknown> | null;
  };
  missedQuestions: { id: number; title: string; closeTime: string; expired?: boolean; overdue?: boolean }[];
  counts: { availableQuestions: number; availableTasks: number; hasNewTasks: boolean };
  points: { path: number; experience: number; ideas: number };
  touchpoints: { completed: number; total: number; message: string; missed?: number };
  schedule?: ScheduleItem[];
  ui?: {
    showTasksBanner?: boolean;
    showQuickCapture?: boolean;
    showEveningCard?: boolean;
  };
}

const SLOT_TO_UI: Record<string, TimeOfDay> = {
  morning: 'утро',
  day: 'день',
  evening: 'вечер',
};

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
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('день');
  const [showEvening, setShowEvening] = useState(false);
  const [tomorrowRole, setTomorrowRole] = useState<string>('');
  const [eveningStep, setEveningStep] = useState(0);
  const [eveningForm, setEveningForm] = useState<Record<string, unknown>>({
    tripYes: false,
    practiceYes: false,
    recommendYes: false,
  });

  const reload = () => {
    setLoading(true);
    setError(null);
    return apiGet<HomeData>('/home')
      .then(d => {
        setData(d);
        if (d.timeSlot && SLOT_TO_UI[d.timeSlot]) {
          setTimeOfDay(SLOT_TO_UI[d.timeSlot]);
        }
        if (d.eveningQuestionnaire?.roles?.[0] && !tomorrowRole) {
          setTomorrowRole(d.eveningQuestionnaire.roles[0].roleKey);
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          routeNavigator.push('/registration');
        } else {
          setError('Не удалось загрузить главную. Проверьте подключение к серверу.');
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!initComplete) return;
    if (!isRegistered) {
      routeNavigator.push('/registration');
      return;
    }
    reload();
  }, [isRegistered, initComplete, routeNavigator]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    if (params.get('evening') === '1') setShowEvening(true);
  }, []);

  const handleQuickSave = async (text: string, source: string) => {
    if (!captureTag) return;
    await apiPost('/piggybank/quick', { tag: captureTag, text, source });
    setSnackbar('Сохранено в копилку');
    setCaptureTag(null);
    reload();
  };

  const handleExperimentStatus = async (status: 'in_progress' | 'done') => {
    await apiPost('/day-state/experiment', { status });
    setSnackbar(status === 'done' ? 'Эксперимент отмечен' : 'Эксперимент в процессе');
    reload();
  };

  const handleEveningSubmit = async () => {
    const askRole = data?.eveningQuestionnaire?.askTomorrowRole !== false && (data?.currentDay ?? 0) <= 6;
    if (askRole && !tomorrowRole) return;
    const ratings: Record<string, unknown> = { ...eveningForm };
    await apiPost('/day-state/evening', {
      tomorrowRoleKey: askRole ? tomorrowRole : undefined,
      ratings,
      experimentStatus: data?.experiment?.status === 'done' ? 'done' : undefined,
    });
    setShowEvening(false);
    setEveningStep(0);
    setSnackbar('Итоговая анкета сохранена · +15 Путь');
    reload();
  };

  const setScale = (key: string, value: number) => {
    setEveningForm(prev => ({ ...prev, [key]: value }));
  };

  const setField = (key: string, value: unknown) => {
    setEveningForm(prev => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (captureTag) {
      setModal(
        <ModalRoot activeModal="quick-capture" onClose={() => setCaptureTag(null)}>
          <QuickCaptureModal
            tag={captureTag}
            onClose={() => setCaptureTag(null)}
            onSave={(text, source) => handleQuickSave(text, source)}
          />
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
          <ButtonLike onClick={() => reload()}>Повторить</ButtonLike>
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
  const showQuick = d.ui?.showQuickCapture ?? (timeOfDay === 'день' && d.currentDay !== 8);
  const showTasksBanner = d.ui?.showTasksBanner ?? timeOfDay === 'утро';
  const askTomorrowRole = d.eveningQuestionnaire?.askTomorrowRole !== false && d.currentDay <= 6;

  return (
    <Panel id={id}>
      <PanelHeader>Главная</PanelHeader>
      <Group>
        <HeaderInfo
          firstName={name}
          lastName={lastName}
          direction={d.user?.direction || '—'}
          groupName={d.user?.groupName}
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
            <button
              key={t}
              type="button"
              className={`time-btn ${timeOfDay === t ? 'on' : ''}`}
              title="Фаза по московскому времени"
              disabled
            >
              {{ утро: '☀️ Утро', день: '🌤 День', вечер: '🌙 Вечер' }[t]}
            </button>
          ))}
        </div>

        {d.roleOfDay && d.currentDay >= 2 && d.currentDay <= 7 && timeOfDay === 'утро' && (
          <RoleOfDayCard
            name={d.roleOfDay.name}
            quadrant={d.roleOfDay.quadrant}
            essence={d.roleOfDay.essence}
          />
        )}

        {d.experiment && d.currentDay !== 8 && (
          <ExperimentCard
            title={d.experiment.title}
            body={d.experiment.body}
            hint={d.experiment.hint}
            roleName={d.experiment.roleName}
            status={d.experiment.status}
            onStatusChange={handleExperimentStatus}
          />
        )}

        {schedule.length > 0 && timeOfDay !== 'вечер' && d.currentDay !== 8 && (
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

        {d.currentDay === 8 && (
          <div className="m-card" style={{ background: 'linear-gradient(135deg,#FFF3E0,#FFECB3)', border: '1px solid #FFE082' }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>День 8 · Отъезд</div>
            <div style={{ fontSize: 12, marginTop: 6, color: '#5D4B37', lineHeight: 1.4 }}>
              Утро — Точка Б (финальная рефлексия). Дневная программа и эксперимент дня не показываются.
            </div>
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
            <div style={{ fontSize: 12, fontWeight: 700, color: '#888' }}>🔒 Заморожено: {q.title}</div>
          </div>
        ))}

        {d.priorityAction && (
          <PriorityAction
            tag={d.priorityAction.type === 'evening' ? '✦ Завершение дня' : '⚡ Нужно сейчас'}
            title={d.priorityAction.title}
            subtitle={d.priorityAction.subtitle}
            buttonText={d.priorityAction.type === 'evening' ? 'Заполнить →' : 'Ответить →'}
            onClick={() => {
              if (d.priorityAction!.type === 'evening') setShowEvening(true);
              else routeNavigator.push(d.priorityAction!.route);
            }}
          />
        )}

        {showEvening && d.eveningQuestionnaire?.available && (
          <div className="m-card">
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Итоговая анкета</div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>
              Шаг {eveningStep + 1} из 4 · можно закрыть и вернуться
            </div>
            <div style={{ height: 4, background: '#eee', borderRadius: 4, marginBottom: 12 }}>
              <div style={{ width: `${((eveningStep + 1) / 4) * 100}%`, height: 4, background: '#2D6A4F', borderRadius: 4 }} />
            </div>

            {eveningStep === 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>9 шкал оценки дня (1–5)</div>
                {(d.eveningQuestionnaire.scales || [
                  { key: 'direction', label: 'Направление' },
                  { key: 'lessonsImportant', label: 'Уроки о важном' },
                  { key: 'openLessons', label: 'Открытые уроки' },
                  { key: 'morningHealth', label: 'Утренняя программа здоровья' },
                  { key: 'workshops', label: 'Мастер-классы' },
                  { key: 'eveningAtmosphere', label: 'Вечерняя программа' },
                  { key: 'food', label: 'Питание' },
                  { key: 'housing', label: 'Проживание' },
                  { key: 'curator', label: 'Куратор группы' },
                ]).map(s => (
                  <FormItem key={s.key} top={s.label}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setScale(s.key, n)}
                          style={{
                            width: 36, height: 36, borderRadius: 8,
                            border: eveningForm[s.key] === n ? '2px solid #2D6A4F' : '1px solid #ddd',
                            background: eveningForm[s.key] === n ? '#D8F3DC' : '#fff',
                            fontWeight: 700, cursor: 'pointer',
                          }}
                        >{n}</button>
                      ))}
                    </div>
                  </FormItem>
                ))}
              </>
            )}

            {eveningStep === 1 && (
              <>
                <FormItem top="Выезжал ли ты на полезную программу?">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button mode={eveningForm.tripYes ? 'primary' : 'secondary'} onClick={() => setField('tripYes', true)}>Да</Button>
                    <Button mode={!eveningForm.tripYes ? 'primary' : 'secondary'} onClick={() => setField('tripYes', false)}>Нет</Button>
                  </div>
                </FormItem>
                {eveningForm.tripYes && (
                  <FormItem top="Оценка выездной программы (1–5)">
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button key={n} type="button" onClick={() => setScale('tripScore', n)}
                          style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #ddd', fontWeight: 700 }}>{n}</button>
                      ))}
                    </div>
                  </FormItem>
                )}
                <FormItem top="Был ли ты на презентации педагогической практики?">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button mode={eveningForm.practiceYes ? 'primary' : 'secondary'} onClick={() => setField('practiceYes', true)}>Да</Button>
                    <Button mode={!eveningForm.practiceYes ? 'primary' : 'secondary'} onClick={() => setField('practiceYes', false)}>Нет</Button>
                  </div>
                </FormItem>
                {eveningForm.practiceYes && (
                  <>
                    <FormItem top="На какой практике?">
                      <textarea
                        value={String(eveningForm.practiceName || '')}
                        onChange={e => setField('practiceName', e.target.value)}
                        style={{ width: '100%', minHeight: 48, borderRadius: 10, border: '1px solid #ddd', padding: 10 }}
                      />
                    </FormItem>
                    <FormItem top="Готов рекомендовать коллегам?">
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Button mode={eveningForm.recommendYes ? 'primary' : 'secondary'} onClick={() => setField('recommendYes', true)}>Да</Button>
                        <Button mode={!eveningForm.recommendYes ? 'primary' : 'secondary'} onClick={() => setField('recommendYes', false)}>Нет</Button>
                      </div>
                    </FormItem>
                    {eveningForm.recommendYes && (
                      <FormItem top="Оценка рекомендации (1–10)">
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                            <button key={n} type="button" onClick={() => setScale('recommendScore', n)}
                              style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #ddd', fontSize: 11 }}>{n}</button>
                          ))}
                        </div>
                      </FormItem>
                    )}
                  </>
                )}
              </>
            )}

            {eveningStep === 2 && (
              <>
                <FormItem top="Главный тезис дня">
                  <textarea value={String(eveningForm.mainThesis || '')} onChange={e => setField('mainThesis', e.target.value)}
                    style={{ width: '100%', minHeight: 56, borderRadius: 10, border: '1px solid #ddd', padding: 10 }} />
                </FormItem>
                <FormItem top="Как изменилось понимание темы / деятельности?">
                  <textarea value={String(eveningForm.understandingChange || '')} onChange={e => setField('understandingChange', e.target.value)}
                    style={{ width: '100%', minHeight: 56, borderRadius: 10, border: '1px solid #ddd', padding: 10 }} />
                </FormItem>
                <FormItem top="Что понравилось больше всего?">
                  <textarea value={String(eveningForm.likedMost || '')} onChange={e => setField('likedMost', e.target.value)}
                    style={{ width: '100%', minHeight: 48, borderRadius: 10, border: '1px solid #ddd', padding: 10 }} />
                </FormItem>
                <FormItem top="Что сделать, чтобы завтра оценки стали выше?">
                  <textarea value={String(eveningForm.improveTomorrow || '')} onChange={e => setField('improveTomorrow', e.target.value)}
                    style={{ width: '100%', minHeight: 48, borderRadius: 10, border: '1px solid #ddd', padding: 10 }} />
                </FormItem>
                <FormItem top="Свободное поле">
                  <textarea value={String(eveningForm.freeNote || '')} onChange={e => setField('freeNote', e.target.value)}
                    style={{ width: '100%', minHeight: 48, borderRadius: 10, border: '1px solid #ddd', padding: 10 }}
                    placeholder="Всё, что не сказано выше" />
                </FormItem>
                {d.experiment && (
                  <FormItem top="Эксперимент с ролью: что получилось / не получилось / что фиксируешь?">
                    <textarea value={String(eveningForm.experimentResult || '')} onChange={e => setField('experimentResult', e.target.value)}
                      style={{ width: '100%', minHeight: 64, borderRadius: 10, border: '1px solid #ddd', padding: 10 }} />
                  </FormItem>
                )}
              </>
            )}

            {eveningStep === 3 && (
              <>
                {askTomorrowRole && (
                  <FormItem top="Завтра сфокусироваться на развитии какой роли?">
                    <CustomSelect
                      options={(d.eveningQuestionnaire.roles || []).map(r => ({
                        label: r.name,
                        value: r.roleKey,
                      }))}
                      value={tomorrowRole || undefined}
                      onChange={e => setTomorrowRole(String(e.target.value))}
                    />
                  </FormItem>
                )}
                {d.currentDay === 7 && (
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                    День 7 — роль на день отъезда не выбираем. Заполните Точку Б в разделе «Вопросы».
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {eveningStep > 0 && (
                <Button size="l" mode="secondary" onClick={() => setEveningStep(s => s - 1)}>Назад</Button>
              )}
              {eveningStep < 3 ? (
                <Button size="l" stretched onClick={() => setEveningStep(s => s + 1)}>Далее</Button>
              ) : (
                <Button size="l" stretched onClick={handleEveningSubmit} disabled={askTomorrowRole && !tomorrowRole}>
                  Сохранить
                </Button>
              )}
            </div>
            <Button size="l" stretched mode="tertiary" style={{ marginTop: 8 }} onClick={() => { setShowEvening(false); setEveningStep(0); }}>
              Отложить
            </Button>
          </div>
        )}

        <div className="m-card" onClick={() => routeNavigator.push('/questions')} style={{ cursor: 'pointer' }}>
          <div className="m-tmi-t">Вопросы</div>
          <div className="m-tmi-s">{d.counts.availableQuestions} доступно</div>
        </div>

        {showTasksBanner && (
          <MiniTasksCard totalCount={d.counts.availableTasks} hasNew={d.counts.hasNewTasks} />
        )}

        <TouchpointsCard
          completed={d.touchpoints.completed}
          total={d.touchpoints.total}
          message={d.touchpoints.message}
          missed={d.touchpoints.missed}
        />

        {showQuick && (
          <div className="m-card">
            <div className="m-now-t">Быстрая фиксация</div>
            <div className="cap-row">
              {QUICK_CAPTURE_ITEMS.map(item => (
                <div key={item.tag} className="cap" onClick={() => setCaptureTag(item.tag)}>
                  <span className="ci">{item.icon}</span>
                  <span className="cl">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <StatsRow
          path={d.points.path}
          exp={d.points.experience}
          ideas={d.points.ideas}
          pathLevel={d.points.pathLevel}
          experienceLevel={d.points.experienceLevel}
          pathProgress={d.points.pathProgress}
          experienceProgress={d.points.experienceProgress}
        />
        <Div />
      </Group>

      {snackbar && <Snackbar onClose={() => setSnackbar(null)} onClosed={() => setSnackbar(null)}>{snackbar}</Snackbar>}
    </Panel>
  );
};

const ButtonLike: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <div onClick={onClick} style={{ marginTop: 8, fontSize: 11, color: '#E53E3E', fontWeight: 700, cursor: 'pointer' }}>{children}</div>
);
