import { useState, useEffect } from 'react';
import { Panel, PanelHeader, Group, Spinner, Select, Button, Snackbar, Checkbox, Input } from '@vkontakte/vkui';
import { UserInfo } from '@vkontakte/vk-bridge';
import { apiGet, apiPost, apiPatch, apiDownloadBlob, ApiError } from '../api/client';
import { useAppModal } from '../App';
import { openQuickCapture } from '../components/QuickCaptureFlow';
import { EmptyState } from '../components/EmptyState';
import { PIGGYBANK_TAGS, PIGGYBANK_SOURCES } from '../data/piggybank';
import { buildParticipantVolunteerUrl } from '../utils/qrDeepLink';
import { requestVkPushPermission } from '../utils/pushNotifications';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import { ParticipantAvatarCircle } from '../components/ParticipantAvatarCircle';
import { QrCodeImage } from '../components/QrCodeImage';

const TAGS = ['', ...PIGGYBANK_TAGS];
const SOURCES = ['', ...PIGGYBANK_SOURCES];

/** Russian pluralization for «эксперимент». */
function formatExperimentCount(n: number): string {
  const abs = Math.abs(Math.trunc(n)) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return `${n} экспериментов`;
  if (d === 1) return `${n} эксперимент`;
  if (d >= 2 && d <= 4) return `${n} эксперимента`;
  return `${n} экспериментов`;
}

const PUSH_TYPES = [
  { key: 'touchpoints', label: 'Точки осмысления / проверки состояния' },
  { key: 'program', label: 'Программа и события' },
  { key: 'tasks', label: 'Задания и модерация' },
  { key: 'exchange', label: 'Общение и ответы' },
  { key: 'org', label: 'Организационные сообщения' },
] as const;

const NOMINATION_OPTIONS: { key: string; label: string }[] = [
  { key: '', label: 'Без номинации' },
  { key: 'sport', label: 'Спорт' },
  { key: 'creative', label: 'Креатив' },
  { key: 'media', label: 'Медиа' },
  { key: 'education', label: 'Образование' },
  { key: 'culture', label: 'Культура' },
  { key: 'volunteer', label: 'Волонтёрство' },
  { key: 'team', label: 'Командность' },
  { key: 'networking', label: 'Нетворкинг' },
  { key: 'leadership', label: 'Лидерство' },
  { key: 'general', label: 'Общий зачёт' },
];

