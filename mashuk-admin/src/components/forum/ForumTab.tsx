import { useCallback, useEffect, useState } from 'react';
import { confirmDelete } from '../../admin/confirmDelete';
import { label } from '../../labels/ru';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';
import { RichHtmlEditor } from '../admin/RichHtmlEditor';
import { htmlToPlain } from '../admin/RichFormatToolbar';
import { HubLensLayout, type HubNavItem } from '../hub/HubSideNav';
import { EveningQuestionnaireBuilder } from './EveningQuestionnaireBuilder';
import { ProfilePdfSettings } from './ProfilePdfSettings';
import { OrgThreadsSection } from './OrgThreadsSection';
import { SECTIONS } from './types';

const FORUM_SETTINGS_NAV: HubNavItem[] = [
  { id: 'forum-cfg-day', label: 'День' },
  { id: 'forum-cfg-calendar', label: 'Календарь' },
  { id: 'forum-cfg-kb', label: 'База знаний' },
  { id: 'forum-cfg-groups', label: 'Группы' },
  { id: 'forum-cfg-focus', label: 'Фокус дня' },
  { id: 'forum-cfg-evening', label: 'Итоговая' },
  { id: 'forum-cfg-menu', label: 'Меню' },
  { id: 'forum-cfg-pdf', label: 'Профиль' },
  { id: 'forum-cfg-consents', label: 'Согласия' },
];

const FORUM_ORG_NAV: HubNavItem[] = [
  { id: 'forum-cfg-org', label: 'Обращения' },
];


