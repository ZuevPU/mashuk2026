import { useEffect, useState } from 'react';
import {
  adminFetch,
  adminLogin,
  getAdminToken,
  setAdminToken,
} from './admin/client';
import { translateApiError } from './admin/errors';
import { AdminsTab } from './components/admins/AdminsTab';
import { AnalyticsTab } from './components/analytics/AnalyticsTab';
import { DataTab } from './components/data/DataTab';
import { DirectionsTab } from './components/directions/DirectionsTab';
import { ExportsTab } from './components/exports/ExportsTab';
import { ForumTab } from './components/forum/ForumTab';
import { JournalTab } from './components/journal/JournalTab';
import { KnowledgeTab } from './components/knowledge/KnowledgeTab';
import { LevelsTab } from './components/levels/LevelsTab';
import { MedalsTab } from './components/medals/MedalsTab';
import { ModerationTab } from './components/moderation/ModerationTab';
import { OnboardingTab } from './components/onboarding/OnboardingTab';
import { ROLE_OPTIONS } from './components/onboarding/roleOptions';
import { ParticipantCardModal } from './components/ParticipantCard';
import { ParticipantsTab } from './components/participants/ParticipantsTab';
import { ProgramTab } from './components/program/ProgramTab';
import { PushTab } from './components/push/PushTab';
import { QuestionsTab } from './components/questions/QuestionsTab';
import { TasksTab } from './components/tasks/TasksTab';
import { TAB_LABELS, TAB_ORDER, type Tab } from './tabs';

export const App = () => {
  const [tab, setTab] = useState<Tab>('participants');
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const reload = () => setReloadKey(k => k + 1);
  const act = (fn: () => Promise<unknown>, msg = 'Сохранено') =>
    fn().then(() => { setToast(msg); reload(); }).catch(e => setToast(translateApiError(String(e))));

  const [participantCard, setParticipantCard] = useState<any>(null);
  const [participantCardTab, setParticipantCardTab] = useState<
    'profile' | 'answers' | 'tasks' | 'medals' | 'points' | 'piggybank'
  >('profile');

  const openParticipantCard = (
    id: number,
    cardTab: typeof participantCardTab = 'profile',
  ) => {
    setParticipantCardTab(cardTab);
    adminFetch(`/participants/${id}/card`)
      .then(card => setParticipantCard(card))
      .catch(e => setToast(translateApiError(String(e))));
  };

  const [loginName, setLoginName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    if (getAdminToken()) setIsAuthenticated(true);
  }, []);

  useEffect(() => {
    const handleApiError = (e: Event) => {
      setToast((e as CustomEvent<string>).detail);
    };
    window.addEventListener('api-error', handleApiError);
    return () => window.removeEventListener('api-error', handleApiError);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      await adminLogin(loginName.trim(), loginPassword);
      setIsAuthenticated(true);
    } catch (err) {
      setLoginError(translateApiError(err instanceof Error ? err.message : 'Ошибка входа'));
    }
  };

  const handleLogout = () => {
    setAdminToken(null);
    setIsAuthenticated(false);
    setLoginName('');
    setLoginPassword('');
  };

  const tabProps = { adminFetch, act, reloadKey, setTab };

  if (!isAuthenticated) {
    return (
      <div className="admin-login-page">
        <form onSubmit={handleLogin} className="admin-login-form">
          <h2>Вход в админку</h2>
          <input
            type="text"
            className="admin-login-input"
            value={loginName}
            onChange={e => setLoginName(e.target.value)}
            placeholder="Логин"
            autoComplete="username"
          />
          <input
            type="password"
            className="admin-login-input"
            value={loginPassword}
            onChange={e => setLoginPassword(e.target.value)}
            placeholder="Пароль"
            autoComplete="current-password"
          />
          {loginError && <div className="admin-login-error">{loginError}</div>}
          <button type="submit" className="admin-login-submit">Войти</button>
        </form>
      </div>
    );
  }

  return (
    <div className="admin">
      <header className="admin-header">
        <h1>Машук 2026 · Админ-панель</h1>
        <button type="button" className="admin-logout-btn adm-btn adm-btn-secondary" onClick={handleLogout}>
          Выйти
        </button>
      </header>
      <nav className="admin-nav">
        {TAB_ORDER.map(t => (
          <button key={t} type="button" className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </nav>
      <main className="admin-main">
        {tab === 'participants' && (
          <ParticipantsTab {...tabProps} onOpenCard={openParticipantCard} />
        )}
        {tab === 'directions' && <DirectionsTab {...tabProps} />}
        {tab === 'onboarding' && (
          <OnboardingTab {...tabProps} onOpenProgram={() => setTab('events')} />
        )}
        {tab === 'forum' && <ForumTab {...tabProps} />}
        {tab === 'events' && <ProgramTab {...tabProps} />}
        {tab === 'knowledge' && <KnowledgeTab {...tabProps} onOpenCard={openParticipantCard} />}
        {tab === 'tasks' && <TasksTab {...tabProps} />}
        {tab === 'questions' && (
          <QuestionsTab {...tabProps} />
        )}
        {tab === 'moderation' && (
          <ModerationTab {...tabProps} onOpenCard={openParticipantCard} />
        )}
        {tab === 'data' && <DataTab {...tabProps} />}
        {tab === 'levels' && <LevelsTab {...tabProps} />}
        {tab === 'analytics' && (
          <AnalyticsTab {...tabProps} onOpenCard={openParticipantCard} />
        )}
        {tab === 'exports' && <ExportsTab {...tabProps} />}
        {tab === 'push' && (
          <PushTab {...tabProps} onOpenCard={openParticipantCard} />
        )}
        {tab === 'admins' && <AdminsTab {...tabProps} />}
        {tab === 'journal' && <JournalTab {...tabProps} />}
        {tab === 'medals' && <MedalsTab {...tabProps} />}
      </main>

      {participantCard && (
        <ParticipantCardModal
          card={participantCard}
          tab={participantCardTab}
          setTab={t => setParticipantCardTab(t as typeof participantCardTab)}
          onClose={() => setParticipantCard(null)}
          onReloadCard={() => {
            const id = participantCard.participant?.id;
            if (id) openParticipantCard(id, participantCardTab);
          }}
          adminFetch={adminFetch}
          act={act}
          roleOptions={ROLE_OPTIONS}
        />
      )}
      {toast && (
        <div className="toast" onClick={() => setToast(null)} role="status">
          {toast}
        </div>
      )}
    </div>
  );
};