export const ProfilePanel: React.FC<{
  id: string;
  fetchedUser?: UserInfo | null;
  onSelfDeleted?: () => void;
}> = ({ id, fetchedUser, onSelfDeleted }) => {
  const routeNavigator = useRouteNavigator();
  const { setModal } = useAppModal();
  const [profile, setProfile] = useState<any>(null);
  const [piggybank, setPiggybank] = useState<any[]>([]);
  const [previewPiggy, setPreviewPiggy] = useState<any[]>([]);
  const [medals, setMedals] = useState<any[]>([]);
  const [section, setSection] = useState<'overview' | 'results' | 'piggybank' | 'final' | 'settings' | 'rating' | 'medals'>('overview');
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
  const [lbMode, setLbMode] = useState<'points' | 'nomination'>('points');
  const [lbNomination, setLbNomination] = useState('sport');
  const [lbScope, setLbScope] = useState<'total' | 'day' | 'shift'>('shift');
  const [lbDay, setLbDay] = useState('1');
  const [lbDirection, setLbDirection] = useState('');
  const [lbGroupId, setLbGroupId] = useState('');
  const [lbSearch, setLbSearch] = useState('');
  const [lbMedalFilter, setLbMedalFilter] = useState<'count' | 'holders' | ''>('');
  const [lbMedalId, setLbMedalId] = useState('');
  const [lbSort, setLbSort] = useState<'score' | 'name'>('score');
  const [lbExtraOpen, setLbExtraOpen] = useState(false);
  const [lbDirections, setLbDirections] = useState<string[]>([]);
  const [lbGroups, setLbGroups] = useState<{ id: number; name: string }[]>([]);
  const [leaders, setLeaders] = useState<any[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [lbLoading, setLbLoading] = useState(false);
  const [shiftResults, setShiftResults] = useState<any>(null);
  const [shiftResultsLoading, setShiftResultsLoading] = useState(false);
  const [shiftExportLoading, setShiftExportLoading] = useState(false);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [answersOpen, setAnswersOpen] = useState(false);
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
    if (section === 'piggybank' || section === 'final' || section === 'settings' || section === 'rating' || section === 'medals' || section === 'results') {
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
    const params = new URLSearchParams({ mode: lbMode, scope: lbScope, sort: lbSort });
    if (lbScope === 'day') params.set('day', lbDay);
    if (lbDirection) params.set('direction', lbDirection);
    if (lbGroupId) params.set('groupId', lbGroupId);
    if (lbSearch.trim()) params.set('search', lbSearch.trim());
    if (lbMode === 'points') params.set('track', lbTrack);
    if (lbMode === 'nomination') params.set('nomination', lbNomination);
    if (lbMode === 'points' && lbMedalFilter === 'count') params.set('medalMode', 'count');
    if (lbMode === 'points' && lbMedalFilter === 'holders') {
      params.set('medalMode', 'holders');
      if (lbMedalId) params.set('medalId', lbMedalId);
    }
    apiGet<any>(`/leaderboard?${params}`)
      .then((res) => {
        setLeaders(res.leaders || []);
        setMyRank(res.myRank ?? null);
        setLbDirections(res.directions || []);
        setLbGroups(res.groups || []);
      })
      .catch((err) => setSnackbar(err instanceof ApiError ? err.message : 'Не удалось загрузить рейтинг'))
      .finally(() => setLbLoading(false));
  }, [section, lbMode, lbTrack, lbDirection, lbGroupId, lbSearch, lbScope, lbDay, lbNomination, lbMedalFilter, lbMedalId, lbSort]);

  useEffect(() => {
    if (section !== 'rating' && section !== 'medals') return;
    apiGet<any>('/profile/medals/catalog')
      .then(res => setMedalsCatalog(res.medals || []))
      .catch((err) => {
        if (section === 'medals') {
          setSnackbar(err instanceof ApiError ? err.message : 'Не удалось загрузить медали');
        }
      });
  }, [section]);

  useEffect(() => {
    if (section !== 'results') return;
    setShiftResultsLoading(true);
    apiGet<any>('/profile/shift-results')
      .then(setShiftResults)
      .catch((err) => setSnackbar(err instanceof ApiError ? err.message : 'Не удалось загрузить итог'))
      .finally(() => setShiftResultsLoading(false));
  }, [section]);

  if (loading) {
    return (
      <Panel id={id}>
        <PanelHeader fixed>Профиль</PanelHeader>
        <Group><Spinner /></Group>
      </Panel>
    );
  }

  if (error || !profile) {
    return (
      <Panel id={id}>
        <PanelHeader fixed>Профиль</PanelHeader>
        <Group>
          <div className="m-card" style={{ color: '#C53030' }}>{error || 'Нет данных'}</div>
          <Button onClick={loadProfile}>Повторить</Button>
        </Group>
      </Panel>
    );
  }

  const p = profile;
  const avatarUrl = p.user?.avatarUrl || fetchedUser?.photo_200 || fetchedUser?.photo_100 || null;
  const m = p.metrics ?? {};
  const abPct = m.abProgress ?? p.trajectory?.progressPercent ?? 0;
  const finalCard = p.finalCard;
  const showFinal = !!finalCard?.available;
  const actionStyle = p.actionStyle;
  const tracker = p.dailyTracker;
  const lastExperimentReflection: {
    dayNumber?: number | null;
    items?: { key: string; question: string; answer: string }[];
  } | null = p.lastExperimentReflection ?? null;
  const experimentReflectionItems = Array.isArray(lastExperimentReflection?.items)
    ? lastExperimentReflection!.items!.filter(i => i?.answer?.trim())
    : [];
  const outcomeBullets: string[] = p.outcomes?.bullets ?? [];
  const showOutcomes = p.outcomes?.visible ?? (p.currentDay >= 3);
  const recentReflections: { title?: string; preview?: string; answeredAt?: string }[] = p.recentReflections ?? [];
  const tagCounts = (p.piggybankTags ?? {}) as Record<string, number>;
  const sourceCounts = (p.piggybankSources ?? tracker?.piggybankSources ?? {}) as Record<string, number>;
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

  const downloadShiftResults = async (format: 'pdf' | 'csv') => {
    setShiftExportLoading(true);
    try {
      const blob = await apiDownloadBlob(`/profile/shift-results?format=${format}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = format === 'pdf' ? 'shift_results.pdf' : 'shift_results.csv';
      a.click();
      URL.revokeObjectURL(url);
      setSnackbar(format === 'pdf' ? 'PDF сохранён' : 'CSV сохранён');
    } catch (err) {
      setSnackbar(err instanceof ApiError ? err.message : 'Не удалось скачать');
    } finally {
      setShiftExportLoading(false);
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

  const sectionOptions = [
    { label: 'Обзор', value: 'overview' },
    { label: 'Результаты', value: 'results' },
    { label: 'Рейтинг', value: 'rating' },
    { label: 'Медали', value: 'medals' },
    { label: `Копилка${p.piggybankCount ? ` · ${p.piggybankCount}` : ''}`, value: 'piggybank' },
    ...(showFinal ? [{ label: 'Итог', value: 'final' }] : []),
    { label: 'Ещё', value: 'settings' },
  ];

  return (
    <Panel id={id}>
      <PanelHeader fixed>Профиль</PanelHeader>
      <Group>
        <div className="m-seg" role="tablist" aria-label="Разделы профиля">
          {sectionOptions.map(opt => (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={section === opt.value}
              className={section === opt.value ? 'on' : undefined}
              onClick={() => setSection(opt.value as typeof section)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {section === 'overview' ? (
          <>
            {/* 1. Кто я и стартовая роль */}
            <div className="pf-hdr">
              <ParticipantAvatarCircle
                firstName={p.user.firstName}
                lastName={p.user.lastName}
                avatarUrl={avatarUrl}
                size="md"
              />
              <div style={{ flex: 1 }}>
                <div className="pf-n">{p.user.firstName} {p.user.lastName}</div>
                <div className="pf-r">{shiftLine || p.user.direction}</div>
                {(p.user.leadingRoleStartName || p.user.pedagogicalRoleName) && (
                  <div style={{ fontSize: 12, color: '#B8621A', marginTop: 4, fontWeight: 700 }}>
                    ◆ Стартовая роль: {p.user.leadingRoleStartName || p.user.pedagogicalRoleName}
                  </div>
                )}
                {actionStyle?.startRole?.essence && (
                  <div style={{ fontSize: 11, color: '#666', marginTop: 4, lineHeight: 1.4 }}>
                    {actionStyle.startRole.essence}
                  </div>
                )}
                {(p.user.workplace || p.user.position) && (
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                    {[p.user.position, p.user.workplace].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            </div>

            {Array.isArray(p.interests) && p.interests.length > 0 && (
              <div className="m-card">
                <div className="pb-lbl">Мои интересы</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {p.interests.map((tag: string) => (
                    <span
                      key={tag}
                      style={{
                        border: '1.5px solid #FF5500',
                        background: '#FFF3E0',
                        color: '#B8621A',
                        borderRadius: 20,
                        padding: '6px 12px',
                        fontSize: 12,
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 2. Мой запрос и желаемый результат */}
            {(p.goalRequestItems?.length > 0 || p.goalAnswers?.length > 0 || p.myRequest || p.goalSetting) && (
              <div className="pb m-card">
                <div className="pb-lbl">🎯 Мой запрос · Точка А</div>
                {Array.isArray(p.goalRequestItems) && p.goalRequestItems.length > 0 ? (
                  <div style={{ marginTop: 8 }}>
                    {p.goalRequestItems.map((item: { question: string; answer: string }, i: number) => (
                      <div
                        key={i}
                        style={{
                          marginTop: i === 0 ? 0 : 12,
                          paddingTop: i === 0 ? 0 : 10,
                          borderTop: i === 0 ? undefined : '1px solid #EDE8DF',
                        }}
                      >
                        <div style={{ fontSize: 11, color: '#888', lineHeight: 1.35, marginBottom: 4 }}>
                          {item.question}
                        </div>
                        <div style={{ fontSize: 13, lineHeight: 1.45, color: '#1a1a1a' }}>
                          {item.answer || '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : Array.isArray(p.goalAnswers) && p.goalAnswers.length > 0 ? (
                  <ul className="pb-checks" style={{ marginTop: 6 }}>
                    {p.goalAnswers.slice(0, 2).map((ans: string, i: number) => (
                      <li key={i}>{ans || '—'}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="pb-text">{p.myRequest || (p.goalSetting.interests as string[])?.join(', ') || '—'}</div>
                )}
              </div>
            )}

            {/* 3. Траектория А → Б */}
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

            {/* 4. Что уже попробовал и понял */}
            <div className="pb m-card" style={{ opacity: showOutcomes ? 1 : 0.85 }}>
              <div className="pb-lbl">📋 Что получилось</div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 8, lineHeight: 1.4 }}>
                Краткий итог по смене (не дословные ответы). Тексты рефлексий — в «Вопросы».
              </div>
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

            {recentReflections.length > 0 && (
              <div className="pb m-card">
                <div
                  className="pb-lbl"
                  style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: answersOpen ? 7 : 0 }}
                  onClick={() => setAnswersOpen(v => !v)}
                  role="button"
                  aria-expanded={answersOpen}
                >
                  <span>💬 Что уже понял · {recentReflections.length}</span>
                  <span>{answersOpen ? '▲' : '▼'}</span>
                </div>
                {!answersOpen && (
                  <div style={{ marginTop: 6 }}>
                    {recentReflections.slice(0, 2).map((r, i) => (
                      <div key={i} style={{ marginTop: i ? 8 : 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{r.title}</div>
                        <div style={{
                          fontSize: 12, color: '#555', marginTop: 3, lineHeight: 1.4,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}
                        >
                          {r.preview}
                        </div>
                      </div>
                    ))}
                    {recentReflections.length > 2 && (
                      <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
                        Ещё {recentReflections.length - 2} — нажмите, чтобы развернуть
                      </div>
                    )}
                  </div>
                )}
                {answersOpen && (
                  <div style={{ marginTop: 4 }}>
                    {recentReflections.map((r, i) => (
                      <div key={i} style={{ marginTop: 10, paddingTop: i ? 10 : 0, borderTop: i ? '1px solid #eee' : undefined }}>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{r.title}</div>
                        <div style={{ fontSize: 12, color: '#555', marginTop: 4, lineHeight: 1.4 }}>{r.preview}</div>
                      </div>
                    ))}
                    <div className="pb-link" style={{ marginTop: 10 }} onClick={() => routeNavigator.push('/questions')}>
                      Все ответы в «Вопросы» →
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 5. Ролевые эксперименты */}
            {(actionStyle?.route || p.roleTrajectory?.route || p.user.nextExperiment
              || (actionStyle?.roleCounts?.length > 0)) && (
              <div className="m-card">
                <div className="pb-lbl">Ролевые эксперименты</div>
                {(actionStyle?.route || p.roleTrajectory?.route) && (
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>
                    {actionStyle?.route || p.roleTrajectory?.route}
                  </div>
                )}
                {actionStyle?.roleCounts?.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginTop: 10 }}>
                    {actionStyle.roleCounts.map((r: { key: string; name: string; count: number }) => (
                      <div key={r.key} style={{ fontSize: 11, background: '#FFF8E7', borderRadius: 8, padding: '6px 8px' }}>
                        <span style={{ fontWeight: 700 }}>{r.name}</span>
                        <span style={{ color: '#888' }}> · {formatExperimentCount(r.count ?? 0)}</span>
                      </div>
                    ))}
                  </div>
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

            {experimentReflectionItems.length > 0 && (
              <div className="m-card">
                <div className="pb-lbl">Последняя рефлексия по эксперименту</div>
                {lastExperimentReflection?.dayNumber != null && (
                  <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                    День {lastExperimentReflection.dayNumber}
                  </div>
                )}
                <div style={{ marginTop: 8 }}>
                  {experimentReflectionItems.map((item, i) => (
                    <div
                      key={item.key || i}
                      style={{
                        marginTop: i ? 10 : 0,
                        paddingTop: i ? 10 : 0,
                        borderTop: i ? '1px solid #eee' : undefined,
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.35 }}>{item.question}</div>
                      <div style={{ fontSize: 12, color: '#555', marginTop: 4, lineHeight: 1.4 }}>{item.answer}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 6. Следующие шаги — planned by default; ✓ only when status is explicitly done */}
            {p.showNextSteps && p.nextSteps?.length > 0 && (
              <div className="pb m-card">
                <div className="pb-lbl">➡️ Следующие шаги</div>
                <ul className="pb-planned">
                  {p.nextSteps.map((step: string | { text?: string; title?: string; status?: string; done?: boolean }, i: number) => {
                    const text = typeof step === 'string'
                      ? step
                      : (step.text || step.title || '');
                    const statusRaw = typeof step === 'string'
                      ? ''
                      : String(step.status || (step.done ? 'done' : '')).toLowerCase();
                    const isDone = statusRaw === 'done' || statusRaw === 'completed' || statusRaw === 'complete';
                    return (
                      <li key={i} className={isDone ? 'is-done' : undefined}>
                        <span style={{ flex: 1, lineHeight: 1.35 }}>{text}</span>
                        {!isDone && <span className="pb-planned-status">Запланировано</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {showFinal && (
              <div className="m-card" style={{ border: '1.5px solid #FFE082', cursor: 'pointer' }} onClick={() => setSection('final')}>
                <div className="pb-lbl">Итоговая карточка смены</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>Точка А ↔ Точка Б · роли · находки →</div>
              </div>
            )}

            {/* 7. Копилка */}
            <div className="m-card m-card--piggybank">
              <div className="pb-lbl">📁 Моя копилка</div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
                Идеи и заметки по тегам
              </div>
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
              {previewPiggy.length > 0 && (
                <div className="profile-piggy-preview">
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Последние записи
                  </div>
                  {previewPiggy.map(entry => (
                    <div key={entry.id} style={{ fontSize: 11, marginTop: 6, color: '#666' }}>
                      {entry.tag}: {entry.text?.slice(0, 60)}
                    </div>
                  ))}
                </div>
              )}
              <div className="pb-link" style={{ marginTop: 10 }} onClick={() => setSection('piggybank')}>
                {p.piggybankCount ?? 0} идей и инструментов →
              </div>
            </div>

            {/* 8. Три понятных индикатора (баллы/уровни — во вкладке «Результаты») */}
            <div className="ab-card">
              <div className="pb-lbl">Мой прогресс</div>
              <div className="ab-stats" style={{ marginTop: 8 }}>
                <div className="abs">
                  <div className="abs-v">{m.eveningReflectionsDone ?? m.touchpointsDone ?? 0}</div>
                  <div className="abs-l">Заполнено точек рефлексии</div>
                </div>
                <div className="abs">
                  <div className="abs-v">{m.piggybankTotal ?? p.piggybankCount ?? 0}</div>
                  <div className="abs-l">Сохранено идей</div>
                </div>
                <div className="abs">
                  <div className="abs-v">{p.stats?.tasksDone ?? tracker?.tasksDone ?? 0}</div>
                  <div className="abs-l">Выполнено заданий</div>
                </div>
              </div>
              <div className="pb-link" style={{ marginTop: 10 }} onClick={() => setSection('results')}>
                Баллы, уровни и медали →
              </div>
            </div>

            {tracker && (
              <div className="m-card m-card--tracker">
                <div
                  className="pb-lbl"
                  style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', marginBottom: trackerOpen ? 7 : 0 }}
                  onClick={() => setTrackerOpen(v => !v)}
                >
                  <span>📊 Мой трекер</span>
                  <span>{trackerOpen ? '▲' : '▼'}</span>
                </div>
                {!trackerOpen && (
                  <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                    Заданий выполнено: {tracker.tasksDone ?? 0} · состояние за смену
                  </div>
                )}
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
                      Заданий выполнено: {tracker.tasksDone ?? 0}
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
                        <div style={{ fontWeight: 700 }}>Точки дня · день {p.currentDay ?? '—'}</div>
                        {tracker.touchpointsToday.map((tp: { title?: string; done?: boolean; state?: string }, i: number) => {
                          const ok = tp.done === true || tp.state === 'done';
                          return (
                            <div key={i}>{ok ? '✓' : '○'} {tp.title || `Точка ${i + 1}`}</div>
                          );
                        })}
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

            <div className="ai-rec">
              <div className="ai-rec-t">💡 Рекомендация</div>
              <div className="ai-rec-b">
                {p.recommendation?.text
                  || 'Продолжайте фиксировать идеи в копилку — они пригодятся для итогов форума.'}
              </div>
            </div>

            {qrDeepLink && (
              <div className="m-card" style={{ textAlign: 'center' }}>
                <div className="pb-lbl">Мой QR</div>
                <QrCodeImage value={qrDeepLink} size={160} alt="QR участника" />
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
        ) : section === 'results' ? (
          <>
            <div className="m-card">
              <div className="pb-lbl">Мои результаты</div>
              <div className="m-results-grid">
                {p.points?.unified ? (
                  <div className="m-st">
                    <div className="m-sv">✦ {p.points.rating ?? p.points.total ?? 0}</div>
                    <div className="m-sl">Баллы · ур. {p.points.ratingLevel ?? p.points.experienceLevel ?? 1}</div>
                  </div>
                ) : null}
                <div className="m-st"><div className="m-sv">📍 {p.points?.path ?? 0}</div><div className="m-sl">Путь{!p.points?.unified ? ` · ур. ${p.points?.pathLevel ?? 1}` : ''}</div></div>
                <div className="m-st"><div className="m-sv">⚡ {p.points?.experience ?? 0}</div><div className="m-sl">Опыт{!p.points?.unified ? ` · ур. ${p.points?.experienceLevel ?? 1}` : ''}</div></div>
                <div className="m-st"><div className="m-sv">{p.points?.bonus ?? 0}</div><div className="m-sl">Бонус</div></div>
                {!p.points?.unified && (
                  <div className="m-st"><div className="m-sv">✦ {p.points?.total ?? 0}</div><div className="m-sl">Общий рейтинг</div></div>
                )}
              </div>
              <div className="m-results-meta">
                Заданий выполнено: {p.stats?.tasksDone ?? 0}
                {' · '}Точек рефлексии: {m.eveningReflectionsDone ?? m.touchpointsDone ?? 0}
                {' · '}Идей: {m.piggybankTotal ?? p.piggybankCount ?? p.stats?.ideas ?? 0}
              </div>
              <div className="pb-link" style={{ marginTop: 8 }} onClick={() => setSection('rating')}>
                Смотреть рейтинг →
              </div>
            </div>

            <div className="m-card">
              <div className="pb-lbl">Итог смены по номинациям</div>
              {shiftResultsLoading ? (
                <Spinner />
              ) : shiftResults ? (
                <>
                  <div className="shift-results-head">
                    <div className="shift-results-name">{shiftResults.fullName}</div>
                    {shiftResults.direction && (
                      <div className="shift-results-dir">{shiftResults.direction}</div>
                    )}
                  </div>
                  <div className="shift-results-table">
                    <div className="shift-results-row shift-results-row-head">
                      <span>Номинация</span>
                      <span>Баллы</span>
                    </div>
                    {(shiftResults.nominations ?? []).map((row: { nomination: string; label: string; points: number }) => (
                      <div key={row.nomination} className="shift-results-row">
                        <span>{row.label}</span>
                        <span className="shift-results-pts">✦ {row.points}</span>
                      </div>
                    ))}
                    <div className="shift-results-row shift-results-total">
                      <span>Итого за смену</span>
                      <span className="shift-results-pts">✦ {shiftResults.totalPoints ?? 0}</span>
                    </div>
                  </div>
                  <div className="shift-results-actions">
                    <Button size="m" stretched mode="secondary" loading={shiftExportLoading} onClick={() => downloadShiftResults('pdf')}>
                      Скачать PDF
                    </Button>
                    <Button size="m" stretched mode="tertiary" loading={shiftExportLoading} onClick={() => downloadShiftResults('csv')}>
                      Скачать CSV
                    </Button>
                  </div>
                </>
              ) : (
                <div className="m-results-meta">Нет данных итога смены</div>
              )}
            </div>

            <div className="m-card">
              <div className="pb-lbl">Медали ({medals.length})</div>
              {medals.length === 0 ? (
                <div className="m-results-meta">Пока нет медалей — выполняй задания и отвечай на точки.</div>
              ) : (
                medals.slice(0, 12).map((med: any) => (
                  <div key={med.id ?? med.medalId} className="medals-list-item">
                    🏅 {med.name ?? med.medalName ?? 'Медаль'}
                  </div>
                ))
              )}
              <div className="pb-link" style={{ marginTop: 8 }} onClick={() => setSection('medals')}>Все медали →</div>
            </div>
            <Button size="l" stretched mode="secondary" onClick={() => setSection('rating')}>
              Смотреть таблицы лидеров
            </Button>
            {finalCard?.available && (
              <Button size="l" stretched style={{ marginTop: 8 }} loading={pdfLoading} onClick={downloadPdf}>
                Скачать полный итог (PDF)
              </Button>
            )}
          </>
        ) : section === 'rating' ? (
          <>
            <div className="m-card">
              <div className="pb-lbl">Рейтинг участников</div>
              {myRank != null && (
                <div className="lb-my-rank">Ваше место: #{myRank}</div>
              )}
              <div className="time-sw lb-mode-sw">
                {([
                  { key: 'points', label: 'Баллы' },
                  { key: 'nomination', label: 'Номинации' },
                ] as const).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={`time-btn ${lbMode === t.key ? 'on' : ''}`}
                    onClick={() => setLbMode(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="time-sw" style={{ marginTop: 10 }}>
                {([
                  { key: 'shift', label: 'За смену' },
                  { key: 'day', label: 'За день' },
                  { key: 'total', label: 'Итоговый' },
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
                  options={[1, 2, 3, 4, 5, 6].map((d) => ({ label: `День ${d}`, value: String(d) }))}
                />
              )}
              {lbMode === 'points' && (
                <div className="time-sw" style={{ marginTop: 10 }}>
                  {([
                    { key: 'total', label: 'Сумма' },
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
              )}
              {lbMode === 'nomination' && (
                <Select
                  style={{ marginTop: 10 }}
                  value={lbNomination}
                  onChange={(e) => setLbNomination(e.target.value)}
                  options={NOMINATION_OPTIONS.filter(o => o.key).map(o => ({ label: o.label, value: o.key }))}
                />
              )}
              {lbMode === 'points' && (
                <>
                  <Select
                    style={{ marginTop: 10 }}
                    value={lbMedalFilter}
                    onChange={(e) => { setLbMedalFilter(e.target.value as '' | 'count' | 'holders'); setLbMedalId(''); }}
                    options={[
                      { label: 'Все участники', value: '' },
                      { label: 'Сортировка по медалям', value: 'count' },
                      { label: 'Только с медалью', value: 'holders' },
                    ]}
                  />
                  {lbMedalFilter === 'holders' && (
                    <Select
                      style={{ marginTop: 10 }}
                      value={lbMedalId}
                      onChange={(e) => setLbMedalId(e.target.value)}
                      options={[
                        { label: 'Выберите медаль', value: '' },
                        ...medalsCatalog.map((m: any) => ({ label: m.name, value: String(m.id) })),
                      ]}
                    />
                  )}
                </>
              )}
              <Input
                style={{ marginTop: 10 }}
                type="search"
                placeholder="Поиск по ФИО или ID"
                value={lbSearch}
                onChange={(e) => setLbSearch(e.target.value)}
              />
              <button
                type="button"
                className="lb-more-toggle"
                onClick={() => setLbExtraOpen(v => !v)}
              >
                {lbExtraOpen ? 'Скрыть фильтры' : 'Ещё фильтры'}
              </button>
              {lbExtraOpen && (
                <>
                  <Select
                    style={{ marginTop: 10 }}
                    value={lbDirection}
                    onChange={(e) => setLbDirection(e.target.value)}
                    options={[
                      { label: 'Все направления', value: '' },
                      ...lbDirections.map((d) => ({ label: d, value: d })),
                    ]}
                  />
                  <Select
                    style={{ marginTop: 10 }}
                    value={lbGroupId}
                    onChange={(e) => setLbGroupId(e.target.value)}
                    options={[
                      { label: 'Все группы / потоки', value: '' },
                      ...lbGroups.map((g) => ({ label: g.name, value: String(g.id) })),
                    ]}
                  />
                  <div className="time-sw" style={{ marginTop: 10 }}>
                    {([
                      { key: 'score', label: 'По баллам' },
                      { key: 'name', label: 'По ФИО' },
                    ] as const).map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        className={`time-btn ${lbSort === t.key ? 'on' : ''}`}
                        onClick={() => setLbSort(t.key)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {lbLoading ? (
              <Spinner />
            ) : leaders.length === 0 ? (
              <EmptyState icon="🏆" title="Рейтинг пуст" subtitle="Баллы появятся после активности на форуме" />
            ) : (
              leaders.map((row) => (
                <div
                  key={row.id}
                  className={`lb-row m-card ${row.isMe ? 'lb-row-me' : ''} ${row.rank <= 3 ? `lb-row-top${row.rank}` : ''}`}
                >
                  <div className={`lb-rank ${row.rank <= 3 ? 'lb-rank-top' : ''}`}>{row.rank}</div>
                  <ParticipantAvatarCircle
                    firstName={row.name.split(' ')[0]}
                    lastName={row.name.split(' ').slice(1).join(' ')}
                    avatarUrl={row.avatarUrl}
                    size="sm"
                  />
                  <div className="lb-name-block">
                    <div className={`lb-name ${row.isMe ? 'lb-name-me' : ''}`}>
                      {row.name}{row.isMe ? ' · вы' : ''}
                    </div>
                    {row.direction && <div className="lb-direction">{row.direction}</div>}
                  </div>
                  <div className="lb-score">
                    {`${lbMedalFilter === 'count' ? '🏅' : lbTrack === 'path' ? '📍' : lbTrack === 'experience' ? '⚡' : '✦'} ${row.score}`}
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
                  {!m.earned && m.conditionLabel && (
                    <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>{m.conditionLabel}</div>
                  )}
                  {!m.earned && m.progress && m.progress.target > 0 && (
                    <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>
                      Прогресс: {m.progress.current} / {m.progress.target}
                    </div>
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
                      <span style={{ color: '#B8621A', fontWeight: 700 }}>#{e.tag}</span>
                      {e.source ? ` · ${e.source}` : ' · без источника'}
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
            {qrDeepLink && (
              <div className="m-card" style={{ textAlign: 'center' }}>
                <div className="pb-lbl">Мой QR</div>
                <QrCodeImage value={qrDeepLink} size={180} alt="QR" />
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
                <Button
                  size="s"
                  mode="secondary"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    void apiPost('/profile/regenerate-qr', {}).then(() => {
                      setSnackbar('QR обновлён');
                      loadProfile();
                    }).catch((err) => setSnackbar(err instanceof ApiError ? err.message : 'Не удалось обновить QR'));
                  }}
                >
                  Обновить QR (при утечке)
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
        ) : section === 'piggybank' ? (
          <>
            <Button
              size="m"
              stretched
              style={{ marginBottom: 12 }}
              onClick={() => openQuickCapture(setModal, {
                onSaved: () => {
                  loadPiggybank();
                  loadProfile();
                  setSnackbar('Запись добавлена в копилку');
                },
                onError: (message) => setSnackbar(message),
              })}
            >
              Создать запись
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
                  {tags.map((t: string) => `#${t}`).join(' ')}
                  {entry.source ? ` · ${entry.source}` : ' · без источника'}
                  {entry.forumDay ? ` · Д${entry.forumDay}` : ''}
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>{entry.text}</div>
              </div>
            );})}
            {piggybank.length === 0 && (
              <EmptyState icon="📝" title="Копилка пуста" subtitle="Фиксируйте идеи и мысли на главной или в программе" />
            )}
          </>
        ) : null}
      </Group>
      {snackbar && <Snackbar onClose={() => setSnackbar(null)} onClosed={() => setSnackbar(null)}>{snackbar}</Snackbar>}
    </Panel>
  );
};
