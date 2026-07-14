import { useState, useEffect } from 'react';
import { Panel, PanelHeader, Group, Spinner, SegmentedControl, Select, Button, Snackbar, Checkbox } from '@vkontakte/vkui';
import { UserInfo } from '@vkontakte/vk-bridge';
import { apiGet, apiPost, apiPatch, ApiError } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { PIGGYBANK_TAGS, PIGGYBANK_SOURCES } from '../data/piggybank';
import { buildParticipantVolunteerUrl } from '../utils/qrDeepLink';

const TAGS = ['', ...PIGGYBANK_TAGS];
const SOURCES = ['', ...PIGGYBANK_SOURCES];

const PUSH_TYPES = [
  { key: 'touchpoints', label: 'Точки осмысления / проверки состояния' },
  { key: 'program', label: 'Программа и события' },
  { key: 'tasks', label: 'Задания и модерация' },
  { key: 'exchange', label: 'Общение и ответы' },
] as const;

export const ProfilePanel: React.FC<{ id: string; fetchedUser?: UserInfo | null }> = ({ id, fetchedUser }) => {
  const [profile, setProfile] = useState<any>(null);
  const [piggybank, setPiggybank] = useState<any[]>([]);
  const [previewPiggy, setPreviewPiggy] = useState<any[]>([]);
  const [medals, setMedals] = useState<any[]>([]);
  const [section, setSection] = useState<'overview' | 'piggybank' | 'final' | 'settings'>('overview');
  const [tagFilter, setTagFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [synthLoading, setSynthLoading] = useState(false);
  const [hideLb, setHideLb] = useState(false);
  const [pushOptOut, setPushOptOut] = useState<Record<string, boolean>>({});
  const [settingsSaving, setSettingsSaving] = useState(false);

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

  const loadPiggybank = () => {
    const params = new URLSearchParams();
    if (tagFilter) params.set('tag', tagFilter);
    if (sourceFilter) params.set('source', sourceFilter);
    const qs = params.toString();
    apiGet<any>(`/piggybank${qs ? `?${qs}` : ''}`)
      .then(pb => setPiggybank(pb.entries || []))
      .catch((err) => setSnackbar(err instanceof ApiError ? err.message : 'Не удалось загрузить копилку'));
  };

  useEffect(() => {
    if (section === 'piggybank') loadPiggybank();
  }, [section, tagFilter, sourceFilter]);

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
  const pathPct = Math.min(100, Math.round(((p.points.path % 100) / 100) * 100));
  const finalCard = p.finalCard;
  const showFinal = !!finalCard?.available;

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

  const qrDeepLink = p?.user?.qrToken
    ? buildParticipantVolunteerUrl(p.user.qrToken, p.user.id)
    : null;
  const qrImageUrl = qrDeepLink
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrDeepLink)}`
    : null;

  const sectionOptions = [
    { label: 'Обзор', value: 'overview' },
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
          onChange={(v) => setSection(v as 'overview' | 'piggybank' | 'final' | 'settings')}
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
                <div className="pf-r">{p.user.direction}</div>
                {p.user.groupName && (
                  <div style={{ fontSize: 11, color: '#B8621A', marginTop: 2, fontWeight: 600 }}>
                    Группа «{p.user.groupName}»
                  </div>
                )}
                {p.user.pedagogicalRoleName && (
                  <div style={{ fontSize: 12, color: '#B8621A', marginTop: 4, fontWeight: 700 }}>
                    ◆ {p.user.pedagogicalRoleName}
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
                    <div className="ab-track-fill" style={{ width: `${p.trajectory.progressPercent ?? pathPct}%` }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{p.trajectory.to}</span>
                </div>
                <div className="ab-dates">
                  <span>{p.trajectory.fromDate || 'Старт'}</span>
                  <span>{p.trajectory.progressPercent ?? pathPct}% пути</span>
                  <span>{p.trajectory.toDate || 'Цель'}</span>
                </div>
              </div>
            )}

            {p.roleTrajectory?.route && (
              <div className="m-card">
                <div className="pb-lbl">Твой способ действия</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>{p.roleTrajectory.route}</div>
                {p.roleTrajectory.byDay?.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 11, color: '#666' }}>
                    {p.roleTrajectory.byDay.map((d: any) => (
                      <div key={d.dayNumber}>Д{d.dayNumber}: {d.activeRoleName || '—'}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="ab-card">
              <div className="ab-stats">
                <div className="abs"><div className="abs-v">{p.stats.activities}</div><div className="abs-l">Активностей</div></div>
                <div className="abs"><div className="abs-v">{p.stats.tasksDone}</div><div className="abs-l">Заданий</div></div>
                <div className="abs"><div className="abs-v">{p.stats.ideas}</div><div className="abs-l">Идей</div></div>
                <div className="abs"><div className="abs-v">{p.stats.answers}</div><div className="abs-l">Ответов</div></div>
              </div>
            </div>

            <div className="m-stats">
              <div className="m-st"><div className="m-sv">📍 {p.points.path}</div><div className="m-sl">Путь · ур. {p.points.pathLevel}</div></div>
              <div className="m-st"><div className="m-sv">⚡ {p.points.experience}</div><div className="m-sl">Опыт · ур. {p.points.experienceLevel}</div></div>
            </div>

            {(p.myRequest || p.goalSetting) && (
              <div className="pb m-card">
                <div className="pb-lbl">🎯 Мой запрос</div>
                <div className="pb-text">{p.myRequest || (p.goalSetting.interests as string[])?.join(', ') || '—'}</div>
              </div>
            )}

            <div className="pb m-card">
              <div className="pb-lbl">📋 Что получилось</div>
              {p.outcomes?.summary ? (
                <ul className="pb-checks">
                  <li>{p.outcomes.summary}</li>
                  {p.stats.tasksDone > 0 && <li>Выполнено заданий: {p.stats.tasksDone}</li>}
                  {p.stats.answers > 0 && <li>Ответов на вопросы: {p.stats.answers}</li>}
                </ul>
              ) : (
                <div style={{ fontSize: 12, color: '#888' }}>Пока мало данных — ответьте на вопросы или запросите синтез.</div>
              )}
              <Button
                size="s"
                style={{ marginTop: 8 }}
                loading={synthLoading}
                onClick={async () => {
                  setSynthLoading(true);
                  try {
                    const res = await apiPost<{ summary?: string; configured?: boolean }>('/profile/outcomes/synthesize', {});
                    setSnackbar(res.configured === false
                      ? 'ИИ не настроен — показан эвристический итог'
                      : 'Итог обновлён');
                    loadProfile();
                  } catch (err) {
                    setSnackbar(err instanceof ApiError ? err.message : 'Не удалось синтезировать');
                  } finally {
                    setSynthLoading(false);
                  }
                }}
              >
                Собрать «Что получилось» (GigaChat)
              </Button>
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

            {p.piggybankTags && Object.keys(p.piggybankTags).length > 0 && (
              <div className="m-card">
                <div className="pb-lbl">📁 МОЯ КОПИЛКА</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {Object.entries(p.piggybankTags as Record<string, number>).map(([tag, count]) => (
                    <span key={tag} style={{
                      fontSize: 11, background: '#FFF3E0', color: '#B8621A',
                      borderRadius: 12, padding: '4px 10px', fontWeight: 600,
                    }}>
                      #{tag} · {count}
                    </span>
                  ))}
                </div>
                <div className="pb-link" onClick={() => setSection('piggybank')}>
                  {p.piggybankCount} идей и инструментов →
                </div>
              </div>
            )}

            {previewPiggy.length > 0 && !p.piggybankTags && (
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
                {p.stats.answers < 2
                  ? 'Ответьте на рефлексивные вопросы — это откроет базу знаний и точки осмысления.'
                  : 'Продолжайте фиксировать идеи в копилку — они пригодятся для итогов форума.'}
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
        ) : section === 'final' && finalCard ? (
          <>
            <div className="m-card" style={{ background: 'linear-gradient(135deg,#FFF8E7,#FFF3E0)' }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Итоговая карточка</div>
              <div style={{ fontSize: 12, marginTop: 4, color: '#666' }}>{finalCard.roles?.route}</div>
            </div>

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
          </>
        ) : (
          <>
            <div className="form-row" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <Select value={tagFilter} onChange={e => setTagFilter(e.target.value)} options={TAGS.map(t => ({ label: t || 'Все теги', value: t }))} />
              <Select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} options={SOURCES.map(s => ({ label: s || 'Все источники', value: s }))} />
            </div>
            {piggybank.map((entry: any) => (
              <div key={entry.id} className="m-card" style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>{entry.tag?.toUpperCase()} · {entry.source}</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>{entry.text}</div>
              </div>
            ))}
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
