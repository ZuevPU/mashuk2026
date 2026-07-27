import { useState, useEffect } from 'react';
import { Panel, PanelHeader, Group, Spinner, SegmentedControl, Select, Button, Snackbar, Checkbox, Input } from '@vkontakte/vkui';
import { UserInfo } from '@vkontakte/vk-bridge';
import { apiGet, apiPost, apiPatch, apiDownloadBlob, ApiError } from '../api/client';
import { useAppModal } from '../App';
import { openQuickCapture } from '../components/QuickCaptureFlow';
import { EmptyState } from '../components/EmptyState';
import { PIGGYBANK_TAGS, PIGGYBANK_SOURCES } from '../data/piggybank';
import { buildParticipantVolunteerUrl } from '../utils/qrDeepLink';
import { requestVkPushPermission } from '../utils/pushNotifications';

const TAGS = ['', ...PIGGYBANK_TAGS];
const SOURCES = ['', ...PIGGYBANK_SOURCES];

const PUSH_TYPES = [
  { key: 'touchpoints', label: 'Точки осмысления / проверки состояния' },
  { key: 'program', label: 'Программа и события' },
  { key: 'tasks', label: 'Задания и модерация' },
  { key: 'exchange', label: 'Общение и ответы' },
] as const;

export const ProfilePanel: React.FC<{
  id: string;
  fetchedUser?: UserInfo | null;
  onSelfDeleted?: () => void;
}> = ({ id, fetchedUser, onSelfDeleted }) => {
  const { setModal } = useAppModal();
  const [profile, setProfile] = useState<any>(null);
  const [piggybank, setPiggybank] = useState<any[]>([]);
  const [previewPiggy, setPreviewPiggy] = useState<any[]>([]);
  const [medals, setMedals] = useState<any[]>([]);
  const [section, setSection] = useState<'overview' | 'piggybank' | 'final' | 'settings' | 'rating' | 'medals'>('overview');
  const [tagFilter, setTagFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [dayFilter, setDayFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [synthLoading, setSynthLoading] = useState(false);
  const [hideLb, setHideLb] = useState(false);
  const [pushOptOut, setPushOptOut] = useState<Record<string, boolean>>({});
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [medalsCatalog, setMedalsCatalog] = useState<any[]>([]);
  const [lbTrack, setLbTrack] = useState<'total' | 'path' | 'experience'>('total');
  const [lbScope, setLbScope] = useState<'total' | 'day' | 'shift'>('total');
  const [lbDay, setLbDay] = useState('1');
  const [lbDirection, setLbDirection] = useState('');
  const [lbDirections, setLbDirections] = useState<string[]>([]);
  const [leaders, setLeaders] = useState<any[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [lbLoading, setLbLoading] = useState(false);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [finalTagFilter, setFinalTagFilter] = useState('');
  const [finalSourceFilter, setFinalSourceFilter] = useState('');

  const loadProfile = () => {
    setLoading(true);
    setError(null);
    apiGet<any>('/profile')
      .then((p) => {
        setProfile(p);
        setHideLb(!!p.user?.hideFromLeaderboard);
        setPushOptOut((p.user?.pushOptOut as Record<string, boolean>) || {});
        return Promise.all([
          apiGet<any>('/piggybank'),
          apiGet<any>('/profile/medals').catch(() => ({ medals: [] })),
        ]);
      })
      .then(([pb, med]) => {
        setPreviewPiggy((pb.entries || []).slice(0, 3));
        setMedals(med.medals || []);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Не удалось загрузить профиль'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadProfile(); }, []);

  useEffect(() => {
    const hash = window.location.hash || '';
    const qIndex = hash.indexOf('?');
    if (qIndex === -1) return;
    const params = new URLSearchParams(hash.slice(qIndex + 1));
    const section = params.get('section');
    if (section === 'piggybank' || section === 'final' || section === 'settings' || section === 'rating' || section === 'medals') {
      setSection(section);
    }
  }, []);

  const loadPiggybank = () => {
    const params = new URLSearchParams();
    if (tagFilter) params.set('tag', tagFilter);
    if (sourceFilter) params.set('source', sourceFilter);
    if (dayFilter) params.set('day', dayFilter);
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    const qs = params.toString();
    apiGet<any>(`/piggybank${qs ? `?${qs}` : ''}`)
      .then(pb => setPiggybank(pb.entries || []))
      .catch((err) => setSnackbar(err instanceof ApiError ? err.message : 'Не удалось загрузить копилку'));
  };

  useEffect(() => {
    if (section !== 'piggybank') return;
    const t = window.setTimeout(loadPiggybank, searchQuery ? 350 : 0);
    return () => window.clearTimeout(t);
  }, [section, tagFilter, sourceFilter, dayFilter, searchQuery]);

  useEffect(() => {
    if (section !== 'rating') return;
    setLbLoading(true);
    const params = new URLSearchParams({ track: lbTrack, scope: lbScope });
    if (lbDirection) params.set('direction', lbDirection);
    if (lbScope === 'day') params.set('day', lbDay);
    apiGet<any>(`/leaderboard?${params}`)
      .then((res) => {
        setLeaders(res.leaders || []);
        setMyRank(res.myRank ?? null);
        setLbDirections(res.directions || []);
      })
      .catch((err) => setSnackbar(err instanceof ApiError ? err.message : 'Не удалось загрузить рейтинг'))
      .finally(() => setLbLoading(false));
  }, [section, lbTrack, lbDirection, lbScope, lbDay]);

  useEffect(() => {
    if (section !== 'medals') return;
    apiGet<any>('/profile/medals/catalog')
      .then(res => setMedalsCatalog(res.medals || []))
      .catch((err) => setSnackbar(err instanceof ApiError ? err.message : 'Не удалось загрузить медали'));
  }, [section]);

  if (loading) {
    return (
      <Panel id={id}>
        <PanelHeader>Профиль</PanelHeader>
        <Group><Spinner /></Group>
      </Panel>
    );
  }

  if (error || !profile) {
    return (
      <Panel id={id}>
        <PanelHeader>Профиль</PanelHeader>
        <Group>
          <div className="m-card" style={{ color: '#C53030' }}>{error || 'Нет данных'}</div>
          <Button onClick={loadProfile}>Повторить</Button>
        </Group>
      </Panel>
    );
  }

  const p = profile;
  const photo = fetchedUser?.photo_100 || fetchedUser?.photo_200;
  const initials = `${(p.user.firstName?.[0] || '')}${(p.user.lastName?.[0] || '')}`;
  const m = p.metrics ?? {};
  const abPct = m.abProgress ?? p.trajectory?.progressPercent ?? 0;
  const finalCard = p.finalCard;
  const showFinal = !!finalCard?.available;
  const actionStyle = p.actionStyle;
  const tracker = p.dailyTracker;
  const outcomeBullets: string[] = p.outcomes?.bullets ?? [];
  const showOutcomes = p.outcomes?.visible ?? (p.currentDay >= 3);
  const tagCounts = (p.piggybankTags ?? {}) as Record<string, number>;
  const sourceCounts = (tracker?.piggybankSources ?? {}) as Record<string, number>;
  const shiftLine = [p.user.direction, p.user.groupName ? `Группа «${p.user.groupName}»` : null, p.user.shiftLabel]
    .filter(Boolean).join(' · ');

  const goPiggybank = (tag?: string, source?: string) => {
    if (tag) setTagFilter(tag);
    if (source) setSourceFilter(source);
    setSection('piggybank');
  };

  const exportPiggybank = async () => {
    setExportLoading(true);
    try {
      const params = new URLSearchParams();
      if (tagFilter) params.set('tag', tagFilter);
      if (sourceFilter) params.set('source', sourceFilter);
      if (dayFilter) params.set('day', dayFilter);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      const qs = params.toString();
      const blob = await apiDownloadBlob(`/piggybank/export${qs ? `?${qs}` : ''}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'piggybank.txt';
      a.click();
      URL.revokeObjectURL(url);
      setSnackbar('Экспорт сохранён');
    } catch (err) {
      setSnackbar(err instanceof ApiError ? err.message : 'Не удалось экспортировать');
    } finally {
      setExportLoading(false);
    }
  };

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      const blob = await apiDownloadBlob('/profile/pdf');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mashuk-profile.pdf';
      a.click();
      URL.revokeObjectURL(url);
      setSnackbar('PDF сохранён');
    } catch (err) {
      setSnackbar(err instanceof ApiError ? err.message : 'Не удалось скачать PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      await apiPatch('/profile/settings', {
        hideFromLeaderboard: hideLb,
        pushOptOut,
      });
      setSnackbar('Настройки сохранены');
      loadProfile();
    } catch (err) {
      setSnackbar(err instanceof ApiError ? err.message : 'Ошибка сохранения');
    } finally {
      setSettingsSaving(false);
    }
  };

  const deleteFromProgram = async () => {
    const ok = window.confirm(
      'Удалить профиль из программы? Вы больше не сможете пользоваться приложением. '
      + 'Для восстановления обратитесь к организаторам.',
    );
    if (!ok) return;
    setDeleteLoading(true);
    try {
      await apiPost('/profile/delete');
      onSelfDeleted?.();
    } catch (err) {
      setSnackbar(err instanceof ApiError ? err.message : 'Не удалось удалить профиль');
    } finally {
      setDeleteLoading(false);
    }
  };

  const qrDeepLink = p?.user?.qrToken
    ? buildParticipantVolunteerUrl(p.user.qrToken, p.user.id)
    : null;
  const qrImageUrl = qrDeepLink
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrDeepLink)}`
    : null;

  const sectionOptions = [
    { label: 'Обзор', value: 'overview' },
    { label: 'Рейтинг', value: 'rating' },
    { label: 'Медали', value: 'medals' },
    { label: `Копилка (${p.piggybankCount ?? 0})`, value: 'piggybank' },
    ...(showFinal ? [{ label: 'Итог смены', value: 'final' }] : []),
    { label: '⚙', value: 'settings' },
  ];

  return (
    <Panel id={id}>
      <PanelHeader>Профиль</PanelHeader>
      <Group>
        <SegmentedControl
          value={section}
          onChange={(v) => setSection(v as typeof section)}
          options={sectionOptions}
        />

        {section === 'overview' ? (
          <>
            <div className="pf-hdr">
              <div className="pf-av">
                {photo ? <img src={photo} alt="" /> : initials}
              </div>
              <div style={{ flex: 1 }}>
                <div className="pf-n">{p.user.firstName} {p.user.lastName}</div>
                <div className="pf-r">{shiftLine || p.user.direction}</div>
                {(p.user.leadingRoleStartName || p.user.pedagogicalRoleName) && (
                  <div style={{ fontSize: 12, color: '#B8621A', marginTop: 4, fontWeight: 700 }}>
                    ◆ Стартовая роль: {p.user.leadingRoleStartName || p.user.pedagogicalRoleName}
                  </div>
                )}
                {(p.user.workplace || p.user.position) && (
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                    {[p.user.position, p.user.workplace].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            </div>

            {p.trajectory && (
              <div className="ab-card">
                <div className="pb-lbl">Траектория A → B</div>
                <div className="ab-row">
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{p.trajectory.from}</span>
                  <div className="ab-track">
                    <div className="ab-track-fill" style={{ width: `${abPct}%` }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{p.trajectory.to}</span>
                </div>
                <div className="ab-dates">
                  <span>{p.trajectory.fromDate || 'Старт'}</span>
                  <span>{abPct}% пути</span>
                  <span>{p.trajectory.toDate || 'Цель'}</span>
                </div>
              </div>
            )}

            {(actionStyle?.route || p.roleTrajectory?.route) && (
              <div className="m-card">
                <div className="pb-lbl">Твой способ действия на программе</div>
                {actionStyle?.startRole && (
                  <div style={{ fontSize: 12, marginTop: 6, color: '#666' }}>
                    Старт: {actionStyle.startRole.name}
                    {actionStyle.startRole.essence ? ` — ${actionStyle.startRole.essence}` : ''}
                  </div>
                )}
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>
                  {actionStyle?.route || p.roleTrajectory.route}
                </div>
                {actionStyle?.roleCounts?.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginTop: 10 }}>
                    {actionStyle.roleCounts.map((r: { key: string; name: string; count: number }) => (
                      <div key={r.key} style={{ fontSize: 11, background: '#FFF8E7', borderRadius: 8, padding: '6px 8px' }}>
                        <span style={{ fontWeight: 700 }}>{r.name}</span>
                        <span style={{ color: '#888' }}> · {r.count}</span>
                      </div>
                    ))}
                  </div>
                )}
                {actionStyle?.selfInsights?.length > 0 && (
                  <ul className="pb-checks" style={{ marginTop: 10 }}>
                    {actionStyle.selfInsights.map((line: string, i: number) => <li key={i}>{line}</li>)}
                  </ul>
                )}
                {(p.user.strongRoleName || p.user.growthRoleName || p.user.nextExperiment) ? (
                  <div style={{ marginTop: 10, fontSize: 12 }}>
                    {p.user.strongRoleName && <div>Сильная роль: {p.user.strongRoleName}</div>}
                    {p.user.growthRoleName && <div>Роль роста: {p.user.growthRoleName}</div>}
                    {p.user.nextExperiment && <div>Эксперимент: {p.user.nextExperiment}</div>}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
                    Выборы Точки Б появятся после финальной анкеты.
                  </div>
                )}
              </div>
            )}

            <div className="ab-card">
              <div className="ab-stats">
                <div className="abs"><div className="abs-v">{abPct}%</div><div className="abs-l">Прогресс A→B</div></div>
                <div className="abs">
                  <div className="abs-v">{m.activitiesVisited ?? p.stats.activities}/{m.activitiesTotal ?? '—'}</div>
                  <div className="abs-l">Активностей</div>
                </div>
                <div className="abs"><div className="abs-v">{m.piggybankTotal ?? p.piggybankCount ?? 0}</div><div className="abs-l">Идей</div></div>
                <div className="abs">
                  <div className="abs-v">{m.eveningReflectionsDone ?? 0}/{m.eveningReflectionsTotal ?? 7}</div>
                  <div className="abs-l">Рефлексий</div>
                </div>
              </div>
            </div>

            <div className="m-stats">
              <div className="m-st"><div className="m-sv">📍 {p.points.path}</div><div className="m-sl">Путь · ур. {p.points.pathLevel}</div></div>
              <div className="m-st"><div className="m-sv">⚡ {p.points.experience}</div><div className="m-sl">Опыт · ур. {p.points.experienceLevel}</div></div>
              <div className="m-st"><div className="m-sv">✦ {p.points.total ?? ((p.points.path ?? 0) + (p.points.experience ?? 0))}</div><div className="m-sl">Общий рейтинг</div></div>
            </div>

            {(p.goalAnswers?.length > 0 || p.myRequest || p.goalSetting) && (
              <div className="pb m-card">
                <div className="pb-lbl">🎯 Мой запрос · Точка А</div>
                {Array.isArray(p.goalAnswers) && p.goalAnswers.length > 0 ? (
                  <ul className="pb-checks" style={{ marginTop: 6 }}>
                    {p.goalAnswers.map((ans: string, i: number) => (
                      <li key={i}>{ans || '—'}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="pb-text">{p.myRequest || (p.goalSetting.interests as string[])?.join(', ') || '—'}</div>
                )}
              </div>
            )}

            <div className="pb m-card" style={{ opacity: showOutcomes ? 1 : 0.85 }}>
              <div className="pb-lbl">📋 Что получилось</div>
              {!showOutcomes ? (
                <div style={{ fontSize: 12, color: '#888' }}>Блок откроется с 3-го дня форума.</div>
              ) : outcomeBullets.length > 0 ? (
                <ul className="pb-checks">
                  {outcomeBullets.map((line: string, i: number) => <li key={i}>{line}</li>)}
                </ul>
              ) : (
                <div style={{ fontSize: 12, color: '#888' }}>Пока мало данных — нажмите «Обновить итог».</div>
              )}
              {showOutcomes && (
                <Button
                  size="s"
                  style={{ marginTop: 8 }}
                  loading={synthLoading}
                  onClick={async () => {
                    setSynthLoading(true);
                    try {
                      await apiPost<{ bullets?: string[] }>('/profile/outcomes/synthesize', {});
                      setSnackbar('Итог обновлён по вашим данным');
                      loadProfile();
                    } catch (err) {
                      setSnackbar(err instanceof ApiError ? err.message : 'Не удалось обновить итог');
                    } finally {
                      setSynthLoading(false);
                    }
                  }}
                >
                  Обновить итог
                </Button>
              )}
            </div>

            {medals.length > 0 && (
              <div className="m-card">
                <div className="pb-lbl">Медали</div>
                {medals.map((m: any) => (
                  <div key={m.id} style={{ fontSize: 13, marginTop: 6 }}>
                    <strong>{m.name}</strong>
                    <span style={{ color: '#888' }}> · {m.level || 'bronze'}</span>
                    {m.description && <div style={{ fontSize: 11, color: '#666' }}>{m.description}</div>}
                  </div>
                ))}
                <div className="pb-link" onClick={() => setSection('medals')}>Все медали →</div>
              </div>
            )}

            {p.showNextSteps && p.nextSteps?.length > 0 && (
              <div className="pb m-card">
                <div className="pb-lbl">➡️ Следующие шаги</div>
                <ol className="pb-checks" style={{ paddingLeft: 18 }}>
                  {p.nextSteps.map((step: string, i: number) => <li key={i}>{step}</li>)}
                </ol>
              </div>
            )}

            {showFinal && (
              <div className="m-card" style={{ border: '1.5px solid #FFE082', cursor: 'pointer' }} onClick={() => setSection('final')}>
                <div className="pb-lbl">Итоговая карточка смены</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>Точка А ↔ Точка Б · роли · находки →</div>
              </div>
            )}

            <div className="m-card">
              <div className="pb-lbl">📁 Моя копилка</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {PIGGYBANK_TAGS.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => goPiggybank(tag, '')}
                    style={{
                      fontSize: 11, background: '#FFF3E0', color: '#B8621A',
                      borderRadius: 12, padding: '4px 10px', fontWeight: 600, border: 'none', cursor: 'pointer',
                    }}
                  >
                    #{tag}{tagCounts[tag] ? ` · ${tagCounts[tag]}` : ''}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {PIGGYBANK_SOURCES.map(src => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => goPiggybank('', src)}
                    style={{
                      fontSize: 10, background: '#f5f5f5', color: '#555',
                      borderRadius: 12, padding: '4px 10px', border: 'none', cursor: 'pointer',
                    }}
                  >
                    {src}{sourceCounts[src] ? ` · ${sourceCounts[src]}` : ''}
                  </button>
                ))}
              </div>
              <div className="pb-link" onClick={() => setSection('piggybank')}>
                {p.piggybankCount ?? 0} идей и инструментов →
              </div>
            </div>

            {tracker && (
              <div className="m-card">
                <div
                  className="pb-lbl"
                  style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                  onClick={() => setTrackerOpen(v => !v)}
                >
                  <span>📊 Мой трекер</span>
                  <span>{trackerOpen ? '▲' : '▼'}</span>
                </div>
                {trackerOpen && (
                  <div style={{ marginTop: 10, fontSize: 12 }}>
                    {tracker.stateCurve?.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Кривая состояния</div>
                        {tracker.stateCurve.map((d: { day: number; energy?: number; emotion?: number; delta?: number }) => (
                          <div key={d.day} style={{ color: '#666' }}>
                            Д{d.day}: энергия {d.energy ?? '—'}, эмоция {d.emotion ?? '—'}
                            {d.delta != null && d.delta !== 0 && (
                              <span style={{ color: d.delta > 0 ? '#2F855A' : '#C53030' }}>
                                {' '}({d.delta > 0 ? '+' : ''}{d.delta})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ marginBottom: 8 }}>
                      Задания: {tracker.tasksDone}/{tracker.tasksTotal} · Опыт: {tracker.experiencePoints}
                    </div>
                    {tracker.myExchangeQuestions?.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 700 }}>Мои вопросы</div>
                        {tracker.myExchangeQuestions.slice(0, 5).map((q: { id: number; text: string }) => (
                          <div key={q.id} style={{ color: '#666' }}>· {q.text?.slice(0, 80)}</div>
                        ))}
                      </div>
                    )}
                    {tracker.touchpointsToday?.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 700 }}>7 точек сегодня</div>
                        {tracker.touchpointsToday.map((tp: { title?: string; done?: boolean }, i: number) => (
                          <div key={i}>{tp.done ? '✓' : '○'} {tp.title || `Точка ${i + 1}`}</div>
                        ))}
                      </div>
                    )}
                    {tracker.roleOfDay && (
                      <div>
                        Роль дня: {tracker.roleOfDay.activeRoleName || '—'}
                        {tracker.roleOfDay.experimentStatus ? ` · ${tracker.roleOfDay.experimentStatus}` : ''}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {previewPiggy.length > 0 && (
              <div className="m-card">
                <div className="pb-lbl">Копилка · последние записи</div>
                {previewPiggy.map(entry => (
                  <div key={entry.id} style={{ fontSize: 11, marginTop: 6, color: '#666' }}>
                    {entry.tag}: {entry.text?.slice(0, 60)}
                  </div>
                ))}
                <div className="pb-link" onClick={() => setSection('piggybank')}>Все записи →</div>
              </div>
            )}

            <div className="ai-rec">
              <div className="ai-rec-t">💡 Рекомендация</div>
              <div className="ai-rec-b">
                {p.recommendation?.text
                  || 'Продолжайте фиксировать идеи в копилку — они пригодятся для итогов форума.'}
              </div>
            </div>

            {qrImageUrl && qrDeepLink && (
              <div className="m-card" style={{ textAlign: 'center' }}>
                <div className="pb-lbl">Мой QR</div>
                <img src={qrImageUrl} alt="QR участника" width={160} height={160} style={{ margin: '12px auto', display: 'block' }} />
                <div style={{ fontSize: 11, color: '#666', wordBreak: 'break-all' }}>{qrDeepLink}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>Покажите волонтёру для подтверждения заданий</div>
                <Button
                  size="s"
                  mode="secondary"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    navigator.clipboard?.writeText(qrDeepLink);
                    setSnackbar('Ссылка скопирована');
                  }}
                >
                  Скопировать ссылку
                </Button>
              </div>
            )}
          </>
        ) : section === 'rating' ? (
          <>
            <div className="m-card">
              <div className="pb-lbl">Рейтинг участников</div>
              {myRank != null && (
                <div style={{ fontSize: 13, marginTop: 6, fontWeight: 700, color: '#B8621A' }}>
                  Ваше место: #{myRank}
                </div>
              )}
              <div className="time-sw" style={{ marginTop: 10 }}>
                {([
                  { key: 'total', label: 'Общий' },
                  { key: 'day', label: 'День' },
                  { key: 'shift', label: 'Смена (лог)' },
                ] as const).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={`time-btn ${lbScope === t.key ? 'on' : ''}`}
                    onClick={() => setLbScope(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {lbScope === 'day' && (
                <Select
                  style={{ marginTop: 10 }}
                  value={lbDay}
                  onChange={(e) => setLbDay(e.target.value)}
                  options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({ label: `День ${d}`, value: String(d) }))}
                />
              )}
              <div className="time-sw" style={{ marginTop: 10 }}>
                {([
                  { key: 'total', label: 'Общий' },
                  { key: 'path', label: 'Путь' },
                  { key: 'experience', label: 'Опыт' },
                ] as const).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={`time-btn ${lbTrack === t.key ? 'on' : ''}`}
                    onClick={() => setLbTrack(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <Select
                style={{ marginTop: 10 }}
                value={lbDirection}
                onChange={(e) => setLbDirection(e.target.value)}
                options={[
                  { label: 'Все направления', value: '' },
                  ...lbDirections.map((d) => ({ label: d, value: d })),
                ]}
              />
            </div>
            {lbLoading ? (
              <Spinner />
            ) : leaders.length === 0 ? (
              <EmptyState icon="🏆" title="Рейтинг пуст" subtitle="Баллы появятся после активности на форуме" />
            ) : (
              leaders.map((row) => (
                <div
                  key={row.id}
                  className="m-card"
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    marginBottom: 8,
                    background: row.isMe ? '#FFF8E7' : undefined,
                    border: row.isMe ? '1.5px solid #FFE082' : undefined,
                  }}
                >
                  <div style={{ fontWeight: 800, width: 28, color: row.rank <= 3 ? '#B8621A' : '#888' }}>
                    {row.rank}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: row.isMe ? 800 : 600 }}>
                      {row.name}{row.isMe ? ' · вы' : ''}
                    </div>
                    {row.direction && (
                      <div style={{ fontSize: 11, color: '#888' }}>{row.direction}</div>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {lbTrack === 'path' ? '📍' : lbTrack === 'experience' ? '⚡' : '✦'} {row.score}
                  </div>
                </div>
              ))
            )}
          </>
        ) : section === 'medals' ? (
          <>
            <div className="m-card">
              <div className="pb-lbl">Все медали</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                Полученные и ещё не открытые награды смены
              </div>
            </div>
            {medalsCatalog.length === 0 ? (
              <EmptyState icon="🏅" title="Каталог пуст" subtitle="Медали появятся после настройки в админке" />
            ) : (
              medalsCatalog.map((m) => (
                <div
                  key={m.id}
                  className="m-card"
                  style={{ opacity: m.earned ? 1 : 0.55, marginBottom: 8 }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {m.earned ? '🏅' : '🔒'} {m.name}
                  </div>
                  {m.description && (
                    <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>{m.description}</div>
                  )}
                  <div style={{ fontSize: 10, color: '#888', marginTop: 6 }}>
                    {m.earned ? 'Получена' : 'Ещё не получена'}
                    {m.level ? ` · ${m.level}` : ''}
                  </div>
                </div>
              ))
            )}
          </>
        ) : section === 'final' && finalCard ? (
          <>
            <div className="m-card" style={{ background: 'linear-gradient(135deg,#FFF8E7,#FFF3E0)' }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Итоговая карточка</div>
              <div style={{ fontSize: 12, marginTop: 4, color: '#666' }}>{finalCard.roles?.route}</div>
              {p.pdf?.available && (
                <Button size="m" stretched loading={pdfLoading} style={{ marginTop: 12 }} onClick={downloadPdf}>
                  Скачать итоговый PDF
                </Button>
              )}
            </div>

            {finalCard.experienceSummary && (
              <div className="m-card">
                <div className="pb-lbl">Опыт смены</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  <div>Заданий выполнено: {finalCard.experienceSummary.tasksApproved}</div>
                  <div>Медалей: {finalCard.experienceSummary.medalsCount}</div>
                  <div>Посещений блоков: {finalCard.experienceSummary.attendanceCount}</div>
                </div>
              </div>
            )}

            <div className="m-card">
              <div className="pb-lbl">Роли</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>
                <div>Старт: {finalCard.roles?.start?.name || '—'}</div>
                <div>Сильная: {finalCard.roles?.strong?.name || '—'}</div>
                <div>Рост: {finalCard.roles?.growth?.name || '—'}</div>
              </div>
            </div>

            <div className="m-card">
              <div className="pb-lbl">Точка А → Точка Б</div>
              {(finalCard.comparison || []).map((row: any) => (
                <div key={row.index} style={{ marginTop: 10, fontSize: 12, borderTop: '1px solid #eee', paddingTop: 8 }}>
                  <div style={{ color: '#888', fontSize: 10 }}>Вопрос {row.index}</div>
                  <div><b>Было:</b> {row.pointA || '—'}</div>
                  <div style={{ marginTop: 4 }}><b>Стало:</b> {row.pointB || '—'}</div>
                </div>
              ))}
              {(!finalCard.comparison || finalCard.comparison.length === 0) && (
                <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>Нет данных для сравнения</div>
              )}
            </div>

            {finalCard.keyFindings?.length > 0 && (
              <div className="m-card">
                <div className="pb-lbl">Ключевые находки</div>
                {finalCard.keyFindings.map((f: any) => (
                  <div key={f.id} style={{ fontSize: 12, marginTop: 6 }}>
                    <span style={{ color: '#B8621A', fontWeight: 700 }}>#{f.tag}</span> {f.text}
                  </div>
                ))}
              </div>
            )}

            {finalCard.plans?.length > 0 && (
              <div className="m-card">
                <div className="pb-lbl">Планы · в работу</div>
                {finalCard.plans.map((f: any) => (
                  <div key={f.id} style={{ fontSize: 12, marginTop: 6 }}>{f.text}</div>
                ))}
              </div>
            )}

            {finalCard.piggybankAll?.length > 0 && (
              <div className="m-card">
                <div className="pb-lbl">Вся копилка</div>
                <div className="form-row" style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <Select
                    value={finalTagFilter}
                    onChange={e => setFinalTagFilter(e.target.value)}
                    options={TAGS.map(t => ({ label: t || 'Все теги', value: t }))}
                  />
                  <Select
                    value={finalSourceFilter}
                    onChange={e => setFinalSourceFilter(e.target.value)}
                    options={SOURCES.map(s => ({ label: s || 'Все источники', value: s }))}
                  />
                </div>
                {finalCard.piggybankAll
                  .filter((e: { tag?: string; source?: string }) => {
                    if (finalTagFilter && e.tag !== finalTagFilter) return false;
                    if (finalSourceFilter && e.source !== finalSourceFilter) return false;
                    return true;
                  })
                  .map((e: { id: number; tag: string; source: string; text: string }) => (
                    <div key={e.id} style={{ fontSize: 12, marginTop: 8, borderTop: '1px solid #eee', paddingTop: 6 }}>
                      <span style={{ color: '#B8621A', fontWeight: 700 }}>#{e.tag}</span> · {e.source}
                      <div>{e.text}</div>
                    </div>
                  ))}
              </div>
            )}

            <div className="m-stats">
              <div className="m-st"><div className="m-sv">📍 {finalCard.points?.path}</div><div className="m-sl">Путь</div></div>
              <div className="m-st"><div className="m-sv">⚡ {finalCard.points?.experience}</div><div className="m-sl">Опыт</div></div>
            </div>
          </>
        ) : section === 'settings' ? (
          <>
            <div className="m-card">
              <div className="pb-lbl">Уведомления</div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                Отметьте типы, которые не хотите получать
              </div>
              {PUSH_TYPES.map(t => (
                <Checkbox
                  key={t.key}
                  checked={!!pushOptOut[t.key]}
                  onChange={e => setPushOptOut(prev => ({ ...prev, [t.key]: e.target.checked }))}
                >
                  {t.label}
                </Checkbox>
              ))}
              <Button
                size="s"
                mode="secondary"
                style={{ marginTop: 10 }}
                onClick={() => {
                  void requestVkPushPermission().then(ok => {
                    setSnackbar(ok ? 'Запрос отправлен в VK' : 'Не удалось запросить уведомления (откройте из VK)');
                  });
                }}
              >
                Разрешить уведомления VK
              </Button>
            </div>
            <div className="m-card">
              <div className="pb-lbl">Рейтинг</div>
              <Checkbox checked={hideLb} onChange={e => setHideLb(e.target.checked)}>
                Скрыть меня из публичного рейтинга
              </Checkbox>
            </div>
            {qrImageUrl && qrDeepLink && (
              <div className="m-card" style={{ textAlign: 'center' }}>
                <div className="pb-lbl">Мой QR</div>
                <img src={qrImageUrl} alt="QR" width={180} height={180} style={{ margin: '8px auto', display: 'block' }} />
                <Button
                  size="s"
                  mode="secondary"
                  onClick={() => {
                    navigator.clipboard?.writeText(qrDeepLink);
                    setSnackbar('Ссылка скопирована');
                  }}
                >
                  Скопировать ссылку для волонтёра
                </Button>
              </div>
            )}
            <Button size="l" stretched loading={settingsSaving} onClick={saveSettings}>
              Сохранить настройки
            </Button>
            <div className="m-card" style={{ marginTop: 16, borderColor: '#FEB2B2' }}>
              <div className="pb-lbl">Удаление из программы</div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
                Доступ к приложению будет отключён. Восстановление — через организаторов форума.
              </div>
              <Button
                size="l"
                stretched
                mode="secondary"
                appearance="negative"
                loading={deleteLoading}
                onClick={deleteFromProgram}
              >
                Удалить мой профиль из программы
              </Button>
            </div>
          </>
        ) : (
          <>
            <Button
              size="m"
              stretched
              style={{ marginBottom: 12 }}
              onClick={() => openQuickCapture(setModal, {
                onSaved: () => {
                  loadPiggybank();
                  setSnackbar('Запись добавлена в копилку');
                },
              })}
            >
              + Новая запись
            </Button>
            <Button
              size="m"
              stretched
              mode="secondary"
              loading={exportLoading}
              style={{ marginBottom: 12 }}
              onClick={exportPiggybank}
            >
              Экспортировать (.txt)
            </Button>
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Поиск по тексту"
              style={{ marginBottom: 12 }}
            />
            <div className="form-row" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <Select value={tagFilter} onChange={e => setTagFilter(e.target.value)} options={TAGS.map(t => ({ label: t || 'Все теги', value: t }))} />
              <Select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} options={SOURCES.map(s => ({ label: s || 'Все источники', value: s }))} />
              <Select
                value={dayFilter}
                onChange={e => setDayFilter(e.target.value)}
                options={[
                  { label: 'Все дни', value: '' },
                  ...Array.from({ length: 7 }, (_, i) => ({ label: `День ${i + 1}`, value: String(i + 1) })),
                ]}
              />
            </div>
            {piggybank.map((entry: any) => {
              const tags: string[] = Array.isArray(entry.tags) && entry.tags.length
                ? entry.tags
                : (entry.tag ? [entry.tag] : []);
              return (
              <div key={entry.id} className="m-card" style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>
                  {tags.map((t: string) => `#${t}`).join(' ')} · {entry.source}
                  {entry.forumDay ? ` · Д${entry.forumDay}` : ''}
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>{entry.text}</div>
              </div>
            );})}
            {piggybank.length === 0 && (
              <EmptyState icon="📝" title="Копилка пуста" subtitle="Фиксируйте идеи и мысли на главной или в программе" />
            )}
          </>
        )}
      </Group>
      {snackbar && <Snackbar onClose={() => setSnackbar(null)} onClosed={() => setSnackbar(null)}>{snackbar}</Snackbar>}
    </Panel>
  );
};
