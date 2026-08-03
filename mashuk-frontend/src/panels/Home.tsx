import { useState, useEffect } from 'react';
import { Panel, PanelHeader, Group, Spinner, Snackbar, Div } from '@vkontakte/vkui';
import { UserInfo } from '@vkontakte/vk-bridge';
import { useRouteNavigator, useActiveVkuiLocation } from '@vkontakte/vk-mini-apps-router';
import { useAppModal } from '../App';
import { HeaderInfo } from '../components/home/HeaderInfo';
import { openQuickCapture } from '../components/QuickCaptureFlow';
import { QUICK_CAPTURE_ITEMS } from '../data/piggybank';
import {
  PriorityAction, NextEventCard, TouchpointsCard, StatsRow,
  RoleOfDayCard, ExperimentCard, MissedTouchpointsCard,
} from '../components/home/DashboardCards';
import { PushBanner, type PushBannerItem } from '../components/home/PushBanner';
import { EveningQuestionnaire, type EveningQuestionnaireProps } from '../components/home/EveningQuestionnaire';
import { apiGet, ApiError } from '../api/client';
import { isEveningDaySummaryQuestion } from '../utils/eveningSummaryQuestion';

interface ScheduleItem {
  kind: string;
  title: string;
  time: string;
  place?: string | null;
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
  activeCard?: {
    kind: string;
    phase: string;
    tag: string;
    title: string;
    subtitle: string;
    route: string;
    cta: string;
  } | null;
  eveningCard?: { title: string; subtitle: string } | null;
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
    opensAt?: string | null;
    completed: boolean;
  } & EveningQuestionnaireProps['questionnaire'];
  missedQuestions: { id: number; title: string; closeTime: string; expired?: boolean; overdue?: boolean }[];
  counts: { availableQuestions: number; availableTasks: number; hasNewTasks: boolean };
  points: {
    path: number;
    experience: number;
    ideas: number;
    total?: number;
    pathLevel?: number;
    experienceLevel?: number;
    pathProgress?: number;
    experienceProgress?: number;
  };
  touchpoints: {
    completed: number;
    total: number;
    message: string;
    missed?: number;
    missedToday?: { id: number; title: string; state: 'overdue' | 'locked' }[];
    missedTodayCount?: number;
    ctaQuestionId?: number | null;
    items?: { id: number; title?: string; state: 'done' | 'active' | 'overdue' | 'locked' | 'pending'; block?: string | null }[];
  };
  schedule?: ScheduleItem[];
  ui?: {
    showTasksBanner?: boolean;
    showQuickCapture?: boolean;
    showPiggybankFab?: boolean;
    showEveningCard?: boolean;
  };
  activePushBanners?: PushBannerItem[];
}

const scheduleKindLabel = (kind: string) => {
  if (kind === 'now') return 'СЕЙЧАС · ';
  if (kind === 'soon') return 'СКОРО · ';
  return 'ДАЛЕЕ · ';
};

