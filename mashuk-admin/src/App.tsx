import { useEffect, useRef, useState } from 'react';
import {
  ADMIN_SHIFT_CHANGED_EVENT,
  adminFetch,
  adminLogin,
  getAdminEditingShiftId,
  getAdminToken,
  setAdminEditingShiftId,
  setAdminToken,
} from './admin/client';
import { translateApiError } from './admin/errors';
import { AdminsTab } from './components/admins/AdminsTab';
import { AnalyticsTab } from './components/analytics/AnalyticsTab';
import { DataTab } from './components/data/DataTab';
import { DirectionsTab } from './components/directions/DirectionsTab';
import { ExportsTab } from './components/exports/ExportsTab';
import { InsightsChrome } from './components/insights/InsightsChrome';
import { InsightsProvider } from './components/insights/InsightsContext';
import { ForumTab } from './components/forum/ForumTab';
import { HubTab } from './components/hub/HubTab';
import { JournalTab } from './components/journal/JournalTab';
import { KnowledgeTab } from './components/knowledge/KnowledgeTab';
import { LevelsTab } from './components/levels/LevelsTab';
import { MedalsTab } from './components/medals/MedalsTab';
import { PiggybankTab } from './components/piggybank/PiggybankTab';
import { ModerationTab } from './components/moderation/ModerationTab';
import { OnboardingTab } from './components/onboarding/OnboardingTab';
import { ROLE_OPTIONS } from './components/onboarding/roleOptions';
import { ParticipantCardModal } from './components/ParticipantCard';
import { ParticipantsTab } from './components/participants/ParticipantsTab';
import { ProgramTab } from './components/program/ProgramTab';
import { SpeakersTab } from './components/speakers/SpeakersTab';
import { PushTab } from './components/push/PushTab';
import { RecommendationTagsTab } from './components/tags/RecommendationTagsTab';
import { QuestionsTab } from './components/questions/QuestionsTab';
import { ShiftsTab } from './components/shifts/ShiftsTab';
import { TasksTab } from './components/tasks/TasksTab';
import { LeaderboardScreen, RatingTab } from './components/rating/RatingTab';
import { TAB_LABELS, TAB_ORDER, groupedAllowedTabs, isNavShortcut, type Tab } from './tabs';

type AdminMe = {
  role?: string;
  allowedTabs?: string[];
  defaultTab?: string;
  analyticsDashboards?: string[] | null;
};

function isLeaderboardHash(): boolean {
  return typeof window !== 'undefined' && window.location.hash.startsWith('#/leaderboard-screen');
}

