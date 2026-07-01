import { useState, useEffect } from 'react';
import { Panel, PanelHeader, Group, Spinner, SegmentedControl, Select, Button, Snackbar } from '@vkontakte/vkui';
import { UserInfo } from '@vkontakte/vk-bridge';
import { apiGet, ApiError } from '../api/client';
import { EmptyState } from '../components/EmptyState';

const TAGS = ['', 'идея', 'мысль', 'вопрос', 'контакт', 'на будущее', 'забрать в работу', 'обсудить с командой'];
const SOURCES = ['', 'блок программы', 'общение с участниками', 'общение со спикерами', 'собственные размышления'];

export const ProfilePanel: React.FC<{ id: string; fetchedUser?: UserInfo | null }> = ({ id, fetchedUser }) => {
  const [profile, setProfile] = useState<any>(null);
  const [piggybank, setPiggybank] = useState<any[]>([]);
  const [previewPiggy, setPreviewPiggy] = useState<any[]>([]);
  const [section, setSection] = useState<'overview' | 'piggybank'>('overview');
  const [tagFilter, setTagFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const loadProfile = () => {
    setLoading(true);
    setError(null);
    apiGet<any>('/profile')
      .then((p) => {
        setProfile(p);
        return apiGet<any>('/piggybank');
      })
      .then(pb => setPreviewPiggy((pb.entries || []).slice(0, 3)))
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

  return (
    <Panel id={id}>
      <PanelHeader>Профиль</PanelHeader>
      <Group>
        <SegmentedControl
          value={section}
          onChange={(v) => setSection(v as 'overview' | 'piggybank')}
          options={[
            { label: 'Обзор', value: 'overview' },
            { label: `Копилка (${p.piggybankCount ?? 0})`, value: 'piggybank' },
          ]}
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
              </div>
            </div>

            {p.trajectory && (
              <div className="ab-card">
                <div className="pb-lbl">Траектория A → B</div>
                <div className="ab-row">
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{p.trajectory.from}</span>
                  <div className="ab-track"><div className="ab-track-fill" style={{ width: `${pathPct}%` }} /></div>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{p.trajectory.to}</span>
                </div>
                <div className="ab-dates"><span>Старт</span><span>{pathPct}% пути</span><span>Цель</span></div>
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

            {p.goalSetting && (
              <div className="pb m-card">
                <div className="pb-lbl">🎯 Мой запрос</div>
                <div className="pb-text">{(p.goalSetting.interests as string[])?.join(', ') || '—'}</div>
              </div>
            )}

            {p.outcomes?.summary && (
              <div className="pb m-card">
                <div className="pb-lbl">📋 Что получилось</div>
                <ul className="pb-checks">
                  <li>{p.outcomes.summary}</li>
                  {p.stats.tasksDone > 0 && <li>Выполнено заданий: {p.stats.tasksDone}</li>}
                  {p.stats.answers > 0 && <li>Ответов на вопросы: {p.stats.answers}</li>}
                </ul>
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
                {p.stats.answers < 2
                  ? 'Ответьте на рефлексивные вопросы — это откроет базу знаний и точки осмысления.'
                  : 'Продолжайте фиксировать идеи в копилку — они пригодятся для итогов форума.'}
              </div>
            </div>
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