export const HomePanel: React.FC<{
  id: string;
  fetchedUser: UserInfo | null;
  isRegistered: boolean;
  initComplete?: boolean;
}> = ({ id, fetchedUser, isRegistered, initComplete = true }) => {
  const routeNavigator = useRouteNavigator();
  const { panel: activePanel } = useActiveVkuiLocation();
  const { setModal } = useAppModal();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEvening, setShowEvening] = useState(false);
  const [dismissedBanners, setDismissedBanners] = useState<number[]>([]);

  const reload = () => {
    setLoading(true);
    setError(null);
    return apiGet<HomeData>('/home')
      .then(d => {
        setData(d);
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
    if (activePanel !== id) return;
    reload();
  }, [isRegistered, initComplete, activePanel, id, routeNavigator]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    if (params.get('evening') === '1') setShowEvening(true);
  }, []);

  const piggyCaptureOpts = (onSaved?: () => void) => ({
    onSaved,
    onError: (message: string) => setSnackbar(message),
  });

  if (loading) {
    return (
      <Panel id={id}>
        <PanelHeader fixed>Главная</PanelHeader>
        <Group><Spinner size="l" /></Group>
      </Panel>
    );
  }

  if (error || !data) {
    return (
      <Panel id={id}>
        <PanelHeader fixed>Главная</PanelHeader>
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
  const schedule = d.schedule ?? [];
  const showEveningCard = !!d.eveningCard && (d.timeSlot === 'evening' || d.eveningWrap);
  const showQuick = d.currentDay !== 8 && (d.ui?.showQuickCapture ?? true);
  const card = d.activeCard;
  const nowEvents = schedule.filter(ev => ev.kind === 'now');
  const parallelNow = nowEvents.length > 1;
  const showProgramNowCards = card?.kind === 'program_now' && parallelNow;
  const showSingleActiveCard = card && !showProgramNowCards;
  const hidePriorityDup = card && d.priorityAction && card.route === d.priorityAction.route;
  const hideEveningDup = card?.kind === 'evening_survey';
  // «Сейчас» / «Скоро» уже в активной карточке — не дублируем в «Расписании»
  let scheduleList = schedule;
  if (card?.kind === 'program_now' || showProgramNowCards) {
    scheduleList = scheduleList.filter(ev => ev.kind !== 'now');
  }
  if (card?.kind === 'program_soon') {
    scheduleList = scheduleList.filter(ev => ev.kind !== 'soon');
  }
  const pushBanners = (d.activePushBanners ?? []).filter(b => !dismissedBanners.includes(b.id));

  const eveningQuestionnaireBlock = showEvening ? (
    d.eveningQuestionnaire?.available ? (
      <EveningQuestionnaire
        currentDay={d.currentDay}
        questionnaire={d.eveningQuestionnaire}
        experiment={d.experiment}
        onClose={() => setShowEvening(false)}
        onSubmitted={() => {
          setShowEvening(false);
          setSnackbar('Итоговая анкета сохранена · +15 Путь');
          reload();
        }}
      />
    ) : (
      <div className="m-card" style={{ fontSize: 13 }}>
        Итоговая анкета откроется в {d.eveningQuestionnaire?.opensAt || '22:00'} МСК.
        {d.eveningQuestionnaire?.completed && ' Вы уже заполнили анкету за сегодня.'}
      </div>
    )
  ) : null;

  return (
    <Panel id={id}>
      <PanelHeader fixed>Главная</PanelHeader>
      <Group>
        <div className="home-feed">
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

        <PushBanner
          banners={pushBanners}
          onDismiss={id => setDismissedBanners(prev => [...prev, id])}
        />

        {showProgramNowCards && nowEvents.map((ev, i) => (
          <PriorityAction
            key={`now-${ev.title}-${ev.time}-${i}`}
            tag={i === 0 ? 'СЕЙЧАС · параллельно' : 'СЕЙЧАС · программа'}
            title={ev.title}
            subtitle={`${ev.time}${ev.place ? ` · ${ev.place}` : ''}`}
            buttonText="Расписание →"
            onClick={() => routeNavigator.push('/program')}
          />
        ))}

        {showSingleActiveCard && (
          <PriorityAction
            tag={card!.tag}
            title={card!.title}
            subtitle={card!.subtitle}
            buttonText={card!.cta}
            onClick={() => {
              if (card!.route.includes('evening=1')) setShowEvening(true);
              else routeNavigator.push(card!.route);
            }}
          />
        )}

        {d.priorityAction && !hidePriorityDup && !card && (
          <PriorityAction
            tag={d.priorityAction.type === 'question' ? '⚡ Нужно сейчас' : '⚡ Нужно сейчас'}
            title={d.priorityAction.title}
            subtitle={d.priorityAction.subtitle}
            buttonText="Ответить →"
            onClick={() => routeNavigator.push(d.priorityAction!.route)}
          />
        )}

        {d.roleOfDay && d.currentDay >= 1 && d.currentDay <= 7 && (
          <RoleOfDayCard
            name={d.roleOfDay.name}
            quadrant={d.roleOfDay.quadrant}
            essence={d.roleOfDay.essence}
            experiment={d.experiment && d.currentDay !== 8 ? {
              title: d.experiment.title,
              body: d.experiment.body,
              hint: d.experiment.hint,
              roleName: d.experiment.roleName,
            } : null}
          />
        )}

        {d.experiment && d.currentDay !== 8 && !d.roleOfDay && (
          <ExperimentCard
            title={d.experiment.title}
            body={d.experiment.body}
            hint={d.experiment.hint}
            roleName={d.experiment.roleName}
            onSaveFixation={() => openQuickCapture(setModal, {
              initialTags: ['мысль'],
              prefillText: [d.experiment!.title, d.experiment!.body].filter(Boolean).join('\n\n'),
              ...piggyCaptureOpts(() => setSnackbar('Фиксация сохранена в копилку')),
            })}
          />
        )}

        {scheduleList.length > 0 && d.currentDay !== 8 && (
          <div className="m-nxt">
            <div className="m-nxt-lbl">Расписание</div>
            {scheduleList.map((ev, i) => (
              <div key={i} className={ev.kind === 'now' ? 'm-now-pulse m-nxt-item' : 'm-nxt-item'}>
                <NextEventCard
                  title={ev.title}
                  time={`${scheduleKindLabel(ev.kind)}${ev.time}${ev.place ? ` · ${ev.place}` : ''}`}
                  isSoon={ev.kind === 'soon'}
                  isNext={ev.kind === 'next'}
                />
              </div>
            ))}
          </div>
        )}

        {showQuick && (
          <div className="m-card">
            <div className="m-now-t">Копилка</div>
            <div className="cap-row">
              {QUICK_CAPTURE_ITEMS.map(item => (
                <div key={item.tag} className="cap" onClick={() => openQuickCapture(setModal, {
                  initialTag: item.tag,
                  ...piggyCaptureOpts(() => { setSnackbar('Сохранено в копилку'); reload(); }),
                })}>
                  <span className="ci">{item.icon}</span>
                  <span className="cl">{item.label}</span>
                </div>
              ))}
            </div>
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

        <MissedTouchpointsCard
          items={d.touchpoints.missedToday ?? []}
          ctaQuestionId={d.touchpoints.ctaQuestionId}
        />

        <div className="m-card" onClick={() => routeNavigator.push('/questions')} style={{ cursor: 'pointer' }}>
          <div className="m-tmi-t">Вопросы</div>
          <div className="m-tmi-s">{d.counts.availableQuestions} доступно</div>
        </div>

        <TouchpointsCard
          completed={d.touchpoints.completed}
          total={d.touchpoints.total}
          message={d.touchpoints.message}
          missed={d.touchpoints.missed}
          items={d.touchpoints.items}
          onItemClick={(item) => {
            if (item.state === 'locked') return;
            if (isEveningDaySummaryQuestion({ title: item.title, block: item.block })) {
              setShowEvening(true);
              return;
            }
            routeNavigator.push(`/questions?q=${item.id}`);
          }}
        />

        {showEveningCard && !showEvening && !hideEveningDup && (
          <PriorityAction
            tag="✦ Завершение дня"
            title="Итоговая анкета"
            subtitle={d.eveningCard!.subtitle}
            buttonText="Заполнить →"
            onClick={() => setShowEvening(true)}
          />
        )}

        {eveningQuestionnaireBlock}

        <StatsRow
          path={d.points.path}
          exp={d.points.experience}
          total={d.points.total}
          ideas={d.points.ideas}
          pathLevel={d.points.pathLevel}
          experienceLevel={d.points.experienceLevel}
          pathProgress={d.points.pathProgress}
          experienceProgress={d.points.experienceProgress}
          onIdeasClick={() => routeNavigator.push('/profile?section=piggybank')}
        />
        </div>
        <Div />
      </Group>

      {snackbar && <Snackbar onClose={() => setSnackbar(null)} onClosed={() => setSnackbar(null)}>{snackbar}</Snackbar>}
    </Panel>
  );
};

const ButtonLike: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <div onClick={onClick} style={{ marginTop: 8, fontSize: 11, color: '#E53E3E', fontWeight: 700, cursor: 'pointer' }}>{children}</div>
);
