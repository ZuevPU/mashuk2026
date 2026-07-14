import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import { label } from './labels/ru';

function translateApiError(message: string): string {
  if (message.includes('No token in response')) return 'Сервер не вернул токен';
  if (message.includes('Not authenticated')) return 'Не авторизован';
  if (message.includes('Session expired')) return 'Сессия истекла. Войдите снова.';
  if (message.includes('VITE_API_URL is not set')) {
    return 'Не задан VITE_API_URL. Укажите его в Timeweb Apps и пересоберите админку.';
  }
  if (message.includes('API returned HTML instead of JSON')) {
    return 'API вернул HTML вместо JSON. Проверьте VITE_API_URL в Timeweb Apps и пересоберите админку.';
  }
  if (message.startsWith('HTTP ')) return `Ошибка сервера: ${message}`;
  return message;
}

function EnumOptions({ values }: { values: string[] }) {
  return (
    <>
      {values.map(v => (
        <option key={v} value={v}>{label(v)}</option>
      ))}
    </>
  );
}

const ADMIN_TOKEN_KEY = 'mashuk_admin_token';

function getAdminToken(): string | null {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

function setAdminToken(token: string | null): void {
  if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

function normalizeApiUrl(url: string): string {
  if (!url) return '';
  let normalized = url.trim();
  if (!normalized.startsWith('/') && !/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }
  const isLocalhost = /localhost|127\.0\.0\.1/i.test(normalized);
  if (normalized.startsWith('http://') && !isLocalhost) {
    normalized = normalized.replace(/^http:\/\//, 'https://');
  }
  return normalized.replace(/\/$/, '');
}

const API_BASE = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL && !import.meta.env.VITE_API_URL.includes('localhost') 
      ? normalizeApiUrl(import.meta.env.VITE_API_URL) 
      : 'https://zuevpu-mashuk2026-ae82.twc1.net/api')
  : normalizeApiUrl(import.meta.env.VITE_API_URL || '');

function getConfigError(): string | null {
  return null;
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.status >= 500 && i < retries) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      return res;
    } catch (e) {
      if (i === retries) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('api-error', { detail: 'Ошибка сети. Проверьте подключение.' }));
        }
        throw e;
      }
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error('Unreachable');
}

async function adminLogin(login: string, password: string) {
  const base = API_BASE ? `${API_BASE}/admin` : '/api/admin';
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  const data = text ? JSON.parse(text) : null;
  if (!data?.token) throw new Error('Сервер не вернул токен');
  setAdminToken(data.token);
  return data;
}

async function adminFetch(path: string, options: RequestInit = {}) {
  const base = API_BASE ? `${API_BASE}/admin` : '/api/admin';
  if (import.meta.env.PROD && !API_BASE) {
    throw new Error('Не задан VITE_API_URL. Укажите его в Timeweb Apps и пересоберите админку.');
  }
  const token = getAdminToken();
  if (!token) throw new Error('Не авторизован');
  const res = await fetchWithRetry(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    setAdminToken(null);
    throw new Error('Сессия истекла. Войдите снова.');
  }
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/html') || text.trimStart().startsWith('<!')) {
    throw new Error(
      'API вернул HTML вместо JSON. Проверьте VITE_API_URL в Timeweb Apps и пересоберите админку.',
    );
  }
  if (ct.includes('text/csv')) return text;
  return text ? JSON.parse(text) : null;
}

