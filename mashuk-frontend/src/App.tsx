import { useState, useEffect, useCallback, ReactNode, createContext, useContext } from 'react';
import { bridge, isVkEnvironment, withTimeout } from './utils/vkBridgeClient';
import { UserInfo } from '@vkontakte/vk-bridge';
import {
  View, Spinner, Button,
  Epic, Tabbar, TabbarItem, Snackbar, SplitLayout, SplitCol,
} from '@vkontakte/vkui';
import { Icon28HomeOutline, Icon28CalendarOutline, Icon28ListOutline, Icon28HelpOutline, Icon28UserCircleOutline, Icon28ErrorCircleOutline, Icon28AddOutline } from '@vkontakte/icons';
import { openQuickCapture } from './components/QuickCaptureFlow';
import { useActiveVkuiLocation, useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import { HomePanel } from './panels/Home';
import { ProgramPanel } from './panels/Program';
import { TasksPanel } from './panels/Tasks';
import { QuestionsPanel } from './panels/Questions';
import { ProfilePanel } from './panels/Profile';
import { RegistrationPanel } from './panels/Registration';
import { VolunteerPanel } from './panels/Volunteer';
import { DelayedSurveyPanel } from './panels/DelayedSurvey';
import { ScanPanel } from './panels/Scan';
import { OpenInVkScreen } from './components/OpenInVkScreen';
import { hasUsableLaunchParams, peekPendingTaskQr, setPendingTaskQr } from './utils/launchParams';
import { apiGet, getHashSearchParams, getStoredShiftId, initAuth, setStoredShiftId } from './api/client';

export const ModalContext = createContext<{ setModal: (modal: ReactNode | null) => void }>({ setModal: () => {} });
export const useAppModal = () => useContext(ModalContext);

const DEFAULT_SECTIONS = {
  home: true,
  program: true,
  tasks: true,
  questions: true,
  profile: true,
};

const TAB_LABELS = {
  home: 'Главная',
  program: 'Программа',
  tasks: 'Задания',
  questions: 'Вопросы',
  profile: 'Профиль',
} as const;

function TabIcon({ badge, children }: { badge?: number; children: React.ReactNode }) {
  return (
    <span className="tab-icon-wrap">
      {children}
      {badge != null && badge > 0 && (
        <span className="tab-badge">{badge > 9 ? '9+' : badge}</span>
      )}
    </span>
  );
}

export const App = () => {
  const { panel: activePanel } = useActiveVkuiLocation();
  const routeNavigator = useRouteNavigator();

  const [fetchedUser, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [initComplete, setInitComplete] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [selfDeleted, setSelfDeleted] = useState(false);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [sectionsVisibility, setSectionsVisibility] = useState(DEFAULT_SECTIONS);
  const [questionsBadge, setQuestionsBadge] = useState(0);
  const [showPiggyFab, setShowPiggyFab] = useState(false);
  const [apiErrorToast, setApiErrorToast] = useState<string | null>(null);
  const [modal, setModal] = useState<ReactNode | null>(null);

  useEffect(() => {
    const handleApiError = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      setApiErrorToast(customEvent.detail);
    };
    window.addEventListener('api-error', handleApiError);
    return () => window.removeEventListener('api-error', handleApiError);
  }, []);

  const refreshTabCounts = useCallback(async () => {
    if (!isRegistered) return;
    try {
      const home = await apiGet<{ counts?: { availableQuestions?: number }; currentDay?: number; ui?: { showPiggybankFab?: boolean } }>('/home');
      setQuestionsBadge(home.counts?.availableQuestions ?? 0);
      setShowPiggyFab(home.ui?.showPiggybankFab === true);
    } catch {
      // ignore background refresh errors
    }
  }, [isRegistered]);

  const runInit = useCallback(async () => {
    setLoading(true);
    setInitError(null);
    try {
      // Production outside Mini App: no launch params → friendly gate, don't spin on API 401.
      if (import.meta.env.PROD && !isVkEnvironment() && !hasUsableLaunchParams()) {
        setInitError('__OPEN_IN_VK__');
        return;
      }

      await initAuth();

      if (isVkEnvironment()) {
        try {
          const user = await withTimeout(bridge.send('VKWebAppGetUserInfo'), 8000);
          setUser(user);
        } catch (e) {
          console.warn('VK Bridge GetUserInfo failed', e);
          try {
            const retry = await withTimeout(bridge.send('VKWebAppGetUserInfo'), 8000);
            setUser(retry);
          } catch (retryErr) {
            console.warn('VK Bridge GetUserInfo retry failed', retryErr);
          }
        }
      }

      const auth = await apiGet<{
        status: string;
        blockReason?: string;
        user?: { shiftId?: number };
        registrationTargetShiftId?: number | null;
        registrationAction?: 'enter' | 'register' | 'choose';
      }>('/auth/me');
      if (auth.status === 'self_deleted') {
        setSelfDeleted(true);
        setBlockedReason(null);
        setIsRegistered(false);
      } else if (auth.status === 'blocked') {
        setSelfDeleted(false);
        setBlockedReason(auth.blockReason || 'Доступ к программе ограничен организаторами.');
        setIsRegistered(false);
      } else if (auth.registrationAction === 'choose') {
        setIsRegistered(false);
        const pending = getHashSearchParams();
        const qr = pending.get('qr');
        const task = pending.get('task');
        if (qr) setPendingTaskQr(qr, task ? Number(task) : undefined);
        if (!window.location.hash.includes('registration')) {
          routeNavigator.push('/registration');
        }
      } else if (auth.status === 'needs_registration') {
        setIsRegistered(false);
        const pending = getHashSearchParams();
        const qr = pending.get('qr');
        const task = pending.get('task');
        if (qr) setPendingTaskQr(qr, task ? Number(task) : undefined);
        if (auth.registrationTargetShiftId && getStoredShiftId() == null) {
          setStoredShiftId(auth.registrationTargetShiftId);
        }
        if (!window.location.hash.includes('registration')) {
          routeNavigator.push('/registration');
        }
      } else {
        setBlockedReason(null);
        setIsRegistered(true);
        if (auth.user?.shiftId) {
          setStoredShiftId(auth.user.shiftId);
        }

        try {
          const home = await apiGet<{
            sectionsVisibility?: Record<string, boolean>;
            counts?: { availableQuestions?: number };
          }>('/home');
          if (home.sectionsVisibility) {
            setSectionsVisibility({ ...DEFAULT_SECTIONS, ...home.sectionsVisibility });
          }
          setQuestionsBadge(home.counts?.availableQuestions ?? 0);
        } catch (e) {
          console.warn('Failed to load sections visibility', e);
        }

        const params = getHashSearchParams();
        const q = params.get('q');
        const task = params.get('task');
        const pending = peekPendingTaskQr();
        const qr = params.get('qr') || pending?.qr || null;
        if (q) routeNavigator.push(`/questions?q=${q}`);
        // QR deep-link always goes to scan → instant credit
        else if (qr) routeNavigator.push(`/scan?qr=${encodeURIComponent(qr)}`);
        else if (task) routeNavigator.push(`/tasks?task=${task}`);
        else if (pending?.taskId) routeNavigator.push(`/tasks?task=${pending.taskId}`);
      }
    } catch (error) {
      console.error('Init error', error);
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('No Bearer token')
        || message.includes('Unauthorized')
        || message.includes('авторизация недоступна')
        || message.includes('через VK Mini App')
      ) {
        setInitError('__OPEN_IN_VK__');
        return;
      }
      setInitError('__NETWORK__');
    } finally {
      setInitComplete(true);
      setLoading(false);
    }
  }, [routeNavigator]);

  useEffect(() => {
    runInit();
  }, [runInit]);

  useEffect(() => {
    if (isRegistered && activePanel !== 'registration') {
      refreshTabCounts();
    }
  }, [activePanel, isRegistered, refreshTabCounts]);

  const handleRegistered = useCallback(() => {
    setIsRegistered(true);
    refreshTabCounts();
    const pending = peekPendingTaskQr();
    if (pending?.qr) {
      routeNavigator.push(`/scan?qr=${encodeURIComponent(pending.qr)}`);
    } else if (pending?.taskId) {
      routeNavigator.push(`/tasks?task=${pending.taskId}`);
    }
  }, [refreshTabCounts, routeNavigator]);

  const handleSelfDeleted = useCallback(() => {
    setSelfDeleted(true);
    setIsRegistered(false);
  }, []);

  const showTab = (key: keyof typeof DEFAULT_SECTIONS) =>
    sectionsVisibility[key] !== false;

  useEffect(() => {
    if (!isRegistered) return;
    const hidden = (['tasks', 'program', 'questions'] as const)
      .find(key => activePanel === key && !showTab(key));
    if (hidden) routeNavigator.push('/');
  }, [activePanel, isRegistered, sectionsVisibility, routeNavigator]);

  if (loading) {
    return (
      <div className="mashuk-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Spinner size="l" />
      </div>
    );
  }

  if (selfDeleted) {
    return (
      <div className="mashuk-root" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24, textAlign: 'center' }}>
        <div className="m-card" style={{ maxWidth: 360 }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Профиль удалён</div>
          <p style={{ fontSize: 14, color: '#555', margin: 0 }}>
            Доступ к приложению для этого профиля отключён.
            Если вы удалили профиль случайно — напишите организаторам, они помогут восстановить участие.
          </p>
        </div>
      </div>
    );
  }

  if (blockedReason) {
    return (
      <div className="mashuk-root" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24, textAlign: 'center' }}>
        <div className="m-card" style={{ maxWidth: 360 }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Доступ ограничен</div>
          <p style={{ fontSize: 14, color: '#555', margin: 0 }}>
            {blockedReason}
          </p>
          <p style={{ fontSize: 13, color: '#888', marginTop: 12, marginBottom: 0 }}>
            Если это ошибка — напишите организаторам форума.
          </p>
        </div>
      </div>
    );
  }

  if (initError === '__OPEN_IN_VK__') {
    return <OpenInVkScreen />;
  }

  if (initError) {
    return (
      <div
        className="mashuk-root"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div className="m-card" style={{ maxWidth: 360, marginBottom: 16 }}>
          <div className="m-hdr-fl" style={{ marginTop: 0 }}>Фокус дня</div>
          <div style={{ fontSize: 18, fontWeight: 800, margin: '6px 0 10px', color: 'var(--m-text-main)', lineHeight: 1.3 }}>
            Связь с Машуком чуть зависла
          </div>
          <p style={{ fontSize: 14, color: '#555', margin: 0, lineHeight: 1.45 }}>
            Видимо, есть проблемы с интернетом. Проверьте сеть и нажмите «Повторить» — день никуда не денется.
          </p>
        </div>
        <Button size="l" onClick={runInit}>Повторить</Button>
      </div>
    );
  }

  return (
    <ModalContext.Provider value={{ setModal }}>
      <SplitLayout
        modal={modal}
        popout={
          apiErrorToast ? (
            <Snackbar
              onClose={() => setApiErrorToast(null)}
              onClosed={() => setApiErrorToast(null)}
              before={<Icon28ErrorCircleOutline fill="var(--vkui--color_icon_negative)" />}
            >
              {apiErrorToast}
            </Snackbar>
          ) : null
        }
      >
        <SplitCol>
        <Epic
          activeStory="main"
      tabbar={
        activePanel !== 'registration' && (
          <Tabbar className="mashuk-tabbar">
            {showTab('home') && (
              <TabbarItem
                selected={activePanel === 'home'}
                onClick={() => routeNavigator.push('/')}
                aria-label={TAB_LABELS.home}
              >
                <span className="tab-item-inner">
                  <Icon28HomeOutline />
                  <span className="tab-label">{TAB_LABELS.home}</span>
                </span>
              </TabbarItem>
            )}
            {showTab('program') && (
              <TabbarItem
                selected={activePanel === 'program'}
                onClick={() => {
                  if (activePanel === 'program') {
                    window.dispatchEvent(new CustomEvent('mashuk-program-reset-day'));
                  }
                  routeNavigator.push('/program');
                }}
                aria-label={TAB_LABELS.program}
              >
                <span className="tab-item-inner">
                  <Icon28CalendarOutline />
                  <span className="tab-label">{TAB_LABELS.program}</span>
                </span>
              </TabbarItem>
            )}
            {showTab('tasks') && (
              <TabbarItem
                selected={activePanel === 'tasks'}
                onClick={() => routeNavigator.push('/tasks')}
                aria-label={TAB_LABELS.tasks}
              >
                <span className="tab-item-inner">
                  <Icon28ListOutline />
                  <span className="tab-label">{TAB_LABELS.tasks}</span>
                </span>
              </TabbarItem>
            )}
            {showTab('questions') && (
              <TabbarItem
                selected={activePanel === 'questions'}
                onClick={() => routeNavigator.push('/questions')}
                aria-label={TAB_LABELS.questions}
              >
                <span className="tab-item-inner">
                  <TabIcon badge={activePanel === 'questions' ? 0 : questionsBadge}>
                    <Icon28HelpOutline />
                  </TabIcon>
                  <span className="tab-label">{TAB_LABELS.questions}</span>
                </span>
              </TabbarItem>
            )}
            {showPiggyFab && (
              <TabbarItem
                selected={false}
                onClick={() => openQuickCapture(setModal, {
                  onSaved: () => void refreshTabCounts(),
                  onError: (message) => setApiErrorToast(message),
                })}
                aria-label="Добавить в копилку"
              >
                <span className="tab-item-inner tab-item-inner--fab">
                  <Icon28AddOutline />
                </span>
              </TabbarItem>
            )}
            {showTab('profile') && (
              <TabbarItem
                selected={activePanel === 'profile'}
                onClick={() => routeNavigator.push('/profile')}
                aria-label={TAB_LABELS.profile}
              >
                <span className="tab-item-inner">
                  <Icon28UserCircleOutline />
                  <span className="tab-label">{TAB_LABELS.profile}</span>
                </span>
              </TabbarItem>
            )}
          </Tabbar>
        )
      }
    >
      <View 
        id="main" 
        activePanel={activePanel || 'home'}
      >
        <HomePanel id="home" fetchedUser={fetchedUser} isRegistered={isRegistered} initComplete={initComplete} />
        <ProgramPanel id="program" />
        <TasksPanel id="tasks" />
        <QuestionsPanel id="questions" onActivity={refreshTabCounts} />
        <ProfilePanel id="profile" fetchedUser={fetchedUser} onSelfDeleted={handleSelfDeleted} />
        <RegistrationPanel id="registration" fetchedUser={fetchedUser} isRegistered={isRegistered} onRegistered={handleRegistered} />
        <VolunteerPanel id="volunteer" />
        <DelayedSurveyPanel id="delayed-survey" />
        <ScanPanel id="scan" />
      </View>
    </Epic>
      </SplitCol>
      </SplitLayout>
    </ModalContext.Provider>
  );
};