export const App = () => {
  const [tab, setTab] = useState<Tab>('participants');
  const [allowedTabs, setAllowedTabs] = useState<Tab[]>([...TAB_ORDER]);
  const [analyticsDashboardAllowlist, setAnalyticsDashboardAllowlist] = useState<string[] | null>(null);
  const [adminRole, setAdminRole] = useState<string>('admin');
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const reload = () => setReloadKey(k => k + 1);
  const act = (fn: () => Promise<unknown>, msg = 'Сохранено', opts?: { reload?: boolean }) =>
    fn().then((result) => {
      setToast(typeof result === 'string' && result.length > 0 ? result : msg);
      if (opts?.reload !== false) reload();
    }).catch(e => setToast(translateApiError(String(e))));

  const [participantCard, setParticipantCard] = useState<any>(null);
  const [participantCardTab, setParticipantCardTab] = useState<
    'profile' | 'activity' | 'answers' | 'tasks' | 'medals' | 'points' | 'piggybank' | 'logs'
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
  const [shiftOptions, setShiftOptions] = useState<{ id: number; name: string; code: string }[]>([]);
  const [editingShiftId, setEditingShiftId] = useState<number | null>(() => getAdminEditingShiftId());
  const [activeShiftId, setActiveShiftId] = useState<number | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  /** Якорь внутри вкладки Форум (итоговая анкета вечера). */
  const [forumFocus, setForumFocus] = useState<{ anchor: string; nonce: number } | null>(null);
  /** Не сбрасывать вкладку на defaultTab после каждого act()/reloadKey */
  const appliedDefaultTabRef = useRef(false);

  useEffect(() => {
    if (getAdminToken()) setIsAuthenticated(true);
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 960) setNavOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      appliedDefaultTabRef.current = false;
      return;
    }
    adminFetch('/auth/me')
      .then((me: AdminMe) => {
        setAdminRole(me.role ?? 'admin');
        const tabs = (me.allowedTabs ?? TAB_ORDER) as Tab[];
        setAllowedTabs(tabs.length ? tabs : [...TAB_ORDER]);
        if (!appliedDefaultTabRef.current) {
          if (me.defaultTab && tabs.includes(me.defaultTab as Tab)) {
            setTab(me.defaultTab as Tab);
          }
          appliedDefaultTabRef.current = true;
        }
        setAnalyticsDashboardAllowlist(me.analyticsDashboards ?? null);
      })
      .catch(() => {
        setAllowedTabs([...TAB_ORDER]);
      });
  }, [isAuthenticated, reloadKey]);

  useEffect(() => {
    if (!isAuthenticated) return;
    adminFetch('/shifts')
      .then((res: { shifts?: { id: number; name: string; code: string }[]; activeShiftId?: number | null }) => {
        const list = res.shifts || [];
        setShiftOptions(list);
        const activeId = res.activeShiftId ?? null;
        setActiveShiftId(activeId);
        const stored = getAdminEditingShiftId();
        const storedOk = stored != null && list.some(s => s.id === stored);
        const next = storedOk ? stored : (activeId ?? list[0]?.id ?? null);
        if (next !== stored) setAdminEditingShiftId(next);
        setEditingShiftId(next);
      })
      .catch(() => {
        setShiftOptions([]);
      });
  }, [isAuthenticated, reloadKey]);

  useEffect(() => {
    const handleApiError = (e: Event) => {
      setToast((e as CustomEvent<string>).detail);
    };
    window.addEventListener('api-error', handleApiError);
    return () => window.removeEventListener('api-error', handleApiError);
  }, []);

  useEffect(() => {
    const onShiftChanged = (e: Event) => {
      const id = (e as CustomEvent<number | null>).detail ?? getAdminEditingShiftId();
      setEditingShiftId(id);
      reload();
    };
    window.addEventListener(ADMIN_SHIFT_CHANGED_EVENT, onShiftChanged);
    return () => window.removeEventListener(ADMIN_SHIFT_CHANGED_EVENT, onShiftChanged);
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

  const selectTab = (next: Tab) => {
    setTab(next);
    setForumFocus(null);
  };

  const tabProps = { adminFetch, act, reloadKey, setTab: selectTab, adminRole };

  if (isAuthenticated && isLeaderboardHash()) {
    return (
      <>
        <LeaderboardScreen adminFetch={adminFetch} onOpenCard={openParticipantCard} />
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
      </>
    );
  }

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

  const navGroups = groupedAllowedTabs(allowedTabs);

  return (
    <div className={`admin admin-shell${navOpen ? ' admin-shell--nav-open' : ''}`}>
      {navOpen && (
        <button
          type="button"
          className="admin-nav-backdrop"
          aria-label="Закрыть меню"
          onClick={() => setNavOpen(false)}
        />
      )}

      <aside className="admin-sidebar" aria-label="Навигация">
        <div className="admin-sidebar-brand">
          <span className="admin-sidebar-mark" aria-hidden>M</span>
          <div className="admin-sidebar-brand-text">
            <strong>Машук 2026</strong>
            <span>Админ-панель</span>
          </div>
        </div>

        <nav className="admin-nav">
          {navGroups.map(group => (
            <div key={group.id} className="admin-nav-group">
              <div className="admin-nav-group-label">{group.label}</div>
              {group.items.map(entry => {
                if (isNavShortcut(entry)) {
                  const on = tab === entry.tab && forumFocus?.anchor === entry.anchor;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className={`admin-nav-sub${on ? ' on' : ''}`}
                      onClick={() => {
                        setTab(entry.tab);
                        setForumFocus({ anchor: entry.anchor, nonce: Date.now() });
                        setNavOpen(false);
                      }}
                    >
                      {entry.label}
                    </button>
                  );
                }
                const on = tab === entry && (entry !== 'forum' || !forumFocus);
                return (
                  <button
                    key={entry}
                    type="button"
                    className={on ? 'on' : ''}
                    onClick={() => {
                      selectTab(entry);
                      setNavOpen(false);
                    }}
                  >
                    {TAB_LABELS[entry]}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <button type="button" className="admin-logout-btn" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </aside>

      <div className="admin-workspace">
        <header className="admin-topbar">
          <button
            type="button"
            className="admin-nav-toggle"
            aria-label="Меню"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(o => !o)}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="admin-topbar-title">
            <h1>
              {tab === 'forum' && forumFocus?.anchor === 'forum-cfg-evening'
                ? 'Итоговая анкета вечера'
                : TAB_LABELS[tab]}
            </h1>
          </div>
          {shiftOptions.length > 0 && (
            <label className="admin-shift-select">
              <span>Смена</span>
              <select
                className="adm-input"
                value={editingShiftId ?? ''}
                onChange={e => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  setAdminEditingShiftId(id);
                }}
              >
                {shiftOptions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.id === activeShiftId ? ' · участники' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
        </header>

        <main className="admin-main">
          {tab === 'rating' && <RatingTab {...tabProps} onOpenCard={openParticipantCard} />}
          {tab === 'participants' && (
            <ParticipantsTab {...tabProps} onOpenCard={openParticipantCard} />
          )}
          {tab === 'directions' && <DirectionsTab {...tabProps} />}
          {tab === 'onboarding' && (
            <OnboardingTab {...tabProps} onOpenProgram={() => selectTab('events')} />
          )}
          {tab === 'forum' && (
            <ForumTab
              {...tabProps}
              focusAnchor={forumFocus?.anchor ?? null}
              focusNonce={forumFocus?.nonce ?? 0}
            />
          )}
          {tab === 'shifts' && <ShiftsTab {...tabProps} />}
          {tab === 'events' && <ProgramTab {...tabProps} />}
          {tab === 'speakers' && <SpeakersTab {...tabProps} />}
          {tab === 'knowledge' && <KnowledgeTab {...tabProps} onOpenCard={openParticipantCard} />}
          {tab === 'tasks' && <TasksTab {...tabProps} />}
          {tab === 'questions' && (
            <QuestionsTab {...tabProps} onOpenCard={openParticipantCard} />
          )}
          {tab === 'moderation' && (
            <ModerationTab {...tabProps} onOpenCard={openParticipantCard} />
          )}
          {tab === 'piggybank' && (
            <PiggybankTab {...tabProps} onOpenCard={openParticipantCard} />
          )}
          {tab === 'data' && <DataTab {...tabProps} />}
          {tab === 'levels' && <LevelsTab {...tabProps} />}
          {tab === 'hub' && <HubTab {...tabProps} onOpenCard={openParticipantCard} />}
          {(tab === 'analytics' || tab === 'exports') && (
            <InsightsProvider
              adminFetch={adminFetch}
              setTab={setTab}
              reloadKey={reloadKey}
              activeSection={tab === 'exports' ? 'exports' : 'analytics'}
              analyticsDashboardAllowlist={analyticsDashboardAllowlist}
            >
              <InsightsChrome>
                {tab === 'analytics' && (
                  <AnalyticsTab {...tabProps} onOpenCard={openParticipantCard} />
                )}
                {tab === 'exports' && <ExportsTab {...tabProps} />}
              </InsightsChrome>
            </InsightsProvider>
          )}
          {tab === 'push' && <PushTab {...tabProps} />}
          {tab === 'recommendation-tags' && <RecommendationTagsTab {...tabProps} />}
          {tab === 'admins' && <AdminsTab {...tabProps} />}
          {tab === 'journal' && <JournalTab {...tabProps} />}
          {tab === 'medals' && <MedalsTab {...tabProps} />}
        </main>
      </div>

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