function downloadCsv(path: string, filename: string) {
  adminFetch(path).then((csv: unknown) => {
    const blob = new Blob([csv as string], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }).catch(console.error);
}

async function adminDownloadBinary(path: string, filename: string) {
  const base = API_BASE ? `${API_BASE}/admin` : '/api/admin';
  const token = getAdminToken();
  if (!token) throw new Error('Не авторизован');
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

type Tab = 'participants' | 'directions' | 'events' | 'tasks' | 'questions' | 'roles' | 'forum' | 'moderation' | 'data' | 'levels' | 'analytics' | 'exports' | 'push' | 'admins' | 'journal' | 'medals';

const TAB_LABELS: Record<Tab, string> = {
  participants: 'Участники',
  directions: 'Направления',
  events: 'События',
  tasks: 'Задания',
  questions: 'Вопросы',
  roles: 'Роли',
  forum: 'Форум',
  moderation: 'Модерация',
  data: 'Данные',
  levels: 'Баллы',
  analytics: 'Аналитика',
  exports: 'Выгрузки',
  push: 'Уведомления',
  admins: 'Админы',
  journal: 'Журнал',
  medals: 'Медали',
};

const SECTIONS = ['home', 'program', 'tasks', 'questions', 'profile'];

const Pagination = ({ page, total, limit = 50, setPage }: { page: number, total: number, limit?: number, setPage: (p: number) => void }) => {
  const pages = Math.ceil(total / limit);
  if (pages <= 1) return null;
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center', fontSize: 14 }}>
      <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Назад</button>
      <span>Страница {page} из {pages} (всего: {total})</span>
      <button disabled={page >= pages} onClick={() => setPage(page + 1)}>Вперед</button>
    </div>
  );
};

export const App = () => {
  const [tab, setTab] = useState<Tab>('participants');
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const reload = () => setReloadKey(k => k + 1);
  const act = (fn: () => Promise<unknown>, msg = 'Сохранено') =>
    fn().then(() => { setToast(msg); reload(); }).catch(e => setToast(translateApiError(String(e))));

  const [participants, setParticipants] = useState<any[]>([]);
  const [participantSearch, setParticipantSearch] = useState('');
  const [directions, setDirections] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [thematicTags, setThematicTags] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [forumSettings, setForumSettings] = useState<any>(null);
  const [pendingExchange, setPendingExchange] = useState<any[]>([]);
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [charts, setCharts] = useState<any>(null);
  const [levelsConfig, setLevelsConfig] = useState<any[]>([]);
  const [pointsLog, setPointsLog] = useState<any[]>([]);
  const [pushLog, setPushLog] = useState<any[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [exchangeArchive, setExchangeArchive] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [dayFocusList, setDayFocusList] = useState<any[]>([]);
  const [recThreshold, setRecThreshold] = useState(1);

  const [newParticipant, setNewParticipant] = useState({ vkId: '', firstName: '', lastName: '', directionId: '' });
  const [newDirection, setNewDirection] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newEvent, setNewEvent] = useState({
    title: '', description: '', place: '', dayNumber: 1, timeSlot: '09:00', tags: '',
  });
  const [newTask, setNewTask] = useState({
    title: '', description: '', category: '', points: 20, answerType: 'text_and_photo',
    confirmationType: 'text_photo',
    allowRetry: true, autoConfirm: false, pushOnPublish: false, hideUntilPublish: true, dayNumber: 1,
  });
  const [newQuestion, setNewQuestion] = useState({
    title: '', text: '', type: 'open', block: 'Целеполагание', status: 'published',
    timePoint: '', dayNumber: 1, points: 10, allowRetry: false, pushOnPublish: false,
    publishTime: '', closeTime: '',
  });
  const [copyDayForm, setCopyDayForm] = useState({ fromDay: 1, toDay: 2, overwrite: false });
  const [questionOptionsMap, setQuestionOptionsMap] = useState<Record<number, any[]>>({});
  const [optionForm, setOptionForm] = useState({ questionId: '', label: '', value: '' });
  const [dayFocusForm, setDayFocusForm] = useState({ dayNumber: 1, title: '', text: '', keyQuestion: '' });
  const [sectionsVis, setSectionsVis] = useState<Record<string, boolean>>({});
  const [rejectComment, setRejectComment] = useState<Record<number, string>>({});
  const [pushText, setPushText] = useState('');
  const [pushParticipantId, setPushParticipantId] = useState('');
  const [newLevel, setNewLevel] = useState({
    actionType: '', pointsPerUnit: 10, maxAccruals: 0, levelType: 'experience', levelThresholds: '0,100,250,500,1000',
  });
  const [newMaterial, setNewMaterial] = useState({
    dayNumber: 1, speakerName: '', speakerInitials: '', eventTitle: '', type: 'pdf', title: '', description: '', url: '', isNew: false,
    eventId: '', direction: '', tags: '', isGeneral: false, includeInAnalytics: true,
  });
  const [scheduleVersions, setScheduleVersions] = useState<any[]>([]);
  const [mergeTags, setMergeTags] = useState({ fromId: '', toId: '' });
  const [newMedal, setNewMedal] = useState({
    name: '', description: '', level: 'bronze', awardType: 'manual', conditionRule: '',
  });
  const [roles, setRoles] = useState<any[]>([]);
  const [dayExperiments, setDayExperiments] = useState<any[]>([]);
  const [expForm, setExpForm] = useState({
    dayNumber: 2, roleKey: 'meaning_researcher', title: '', body: '', hint: '',
  });
  const [exportDay, setExportDay] = useState('1');
  const [exportType, setExportType] = useState('all');
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [newAdmin, setNewAdmin] = useState({ login: '', password: '', role: 'moderator' });
  const [actionsLog, setActionsLog] = useState<any[]>([]);
  const [journalCritical, setJournalCritical] = useState(false);
  const [medals, setMedals] = useState<any[]>([]);
  const [dashboards, setDashboards] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [consents, setConsents] = useState<any[]>([]);
  const [orgThreads, setOrgThreads] = useState<any[]>([]);
  const [pushTemplates, setPushTemplates] = useState<any[]>([]);
  const [pdfWhitelist, setPdfWhitelist] = useState<any[]>([]);
  const [newGroup, setNewGroup] = useState({ name: '', capacity: 30, directionId: '' });
  const [newConsent, setNewConsent] = useState({ kind: 'pd', version: 1, title: '', body: '', isActive: true });
  const [newPushTemplate, setNewPushTemplate] = useState({ key: '', title: '', body: '', slotKey: '', isActive: true });
  const [orgReplyDraft, setOrgReplyDraft] = useState<Record<number, string>>({});
  const [diagMatrix, setDiagMatrix] = useState<string[][]>([]);
  const [participantCard, setParticipantCard] = useState<any>(null);
  const [participantCardTab, setParticipantCardTab] = useState<'profile' | 'answers' | 'tasks' | 'medals' | 'points'>('profile');
  const [rightsMatrix, setRightsMatrix] = useState<any[]>([]);
  const ROLE_OPTIONS = [
    { key: 'meaning_researcher', name: 'Исследователь смыслов' },
    { key: 'practice_realizer', name: 'Реализатор практики' },
    { key: 'communication_guide', name: 'Проводник коммуникации' },
    { key: 'content_packer', name: 'Упаковщик содержания' },
    { key: 'process_navigator', name: 'Навигатор процесса' },
    { key: 'environment_keeper', name: 'Хранитель среды' },
  ];

  const [participantsPage, setParticipantsPage] = useState(1);
  const [participantsTotal, setParticipantsTotal] = useState(0);
  const [submissionsPage, setSubmissionsPage] = useState(1);
  const [submissionsTotal, setSubmissionsTotal] = useState(0);
  const [attendancePage, setAttendancePage] = useState(1);
  const [attendanceTotal, setAttendanceTotal] = useState(0);
  const [exchangePage, setExchangePage] = useState(1);
  const [exchangeTotal, setExchangeTotal] = useState(0);

  const [tabLoading, setTabLoading] = useState(false);

  useEffect(() => {
    const handleApiError = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      setToast(customEvent.detail);
    };
    window.addEventListener('api-error', handleApiError);
    return () => window.removeEventListener('api-error', handleApiError);
  }, []);

  useEffect(() => {
    (async () => {
      setTabLoading(true);
      try {
        if (tab === 'participants') {
          const res = await adminFetch(`/participants?page=${participantsPage}`);
          setParticipants(res.participants);
          setParticipantsTotal(res.totalCount || 0);
        }
        if (tab === 'directions') setDirections((await adminFetch('/directions')).directions);
        if (tab === 'events') {
          setEvents((await adminFetch('/events')).events);
          setThematicTags((await adminFetch('/thematic-tags')).tags);
          setMaterials((await adminFetch('/materials')).materials);
          setScheduleVersions((await adminFetch('/schedule/versions')).versions || []);
        }
        if (tab === 'tasks') setTasks((await adminFetch('/tasks')).tasks);
        if (tab === 'questions') {
          const qs = (await adminFetch('/questions')).questions;
          setQuestions(qs);
          const optsEntries = await Promise.all(
            (qs as { id: number }[]).map(async (q) => {
              try {
                const r = await adminFetch(`/questions/${q.id}/options`) as { options: unknown[] };
                return [q.id, r.options || []] as const;
              } catch {
                return [q.id, []] as const;
              }
            }),
          );
          setQuestionOptionsMap(Object.fromEntries(optsEntries));
        }
        if (tab === 'forum') {
          const fs = (await adminFetch('/forum-settings')).settings;
          setForumSettings(fs);
          setSectionsVis((fs?.sectionsVisibility as Record<string, boolean>) || {});
          setRecThreshold(fs?.recommendationThreshold ?? 1);
          setDayFocusList((await adminFetch('/day-focus')).focus);
          setGroups((await adminFetch('/groups')).groups || []);
          setConsents((await adminFetch('/consents')).consents || []);
          setDirections((await adminFetch('/directions')).directions);
        }
        if (tab === 'moderation') {
          setPendingExchange((await adminFetch('/exchange/pending')).questions);
          setPendingTasks((await adminFetch('/task-submissions/pending')).submissions);
          setExchangeArchive((await adminFetch('/exchange?status=approved')).questions);
          setOrgThreads((await adminFetch('/org/threads')).threads || []);
        }
        if (tab === 'push') {
          setPushLog((await adminFetch('/push/log')).log);
          setPushTemplates((await adminFetch('/push/templates')).templates || []);
        }
        if (tab === 'participants') {
          setPdfWhitelist((await adminFetch('/pdf-whitelist')).entries || []);
        }
        if (tab === 'data') {
          const subRes = await adminFetch(`/task-submissions?page=${submissionsPage}`);
          setAllSubmissions(subRes.submissions);
          setSubmissionsTotal(subRes.totalCount || 0);

          const attRes = await adminFetch(`/event-attendance?page=${attendancePage}`);
          setAttendance(attRes.attendance);
          setAttendanceTotal(attRes.totalCount || 0);

          const exRes = await adminFetch(`/exchange?page=${exchangePage}`);
          setExchangeArchive(exRes.questions);
          setExchangeTotal(exRes.totalCount || 0);
        }
        if (tab === 'levels') {
          setLevelsConfig((await adminFetch('/levels-config')).config);
          setPointsLog((await adminFetch('/points-log')).log);
        }
        if (tab === 'analytics') {
          setAnalytics(await adminFetch('/analytics/summary'));
          setCharts(await adminFetch('/analytics/charts'));
          setDashboards(await adminFetch('/analytics/dashboards?mode=today'));
          setLeaderboard((await adminFetch('/leaderboard?track=total')).leaders || []);
        }
        if (tab === 'admins') {
          setAdminUsers((await adminFetch('/admin-users')).users);
          setRightsMatrix((await adminFetch('/rights-matrix')).matrix || []);
        }
        if (tab === 'journal') {
          setActionsLog((await adminFetch(`/actions-log?critical=${journalCritical ? 1 : 0}`)).actions);
        }
        if (tab === 'medals') setMedals((await adminFetch('/medals')).medals);
        if (tab === 'roles') {
          setRoles((await adminFetch('/roles')).roles);
          setDayExperiments((await adminFetch('/day-experiments')).experiments);
          const fs = await adminFetch('/forum-settings');
          setForumSettings(fs.settings);
          const cfg = fs.settings?.roleDiagnosticsConfig?.optionToRole;
          if (Array.isArray(cfg) && cfg.length === 6) setDiagMatrix(cfg);
          else setDiagMatrix([
            ['meaning_researcher', 'practice_realizer', 'communication_guide', 'process_navigator'],
            ['meaning_researcher', 'communication_guide', 'environment_keeper', 'content_packer'],
            ['practice_realizer', 'content_packer', 'process_navigator', 'environment_keeper'],
            ['meaning_researcher', 'practice_realizer', 'process_navigator', 'communication_guide'],
            ['content_packer', 'practice_realizer', 'environment_keeper', 'communication_guide'],
            ['meaning_researcher', 'process_navigator', 'practice_realizer', 'environment_keeper'],
          ]);
        }
        if (tab === 'directions' || tab === 'participants') {
          setDirections((await adminFetch('/directions')).directions);
          if (tab === 'participants') {
            setRoles((await adminFetch('/roles')).roles);
          }
        }
      } catch (e) {
        setToast(translateApiError(String(e instanceof Error ? e.message : e)));
      } finally {
        setTabLoading(false);
      }
    })();
  }, [tab, reloadKey, participantsPage, submissionsPage, attendancePage, exchangePage, journalCritical]);

  const filteredParticipants = participants.filter(p => {
    const q = participantSearch.toLowerCase();
    if (!q) return true;
    return `${p.firstName} ${p.lastName} ${p.direction} ${p.vkId}`.toLowerCase().includes(q);
  });

  const createParticipant = () => act(async () => {
    await adminFetch('/participants', {
      method: 'POST',
      body: JSON.stringify({
        vkId: Number(newParticipant.vkId),
        firstName: newParticipant.firstName,
        lastName: newParticipant.lastName,
        directionId: newParticipant.directionId ? Number(newParticipant.directionId) : undefined,
      }),
    });
    setNewParticipant({ vkId: '', firstName: '', lastName: '', directionId: '' });
  });

  const createDirection = () => act(async () => {
    if (!newDirection.trim()) return;
    await adminFetch('/directions', { method: 'POST', body: JSON.stringify({ name: newDirection }) });
    setNewDirection('');
  });

  const createTag = () => act(async () => {
    if (!newTag.trim()) return;
    await adminFetch('/thematic-tags', { method: 'POST', body: JSON.stringify({ name: newTag }) });
    setNewTag('');
  });

  const createEvent = () => act(async () => {
    await adminFetch('/events', {
      method: 'POST',
      body: JSON.stringify({
        ...newEvent,
        dayNumber: Number(newEvent.dayNumber),
        tags: newEvent.tags.split(',').map(t => t.trim()).filter(Boolean),
        isPublished: true,
      }),
    });
  });

  const createTask = () => act(async () => {
    await adminFetch('/tasks', {
      method: 'POST',
      body: JSON.stringify({ ...newTask, publishTime: new Date(), dayNumber: Number(newTask.dayNumber) }),
    });
  });

  const createQuestion = () => act(async () => {
    const body: Record<string, unknown> = {
      ...newQuestion,
      dayNumber: Number(newQuestion.dayNumber),
    };
    if (newQuestion.publishTime) body.publishTime = new Date(newQuestion.publishTime).toISOString();
    else delete body.publishTime;
    if (newQuestion.closeTime) body.closeTime = new Date(newQuestion.closeTime).toISOString();
    else delete body.closeTime;
    await adminFetch('/questions', { method: 'POST', body: JSON.stringify(body) });
  });

  const addOption = () => act(async () => {
    if (!optionForm.questionId || !optionForm.label) return;
    await adminFetch(`/questions/${optionForm.questionId}/options`, {
      method: 'POST',
      body: JSON.stringify({ label: optionForm.label, value: optionForm.value || optionForm.label }),
    });
    setOptionForm({ questionId: '', label: '', value: '' });
  });

  const saveDayFocus = () => act(async () => {
    await adminFetch('/day-focus', { method: 'POST', body: JSON.stringify(dayFocusForm) });
  });

  const saveForumSettings = (patch: Record<string, unknown>) => act(async () => {
    await adminFetch('/forum-settings', { method: 'PATCH', body: JSON.stringify(patch) });
  });

  const saveSections = () => saveForumSettings({ sectionsVisibility: sectionsVis });

  const loadDayFocusIntoForm = (dayNumber: number) => {
    const f = dayFocusList.find(d => d.dayNumber === dayNumber);
    if (f) setDayFocusForm({ dayNumber, title: f.title || '', text: f.text || '', keyQuestion: f.keyQuestion || '' });
    else setDayFocusForm({ dayNumber, title: '', text: '', keyQuestion: '' });
  };

  const createMaterial = () => act(async () => {
    const tags = newMaterial.tags.split(',').map(s => s.trim()).filter(Boolean);
    await adminFetch('/materials', {
      method: 'POST',
      body: JSON.stringify({
        ...newMaterial,
        dayNumber: Number(newMaterial.dayNumber),
        eventId: newMaterial.eventId ? Number(newMaterial.eventId) : null,
        tags,
        isGeneral: !!newMaterial.isGeneral,
        includeInAnalytics: newMaterial.includeInAnalytics !== false,
      }),
    });
  });

  const emotionChartData = charts?.emotions
    ? Object.entries(charts.emotions as Record<string, number>).map(([name, value]) => ({ name: label(name), value }))
    : [];

  const [loginName, setLoginName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    if (getAdminToken()) {
      setIsAuthenticated(true);
    }
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

  const configError = getConfigError();
  if (configError) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#fff5f5', padding: 24 }}>
        <div style={{ maxWidth: 480, background: 'white', padding: 32, borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', color: '#C53030', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 14 }}>
          <strong style={{ display: 'block', marginBottom: 12 }}>⚠️ Ошибка конфигурации</strong>
          {configError}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f5f5f5' }}>
        <form onSubmit={handleLogin} style={{ background: 'white', padding: 32, borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 320 }}>
          <h2 style={{ margin: 0, textAlign: 'center' }}>Вход в админку</h2>
          <input
            type="text"
            value={loginName}
            onChange={e => setLoginName(e.target.value)}
            placeholder="Логин"
            autoComplete="username"
            style={{ padding: '8px 12px', fontSize: 16, borderRadius: 6, border: '1px solid #ccc' }}
          />
          <input
            type="password"
            value={loginPassword}
            onChange={e => setLoginPassword(e.target.value)}
            placeholder="Пароль"
            autoComplete="current-password"
            style={{ padding: '8px 12px', fontSize: 16, borderRadius: 6, border: '1px solid #ccc' }}
          />
          {loginError && (
            <div style={{ color: '#C53030', fontSize: 14 }}>{loginError}</div>
          )}
          <button type="submit" style={{ padding: '10px', fontSize: 16, background: '#FF5500', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            Войти
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="admin">
      <header className="admin-header">
        <h1>Машук 2026 · Админ-панель</h1>
        <button type="button" onClick={handleLogout} style={{ marginLeft: 'auto', padding: '6px 12px' }}>
          Выйти
        </button>
      </header>
      <nav className="admin-nav">
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{TAB_LABELS[t]}</button>
        ))}
      </nav>
      <main className="admin-main">
        {tabLoading && <div className="tab-loading"><span className="tab-loading-bar" /></div>}
        {tab === 'participants' && (
          <>
            <div className="form-row">
              <input value={participantSearch} onChange={e => setParticipantSearch(e.target.value)} placeholder="Поиск..." />
              <input value={newParticipant.vkId} onChange={e => setNewParticipant({ ...newParticipant, vkId: e.target.value })} placeholder="ID ВКонтакте" />
              <input value={newParticipant.firstName} onChange={e => setNewParticipant({ ...newParticipant, firstName: e.target.value })} placeholder="Имя" />
              <input value={newParticipant.lastName} onChange={e => setNewParticipant({ ...newParticipant, lastName: e.target.value })} placeholder="Фамилия" />
              <select value={newParticipant.directionId} onChange={e => setNewParticipant({ ...newParticipant, directionId: e.target.value })}>
                <option value="">Направление</option>
                {directions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <button onClick={createParticipant}>Добавить</button>
            </div>
            <table>
              <thead><tr><th>№</th><th>VK</th><th>Имя</th><th>Направление</th><th>Роль</th><th>Путь</th><th>Опыт</th><th>Действия</th></tr></thead>
              <tbody>
                {filteredParticipants.map(p => (
                  <tr key={p.id}>
                    <td>{p.id}</td><td>{p.vkId}</td>
                    <td>
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', color: '#2B6CB0', cursor: 'pointer', padding: 0, fontWeight: 600 }}
                        onClick={() => {
                          setParticipantCardTab('profile');
                          act(async () => {
                            const card = await adminFetch(`/participants/${p.id}/card`);
                            setParticipantCard(card);
                          });
                        }}
                      >
                        {p.firstName} {p.lastName}
                      </button>
                    </td>
                    <td>
                      <select
                        value={directions.find(d => d.name === p.direction)?.id || ''}
                        onChange={e => adminFetch(`/participants/${p.id}/direction`, {
                          method: 'PATCH', body: JSON.stringify({ directionId: Number(e.target.value) }),
                        }).then(reload)}
                      >
                        {directions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        value={p.pedagogicalRole || ''}
                        onChange={e => act(() => adminFetch(`/participants/${p.id}/role`, {
                          method: 'PATCH',
                          body: JSON.stringify({ pedagogicalRole: e.target.value || null }),
                        }), 'Роль обновлена')}
                      >
                        <option value="">—</option>
                        {ROLE_OPTIONS.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
                      </select>
                    </td>
                    <td>{p.pathPoints}</td><td>{p.experiencePoints}</td>
                    <td>
                      <button onClick={() => act(async () => {
                        const r = await adminFetch('/qr/download', {
                          method: 'POST', body: JSON.stringify({ type: 'participant', id: p.id }),
                        });
                        if (r.qrImageUrl) window.open(r.qrImageUrl, '_blank');
                        setToast(`QR: ${r.url}`);
                      })}>QR</button>
                      <button onClick={() => act(() => adminFetch('/pdf-whitelist', {
                        method: 'POST',
                        body: JSON.stringify({ participantId: p.id, enabled: true }),
                      }), 'PDF whitelist OK')}>PDF+</button>
                      <button onClick={() => act(() => adminDownloadBinary(`/participants/${p.id}/pdf`, `profile_${p.id}.pdf`), 'PDF скачан')}>PDF</button>
                      <button className="btn-danger" onClick={() => {
                        if (confirm('Сбросить регистрацию?')) {
                          adminFetch(`/participants/${p.id}/registration`, { method: 'DELETE' }).then(reload);
                        }
                      }}>Сброс</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={participantsPage} total={participantsTotal} setPage={setParticipantsPage} />
            {pdfWhitelist.length > 0 && (
              <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
                PDF whitelist: {pdfWhitelist.filter((e: any) => e.enabled).length} участник(ов)
              </p>
            )}
            {participantCard && (
              <div className="card" style={{ marginTop: 16, border: '2px solid #2B6CB0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>
                    Карточка · {participantCard.participant?.firstName} {participantCard.participant?.lastName}
                  </h3>
                  <button type="button" onClick={() => setParticipantCard(null)}>Закрыть</button>
                </div>
                <div className="form-row" style={{ marginTop: 8 }}>
                  {(['profile', 'answers', 'tasks', 'medals', 'points'] as const).map(t => (
                    <button
                      key={t}
                      className={participantCardTab === t ? 'on' : ''}
                      onClick={() => setParticipantCardTab(t)}
                    >
                      {{ profile: 'Профиль', answers: 'Ответы', tasks: 'Задания', medals: 'Медали', points: 'Баллы' }[t]}
                    </button>
                  ))}
                </div>
                {participantCardTab === 'profile' && (
                  <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 8 }}>
                    <div>VK: {participantCard.participant?.vkId}</div>
                    <div>Направление: {participantCard.participant?.direction}</div>
                    <div>Группа: {participantCard.participant?.groupName || '—'}</div>
                    <div>Роль старт: {participantCard.participant?.pedagogicalRole || '—'}</div>
                    <div>Сильная / рост: {participantCard.participant?.strongRole || '—'} / {participantCard.participant?.growthRole || '—'}</div>
                    <div>Путь / Опыт: {participantCard.participant?.pathPoints} / {participantCard.participant?.experiencePoints}</div>
                  </div>
                )}
                {participantCardTab === 'answers' && (
                  <table style={{ marginTop: 8 }}>
                    <thead><tr><th>День</th><th>Блок</th><th>Вопрос</th><th>Ответ</th></tr></thead>
                    <tbody>
                      {(participantCard.answers || []).slice(0, 40).map((a: any) => (
                        <tr key={a.id}>
                          <td>{a.dayNumber}</td>
                          <td>{a.block}</td>
                          <td>{a.questionTitle}</td>
                          <td style={{ maxWidth: 240, fontSize: 11 }}>{typeof a.answerData === 'string' ? a.answerData.slice(0, 120) : JSON.stringify(a.answerData).slice(0, 120)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {participantCardTab === 'tasks' && (
                  <table style={{ marginTop: 8 }}>
                    <thead><tr><th>Задание</th><th>Статус</th><th>Баллы</th></tr></thead>
                    <tbody>
                      {(participantCard.submissions || []).map((s: any) => (
                        <tr key={s.id}><td>{s.taskTitle}</td><td>{s.status}</td><td>{s.pointsAwarded}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {participantCardTab === 'medals' && (
                  <ul style={{ marginTop: 8 }}>
                    {(participantCard.medals || []).map((m: any) => (
                      <li key={m.id}>{m.name} · {m.level} · {m.awardedAt ? new Date(m.awardedAt).toLocaleDateString('ru-RU') : ''}</li>
                    ))}
                    {(participantCard.medals || []).length === 0 && <li style={{ color: '#888' }}>Нет медалей</li>}
                  </ul>
                )}
                {participantCardTab === 'points' && (
                  <table style={{ marginTop: 8 }}>
                    <thead><tr><th>Действие</th><th>Баллы</th><th>Когда</th></tr></thead>
                    <tbody>
                      {(participantCard.points || []).map((p: any) => (
                        <tr key={p.id}>
                          <td>{p.actionType}</td>
                          <td>{p.points}</td>
                          <td>{p.createdAt ? new Date(p.createdAt).toLocaleString('ru-RU') : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'directions' && (
          <>
            <div className="form-row">
              <input value={newDirection} onChange={e => setNewDirection(e.target.value)} placeholder="Новое направление" />
              <button onClick={createDirection}>Добавить</button>
            </div>
            {directions.map(d => (
              <div key={d.id} className="card">
                <input defaultValue={d.name} id={`dir-name-${d.id}`} />
                <label style={{ marginLeft: 8 }}>
                  <input type="checkbox" defaultChecked={!d.isHidden} id={`dir-vis-${d.id}`} /> Видимо
                </label>
                <button onClick={() => {
                  const name = (document.getElementById(`dir-name-${d.id}`) as HTMLInputElement).value;
                  const isHidden = !(document.getElementById(`dir-vis-${d.id}`) as HTMLInputElement).checked;
                  adminFetch(`/directions/${d.id}`, { method: 'PATCH', body: JSON.stringify({ name, isHidden }) }).then(reload);
                }}>Сохранить</button>
              </div>
            ))}
          </>
        )}

        {tab === 'roles' && (
          <>
            <h3>Матрица ролей (6)</h3>
            {roles.map(r => (
              <div key={r.id} className="card">
                <div style={{ fontWeight: 700 }}>{r.name} · <code>{r.roleKey}</code></div>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{r.quadrant}</div>
                <textarea
                  defaultValue={r.essence || ''}
                  id={`role-essence-${r.id}`}
                  rows={2}
                  style={{ width: '100%' }}
                  placeholder="Суть"
                />
                <textarea
                  defaultValue={r.inClass || ''}
                  id={`role-inclass-${r.id}`}
                  rows={2}
                  style={{ width: '100%', marginTop: 6 }}
                  placeholder="Проявления"
                />
                <input
                  defaultValue={r.keywords || ''}
                  id={`role-kw-${r.id}`}
                  style={{ width: '100%', marginTop: 6 }}
                  placeholder="Ключевые слова"
                />
                <button
                  style={{ marginTop: 8 }}
                  onClick={() => act(() => adminFetch(`/roles/${r.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      name: r.name,
                      quadrant: r.quadrant,
                      essence: (document.getElementById(`role-essence-${r.id}`) as HTMLTextAreaElement).value,
                      inClass: (document.getElementById(`role-inclass-${r.id}`) as HTMLTextAreaElement).value,
                      keywords: (document.getElementById(`role-kw-${r.id}`) as HTMLInputElement).value,
                      sortOrder: r.sortOrder,
                    }),
                  }))}
                >
                  Сохранить роль
                </button>
              </div>
            ))}
            <h3 style={{ marginTop: 24 }}>Веса диагностики (option → роль)</h3>
            <p style={{ fontSize: 12, color: '#666' }}>
              6 вопросов × 4 варианта. Меняет скоринг онбординга без деплоя кода.
            </p>
            {diagMatrix.map((row, qi) => (
              <div key={qi} className="card" style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Вопрос {qi + 1}</div>
                <div className="form-row" style={{ flexWrap: 'wrap' }}>
                  {row.map((roleKey, oi) => (
                    <label key={oi} style={{ fontSize: 12 }}>
                      Вариант {oi + 1}
                      <select
                        value={roleKey}
                        onChange={e => {
                          const next = diagMatrix.map(r => [...r]);
                          next[qi][oi] = e.target.value;
                          setDiagMatrix(next);
                        }}
                      >
                        {ROLE_OPTIONS.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <button
              style={{ marginTop: 8 }}
              onClick={() => act(() => adminFetch('/forum-settings', {
                method: 'PATCH',
                body: JSON.stringify({ roleDiagnosticsConfig: { optionToRole: diagMatrix } }),
              }), 'Матрица диагностики сохранена')}
            >
              Сохранить веса диагностики
            </button>
            <h3 style={{ marginTop: 24 }}>Каталог советов (роль × день)</h3>
            <div className="form-row">
              <select value={expForm.dayNumber} onChange={e => setExpForm({ ...expForm, dayNumber: Number(e.target.value) })}>
                {[2, 3, 4, 5, 6, 7].map(d => <option key={d} value={d}>День {d}</option>)}
              </select>
              <select value={expForm.roleKey} onChange={e => setExpForm({ ...expForm, roleKey: e.target.value })}>
                {ROLE_OPTIONS.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
              </select>
              <input value={expForm.title} onChange={e => setExpForm({ ...expForm, title: e.target.value })} placeholder="Заголовок совета" />
              <input value={expForm.body} onChange={e => setExpForm({ ...expForm, body: e.target.value })} placeholder="Текст" style={{ flex: 2 }} />
              <button onClick={() => act(() => adminFetch('/day-experiments', {
                method: 'POST',
                body: JSON.stringify(expForm),
              }), 'Совет сохранён')}>Сохранить совет</button>
            </div>
            <table>
              <thead><tr><th>День</th><th>Роль</th><th>Заголовок</th><th>Текст</th><th></th></tr></thead>
              <tbody>
                {dayExperiments.map(e => (
                  <tr key={e.id}>
                    <td>{e.dayNumber}</td>
                    <td>{ROLE_OPTIONS.find(r => r.key === e.roleKey)?.name || e.roleKey}</td>
                    <td>{e.title}</td>
                    <td style={{ maxWidth: 280, fontSize: 12 }}>{(e.body || '').slice(0, 100)}</td>
                    <td>
                      <button className="btn-danger" onClick={() => act(() =>
                        adminFetch(`/day-experiments/${e.id}`, { method: 'DELETE' }), 'Удалено')}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tab === 'events' && (
          <>
            <div className="card">
              <h3>Тематические теги</h3>
              <div className="form-row">
                <input value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="Новый тег" />
                <button onClick={createTag}>Добавить тег</button>
              </div>
              <div>{thematicTags.map(t => (
                <span key={t.id} className="tag-chip">
                  {t.name}
                  <button type="button" style={{ marginLeft: 6 }} onClick={() => {
                    const name = prompt('Новое имя тега', t.name);
                    if (name) act(() => adminFetch(`/thematic-tags/${t.id}`, { method: 'PATCH', body: JSON.stringify({ name }) }));
                  }}>✎</button>
                  <button type="button" className="btn-danger" style={{ marginLeft: 4 }} onClick={() => {
                    if (confirm('Удалить тег?')) act(() => adminFetch(`/thematic-tags/${t.id}`, { method: 'DELETE' }));
                  }}>×</button>
                </span>
              ))}</div>
            </div>
            <div className="card">
              <h3>Новое событие</h3>
              <div className="form-row">
                <input value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} placeholder="Название" />
                <input value={newEvent.place} onChange={e => setNewEvent({ ...newEvent, place: e.target.value })} placeholder="Место" />
                <input value={newEvent.timeSlot} onChange={e => setNewEvent({ ...newEvent, timeSlot: e.target.value })} placeholder="Слот (09:00)" />
                <input type="number" value={newEvent.dayNumber} onChange={e => setNewEvent({ ...newEvent, dayNumber: Number(e.target.value) })} placeholder="День" />
              </div>
              <div className="form-row">
                <input value={newEvent.description} onChange={e => setNewEvent({ ...newEvent, description: e.target.value })} placeholder="Описание" style={{ flex: 2 }} />
                <input value={newEvent.tags} onChange={e => setNewEvent({ ...newEvent, tags: e.target.value })} placeholder="Теги через запятую" />
                <button onClick={createEvent}>Создать</button>
              </div>
            </div>
            {events.map(e => (
              <div key={e.id} className="card">
                <div className="form-row">
                  <input defaultValue={e.title} id={`ev-title-${e.id}`} placeholder="Название" />
                  <input defaultValue={e.place || ''} id={`ev-place-${e.id}`} placeholder="Место" />
                  <input defaultValue={e.timeSlot || ''} id={`ev-slot-${e.id}`} placeholder="Слот" style={{ width: 80 }} />
                  <input type="number" defaultValue={e.dayNumber || 1} id={`ev-day-${e.id}`} style={{ width: 60 }} />
                </div>
                <textarea defaultValue={e.description || ''} id={`ev-desc-${e.id}`} placeholder="Описание" rows={2} style={{ width: '100%', marginTop: 8 }} />
                <div className="form-row" style={{ marginTop: 8 }}>
                  <button onClick={() => act(() => adminFetch(`/events/${e.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      title: (document.getElementById(`ev-title-${e.id}`) as HTMLInputElement).value,
                      place: (document.getElementById(`ev-place-${e.id}`) as HTMLInputElement).value,
                      timeSlot: (document.getElementById(`ev-slot-${e.id}`) as HTMLInputElement).value,
                      dayNumber: Number((document.getElementById(`ev-day-${e.id}`) as HTMLInputElement).value),
                      description: (document.getElementById(`ev-desc-${e.id}`) as HTMLTextAreaElement).value,
                    }),
                  }))}>Сохранить</button>
                  <button onClick={() => act(async () => {
                    const r = await adminFetch('/qr/download', {
                      method: 'POST', body: JSON.stringify({ type: 'event', id: e.id }),
                    });
                    if (r.qrImageUrl) window.open(r.qrImageUrl, '_blank');
                    setToast(`QR: ${r.url}`);
                  })}>QR</button>
                  <button className="btn-danger" onClick={() => {
                    if (confirm('Удалить событие?')) act(() => adminFetch(`/events/${e.id}`, { method: 'DELETE' }));
                  }}>Удалить</button>
                </div>
              </div>
            ))}
            <div className="card">
              <h3>Материалы базы знаний</h3>
              <div className="form-row">
                <input type="number" value={newMaterial.dayNumber} onChange={e => setNewMaterial({ ...newMaterial, dayNumber: Number(e.target.value) })} placeholder="День" />
                <input value={newMaterial.eventId} onChange={e => setNewMaterial({ ...newMaterial, eventId: e.target.value })} placeholder="eventId" style={{ width: 70 }} />
                <input value={newMaterial.direction} onChange={e => setNewMaterial({ ...newMaterial, direction: e.target.value })} placeholder="Направление" />
                <input value={newMaterial.tags} onChange={e => setNewMaterial({ ...newMaterial, tags: e.target.value })} placeholder="Теги через запятую" />
              </div>
              <div className="form-row">
                <input value={newMaterial.speakerName} onChange={e => setNewMaterial({ ...newMaterial, speakerName: e.target.value })} placeholder="Спикер" />
                <input value={newMaterial.title} onChange={e => setNewMaterial({ ...newMaterial, title: e.target.value })} placeholder="Название" />
                <input value={newMaterial.url} onChange={e => setNewMaterial({ ...newMaterial, url: e.target.value })} placeholder="Ссылка" />
                <label><input type="checkbox" checked={newMaterial.isGeneral} onChange={e => setNewMaterial({ ...newMaterial, isGeneral: e.target.checked })} /> Общий</label>
                <label><input type="checkbox" checked={newMaterial.includeInAnalytics} onChange={e => setNewMaterial({ ...newMaterial, includeInAnalytics: e.target.checked })} /> В аналитике</label>
                <button onClick={createMaterial}>Добавить</button>
              </div>
              {materials.map(m => (
                <div key={m.id} className="card" style={{ fontSize: 12 }}>
                  <strong>{m.title}</strong> · Д{m.dayNumber}
                  {m.eventId ? ` · event#${m.eventId}` : ''}
                  {m.direction ? ` · ${m.direction}` : ''}
                  {m.isGeneral ? ' · общий' : ''}
                  {m.includeInAnalytics === false ? ' · вне аналитики' : ''}
                  <div className="form-row" style={{ marginTop: 4 }}>
                    <input defaultValue={m.title} id={`mat-title-${m.id}`} />
                    <input defaultValue={m.url || ''} id={`mat-url-${m.id}`} placeholder="Ссылка" style={{ flex: 1 }} />
                    <label>
                      <input type="checkbox" defaultChecked={m.includeInAnalytics !== false} id={`mat-an-${m.id}`} /> аналитика
                    </label>
                    <button onClick={() => act(() => adminFetch(`/materials/${m.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({
                        title: (document.getElementById(`mat-title-${m.id}`) as HTMLInputElement).value,
                        url: (document.getElementById(`mat-url-${m.id}`) as HTMLInputElement).value,
                        includeInAnalytics: (document.getElementById(`mat-an-${m.id}`) as HTMLInputElement).checked,
                      }),
                    }))}>Сохранить</button>
                    <button className="btn-danger" onClick={() => {
                      if (confirm('Удалить материал?')) act(() => adminFetch(`/materials/${m.id}`, { method: 'DELETE' }));
                    }}>×</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="card">
              <h3>Слияние тегов</h3>
              <div className="form-row">
                <select value={mergeTags.fromId} onChange={e => setMergeTags({ ...mergeTags, fromId: e.target.value })}>
                  <option value="">Откуда (удалится)</option>
                  {thematicTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <span>→</span>
                <select value={mergeTags.toId} onChange={e => setMergeTags({ ...mergeTags, toId: e.target.value })}>
                  <option value="">Куда</option>
                  {thematicTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button onClick={() => {
                  if (!mergeTags.fromId || !mergeTags.toId) return;
                  if (!confirm('Объединить теги? Операция необратима.')) return;
                  act(() => adminFetch('/thematic-tags/merge', {
                    method: 'POST',
                    body: JSON.stringify({ fromId: Number(mergeTags.fromId), toId: Number(mergeTags.toId) }),
                  }), 'Теги объединены');
                }}>Объединить</button>
              </div>
            </div>
          </>
        )}

        {tab === 'tasks' && (
          <>
            <div className="card">
              <h3>Новое задание</h3>
              <div className="form-row">
                <input value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} placeholder="Название" />
                <input value={newTask.category} onChange={e => setNewTask({ ...newTask, category: e.target.value })} placeholder="Категория" />
                <input type="number" value={newTask.points} onChange={e => setNewTask({ ...newTask, points: Number(e.target.value) })} placeholder="Баллы" />
                <select value={newTask.answerType} onChange={e => setNewTask({ ...newTask, answerType: e.target.value })}>
                  <EnumOptions values={['text', 'photo', 'text_and_photo']} />
                </select>
                <select value={newTask.confirmationType} onChange={e => setNewTask({ ...newTask, confirmationType: e.target.value })}>
                  <option value="text_photo">Текст/фото</option>
                  <option value="photo">Фото</option>
                  <option value="post_url">Ссылка на пост</option>
                  <option value="qr">QR</option>
                  <option value="auto">Авто</option>
                  <option value="team">Команда</option>
                </select>
              </div>
              <div className="form-row">
                <input value={newTask.description} onChange={e => setNewTask({ ...newTask, description: e.target.value })} placeholder="Описание" style={{ flex: 2 }} />
                <label><input type="checkbox" checked={newTask.allowRetry} onChange={e => setNewTask({ ...newTask, allowRetry: e.target.checked })} /> Повтор</label>
                <label><input type="checkbox" checked={newTask.autoConfirm} onChange={e => setNewTask({ ...newTask, autoConfirm: e.target.checked })} /> Авто</label>
                <label><input type="checkbox" checked={newTask.pushOnPublish} onChange={e => setNewTask({ ...newTask, pushOnPublish: e.target.checked })} /> Уведомление при публикации</label>
                <button onClick={createTask}>Создать</button>
              </div>
            </div>
            {tasks.map(t => (
              <div key={t.id} className="card">
                <div className="form-row">
                  <input defaultValue={t.title} id={`task-title-${t.id}`} placeholder="Название" />
                  <input defaultValue={t.category || ''} id={`task-cat-${t.id}`} placeholder="Категория" />
                  <input type="number" defaultValue={t.points} id={`task-pts-${t.id}`} style={{ width: 60 }} />
                  <input type="number" defaultValue={t.dayNumber || 1} id={`task-day-${t.id}`} style={{ width: 60 }} placeholder="День" />
                </div>
                <textarea defaultValue={t.description || ''} id={`task-desc-${t.id}`} placeholder="Описание" rows={2} style={{ width: '100%', marginTop: 8 }} />
                <div className="form-row" style={{ marginTop: 8, fontSize: 12 }}>
                  <label>Тип подтверждения
                    <select id={`task-confirm-${t.id}`} defaultValue={t.confirmationType || 'text_photo'}>
                      <option value="text_photo">Текст/фото</option>
                      <option value="photo">Фото</option>
                      <option value="post_url">Ссылка на пост</option>
                      <option value="qr">QR</option>
                      <option value="auto">Авто</option>
                      <option value="team">Команда</option>
                    </select>
                  </label>
                  <label><input type="checkbox" defaultChecked={t.pushOnPublish} id={`task-push-${t.id}`} /> Уведомление при публикации</label>
                  <label><input type="checkbox" defaultChecked={t.allowRetry} id={`task-retry-${t.id}`} /> Повтор</label>
                  <label><input type="checkbox" defaultChecked={t.autoConfirm} id={`task-auto-${t.id}`} /> Авто</label>
                </div>
                <div className="form-row" style={{ marginTop: 8 }}>
                  <button onClick={() => act(() => adminFetch(`/tasks/${t.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      title: (document.getElementById(`task-title-${t.id}`) as HTMLInputElement).value,
                      category: (document.getElementById(`task-cat-${t.id}`) as HTMLInputElement).value,
                      points: Number((document.getElementById(`task-pts-${t.id}`) as HTMLInputElement).value),
                      dayNumber: Number((document.getElementById(`task-day-${t.id}`) as HTMLInputElement).value),
                      description: (document.getElementById(`task-desc-${t.id}`) as HTMLTextAreaElement).value,
                      confirmationType: (document.getElementById(`task-confirm-${t.id}`) as HTMLSelectElement).value,
                      pushOnPublish: (document.getElementById(`task-push-${t.id}`) as HTMLInputElement).checked,
                      allowRetry: (document.getElementById(`task-retry-${t.id}`) as HTMLInputElement).checked,
                      autoConfirm: (document.getElementById(`task-auto-${t.id}`) as HTMLInputElement).checked,
                    }),
                  }))}>Сохранить</button>
                  <button onClick={() => act(async () => {
                    const r = await adminFetch('/qr/download', {
                      method: 'POST',
                      body: JSON.stringify({ type: 'task', id: t.id }),
                    });
                    if (r.qrImageUrl) window.open(r.qrImageUrl, '_blank');
                    setToast(`QR: ${r.url}`);
                  })}>QR</button>
                  <button className="btn-danger" onClick={() => {
                    if (confirm('Удалить задание?')) act(() => adminFetch(`/tasks/${t.id}`, { method: 'DELETE' }));
                  }}>Удалить</button>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'questions' && (
          <>
            <div className="card">
              <h3>Шаблон 7 точек × дни</h3>
              <div className="form-row">
                <button onClick={() => act(() => adminFetch('/questions/seed-touchpoints', {
                  method: 'POST', body: JSON.stringify({ overwrite: false }),
                }), 'Шаблон развёрнут')}>Развернуть шаблон 7×7</button>
                <input type="number" value={copyDayForm.fromDay} onChange={e => setCopyDayForm({ ...copyDayForm, fromDay: Number(e.target.value) })} placeholder="С дня" style={{ width: 70 }} />
                <span>→</span>
                <input type="number" value={copyDayForm.toDay} onChange={e => setCopyDayForm({ ...copyDayForm, toDay: Number(e.target.value) })} placeholder="На день" style={{ width: 70 }} />
                <label><input type="checkbox" checked={copyDayForm.overwrite} onChange={e => setCopyDayForm({ ...copyDayForm, overwrite: e.target.checked })} /> overwrite</label>
                <button onClick={() => act(() => adminFetch('/questions/copy-day', {
                  method: 'POST', body: JSON.stringify(copyDayForm),
                }), 'Скопировано')}>Скопировать день</button>
              </div>
            </div>
            <div className="card">
              <h3>Новый вопрос</h3>
              <div className="form-row">
                <input value={newQuestion.title} onChange={e => setNewQuestion({ ...newQuestion, title: e.target.value })} placeholder="Заголовок" />
                <select value={newQuestion.type} onChange={e => setNewQuestion({ ...newQuestion, type: e.target.value })}>
                  <EnumOptions values={['open', 'checkin', 'choice', 'multi', 'dependent']} />
                </select>
                <input value={newQuestion.block} onChange={e => setNewQuestion({ ...newQuestion, block: e.target.value })} placeholder="Блок" />
                <select value={newQuestion.timePoint} onChange={e => setNewQuestion({ ...newQuestion, timePoint: e.target.value })}>
                  <option value="">—</option>
                  <option value="утро">утро</option>
                  <option value="день">день</option>
                  <option value="вечер">вечер</option>
                </select>
                <input type="number" value={newQuestion.dayNumber} onChange={e => setNewQuestion({ ...newQuestion, dayNumber: Number(e.target.value) })} placeholder="День" style={{ width: 70 }} />
                <button onClick={createQuestion}>Создать</button>
              </div>
              <div className="form-row" style={{ marginTop: 8 }}>
                <label>Открытие <input type="datetime-local" value={newQuestion.publishTime} onChange={e => setNewQuestion({ ...newQuestion, publishTime: e.target.value })} /></label>
                <label>Закрытие <input type="datetime-local" value={newQuestion.closeTime} onChange={e => setNewQuestion({ ...newQuestion, closeTime: e.target.value })} /></label>
              </div>
              <input value={newQuestion.text} onChange={e => setNewQuestion({ ...newQuestion, text: e.target.value })} placeholder="Текст вопроса" style={{ width: '100%', padding: 8, marginTop: 8 }} />
            </div>
            <div className="card">
              <h3>Добавить вариант ответа</h3>
              <div className="form-row">
                <select value={optionForm.questionId} onChange={e => setOptionForm({ ...optionForm, questionId: e.target.value })}>
                  <option value="">Вопрос</option>
                  {questions.map(q => <option key={q.id} value={q.id}>{q.id}: {q.title}</option>)}
                </select>
                <input value={optionForm.label} onChange={e => setOptionForm({ ...optionForm, label: e.target.value })} placeholder="Подпись варианта" />
                <input value={optionForm.value} onChange={e => setOptionForm({ ...optionForm, value: e.target.value })} placeholder="Значение варианта" />
                <button onClick={addOption}>Добавить</button>
              </div>
            </div>
            {questions.map(q => (
              <div key={q.id} className="card">
                <div className="form-row">
                  <strong>{q.id}.</strong>
                  <input defaultValue={q.title} id={`q-title-${q.id}`} style={{ flex: 1 }} />
                  <select defaultValue={q.status} id={`q-status-${q.id}`}>
                    <EnumOptions values={['draft', 'published']} />
                  </select>
                </div>
                <textarea defaultValue={q.text || ''} id={`q-text-${q.id}`} placeholder="Текст" rows={2} style={{ width: '100%', marginTop: 8 }} />
                <div className="form-row" style={{ marginTop: 8, fontSize: 12 }}>
                  <input defaultValue={q.block || ''} id={`q-block-${q.id}`} placeholder="Блок" />
                  <input type="number" defaultValue={q.dayNumber || 1} id={`q-day-${q.id}`} style={{ width: 60 }} placeholder="День" />
                  <input type="number" defaultValue={q.points ?? 10} id={`q-points-${q.id}`} style={{ width: 60 }} placeholder="Баллы" />
                  <label><input type="checkbox" defaultChecked={q.pushOnPublish} id={`q-push-${q.id}`} /> Уведомление при публикации</label>
                </div>
                <div className="form-row" style={{ marginTop: 4, fontSize: 11, color: '#666' }}>
                  Д{q.dayNumber || '—'} · {q.timePoint || '—'} · окно: {q.publishTime ? new Date(q.publishTime).toLocaleString('ru-RU') : '—'} → {q.closeTime ? new Date(q.closeTime).toLocaleString('ru-RU') : '—'}
                </div>
                {(questionOptionsMap[q.id] || []).length > 0 && (
                  <div style={{ fontSize: 11, marginTop: 8 }}>
                    <strong>Варианты:</strong>
                    {(questionOptionsMap[q.id] || []).map((opt: { id: number; label: string }) => (
                      <span key={opt.id} className="tag-chip" style={{ marginLeft: 4 }}>
                        {opt.label}
                        <button type="button" style={{ marginLeft: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: '#C53030' }} onClick={() => act(() => adminFetch(`/questions/${q.id}/options/${opt.id}`, { method: 'DELETE' }), 'Удалено')}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="form-row" style={{ marginTop: 8 }}>
                  <button onClick={async () => {
                    try {
                      const res = await adminFetch(`/questions/${q.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({
                          title: (document.getElementById(`q-title-${q.id}`) as HTMLInputElement).value,
                          text: (document.getElementById(`q-text-${q.id}`) as HTMLTextAreaElement).value,
                          status: (document.getElementById(`q-status-${q.id}`) as HTMLSelectElement).value,
                          block: (document.getElementById(`q-block-${q.id}`) as HTMLInputElement).value,
                          dayNumber: Number((document.getElementById(`q-day-${q.id}`) as HTMLInputElement).value),
                          points: Number((document.getElementById(`q-points-${q.id}`) as HTMLInputElement).value),
                          pushOnPublish: (document.getElementById(`q-push-${q.id}`) as HTMLInputElement).checked,
                        }),
                      });
                      if (res.versioned) {
                        setToast(`⚠ Создана новая версия (было ${res.previousAnswerCount} ответов). Старые ответы сохранили прежнюю формулировку.`);
                      } else {
                        setToast('Сохранено');
                      }
                      reload();
                    } catch (e) {
                      setToast(translateApiError(String(e)));
                    }
                  }}>Сохранить</button>
                  <button className="btn-danger" onClick={() => {
                    if (confirm('Удалить вопрос?')) act(() => adminFetch(`/questions/${q.id}`, { method: 'DELETE' }));
                  }}>Удалить</button>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'forum' && forumSettings && (
          <>
            <div className="card">
              <p>Текущий день: <strong>{forumSettings.currentDay}</strong> / {forumSettings.totalDays ?? 8}</p>
              <div className="form-row">
                {Array.from({ length: forumSettings.totalDays ?? 8 }, (_, i) => i + 1).map(d => (
                  <button key={d} onClick={() => saveForumSettings({ currentDay: d })}>День {d}</button>
                ))}
                <input type="number" defaultValue={forumSettings.totalDays ?? 8} id="total-days" placeholder="Всего дней" />
                <button onClick={() => {
                  const totalDays = Number((document.getElementById('total-days') as HTMLInputElement).value);
                  saveForumSettings({ totalDays });
                }}>Сохранить дней</button>
                <input type="number" value={recThreshold} onChange={e => setRecThreshold(Number(e.target.value))} placeholder="Порог рекомендаций" />
                <button onClick={() => saveForumSettings({ recommendationThreshold: recThreshold })}>Сохранить порог</button>
              </div>
              <div className="form-row" style={{ marginTop: 8 }}>
                <label>Группы
                  <select
                    defaultValue={forumSettings.groupAssignMode || 'list'}
                    onChange={e => saveForumSettings({ groupAssignMode: e.target.value })}
                  >
                    <option value="list">Выбор из списка</option>
                    <option value="auto">Автоназначение</option>
                  </select>
                </label>
                <label>Порог БЗ
                  <input
                    type="number"
                    defaultValue={forumSettings.kbUnlockThreshold ?? 4}
                    id="kb-threshold"
                    style={{ width: 60 }}
                  />
                </label>
                <button onClick={() => saveForumSettings({
                  kbUnlockThreshold: Number((document.getElementById('kb-threshold') as HTMLInputElement).value),
                })}>Порог БЗ</button>
                <label>
                  <input
                    type="checkbox"
                    defaultChecked={!!forumSettings.kbUnlockDisabled}
                    onChange={e => saveForumSettings({ kbUnlockDisabled: e.target.checked })}
                  /> БЗ без блокировки
                </label>
                <button onClick={() => act(() => adminFetch('/schedule/publish', {
                  method: 'POST',
                  body: JSON.stringify({ dayNumber: forumSettings.currentDay }),
                }), `День ${forumSettings.currentDay} опубликован`)}>
                  Опубликовать день {forumSettings.currentDay}
                </button>
                <button onClick={() => act(async () => {
                  const r = await adminFetch(`/schedule/versions?day=${forumSettings.currentDay}`);
                  setScheduleVersions(r.versions || []);
                }, 'Версии загружены')}>История версий Д{forumSettings.currentDay}</button>
              </div>
              {scheduleVersions.length > 0 && (
                <div style={{ fontSize: 12, marginTop: 8 }}>
                  {scheduleVersions.slice(0, 8).map((v: any) => (
                    <div key={v.id}>Д{v.dayNumber} v{v.version} · {v.publishedAt ? new Date(v.publishedAt).toLocaleString('ru-RU') : '—'} · событий: {Array.isArray(v.eventsSnapshot) ? v.eventsSnapshot.length : '—'}</div>
                  ))}
                </div>
              )}
            </div>
            <div className="card">
              <h3>Фокус дня</h3>
              <div className="form-row">
                {Array.from({ length: forumSettings.totalDays ?? 8 }, (_, i) => i + 1).map(d => (
                  <button key={d} type="button" onClick={() => loadDayFocusIntoForm(d)}>День {d}</button>
                ))}
              </div>
              {dayFocusList.length > 0 && (
                <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
                  Сохранённые: {dayFocusList.map(f => `Д${f.dayNumber}`).join(', ')}
                </div>
              )}
              <div className="form-row">
                <input type="number" value={dayFocusForm.dayNumber} onChange={e => setDayFocusForm({ ...dayFocusForm, dayNumber: Number(e.target.value) })} />
                <input value={dayFocusForm.title} onChange={e => setDayFocusForm({ ...dayFocusForm, title: e.target.value })} placeholder="Заголовок" />
                <input value={dayFocusForm.keyQuestion} onChange={e => setDayFocusForm({ ...dayFocusForm, keyQuestion: e.target.value })} placeholder="Ключевой вопрос" />
              </div>
              <textarea value={dayFocusForm.text} onChange={e => setDayFocusForm({ ...dayFocusForm, text: e.target.value })} placeholder="Текст фокуса" rows={3} style={{ width: '100%' }} />
              <button onClick={saveDayFocus} style={{ marginTop: 8 }}>Сохранить фокус</button>
            </div>
            <div className="card">
              <h3>Видимость разделов</h3>
              {SECTIONS.map(s => (
                <label key={s} style={{ display: 'block', marginBottom: 4 }}>
                  <input type="checkbox" checked={sectionsVis[s] !== false} onChange={e => setSectionsVis({ ...sectionsVis, [s]: e.target.checked })} />
                  {' '}{label(s)}
                </label>
              ))}
              <button onClick={saveSections}>Сохранить</button>
            </div>
            <div className="card">
              <h3>Группы участников</h3>
              <div className="form-row">
                <input value={newGroup.name} onChange={e => setNewGroup({ ...newGroup, name: e.target.value })} placeholder="Название группы" />
                <input type="number" value={newGroup.capacity} onChange={e => setNewGroup({ ...newGroup, capacity: Number(e.target.value) })} placeholder="Вместимость" style={{ width: 80 }} />
                <select value={newGroup.directionId} onChange={e => setNewGroup({ ...newGroup, directionId: e.target.value })}>
                  <option value="">Любое направление</option>
                  {directions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button onClick={() => act(() => adminFetch('/groups', {
                  method: 'POST',
                  body: JSON.stringify({
                    name: newGroup.name,
                    capacity: newGroup.capacity,
                    directionId: newGroup.directionId ? Number(newGroup.directionId) : null,
                  }),
                }).then(() => setNewGroup({ name: '', capacity: 30, directionId: '' })), 'Группа создана')}>
                  Добавить
                </button>
              </div>
              <table>
                <thead><tr><th>ID</th><th>Название</th><th>Вместимость</th><th>Участников</th><th></th></tr></thead>
                <tbody>
                  {groups.map(g => (
                    <tr key={g.id}>
                      <td>{g.id}</td>
                      <td>
                        <input defaultValue={g.name} id={`grp-name-${g.id}`} />
                      </td>
                      <td>
                        <input type="number" defaultValue={g.capacity ?? 30} id={`grp-cap-${g.id}`} style={{ width: 70 }} />
                      </td>
                      <td>{g.membersCount ?? 0}</td>
                      <td>
                        <button onClick={() => act(() => adminFetch(`/groups/${g.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({
                            name: (document.getElementById(`grp-name-${g.id}`) as HTMLInputElement).value,
                            capacity: Number((document.getElementById(`grp-cap-${g.id}`) as HTMLInputElement).value),
                          }),
                        }))}>Сохранить</button>
                        <button className="btn-danger" onClick={() => {
                          if (confirm('Удалить группу?')) act(() => adminFetch(`/groups/${g.id}`, { method: 'DELETE' }));
                        }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card">
              <h3>Тексты согласий</h3>
              <div className="form-row">
                <select value={newConsent.kind} onChange={e => setNewConsent({ ...newConsent, kind: e.target.value })}>
                  <option value="pd">ПД</option>
                  <option value="analytics">Аналитика</option>
                </select>
                <input type="number" value={newConsent.version} onChange={e => setNewConsent({ ...newConsent, version: Number(e.target.value) })} placeholder="Версия" style={{ width: 70 }} />
                <input value={newConsent.title} onChange={e => setNewConsent({ ...newConsent, title: e.target.value })} placeholder="Заголовок" />
                <label>
                  <input type="checkbox" checked={newConsent.isActive} onChange={e => setNewConsent({ ...newConsent, isActive: e.target.checked })} /> Активно
                </label>
              </div>
              <textarea value={newConsent.body} onChange={e => setNewConsent({ ...newConsent, body: e.target.value })} placeholder="Текст согласия" rows={3} style={{ width: '100%' }} />
              <button style={{ marginTop: 8 }} onClick={() => act(() => adminFetch('/consents', {
                method: 'POST', body: JSON.stringify(newConsent),
              }).then(() => setNewConsent({ kind: 'pd', version: 1, title: '', body: '', isActive: true })), 'Согласие создано')}>
                Добавить согласие
              </button>
              {consents.map(c => (
                <div key={c.id} className="card" style={{ marginTop: 8, fontSize: 12 }}>
                  <strong>{c.kind}</strong> v{c.version} · {c.title}
                  {c.isActive ? ' · активно' : ''}
                  <div style={{ color: '#666', marginTop: 4 }}>{(c.body || '').slice(0, 160)}{(c.body || '').length > 160 ? '…' : ''}</div>
                  <div className="form-row" style={{ marginTop: 6 }}>
                    {!c.isActive && (
                      <button onClick={() => act(() => adminFetch(`/consents/${c.id}`, {
                        method: 'PATCH', body: JSON.stringify({ isActive: true }),
                      }), 'Активировано')}>Сделать активным</button>
                    )}
                    <button className="btn-danger" onClick={() => {
                      if (confirm('Удалить текст согласия?')) act(() => adminFetch(`/consents/${c.id}`, { method: 'DELETE' }));
                    }}>Удалить</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'moderation' && (
          <>
            <h3>Обмен опытом</h3>
            {pendingExchange.map(q => (
              <div key={q.id} className="card">
                <p>{q.text}</p>
                <button onClick={() => adminFetch(`/exchange/${q.id}`, { method: 'PATCH', body: JSON.stringify({ moderationStatus: 'approved' }) }).then(reload)}>Одобрить</button>
                <button className="btn-danger" onClick={() => adminFetch(`/exchange/${q.id}`, { method: 'PATCH', body: JSON.stringify({ moderationStatus: 'rejected' }) }).then(reload)}>Отклонить</button>
              </div>
            ))}
            <h3>Задания на проверке</h3>
            {pendingTasks.map(s => (
              <div key={s.id} className="card">
                <p><strong>{s.participantName}</strong> · {s.taskTitle}</p>
                <p>{s.answerText}</p>
                {s.photoUrl && <img src={s.photoUrl} alt="" style={{ maxWidth: 200 }} />}
                <input value={rejectComment[s.id] || ''} onChange={e => setRejectComment({ ...rejectComment, [s.id]: e.target.value })} placeholder="Комментарий при отклонении" />
                <div className="form-row">
                  <button onClick={() => adminFetch(`/task-submissions/${s.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) }).then(reload)}>Одобрить</button>
                  <button className="btn-danger" onClick={() => adminFetch(`/task-submissions/${s.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: 'rejected', moderatorComment: rejectComment[s.id] || 'Не принято' }),
                  }).then(reload)}>Отклонить</button>
                </div>
              </div>
            ))}
            <h3>Архив обмена (одобрено)</h3>
            {exchangeArchive.map(q => (
              <div key={q.id} className="card">
                <p>{q.text}</p>
                <p style={{ fontSize: 11, color: '#888' }}>{q.authorName} · {label(q.moderationStatus)}</p>
                {q.answers?.map((a: any) => (
                  <div key={a.id} style={{ marginTop: 6, padding: 6, background: '#f5f5f5', borderRadius: 6, fontSize: 12 }}>
                    {a.authorName}: {a.text}
                    {a.reactions && ` · 👍 ${a.reactions.likes ?? 0}`}
                  </div>
                ))}
              </div>
            ))}
            <h3>Обращения к организаторам</h3>
            {orgThreads.length === 0 && <p style={{ color: '#888' }}>Нет обращений</p>}
            {orgThreads.map(t => (
              <div key={t.id} className="card">
                <p>
                  <strong>{t.participantName || 'Участник'}</strong>
                  {t.groupName ? ` · ${t.groupName}` : ''}
                  {t.direction ? ` · ${t.direction}` : ''}
                  {' · '}
                  <span style={{ color: t.status === 'answered' ? '#2F855A' : '#B8621A' }}>
                    {t.status === 'answered' ? 'отвечено' : 'ожидает'}
                  </span>
                </p>
                <p style={{ fontSize: 12, color: '#666' }}>{t.subject}</p>
                {(t.messages || []).map((m: any) => (
                  <div key={m.id} style={{
                    marginTop: 6, padding: 8, borderRadius: 6, fontSize: 12,
                    background: m.senderType === 'admin' ? '#F0FFF4' : '#F7F7F7',
                  }}>
                    <div style={{ color: '#888', fontSize: 10 }}>
                      {m.senderType === 'admin' ? 'Организаторы' : 'Участник'}
                      {m.createdAt ? ` · ${new Date(m.createdAt).toLocaleString('ru-RU')}` : ''}
                    </div>
                    {m.text}
                  </div>
                ))}
                <div className="form-row" style={{ marginTop: 8 }}>
                  <input
                    value={orgReplyDraft[t.id] || ''}
                    onChange={e => setOrgReplyDraft({ ...orgReplyDraft, [t.id]: e.target.value })}
                    placeholder="Ответ организатора…"
                    style={{ flex: 1 }}
                  />
                  <button onClick={() => act(() => adminFetch(`/org/threads/${t.id}/reply`, {
                    method: 'POST',
                    body: JSON.stringify({ text: orgReplyDraft[t.id], sendPush: true }),
                  }).then(() => setOrgReplyDraft({ ...orgReplyDraft, [t.id]: '' })), 'Ответ отправлен')}>
                    Ответить + push
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'data' && (
          <>
            <h3>Ответы на задания</h3>
            <table>
              <thead><tr><th>Участник</th><th>Задание</th><th>Статус</th><th>Ответ</th><th>Дата</th></tr></thead>
              <tbody>
                {allSubmissions.map(s => (
                  <tr key={s.id}>
                    <td>{s.participantName}</td>
                    <td>{s.taskTitle}</td>
                    <td>{label(s.status)}</td>
                    <td>{s.answerText?.slice(0, 40)}</td>
                    <td>{s.submittedAt ? new Date(s.submittedAt).toLocaleString('ru-RU') : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={submissionsPage} total={submissionsTotal} setPage={setSubmissionsPage} />
            <h3>Посещаемость событий</h3>
            <table>
              <thead><tr><th>Участник</th><th>Направление</th><th>Событие</th><th>День</th><th>Дата</th></tr></thead>
              <tbody>
                {attendance.map(a => (
                  <tr key={a.id}>
                    <td>{a.participantName}</td>
                    <td>{a.direction}</td>
                    <td>{a.eventTitle}</td>
                    <td>{a.eventDay}</td>
                    <td>{a.createdAt ? new Date(a.createdAt).toLocaleString('ru-RU') : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={attendancePage} total={attendanceTotal} setPage={setAttendancePage} />
            <h3>Обмен опытом (все)</h3>
            {exchangeArchive.map(q => (
              <div key={q.id} className="card">
                <strong>{label(q.moderationStatus)}</strong> · {q.text}
                <div style={{ fontSize: 11 }}>{q.authorName} · ответов: {q.answers?.length ?? 0}</div>
              </div>
            ))}
            <Pagination page={exchangePage} total={exchangeTotal} setPage={setExchangePage} />
          </>
        )}

        {tab === 'levels' && (
          <>
            <div className="card">
              <h3>Настройка баллов</h3>
              <div className="form-row">
                <input value={newLevel.actionType} onChange={e => setNewLevel({ ...newLevel, actionType: e.target.value })} placeholder="Тип действия" />
                <input type="number" value={newLevel.pointsPerUnit} onChange={e => setNewLevel({ ...newLevel, pointsPerUnit: Number(e.target.value) })} placeholder="Баллы" />
                <input value={newLevel.levelThresholds} onChange={e => setNewLevel({ ...newLevel, levelThresholds: e.target.value })} placeholder="Пороги уровней" />
                <button onClick={() => adminFetch('/levels-config', {
                  method: 'POST',
                  body: JSON.stringify({
                    actionType: newLevel.actionType,
                    pointsPerUnit: newLevel.pointsPerUnit,
                    maxAccruals: newLevel.maxAccruals,
                    levelType: newLevel.levelType,
                    levelThresholds: newLevel.levelThresholds.split(',').map(Number),
                  }),
                }).then(reload)}>Добавить</button>
              </div>
            </div>
            {levelsConfig.map(c => (
              <div key={c.id} className="card">
                {label(c.actionType)} ·
                <input type="number" defaultValue={c.pointsPerUnit} id={`lvl-pts-${c.id}`} style={{ width: 60, marginLeft: 8 }} />
                <button onClick={() => act(() => adminFetch('/levels-config', {
                  method: 'POST',
                  body: JSON.stringify({
                    actionType: c.actionType,
                    pointsPerUnit: Number((document.getElementById(`lvl-pts-${c.id}`) as HTMLInputElement).value),
                    maxAccruals: c.maxAccruals,
                    levelThresholds: c.levelThresholds,
                  }),
                }))}>Обновить</button>
              </div>
            ))}
            <h3>Лог начислений</h3>
            <table>
              <thead><tr><th>Участник</th><th>Действие</th><th>Баллы</th><th>Дата</th></tr></thead>
              <tbody>
                {pointsLog.map(l => (
                  <tr key={l.id}><td>{l.participantName}</td><td>{label(l.actionType)}</td><td>{l.points}</td><td>{l.createdAt ? new Date(l.createdAt).toLocaleString('ru-RU') : ''}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tab === 'analytics' && analytics && (
          <>
            {dashboards && (
              <div className="card">
                <h3>Дашборды v1</h3>
                <p>Зарегистрировано: {dashboards.pulse?.registered} · Ответов: {dashboards.pulse?.totalAnswers}</p>
                <p style={{ fontSize: 12 }}>GigaChat: {dashboards.gigachat?.configured ? 'настроен' : 'не настроен (.env)'}</p>
                <p style={{ fontSize: 12 }}>Программа: событий {dashboards.program?.eventsCount ?? 0} · материалов {dashboards.program?.materialsCount ?? 0}</p>
                <p style={{ fontSize: 12 }}>Заданий подтверждено: {dashboards.activity?.tasksApproved ?? 0} · Копилка: {dashboards.piggybank?.total ?? 0}</p>
                {dashboards.semantic && (
                  <div style={{ marginTop: 8, fontSize: 12, background: '#F7F7F7', padding: 8, borderRadius: 8 }}>
                    <strong>Смысловая аналитика</strong> ({dashboards.semantic.source})
                    <div style={{ marginTop: 4 }}>{dashboards.semantic.summary}</div>
                    <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {(dashboards.semantic.layers || []).map((l: any) => (
                        <span key={l.id} className="tag-chip">{l.title}: {l.count}</span>
                      ))}
                    </div>
                  </div>
                )}
                <button style={{ marginTop: 8 }} onClick={() => act(() => adminFetch('/integrations/club-match', { method: 'POST' }), 'Club-match выполнен')}>
                  Запустить club-match
                </button>
              </div>
            )}
            {dashboards?.pulse?.energySeries?.length > 0 && (
              <div className="card chart-card">
                <h3>Пульс · энергия по дням</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={dashboards.pulse.energySeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis domain={[0, 10]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="avg" stroke="#FF5500" name="Средняя энергия" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {dashboards?.portrait?.roleDistribution && (
              <div className="card chart-card">
                <h3>Портрет · роли</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={Object.entries(dashboards.portrait.roleDistribution).map(([name, value]) => ({ name, value }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#805AD5" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {dashboards?.activity?.reflectionDepth && (
              <div className="card chart-card">
                <h3>Активность · глубина рефлексии</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={Object.entries(dashboards.activity.reflectionDepth).map(([name, value]) => ({ name, value }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#3182CE" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {dashboards?.piggybank?.series?.length > 0 && (
              <div className="card chart-card">
                <h3>Копилка · по тегам</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dashboards.piggybank.series}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="tag" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#38A169" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {leaderboard.length > 0 && (
              <div className="card">
                <h3>Рейтинг (общий)</h3>
                <table>
                  <thead><tr><th>#</th><th>ФИО</th><th>Баллы</th></tr></thead>
                  <tbody>
                    {leaderboard.slice(0, 15).map((l: any) => (
                      <tr key={l.id}><td>{l.rank}</td><td>{l.firstName} {l.lastName}</td><td>{l.score}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="card">
              <p>Участников: {analytics.participantCount} · Ответов: {analytics.answerCount} · Заполненность: {analytics.completionPercent}%</p>
              <p>Средняя энергия: {analytics.avgEnergy} · Медиана слов: {charts?.medianWordCount ?? '—'}</p>
              {analytics.redFlag && <p style={{ color: '#C53030', fontWeight: 700 }}>⚠ Тревога: низкая энергия участников</p>}
              {analytics.completionPercent === 0 && (
                <p style={{ color: '#888', fontSize: 12 }}>Нажмите «Пересчитать», если графики пустые</p>
              )}
              <button onClick={() => adminFetch('/analytics/recalculate', { method: 'POST' }).then(reload)}>Пересчитать</button>
            </div>
            {emotionChartData.length > 0 && (
              <div className="card chart-card">
                <h3>Эмоции участников</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={emotionChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#FF5500" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {charts?.energyTrend?.length > 0 && (
              <div className="card chart-card">
                <h3>Энергия по дням</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={charts.energyTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis domain={[0, 10]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="avg" stroke="#FF5500" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {charts?.completionByDirection?.length > 0 && (
              <div className="card chart-card">
                <h3>Заполненность по направлениям</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={charts.completionByDirection}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="direction" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Bar dataKey="percent" fill="#3182CE" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {charts?.piggybankTags?.length > 0 && (
              <div className="card chart-card">
                <h3>Топ тегов копилки</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={charts.piggybankTags.slice(0, 8)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="tag" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#38A169" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}

        {tab === 'exports' && (
          <div className="card">
            <h3>Выгрузка по дню</h3>
            <div className="form-row">
              <select value={exportDay} onChange={e => setExportDay(e.target.value)}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(d => <option key={d} value={d}>День {d}</option>)}
              </select>
              <select value={exportType} onChange={e => setExportType(e.target.value)}>
                <option value="all">Все типы</option>
                <option value="checkin">Проверка состояния</option>
                <option value="direction">Направление / осмысление</option>
                <option value="lessons">После уроков</option>
                <option value="evening">Итоги дня</option>
                <option value="point_a">Точка А</option>
                <option value="point_b">Точка Б</option>
              </select>
              <button onClick={() => downloadCsv(
                `/exports/answers?day=${exportDay}&type=${exportType}&depth=1`,
                `answers_day${exportDay}.csv`,
              )}>
                Скачать ответы дня (с ориентиром глубины)
              </button>
              <button onClick={() => act(() => adminDownloadBinary(
                `/exports/day?day=${exportDay}&type=${exportType}`,
                `day_${exportDay}_${exportType}.xlsx`,
              ), 'Книга дня скачана')}>
                Книга дня (XLSX / CSV)
              </button>
            </div>
            <h3 style={{ marginTop: 16 }}>Другие выгрузки</h3>
            <div className="form-row">
              <button onClick={() => downloadCsv('/exports/participants', 'participants.csv')}>Участники</button>
              <button onClick={() => downloadCsv('/exports/answers', 'answers.csv')}>Все ответы</button>
              <button onClick={() => downloadCsv('/exports/piggybank', 'piggybank.csv')}>Копилка</button>
              <button onClick={() => downloadCsv('/exports/task-submissions', 'task_submissions.csv')}>Задания</button>
              <button onClick={() => downloadCsv('/exports/exchange', 'exchange.csv')}>Обмен</button>
              <button onClick={() => downloadCsv('/exports/attendance', 'attendance.csv')}>Посещаемость</button>
              <button onClick={() => downloadCsv('/exports/points-log', 'points_log.csv')}>Баллы</button>
            </div>
            <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
              Ориентир глубины — качественный слой (Фиксация / Личный вывод / Перенос в практику), не оценка в баллах.
            </p>
          </div>
        )}

        {tab === 'push' && (
          <>
            <div className="card">
              <h3>Шаблоны уведомлений</h3>
              <div className="form-row">
                <input value={newPushTemplate.key} onChange={e => setNewPushTemplate({ ...newPushTemplate, key: e.target.value })} placeholder="key" />
                <input value={newPushTemplate.slotKey} onChange={e => setNewPushTemplate({ ...newPushTemplate, slotKey: e.target.value })} placeholder="slotKey (morning/evening…)" />
                <input value={newPushTemplate.title} onChange={e => setNewPushTemplate({ ...newPushTemplate, title: e.target.value })} placeholder="Заголовок" />
              </div>
              <textarea value={newPushTemplate.body} onChange={e => setNewPushTemplate({ ...newPushTemplate, body: e.target.value })} placeholder="Текст шаблона" rows={2} style={{ width: '100%' }} />
              <button style={{ marginTop: 8 }} onClick={() => act(() => adminFetch('/push/templates', {
                method: 'POST', body: JSON.stringify(newPushTemplate),
              }).then(() => setNewPushTemplate({ key: '', title: '', body: '', slotKey: '', isActive: true })), 'Шаблон создан')}>
                Добавить шаблон
              </button>
              {pushTemplates.map(t => (
                <div key={t.id} className="card" style={{ marginTop: 8, fontSize: 12 }}>
                  <strong>{t.key}</strong>{t.slotKey ? ` · ${t.slotKey}` : ''} {t.isActive === false ? '· выкл' : ''}
                  <div>{t.title}</div>
                  <div style={{ color: '#666' }}>{t.body}</div>
                  <div className="form-row" style={{ marginTop: 6 }}>
                    <button onClick={() => {
                      setPushText(t.body || '');
                      setToast('Текст шаблона подставлен');
                    }}>Использовать</button>
                    <button onClick={() => act(() => adminFetch(`/push/templates/${t.id}`, {
                      method: 'PATCH', body: JSON.stringify({ isActive: t.isActive === false }),
                    }), t.isActive === false ? 'Включён' : 'Выключен')}>
                      {t.isActive === false ? 'Вкл' : 'Выкл'}
                    </button>
                    <button className="btn-danger" onClick={() => {
                      if (confirm('Удалить шаблон?')) act(() => adminFetch(`/push/templates/${t.id}`, { method: 'DELETE' }));
                    }}>×</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="card">
              <textarea value={pushText} onChange={e => setPushText(e.target.value)} placeholder="Текст уведомления" rows={3} style={{ width: '100%' }} />
              <div className="form-row" style={{ marginTop: 8 }}>
                <input
                  type="number"
                  value={pushParticipantId}
                  onChange={e => setPushParticipantId(e.target.value)}
                  placeholder="ID участника (пусто = всем)"
                  style={{ flex: 1 }}
                />
                <button onClick={() => act(() => adminFetch('/push/send', {
                  method: 'POST',
                  body: JSON.stringify({
                    text: pushText,
                    ...(pushParticipantId ? { participantId: Number(pushParticipantId) } : {}),
                  }),
                }), 'Уведомление отправлено').then(() => { setPushText(''); setPushParticipantId(''); })}>
                  Отправить
                </button>
                <button onClick={() => act(() => adminFetch('/integrations/club-match', { method: 'POST' }), 'Подбор клубов выполнен')}>
                  Подбор клубов (ИИ)
                </button>
              </div>
            </div>
            <table>
              <thead><tr><th>Текст</th><th>Триггер</th><th>Статус</th><th>Дата</th></tr></thead>
              <tbody>
                {pushLog.map(l => (
                  <tr key={l.id}><td>{l.text}</td><td>{label(l.triggerType)}</td><td>{label(l.deliveryStatus)}</td><td>{l.sentAt ? new Date(l.sentAt).toLocaleString('ru-RU') : ''}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tab === 'admins' && (
          <>
            <div className="card" style={{ marginBottom: 16 }}>
              <h3>Матрица прав (только просмотр)</h3>
              <p style={{ fontSize: 12, color: '#666' }}>Права задаются в коде (`roleCan`). Редактирование ролей пользователей — ниже.</p>
              <table>
                <thead>
                  <tr>
                    <th>Роль</th>
                    <th>чтение</th>
                    <th>модерация</th>
                    <th>выгрузка</th>
                    <th>настройки</th>
                    <th>пользователи</th>
                    <th>удаление</th>
                  </tr>
                </thead>
                <tbody>
                  {rightsMatrix.map((row: any) => (
                    <tr key={row.role}>
                      <td>{row.label}</td>
                      {(['read', 'moderate', 'export', 'settings', 'users', 'delete'] as const).map(a => (
                        <td key={a}>{row.actions?.[a] ? '✓' : '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-row">
              <input value={newAdmin.login} onChange={e => setNewAdmin({ ...newAdmin, login: e.target.value })} placeholder="Логин" />
              <input type="password" value={newAdmin.password} onChange={e => setNewAdmin({ ...newAdmin, password: e.target.value })} placeholder="Пароль" />
              <select value={newAdmin.role} onChange={e => setNewAdmin({ ...newAdmin, role: e.target.value })}>
                <option value="admin">admin</option>
                <option value="moderator">moderator</option>
                <option value="analyst">analyst</option>
                <option value="director">director</option>
              </select>
              <button onClick={() => act(() => adminFetch('/admin-users', {
                method: 'POST', body: JSON.stringify(newAdmin),
              }).then(() => setNewAdmin({ login: '', password: '', role: 'moderator' })), 'Админ создан')}>
                Добавить
              </button>
            </div>
            <table>
              <thead><tr><th>ID</th><th>Логин</th><th>Роль</th><th>Активен</th><th></th></tr></thead>
              <tbody>
                {adminUsers.map(u => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.login}</td>
                    <td>
                      <select value={u.role || 'admin'} onChange={e => act(() => adminFetch(`/admin-users/${u.id}`, {
                        method: 'PATCH', body: JSON.stringify({ role: e.target.value }),
                      }))}>
                        <option value="admin">admin</option>
                        <option value="moderator">moderator</option>
                        <option value="analyst">analyst</option>
                        <option value="director">director</option>
                      </select>
                    </td>
                    <td>{u.isActive === false ? 'нет' : 'да'}</td>
                    <td>
                      <button onClick={() => act(() => adminFetch(`/admin-users/${u.id}`, {
                        method: 'PATCH', body: JSON.stringify({ isActive: u.isActive === false }),
                      }), u.isActive === false ? 'Разблокирован' : 'Заблокирован')}>
                        {u.isActive === false ? 'Разблок' : 'Блок'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tab === 'journal' && (
          <>
            <div className="form-row">
              <label>
                <input type="checkbox" checked={journalCritical} onChange={e => setJournalCritical(e.target.checked)} />
                {' '}Только критичные операции
              </label>
            </div>
            <table>
              <thead><tr><th>Время</th><th>Админ</th><th>Действие</th><th>Раздел</th><th>Объект</th><th>Крит.</th></tr></thead>
              <tbody>
                {actionsLog.map(a => (
                  <tr key={a.id}>
                    <td>{a.createdAt ? new Date(a.createdAt).toLocaleString('ru-RU') : ''}</td>
                    <td>{a.adminLogin}</td>
                    <td>{a.actionType}</td>
                    <td>{a.section}</td>
                    <td>{a.objectId}</td>
                    <td>{a.isCritical ? '⚠' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tab === 'medals' && (
          <>
            <div className="form-row">
              <input value={newMedal.name} onChange={e => setNewMedal({ ...newMedal, name: e.target.value })} placeholder="Название" />
              <input value={newMedal.description} onChange={e => setNewMedal({ ...newMedal, description: e.target.value })} placeholder="Описание" />
              <select value={newMedal.level} onChange={e => setNewMedal({ ...newMedal, level: e.target.value })}>
                <option value="bronze">Бронза</option>
                <option value="silver">Серебро</option>
                <option value="gold">Золото</option>
              </select>
              <select value={newMedal.awardType} onChange={e => setNewMedal({ ...newMedal, awardType: e.target.value })}>
                <option value="manual">Ручная</option>
                <option value="auto">Авто</option>
              </select>
              <input
                value={newMedal.conditionRule}
                onChange={e => setNewMedal({ ...newMedal, conditionRule: e.target.value })}
                placeholder="tasks_completed>=1"
                style={{ minWidth: 160 }}
              />
              <button onClick={() => act(() => adminFetch('/medals', {
                method: 'POST', body: JSON.stringify(newMedal),
              }), 'Медаль создана')}>Создать</button>
              <button onClick={() => act(() => adminFetch('/medals/evaluate', { method: 'POST' }), 'Авто-оценка запущена')}>
                Авто-оценка
              </button>
            </div>
            <table>
              <thead><tr><th>Название</th><th>Уровень</th><th>Тип</th><th>Правило</th><th></th></tr></thead>
              <tbody>
                {medals.map(m => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td>{m.level}</td>
                    <td>{m.awardType}</td>
                    <td style={{ fontSize: 11 }}>{m.conditionRule || '—'}</td>
                    <td>
                      <button className="btn-danger" onClick={() => act(() =>
                        adminFetch(`/medals/${m.id}`, { method: 'DELETE' }), 'Удалено')}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </main>
      {toast && (
        <div className="toast" onClick={() => setToast(null)} role="status">
          {toast}
        </div>
      )}
    </div>
  );
};
