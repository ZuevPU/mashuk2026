import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts';

const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || 'dev-admin-secret';

function normalizeApiUrl(url: string): string {
  if (!url) return '';
  let normalized = url.trim();
  if (!normalized.startsWith('/') && !/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }
  if (normalized.startsWith('http://')) {
    normalized = normalized.replace(/^http:\/\//, 'https://');
  }
  return normalized.replace(/\/$/, '');
}

const API_BASE = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL && !import.meta.env.VITE_API_URL.includes('localhost') 
      ? normalizeApiUrl(import.meta.env.VITE_API_URL) 
      : 'https://zuevpu-mashuk2026-1535.twc1.net/api')
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

async function adminFetch(path: string, options: RequestInit = {}) {
  const base = API_BASE ? `${API_BASE}/admin` : '/api/admin';
  if (import.meta.env.PROD && !API_BASE) {
    throw new Error('VITE_API_URL is not set. Configure it in Timeweb Apps and rebuild the admin panel.');
  }
  const res = await fetchWithRetry(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': ADMIN_TOKEN,
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/html') || text.trimStart().startsWith('<!')) {
    throw new Error(
      'API returned HTML instead of JSON. Set VITE_API_URL=https://zuevpu-mashuk2026-1535.twc1.net/api in Timeweb Apps and rebuild.',
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

type Tab = 'participants' | 'directions' | 'events' | 'tasks' | 'questions' | 'forum' | 'moderation' | 'data' | 'levels' | 'analytics' | 'exports' | 'push';

const TAB_LABELS: Record<Tab, string> = {
  participants: 'Участники',
  directions: 'Направления',
  events: 'События',
  tasks: 'Задания',
  questions: 'Вопросы',
  forum: 'Форум',
  moderation: 'Модерация',
  data: 'Данные',
  levels: 'Баллы',
  analytics: 'Аналитика',
  exports: 'Выгрузки',
  push: 'Push',
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
    fn().then(() => { setToast(msg); reload(); }).catch(e => setToast(String(e)));

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
    allowRetry: true, autoConfirm: false, pushOnPublish: false, hideUntilPublish: true, dayNumber: 1,
  });
  const [newQuestion, setNewQuestion] = useState({
    title: '', text: '', type: 'open', block: 'Целеполагание', status: 'published',
    timePoint: '', dayNumber: 1, points: 10, allowRetry: false, pushOnPublish: false,
  });
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
  });

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
        }
        if (tab === 'moderation') {
          setPendingExchange((await adminFetch('/exchange/pending')).questions);
          setPendingTasks((await adminFetch('/task-submissions/pending')).submissions);
          setExchangeArchive((await adminFetch('/exchange?status=approved')).questions);
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
        }
        if (tab === 'push') setPushLog((await adminFetch('/push/log')).log);
        if (tab === 'directions' || tab === 'participants') {
          setDirections((await adminFetch('/directions')).directions);
        }
      } catch (e) {
        setToast(String(e instanceof Error ? e.message : e));
      } finally {
        setTabLoading(false);
      }
    })();
  }, [tab, reloadKey, participantsPage, submissionsPage, attendancePage, exchangePage]);

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
    await adminFetch('/questions', {
      method: 'POST',
      body: JSON.stringify({ ...newQuestion, dayNumber: Number(newQuestion.dayNumber) }),
    });
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
    await adminFetch('/materials', {
      method: 'POST',
      body: JSON.stringify({ ...newMaterial, dayNumber: Number(newMaterial.dayNumber) }),
    });
  });

  const emotionChartData = charts?.emotions
    ? Object.entries(charts.emotions as Record<string, number>).map(([name, value]) => ({ name, value }))
    : [];

  const [authKey, setAuthKey] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('mashuk_admin_auth');
    if (saved === 'сладкаябулочкаскорицей55') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (authKey === 'сладкаябулочкаскорицей55') {
      localStorage.setItem('mashuk_admin_auth', authKey);
      setIsAuthenticated(true);
    } else {
      alert('Неверный код доступа');
    }
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
        <form onSubmit={handleLogin} style={{ background: 'white', padding: 32, borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ margin: 0, textAlign: 'center' }}>Вход в админку</h2>
          <input 
            type="password" 
            value={authKey} 
            onChange={e => setAuthKey(e.target.value)} 
            placeholder="Код доступа" 
            style={{ padding: '8px 12px', fontSize: 16, borderRadius: 6, border: '1px solid #ccc' }}
          />
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
              <input value={newParticipant.vkId} onChange={e => setNewParticipant({ ...newParticipant, vkId: e.target.value })} placeholder="VK ID" />
              <input value={newParticipant.firstName} onChange={e => setNewParticipant({ ...newParticipant, firstName: e.target.value })} placeholder="Имя" />
              <input value={newParticipant.lastName} onChange={e => setNewParticipant({ ...newParticipant, lastName: e.target.value })} placeholder="Фамилия" />
              <select value={newParticipant.directionId} onChange={e => setNewParticipant({ ...newParticipant, directionId: e.target.value })}>
                <option value="">Направление</option>
                {directions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <button onClick={createParticipant}>Добавить</button>
            </div>
            <table>
              <thead><tr><th>ID</th><th>VK</th><th>Имя</th><th>Направление</th><th>Путь</th><th>Опыт</th><th>Действия</th></tr></thead>
              <tbody>
                {filteredParticipants.map(p => (
                  <tr key={p.id}>
                    <td>{p.id}</td><td>{p.vkId}</td>
                    <td>{p.firstName} {p.lastName}</td>
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
                    <td>{p.pathPoints}</td><td>{p.experiencePoints}</td>
                    <td>
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
                <input value={newMaterial.speakerName} onChange={e => setNewMaterial({ ...newMaterial, speakerName: e.target.value })} placeholder="Спикер" />
                <input value={newMaterial.title} onChange={e => setNewMaterial({ ...newMaterial, title: e.target.value })} placeholder="Название" />
                <input value={newMaterial.url} onChange={e => setNewMaterial({ ...newMaterial, url: e.target.value })} placeholder="URL" />
                <button onClick={createMaterial}>Добавить</button>
              </div>
              {materials.map(m => (
                <div key={m.id} className="card" style={{ fontSize: 12 }}>
                  <input defaultValue={m.title} id={`mat-title-${m.id}`} />
                  <input defaultValue={m.url || ''} id={`mat-url-${m.id}`} placeholder="URL" style={{ marginLeft: 8, flex: 1 }} />
                  <button onClick={() => act(() => adminFetch(`/materials/${m.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      title: (document.getElementById(`mat-title-${m.id}`) as HTMLInputElement).value,
                      url: (document.getElementById(`mat-url-${m.id}`) as HTMLInputElement).value,
                    }),
                  }))}>Сохранить</button>
                  <button className="btn-danger" onClick={() => {
                    if (confirm('Удалить материал?')) act(() => adminFetch(`/materials/${m.id}`, { method: 'DELETE' }));
                  }}>×</button>
                </div>
              ))}
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
                  <option value="text">text</option>
                  <option value="photo">photo</option>
                  <option value="text_and_photo">text_and_photo</option>
                </select>
              </div>
              <div className="form-row">
                <input value={newTask.description} onChange={e => setNewTask({ ...newTask, description: e.target.value })} placeholder="Описание" style={{ flex: 2 }} />
                <label><input type="checkbox" checked={newTask.allowRetry} onChange={e => setNewTask({ ...newTask, allowRetry: e.target.checked })} /> Повтор</label>
                <label><input type="checkbox" checked={newTask.autoConfirm} onChange={e => setNewTask({ ...newTask, autoConfirm: e.target.checked })} /> Авто</label>
                <label><input type="checkbox" checked={newTask.pushOnPublish} onChange={e => setNewTask({ ...newTask, pushOnPublish: e.target.checked })} /> Push</label>
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
                  <label><input type="checkbox" defaultChecked={t.pushOnPublish} id={`task-push-${t.id}`} /> Push</label>
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
                      pushOnPublish: (document.getElementById(`task-push-${t.id}`) as HTMLInputElement).checked,
                      allowRetry: (document.getElementById(`task-retry-${t.id}`) as HTMLInputElement).checked,
                      autoConfirm: (document.getElementById(`task-auto-${t.id}`) as HTMLInputElement).checked,
                    }),
                  }))}>Сохранить</button>
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
              <h3>Новый вопрос</h3>
              <div className="form-row">
                <input value={newQuestion.title} onChange={e => setNewQuestion({ ...newQuestion, title: e.target.value })} placeholder="Заголовок" />
                <select value={newQuestion.type} onChange={e => setNewQuestion({ ...newQuestion, type: e.target.value })}>
                  {['open', 'checkin', 'choice', 'multi', 'dependent'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input value={newQuestion.block} onChange={e => setNewQuestion({ ...newQuestion, block: e.target.value })} placeholder="Блок" />
                <select value={newQuestion.timePoint} onChange={e => setNewQuestion({ ...newQuestion, timePoint: e.target.value })}>
                  <option value="">—</option>
                  <option value="утро">утро</option>
                  <option value="день">день</option>
                  <option value="вечер">вечер</option>
                </select>
                <button onClick={createQuestion}>Создать</button>
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
                <input value={optionForm.label} onChange={e => setOptionForm({ ...optionForm, label: e.target.value })} placeholder="Label" />
                <input value={optionForm.value} onChange={e => setOptionForm({ ...optionForm, value: e.target.value })} placeholder="Value" />
                <button onClick={addOption}>Добавить</button>
              </div>
            </div>
            {questions.map(q => (
              <div key={q.id} className="card">
                <div className="form-row">
                  <strong>{q.id}.</strong>
                  <input defaultValue={q.title} id={`q-title-${q.id}`} style={{ flex: 1 }} />
                  <select defaultValue={q.status} id={`q-status-${q.id}`}>
                    <option value="draft">draft</option>
                    <option value="published">published</option>
                  </select>
                </div>
                <textarea defaultValue={q.text || ''} id={`q-text-${q.id}`} placeholder="Текст" rows={2} style={{ width: '100%', marginTop: 8 }} />
                <div className="form-row" style={{ marginTop: 8, fontSize: 12 }}>
                  <input defaultValue={q.block || ''} id={`q-block-${q.id}`} placeholder="Блок" />
                  <input type="number" defaultValue={q.points ?? 10} id={`q-points-${q.id}`} style={{ width: 60 }} placeholder="Баллы" />
                  <label><input type="checkbox" defaultChecked={q.pushOnPublish} id={`q-push-${q.id}`} /> Push</label>
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
                  <button onClick={() => act(() => adminFetch(`/questions/${q.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      title: (document.getElementById(`q-title-${q.id}`) as HTMLInputElement).value,
                      text: (document.getElementById(`q-text-${q.id}`) as HTMLTextAreaElement).value,
                      status: (document.getElementById(`q-status-${q.id}`) as HTMLSelectElement).value,
                      block: (document.getElementById(`q-block-${q.id}`) as HTMLInputElement).value,
                      points: Number((document.getElementById(`q-points-${q.id}`) as HTMLInputElement).value),
                      pushOnPublish: (document.getElementById(`q-push-${q.id}`) as HTMLInputElement).checked,
                    }),
                  }))}>Сохранить</button>
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
              <p>Текущий день: <strong>{forumSettings.currentDay}</strong> / {forumSettings.totalDays ?? 4}</p>
              <div className="form-row">
                {[1, 2, 3, 4].map(d => (
                  <button key={d} onClick={() => saveForumSettings({ currentDay: d })}>День {d}</button>
                ))}
                <input type="number" defaultValue={forumSettings.totalDays} id="total-days" placeholder="Всего дней" />
                <button onClick={() => {
                  const totalDays = Number((document.getElementById('total-days') as HTMLInputElement).value);
                  saveForumSettings({ totalDays });
                }}>Сохранить дней</button>
                <input type="number" value={recThreshold} onChange={e => setRecThreshold(Number(e.target.value))} placeholder="Порог рекомендаций" />
                <button onClick={() => saveForumSettings({ recommendationThreshold: recThreshold })}>Сохранить порог</button>
              </div>
            </div>
            <div className="card">
              <h3>Фокус дня</h3>
              <div className="form-row">
                {[1, 2, 3, 4].map(d => (
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
                  {' '}{s}
                </label>
              ))}
              <button onClick={saveSections}>Сохранить</button>
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
                <p style={{ fontSize: 11, color: '#888' }}>{q.authorName} · {q.moderationStatus}</p>
                {q.answers?.map((a: any) => (
                  <div key={a.id} style={{ marginTop: 6, padding: 6, background: '#f5f5f5', borderRadius: 6, fontSize: 12 }}>
                    {a.authorName}: {a.text}
                    {a.reactions && ` · 👍 ${a.reactions.likes ?? 0}`}
                  </div>
                ))}
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
                    <td>{s.status}</td>
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
                <strong>{q.moderationStatus}</strong> · {q.text}
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
                <input value={newLevel.actionType} onChange={e => setNewLevel({ ...newLevel, actionType: e.target.value })} placeholder="actionType" />
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
                {c.actionType} ·
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
                  <tr key={l.id}><td>{l.participantName}</td><td>{l.actionType}</td><td>{l.points}</td><td>{l.createdAt ? new Date(l.createdAt).toLocaleString('ru-RU') : ''}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tab === 'analytics' && analytics && (
          <>
            <div className="card">
              <p>Участников: {analytics.participantCount} · Ответов: {analytics.answerCount} · Заполненность: {analytics.completionPercent}%</p>
              <p>Средняя энергия: {analytics.avgEnergy} · Медиана слов: {charts?.medianWordCount ?? '—'}</p>
              {analytics.redFlag && <p style={{ color: '#C53030', fontWeight: 700 }}>⚠ Red flag: низкая энергия участников</p>}
              {analytics.completionPercent === 0 && (
                <p style={{ color: '#888', fontSize: 12 }}>Нажмите «Пересчитать», если графики пустые</p>
              )}
              <button onClick={() => adminFetch('/analytics/recalculate', { method: 'POST' }).then(reload)}>Пересчитать</button>
            </div>
            {emotionChartData.length > 0 && (
              <div className="card chart-card">
                <h3>Эмоции (check-in)</h3>
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
            <div className="form-row">
              <button onClick={() => downloadCsv('/exports/participants', 'participants.csv')}>Участники</button>
              <button onClick={() => downloadCsv('/exports/answers', 'answers.csv')}>Ответы</button>
              <button onClick={() => downloadCsv('/exports/piggybank', 'piggybank.csv')}>Копилка</button>
              <button onClick={() => downloadCsv('/exports/task-submissions', 'task_submissions.csv')}>Задания</button>
              <button onClick={() => downloadCsv('/exports/exchange', 'exchange.csv')}>Обмен</button>
              <button onClick={() => downloadCsv('/exports/attendance', 'attendance.csv')}>Посещаемость</button>
              <button onClick={() => downloadCsv('/exports/points-log', 'points_log.csv')}>Баллы</button>
            </div>
          </div>
        )}

        {tab === 'push' && (
          <>
            <div className="card">
              <textarea value={pushText} onChange={e => setPushText(e.target.value)} placeholder="Текст push-уведомления" rows={3} style={{ width: '100%' }} />
              <div className="form-row" style={{ marginTop: 8 }}>
                <input
                  type="number"
                  value={pushParticipantId}
                  onChange={e => setPushParticipantId(e.target.value)}
                  placeholder="participantId (пусто = всем)"
                  style={{ flex: 1 }}
                />
                <button onClick={() => act(() => adminFetch('/push/send', {
                  method: 'POST',
                  body: JSON.stringify({
                    text: pushText,
                    ...(pushParticipantId ? { participantId: Number(pushParticipantId) } : {}),
                  }),
                }), 'Push отправлен').then(() => { setPushText(''); setPushParticipantId(''); })}>
                  Отправить
                </button>
              </div>
            </div>
            <table>
              <thead><tr><th>Текст</th><th>Триггер</th><th>Статус</th><th>Дата</th></tr></thead>
              <tbody>
                {pushLog.map(l => (
                  <tr key={l.id}><td>{l.text}</td><td>{l.triggerType}</td><td>{l.deliveryStatus}</td><td>{l.sentAt ? new Date(l.sentAt).toLocaleString('ru-RU') : ''}</td></tr>
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