function plainFocusToHtml(text: string): string {
  if (!text.trim()) return '';
  return text
    .split(/\n/)
    .map(line => {
      const escaped = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<p>${escaped || '<br>'}</p>`;
    })
    .join('');
}

type ForumSegment = 'settings' | 'org';

type ForumTabProps = AdminTabProps & {
  /** Прокрутить к якорю после загрузки (например итоговая анкета вечера). */
  focusAnchor?: string | null;
  focusNonce?: number;
};

export function ForumTab({ adminFetch, act, reloadKey, focusAnchor, focusNonce }: ForumTabProps) {
  const [forumSegment, setForumSegment] = useState<ForumSegment>('settings');
  const [forumSettings, setForumSettings] = useState<any>(null);
  const [recThreshold, setRecThreshold] = useState(1);
  const [recEmptyNoMatchText, setRecEmptyNoMatchText] = useState('');
  const [recEmptyNoEventsText, setRecEmptyNoEventsText] = useState('');
  const [totalDaysDraft, setTotalDaysDraft] = useState(8);
  const [kbThreshold, setKbThreshold] = useState(4);
  const [sectionsVis, setSectionsVis] = useState<Record<string, boolean>>({});
  const [dayFocusList, setDayFocusList] = useState<any[]>([]);
  const [dayFocusForm, setDayFocusForm] = useState({
    dayNumber: 1,
    title: '',
    text: '',
    textHtml: '',
    keyQuestion: '',
  });
  const [groups, setGroups] = useState<any[]>([]);
  const [groupDrafts, setGroupDrafts] = useState<Record<number, {
    name: string;
    capacity: number;
    directionId: number | '';
  }>>({});
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(() => new Set());
  const [bulkCapacity, setBulkCapacity] = useState(30);
  const [directions, setDirections] = useState<any[]>([]);
  const [consents, setConsents] = useState<any[]>([]);
  const [scheduleVersions, setScheduleVersions] = useState<any[]>([]);
  const [scheduleDays, setScheduleDays] = useState<{ dayNumber: number; isPublished?: boolean }[]>([]);
  const [publishDayPick, setPublishDayPick] = useState(1);
  const [newGroup, setNewGroup] = useState({ name: '', capacity: 30, directionId: '' });
  const [newConsent, setNewConsent] = useState({ kind: 'pd', version: 1, title: '', body: '', isActive: true });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fs = (await adminFetch('/forum-settings')).settings;
      setForumSettings(fs);
      setRecThreshold(fs?.recommendationThreshold ?? 1);
      setRecEmptyNoMatchText(fs?.programRecEmptyNoMatchText ?? '');
      setRecEmptyNoEventsText(fs?.programRecEmptyNoEventsText ?? '');
      setTotalDaysDraft(fs?.totalDays ?? 8);
      setKbThreshold(fs?.kbUnlockThreshold ?? 4);
      setSectionsVis((fs?.sectionsVisibility as Record<string, boolean>) || {});
      setDayFocusList((await adminFetch('/day-focus')).focus || []);
      const nextGroups = (await adminFetch('/groups')).groups || [];
      setGroups(nextGroups);
      setSelectedGroupIds(prev => {
        const alive = new Set(nextGroups.map((g: { id: number }) => g.id));
        return new Set([...prev].filter(id => alive.has(id)));
      });
      setConsents((await adminFetch('/consents')).consents || []);
      setDirections((await adminFetch('/directions')).directions || []);
      const sched = await adminFetch('/schedule/versions').catch(() => ({ days: [], versions: [] }));
      setScheduleDays(sched.days || []);
      setScheduleVersions(sched.versions || []);
      setPublishDayPick(fs?.currentDay ?? 1);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    setGroupDrafts(Object.fromEntries(groups.map((g: {
      id: number;
      name?: string;
      capacity?: number;
      directionId?: number | null;
    }) => [g.id, {
      name: g.name || '',
      capacity: g.capacity ?? 30,
      directionId: g.directionId ?? '',
    }])));
  }, [groups]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  useEffect(() => {
    if (!focusAnchor) return;
    setForumSegment('settings');
  }, [focusAnchor, focusNonce]);

  useEffect(() => {
    if (!focusAnchor || loading) return;
    let cancelled = false;
    const tryScroll = (attempt: number) => {
      if (cancelled) return;
      const el = document.getElementById(focusAnchor);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (attempt < 16) window.setTimeout(() => tryScroll(attempt + 1), 50);
    };
    const t = window.setTimeout(() => tryScroll(0), 40);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [focusAnchor, focusNonce, loading]);

  const saveForumSettings = (patch: Record<string, unknown>) =>
    act(async () => {
      const res = await adminFetch('/forum-settings', { method: 'PATCH', body: JSON.stringify(patch) });
      setForumSettings(res.settings);
      if (patch.recommendationThreshold != null) setRecThreshold(Number(patch.recommendationThreshold));
      if (patch.programRecEmptyNoMatchText !== undefined) {
        setRecEmptyNoMatchText((patch.programRecEmptyNoMatchText as string | null) ?? '');
      }
      if (patch.programRecEmptyNoEventsText !== undefined) {
        setRecEmptyNoEventsText((patch.programRecEmptyNoEventsText as string | null) ?? '');
      }
      if (patch.totalDays != null) setTotalDaysDraft(Number(patch.totalDays));
      if (patch.kbUnlockThreshold != null) setKbThreshold(Number(patch.kbUnlockThreshold));
      if (patch.sectionsVisibility) setSectionsVis(patch.sectionsVisibility as Record<string, boolean>);
    }, 'Сохранено');

  const loadDayFocusIntoForm = (dayNumber: number) => {
    const f = dayFocusList.find(d => d.dayNumber === dayNumber);
    if (f) {
      const text = f.text || '';
      const textHtml = f.textHtml || (text ? plainFocusToHtml(text) : '');
      setDayFocusForm({
        dayNumber,
        title: f.title || '',
        text,
        textHtml,
        keyQuestion: f.keyQuestion || '',
      });
    } else {
      setDayFocusForm({ dayNumber, title: '', text: '', textHtml: '', keyQuestion: '' });
    }
  };

  const saveDayFocus = () =>
    act(async () => {
      const textHtml = dayFocusForm.textHtml || '';
      const text = htmlToPlain(textHtml) || dayFocusForm.text || '';
      await adminFetch('/day-focus', {
        method: 'POST',
        body: JSON.stringify({
          dayNumber: dayFocusForm.dayNumber,
          title: dayFocusForm.title,
          keyQuestion: dayFocusForm.keyQuestion,
          text,
          textHtml,
        }),
      });
      setDayFocusList((await adminFetch('/day-focus')).focus || []);
    }, 'Фокус дня сохранён');

  const loadScheduleVersions = () =>
    act(async () => {
      const r = await adminFetch(`/schedule/versions?day=${publishDayPick}`);
      setScheduleVersions(r.versions || []);
      setScheduleDays(r.days || []);
    }, 'История загружена');

  const publishScheduleDay = (dayNumber: number) => {
    if (!confirm(`Опубликовать расписание дня ${dayNumber} для участников?\n\nДо публикации участники не видят этот день, даже если события уже внесены.`)) return;
    act(async () => {
      const published = await adminFetch('/schedule/publish', {
        method: 'POST',
        body: JSON.stringify({ dayNumber }),
      }) as { currentDay?: number };
      const r = await adminFetch('/schedule/versions');
      setScheduleDays(r.days || []);
      setScheduleVersions(r.versions || []);
      // Refresh current day + day-focus form so admin matches what participants see.
      const fs = (await adminFetch('/forum-settings')).settings;
      setForumSettings(fs);
      const focusList = (await adminFetch('/day-focus')).focus || [];
      setDayFocusList(focusList);
      const liveDay = Number(published.currentDay ?? fs?.currentDay ?? dayNumber) || dayNumber;
      const f = focusList.find((d: { dayNumber: number }) => d.dayNumber === liveDay);
      if (f) {
        const text = f.text || '';
        setDayFocusForm({
          dayNumber: liveDay,
          title: f.title || '',
          text,
          textHtml: f.textHtml || (text ? plainFocusToHtml(text) : ''),
          keyQuestion: f.keyQuestion || '',
        });
      } else {
        setDayFocusForm({ dayNumber: liveDay, title: '', text: '', textHtml: '', keyQuestion: '' });
      }
    }, `День ${dayNumber} опубликован`);
  };

  const unpublishScheduleDay = (dayNumber: number) => {
    if (!confirm(
      `Скрыть день ${dayNumber} у участников?\n\n`
      + 'События останутся в админке как черновик дня. '
      + 'Итоговая анкета вечера за этот день тоже будет снята с публикации.',
    )) return;
    act(async () => {
      await adminFetch('/schedule/draft', {
        method: 'POST',
        body: JSON.stringify({ dayNumber }),
      });
      const r = await adminFetch('/schedule/versions');
      setScheduleDays(r.days || []);
      setScheduleVersions(r.versions || []);
    }, `День ${dayNumber} скрыт`);
  };

  if (forumSegment === 'settings' && (loading || !forumSettings)) {
    return <p className="adm-muted">Загрузка конструктора форума…</p>;
  }

  const totalDays = forumSettings?.totalDays ?? 8;
  const currentDay = forumSettings?.currentDay ?? 1;
  const publishedDaySet = new Set(
    scheduleDays.filter(d => d.isPublished).map(d => d.dayNumber),
  );
  const focusFilled = new Set(
    dayFocusList.filter(f => f.title || f.text || f.textHtml).map(f => f.dayNumber),
  );

  return (
    <HubLensLayout
      className="adm-forum adm-kb"
      items={forumSegment === 'settings' ? FORUM_SETTINGS_NAV : FORUM_ORG_NAV}
      navLabel={forumSegment === 'settings' ? 'Разделы форума' : 'Обращения'}
    >
      <div className="adm-forum-seg" role="tablist" aria-label="Разделы вкладки Форум">
        <button
          type="button"
          role="tab"
          className={forumSegment === 'settings' ? 'on' : ''}
          aria-selected={forumSegment === 'settings'}
          onClick={() => setForumSegment('settings')}
        >
          Настройки форума
        </button>
        <button
          type="button"
          role="tab"
          className={forumSegment === 'org' ? 'on' : ''}
          aria-selected={forumSegment === 'org'}
          onClick={() => setForumSegment('org')}
        >
          Обращения к организаторам
        </button>
      </div>

      {forumSegment === 'org' && (
        <section id="forum-cfg-org" className="adm-forum-anchor">
          <OrgThreadsSection adminFetch={adminFetch} act={act} reloadKey={reloadKey} />
        </section>
      )}

      {forumSegment === 'settings' && (
      <>
      <section id="forum-cfg-day" className="adm-forum-anchor">
        <AdminPageHero
          title={`Сейчас для участников: день ${currentDay} из ${totalDays}`}
          hint="От этого зависят главная, программа, touchpoints и публикация расписания. Переключите день — участники увидят контент этого дня (если он опубликован)."
        >
          <div className="adm-seg adm-forum-day-seg">
            {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => (
              <button
                key={d}
                type="button"
                className={currentDay === d ? 'on' : ''}
                onClick={() => saveForumSettings({ currentDay: d })}
              >
                День {d}
              </button>
            ))}
          </div>
        </AdminPageHero>
      </section>

      <section id="forum-cfg-calendar" className="adm-forum-anchor">
      <div className="card adm-forum-block adm-kb-panel">
        <div className="adm-kb-panel-head">
          <h3>Календарь и публикация программы</h3>
          <p className="adm-kb-panel-sub">
            Расписание вбиваете во вкладке «Программа» заранее. Участники видят день только после публикации здесь
            (или кнопкой «Опубликовать день» в Программе). Неопубликованные дни в приложении пустые.
          </p>
        </div>
        <div className="adm-forum-grid-2">
          <label className="adm-field">
            <span className="adm-label">Всего дней форума</span>
            <input
              type="number"
              className="adm-input"
              min={1}
              max={14}
              value={totalDaysDraft}
              onChange={e => setTotalDaysDraft(Number(e.target.value))}
            />
          </label>
          <label className="adm-field">
            <span className="adm-label">Порог «Рекомендуем тебе»</span>
            <input
              type="number"
              className="adm-input"
              min={0}
              max={10}
              value={recThreshold}
              onChange={e => setRecThreshold(Number(e.target.value))}
            />
            <span className="adm-muted">Сколько общих интересов нужно для рекомендации события</span>
          </label>
        </div>
        <div className="adm-forum-grid-2" style={{ marginTop: 12 }}>
          <label className="adm-field">
            <span className="adm-label">Плашка «Персональные рекомендации» — нет совпадений</span>
            <textarea
              className="adm-input"
              rows={4}
              value={recEmptyNoMatchText}
              onChange={e => setRecEmptyNoMatchText(e.target.value)}
              placeholder="Здесь будут отображаться события программы, которые совпадают с вашими интересами. Когда такие совпадения появятся, мы покажем их в этом разделе."
            />
            <span className="adm-muted">Показывается участнику, если интересы выбраны, но подходящих событий пока нет</span>
          </label>
          <label className="adm-field">
            <span className="adm-label">Плашка «Персональные рекомендации» — день без событий</span>
            <textarea
              className="adm-input"
              rows={4}
              value={recEmptyNoEventsText}
              onChange={e => setRecEmptyNoEventsText(e.target.value)}
              placeholder="На этот день ещё нет опубликованных событий — блок появится, когда расписание выйдет."
            />
            <span className="adm-muted">Показывается, если на выбранный день ещё нет опубликованных событий</span>
          </label>
        </div>
        <div className="adm-forum-toolbar">
          <button
            type="button"
            className="adm-btn adm-btn-secondary"
            onClick={() => saveForumSettings({
              totalDays: totalDaysDraft,
              recommendationThreshold: recThreshold,
              programRecEmptyNoMatchText: recEmptyNoMatchText.trim() || null,
              programRecEmptyNoEventsText: recEmptyNoEventsText.trim() || null,
            })}
          >
            Сохранить календарь и рекомендации
          </button>
        </div>

        <h4 style={{ margin: '16px 0 8px', fontSize: 14 }}>Статус дней для участников</h4>
        <table className="adm-table">
          <thead>
            <tr>
              <th>День</th>
              <th>Статус</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => {
              const live = publishedDaySet.has(d);
              return (
                <tr key={d}>
                  <td>
                    День {d}
                    {d === currentDay ? <span className="adm-muted"> · текущий</span> : null}
                  </td>
                  <td>
                    <span className={live ? 'adm-forum-accent' : 'adm-muted'} style={{ fontWeight: 700 }}>
                      {live ? 'Опубликован' : 'Черновик (скрыт)'}
                    </span>
                  </td>
                  <td>
                    {live ? (
                      <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => unpublishScheduleDay(d)}>
                        Скрыть
                      </button>
                    ) : (
                      <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={() => publishScheduleDay(d)}>
                        Опубликовать
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="adm-forum-toolbar" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <label className="adm-forum-inline">
            История публикаций дня
            <select className="adm-input" style={{ width: 80 }} value={publishDayPick} onChange={e => setPublishDayPick(Number(e.target.value))}>
              {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={loadScheduleVersions}>
            Показать историю
          </button>
        </div>
        {scheduleVersions.length > 0 && (
          <table className="adm-table" style={{ marginTop: 12 }}>
            <thead><tr><th>День</th><th>Версия</th><th>Когда</th><th>Событий</th></tr></thead>
            <tbody>
              {scheduleVersions.filter((v: any) => v.dayNumber === publishDayPick).slice(0, 8).map((v: any) => (
                <tr key={v.id}>
                  <td>{v.dayNumber}</td>
                  <td>{v.version}</td>
                  <td>{v.publishedAt ? new Date(v.publishedAt).toLocaleString('ru-RU') : '—'}</td>
                  <td>{Array.isArray(v.eventsSnapshot) ? v.eventsSnapshot.length : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </section>

      <section id="forum-cfg-kb" className="adm-forum-anchor">
      <div className="card adm-forum-block adm-kb-panel">
        <div className="adm-kb-panel-head">
          <h3>База знаний</h3>
          <p className="adm-kb-panel-sub">
            Сколько точек осмысления нужно, чтобы открыть материалы дня. Разблокировка одному участнику — вкладка «База знаний».
          </p>
        </div>
        <div className="adm-forum-grid-2">
          <label className="adm-field">
            <span className="adm-label">Порог touchpoints (обычно 4)</span>
            <input
              type="number"
              className="adm-input"
              min={0}
              max={20}
              value={kbThreshold}
              onChange={e => setKbThreshold(Number(e.target.value))}
            />
          </label>
          <label className="adm-field">
            <span className="adm-label">Прошлые дни материалов</span>
            <select
              className="adm-input"
              value={forumSettings.kbPastDaysPolicy || 'locked'}
              onChange={e => saveForumSettings({ kbPastDaysPolicy: e.target.value })}
            >
              <option value="locked">Закрыты без порога / ручной разблокировки</option>
              <option value="auto_open">Автоматически открыть прошлые дни</option>
            </select>
          </label>
        </div>
        <label className="adm-forum-check" style={{ display: 'block', marginTop: 8 }}>
          <input
            type="checkbox"
            checked={!!forumSettings.kbUnlockDisabled}
            onChange={e => saveForumSettings({ kbUnlockDisabled: e.target.checked })}
          />
          Не блокировать базу знаний (все материалы доступны)
        </label>
        <button
          type="button"
          className="adm-btn adm-btn-secondary"
          style={{ marginTop: 12 }}
          onClick={() => saveForumSettings({ kbUnlockThreshold: kbThreshold })}
        >
          Сохранить порог базы знаний
        </button>
      </div>
      </section>

      <section id="forum-cfg-groups" className="adm-forum-anchor">
      <div className="card adm-forum-block adm-kb-panel">
        <div className="adm-kb-panel-head">
          <h3>Группы при регистрации</h3>
          <p className="adm-kb-panel-sub">
            Рабочие группы только этой смены (переключатель смены в шапке).
            Участник выбирает любую группу смены или система назначает автоматически.
            Переименование обновляет название у всех участников группы.
            Столбец «Направление» задаёт направление членам группы, если оно указано.
          </p>
        </div>
        <label className="adm-field">
          <span className="adm-label">Режим</span>
          <select
            className="adm-input"
            value={forumSettings.groupAssignMode || 'list'}
            onChange={e => saveForumSettings({ groupAssignMode: e.target.value })}
          >
            <option value="list">Участник выбирает из списка</option>
            <option value="auto">Назначает система</option>
          </select>
        </label>
        <div className="form-row">
          <input value={newGroup.name} onChange={e => setNewGroup({ ...newGroup, name: e.target.value })} placeholder="Название группы" />
          <input type="number" value={newGroup.capacity} onChange={e => setNewGroup({ ...newGroup, capacity: Number(e.target.value) })} placeholder="Мест" style={{ width: 80 }} />
          <select value={newGroup.directionId} onChange={e => setNewGroup({ ...newGroup, directionId: e.target.value })}>
            <option value="">Без принудительного направления</option>
            {directions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button
            type="button"
            onClick={() => act(async () => {
              await adminFetch('/groups', {
                method: 'POST',
                body: JSON.stringify({
                  name: newGroup.name,
                  capacity: newGroup.capacity,
                  directionId: newGroup.directionId ? Number(newGroup.directionId) : null,
                }),
              });
              await load();
              setNewGroup({ name: '', capacity: 30, directionId: '' });
            }, 'Группа добавлена')}
          >
            Добавить группу
          </button>
        </div>
        {groups.length > 0 && (
          <div className="form-row" style={{ marginTop: 10, alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={groups.length > 0 && groups.every(g => selectedGroupIds.has(g.id))}
                onChange={e => {
                  if (e.target.checked) setSelectedGroupIds(new Set(groups.map(g => g.id)));
                  else setSelectedGroupIds(new Set());
                }}
              />
              Выбрать все ({selectedGroupIds.size})
            </label>
            <span className="adm-label" style={{ margin: 0 }}>Общие места для выбранных</span>
            <input
              type="number"
              className="adm-input adm-input-narrow"
              min={1}
              value={bulkCapacity}
              onChange={e => setBulkCapacity(Number(e.target.value))}
              style={{ width: 90 }}
              aria-label="Количество мест для выбранных групп"
            />
            <button
              type="button"
              className="adm-btn adm-btn-secondary"
              disabled={selectedGroupIds.size === 0 || !Number.isFinite(bulkCapacity) || bulkCapacity < 1}
              onClick={() => act(async () => {
                const capacity = Math.max(1, Math.floor(Number(bulkCapacity) || 0));
                const ids = [...selectedGroupIds];
                await Promise.all(ids.map(async (id) => {
                  const g = groups.find(x => x.id === id);
                  if (!g) return;
                  const draft = groupDrafts[id];
                  const name = draft?.name ?? g.name;
                  const directionId = draft?.directionId !== undefined
                    ? (draft.directionId === '' ? null : Number(draft.directionId))
                    : (g.directionId ?? null);
                  await adminFetch(`/groups/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ name, capacity, directionId }),
                  });
                }));
                setGroupDrafts(prev => {
                  const next = { ...prev };
                  for (const id of ids) {
                    const g = groups.find(x => x.id === id);
                    next[id] = {
                      name: prev[id]?.name ?? g?.name ?? '',
                      capacity,
                      directionId: prev[id]?.directionId ?? g?.directionId ?? '',
                    };
                  }
                  return next;
                });
                await load();
              }, `Мест: ${bulkCapacity} для ${selectedGroupIds.size} групп`)}
            >
              Применить к выбранным
            </button>
            <button
              type="button"
              className="adm-btn adm-btn-secondary"
              onClick={() => {
                if (!confirm('Перезаписать направление всех участников по направлению их группы? Выбор, который человек сделал при регистрации, будет заменён.')) return;
                act(async () => {
                  const res = await adminFetch('/groups/sync-directions', { method: 'POST' });
                  await load();
                  return `Направление обновлено у ${res.synced ?? 0} участников`;
                });
              }}
            >
              Применить направления групп к участникам
            </button>
          </div>
        )}
        {groups.length === 0 && (
          <p className="adm-muted" style={{ marginTop: 8 }}>Пока нет групп — добавьте первую выше.</p>
        )}
        <table className="adm-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={groups.length > 0 && groups.every(g => selectedGroupIds.has(g.id))}
                  onChange={e => {
                    if (e.target.checked) setSelectedGroupIds(new Set(groups.map(g => g.id)));
                    else setSelectedGroupIds(new Set());
                  }}
                  aria-label="Выбрать все группы"
                />
              </th>
              <th>Название</th>
              <th>Мест</th>
              <th>Направление</th>
              <th>Участников</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <tr key={g.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedGroupIds.has(g.id)}
                    onChange={e => {
                      setSelectedGroupIds(prev => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(g.id);
                        else next.delete(g.id);
                        return next;
                      });
                    }}
                    aria-label={`Выбрать группу ${g.name}`}
                  />
                </td>
                <td>
                  <input
                    className="adm-input"
                    value={groupDrafts[g.id]?.name ?? g.name}
                    onChange={e => setGroupDrafts(prev => ({
                      ...prev,
                      [g.id]: {
                        name: e.target.value,
                        capacity: prev[g.id]?.capacity ?? g.capacity ?? 30,
                        directionId: prev[g.id]?.directionId ?? g.directionId ?? '',
                      },
                    }))}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="adm-input adm-input-narrow"
                    value={groupDrafts[g.id]?.capacity ?? g.capacity ?? 30}
                    onChange={e => setGroupDrafts(prev => ({
                      ...prev,
                      [g.id]: {
                        name: prev[g.id]?.name ?? g.name,
                        capacity: Number(e.target.value),
                        directionId: prev[g.id]?.directionId ?? g.directionId ?? '',
                      },
                    }))}
                  />
                </td>
                <td>
                  <select
                    className="adm-input"
                    value={groupDrafts[g.id]?.directionId ?? g.directionId ?? ''}
                    onChange={e => setGroupDrafts(prev => ({
                      ...prev,
                      [g.id]: {
                        name: prev[g.id]?.name ?? g.name,
                        capacity: prev[g.id]?.capacity ?? g.capacity ?? 30,
                        directionId: e.target.value === '' ? '' : Number(e.target.value),
                      },
                    }))}
                  >
                    <option value="">— не задано —</option>
                    {directions.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </td>
                <td>{g.membersCount ?? 0}</td>
                <td>
                  <button
                    type="button"
                    className="adm-btn adm-btn-secondary adm-btn-sm"
                    onClick={() => act(async () => {
                      const d = groupDrafts[g.id] || {
                        name: g.name,
                        capacity: g.capacity ?? 30,
                        directionId: g.directionId ?? '',
                      };
                      const res = await adminFetch(`/groups/${g.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({
                          name: d.name,
                          capacity: d.capacity,
                          directionId: d.directionId === '' ? null : Number(d.directionId),
                        }),
                      });
                      await load();
                      if (res.directionSynced) {
                        return `Сохранено · направление обновлено у ${res.directionSynced}`;
                      }
                    })}
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn-danger adm-btn-sm"
                    onClick={() => {
                      if (!confirmDelete('Удалить группу?')) return;
                      act(async () => {
                        await adminFetch(`/groups/${g.id}`, { method: 'DELETE' });
                        setSelectedGroupIds(prev => {
                          const next = new Set(prev);
                          next.delete(g.id);
                          return next;
                        });
                        await load();
                      });
                    }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </section>

      <section id="forum-cfg-focus" className="adm-forum-anchor">
      <div className="card adm-forum-block adm-kb-panel">
        <div className="adm-kb-panel-head">
          <h3>Фокус дня на главной</h3>
          <p className="adm-kb-panel-sub">Текст на главном экране участника: заголовок, ключевой вопрос, пояснение.</p>
        </div>
        <div className="adm-forum-day-chips">
          {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => (
            <button
              key={d}
              type="button"
              className={`adm-chip-btn ${focusFilled.has(d) ? 'filled' : ''} ${dayFocusForm.dayNumber === d ? 'on' : ''}`}
              onClick={() => loadDayFocusIntoForm(d)}
            >
              Д{d}{focusFilled.has(d) ? ' ✓' : ''}
            </button>
          ))}
        </div>
        <div className="adm-forum-grid-2">
          <label className="adm-field">
            <span className="adm-label">Заголовок</span>
            <input className="adm-input" value={dayFocusForm.title} onChange={e => setDayFocusForm({ ...dayFocusForm, title: e.target.value })} />
          </label>
          <label className="adm-field">
            <span className="adm-label">Ключевой вопрос</span>
            <input className="adm-input" value={dayFocusForm.keyQuestion} onChange={e => setDayFocusForm({ ...dayFocusForm, keyQuestion: e.target.value })} />
          </label>
        </div>
        <RichHtmlEditor
          label="Текст фокуса"
          value={dayFocusForm.textHtml}
          resetKey={dayFocusForm.dayNumber}
          minHeight={120}
          onChange={html => setDayFocusForm(prev => ({
            ...prev,
            textHtml: html,
            text: htmlToPlain(html),
          }))}
        />
        {dayFocusForm.title && (
          <div className="adm-forum-preview adm-forum-focus-preview">
            <div className="adm-forum-preview-label">Как на главной</div>
            <strong>{dayFocusForm.title}</strong>
            {dayFocusForm.keyQuestion && <p>{dayFocusForm.keyQuestion}</p>}
            {dayFocusForm.textHtml ? (
              <div
                className="adm-forum-focus-html"
                dangerouslySetInnerHTML={{ __html: dayFocusForm.textHtml }}
              />
            ) : dayFocusForm.text ? (
              <p className="adm-muted" style={{ whiteSpace: 'pre-wrap' }}>{dayFocusForm.text}</p>
            ) : null}
          </div>
        )}
        <button type="button" className="adm-btn adm-btn-primary" onClick={saveDayFocus}>Сохранить фокус</button>
      </div>
      </section>

      <section id="forum-cfg-evening" className="adm-forum-anchor">
      <div className="card adm-forum-block adm-kb-panel">
        <EveningQuestionnaireBuilder
          adminFetch={adminFetch}
          act={act}
          initialDay={currentDay}
          directions={directions.map((d: { id: number; name: string }) => ({ id: d.id, name: d.name }))}
        />
      </div>
      </section>

      <section id="forum-cfg-menu" className="adm-forum-anchor">
      <div className="card adm-forum-block adm-kb-panel">
        <div className="adm-kb-panel-head">
          <h3>Меню участника</h3>
          <p className="adm-kb-panel-sub">Какие разделы видны в нижней навигации мини-приложения.</p>
        </div>
        {SECTIONS.map(s => (
          <label key={s} className="adm-forum-check" style={{ display: 'block', marginBottom: 6 }}>
            <input
              type="checkbox"
              checked={sectionsVis[s] !== false}
              onChange={e => setSectionsVis({ ...sectionsVis, [s]: e.target.checked })}
            />
            {label(s)}
          </label>
        ))}
        <button type="button" className="adm-btn adm-btn-primary" style={{ marginTop: 8 }} onClick={() => saveForumSettings({ sectionsVisibility: sectionsVis })}>
          Сохранить меню
        </button>
      </div>
      </section>

      <section id="forum-cfg-pdf" className="adm-forum-anchor">
      <div className="card adm-forum-block adm-kb-panel">
        <ProfilePdfSettings
          adminFetch={adminFetch}
          act={act}
          forumShiftLabel={forumSettings.shiftLabel}
          onShiftLabelSave={lbl => setForumSettings((s: any) => ({ ...s, shiftLabel: lbl }))}
        />
      </div>
      </section>

      <section id="forum-cfg-consents" className="adm-forum-anchor">
      <div className="card adm-forum-block adm-kb-panel">
        <div className="adm-kb-panel-head">
          <h3>Согласия (ПД и аналитика)</h3>
          <p className="adm-kb-panel-sub">Тексты при первом входе. Активная версия показывается новым участникам.</p>
        </div>
        <div className="form-row">
          <select value={newConsent.kind} onChange={e => setNewConsent({ ...newConsent, kind: e.target.value })}>
            <option value="pd">Персональные данные</option>
            <option value="analytics">Аналитика</option>
          </select>
          <input type="number" value={newConsent.version} onChange={e => setNewConsent({ ...newConsent, version: Number(e.target.value) })} placeholder="Версия" style={{ width: 70 }} />
          <input value={newConsent.title} onChange={e => setNewConsent({ ...newConsent, title: e.target.value })} placeholder="Заголовок" />
          <label className="adm-forum-check">
            <input type="checkbox" checked={newConsent.isActive} onChange={e => setNewConsent({ ...newConsent, isActive: e.target.checked })} />
            Сразу активно
          </label>
        </div>
        <textarea value={newConsent.body} onChange={e => setNewConsent({ ...newConsent, body: e.target.value })} placeholder="Текст согласия" rows={3} style={{ width: '100%' }} />
        <button
          type="button"
          style={{ marginTop: 8 }}
          onClick={() => act(async () => {
            await adminFetch('/consents', { method: 'POST', body: JSON.stringify(newConsent) });
            setConsents((await adminFetch('/consents')).consents || []);
            setNewConsent({ kind: 'pd', version: 1, title: '', body: '', isActive: true });
          }, 'Согласие добавлено')}
        >
          Добавить согласие
        </button>
        {consents.map(c => (
          <div key={c.id} className="adm-forum-consent-card">
            <strong>{c.kind === 'pd' ? 'ПД' : 'Аналитика'}</strong> · версия {c.version} · {c.title}
            {c.isActive ? ' · активно' : ''}
            <div className="adm-muted" style={{ marginTop: 4 }}>{(c.body || '').slice(0, 200)}{(c.body || '').length > 200 ? '…' : ''}</div>
            <div className="adm-forum-toolbar">
              {!c.isActive && (
                <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => act(async () => {
                  await adminFetch(`/consents/${c.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: true }) });
                  setConsents((await adminFetch('/consents')).consents || []);
                }, 'Активировано')}>
                  Сделать активным
                </button>
              )}
              <button type="button" className="adm-btn adm-btn-danger adm-btn-sm" onClick={() => {
                if (!confirmDelete('Удалить текст?')) return;
                act(async () => {
                  await adminFetch(`/consents/${c.id}`, { method: 'DELETE' });
                  setConsents((await adminFetch('/consents')).consents || []);
                });
              }}>
                Удалить
              </button>
            </div>
          </div>
        ))}
      </div>
      </section>
      </>
      )}
    </HubLensLayout>
  );
}
