import { useState, useEffect, useCallback } from 'react';
import { bridge, isVkEnvironment } from './utils/vkBridgeClient';
import { UserInfo } from '@vkontakte/vk-bridge';
import {
  View, Spinner, Button,
  Epic, Tabbar, TabbarItem,
} from '@vkontakte/vkui';
import { Icon28HomeOutline, Icon28CalendarOutline, Icon28ListOutline, Icon28HelpOutline, Icon28UserCircleOutline } from '@vkontakte/icons';
import { useActiveVkuiLocation, useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import { HomePanel } from './panels/Home';
import { ProgramPanel } from './panels/Program';
import { TasksPanel } from './panels/Tasks';
import { QuestionsPanel } from './panels/Questions';
import { ProfilePanel } from './panels/Profile';
import { RegistrationPanel } from './panels/Registration';
import { apiGet, getApiUrl, getHashSearchParams, initAuth } from './api/client';

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
  questions: 'Общение',
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
  const [sectionsVisibility, setSectionsVisibility] = useState(DEFAULT_SECTIONS);
  const [questionsBadge, setQuestionsBadge] = useState(0);

  const refreshTabCounts = useCallback(async () => {
    if (!isRegistered) return;
    try {
      const home = await apiGet<{ counts?: { availableQuestions?: number } }>('/home');
      setQuestionsBadge(home.counts?.availableQuestions ?? 0);
    } catch {
      // ignore background refresh errors
    }
  }, [isRegistered]);

  const runInit = useCallback(async () => {
    setLoading(true);
    setInitError(null);
    try {
      await initAuth();

      if (isVkEnvironment()) {
        try {
          const user = await bridge.send('VKWebAppGetUserInfo');
          setUser(user);
        } catch (e) {
          console.warn('VK Bridge GetUserInfo failed', e);
        }
      }

      const auth = await apiGet<{ status: string }>('/auth/me');
      if (auth.status === 'needs_registration') {
        setIsRegistered(false);
        if (!window.location.hash.includes('registration')) {
          routeNavigator.push('/registration');
        }
      } else {
        setIsRegistered(true);

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
        if (q) routeNavigator.push(`/questions?q=${q}`);
        else if (task) routeNavigator.push(`/tasks?task=${task}`);
      }
    } catch (error) {
      console.error('Init error', error);
      const apiUrl = getApiUrl();
      const hint = !apiUrl.startsWith('https://')
        ? ' Укажите VITE_API_URL с https:// в Timeweb.'
        : '';
      setInitError(`Ошибка: ${error instanceof Error ? error.message : String(error)} | API: ${apiUrl}${hint}`);
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
  }, [refreshTabCounts]);

  const showTab = (key: keyof typeof DEFAULT_SECTIONS) =>
    sectionsVisibility[key] !== false;

  if (loading) {
    return (
      <div className="mashuk-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Spinner size="l" />
      </div>
    );
  }

  if (initError) {
    return (
      <div className="mashuk-root" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24, textAlign: 'center' }}>
        <div className="m-card" style={{ color: '#C53030', marginBottom: 16, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{initError}</div>
        <Button size="l" onClick={runInit}>Повторить</Button>
      </div>
    );
  }

  return (
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
                onClick={() => routeNavigator.push('/program')}
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
      <View id="main" activePanel={activePanel || 'home'}>
        <HomePanel id="home" fetchedUser={fetchedUser} isRegistered={isRegistered} initComplete={initComplete} />
        <ProgramPanel id="program" />
        <TasksPanel id="tasks" />
        <QuestionsPanel id="questions" onActivity={refreshTabCounts} />
        <ProfilePanel id="profile" fetchedUser={fetchedUser} />
        <RegistrationPanel id="registration" fetchedUser={fetchedUser} isRegistered={isRegistered} onRegistered={handleRegistered} />
      </View>
    </Epic>
  );
};
