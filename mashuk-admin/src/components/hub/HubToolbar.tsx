import { useInsights } from '../insights/InsightsContext';
import type { HubLens } from './hubLenses';
import { HUB_FORUM_DAY_ALL, hubDirections, isAllForumDay, isOrganizerDirection } from './hubQuery';

const LENS_LABELS: Record<HubLens, string> = {
  forum: 'Форум',
  stats: 'Статистика',
  dayResults: 'Итоги дня',
  state: 'Состояние',
  activity: 'Активность',
  piggybank: 'Копилка',
  afterBlocks: 'После блоков',
  exchange: 'Обмен опытом',
  direction: 'Направление',
  groups: 'Группы',
  participant: 'Участник',
};

const LENS_ORDER: HubLens[] = [
  'forum', 'stats', 'dayResults', 'state', 'activity', 'piggybank', 'afterBlocks', 'exchange',
  'direction', 'groups', 'participant',
];

/** Свой маленький тулбар вместо InsightsChrome — тот тащит таб-бар старых 14 дашбордов. */
export function HubToolbar({
  lens,
  onLensChange,
}: {
  lens: HubLens;
  onLensChange: (l: HubLens) => void;
}) {
  const {
    forumDay,
    setForumDay,
    direction,
    setDirection,
    group,
    setGroup,
    ageCategory,
    setAgeCategory,
    activity,
    setActivity,
    meta,
  } = useInsights();

  const directionOptions = hubDirections(meta?.filters?.directions);
  const directionValue = isOrganizerDirection(direction) ? '' : direction;
  const dateValue = isAllForumDay(forumDay) ? HUB_FORUM_DAY_ALL : forumDay;

  return (
    <div className="adm-insights-toolbar card adm-forum-block">
      <div className="adm-insights-toolbar-top">
        <div className="adm-insights-section-tabs">
          {LENS_ORDER.map(l => (
            <button
              key={l}
              type="button"
              className={lens === l ? 'adm-btn adm-btn-primary' : 'adm-btn adm-btn-secondary'}
              onClick={() => onLensChange(l)}
            >
              {LENS_LABELS[l]}
            </button>
          ))}
        </div>
        {meta?.currentForumDay != null && (
          <span className="adm-insights-day-badge">Сейчас идёт день {meta.currentForumDay} из 8</span>
        )}
      </div>

      <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', marginTop: 8 }}>
        <label className="adm-insights-filter">
          Дата
          <select
            className="adm-input"
            value={dateValue}
            onChange={e => setForumDay(e.target.value)}
          >
            <option value={HUB_FORUM_DAY_ALL}>Весь форум</option>
            {(meta?.forumDays ?? [1, 2, 3, 4, 5, 6, 7, 8].map(d => ({
              day: d,
              label: `D${d}`,
              calendarDate: null as string | null,
            }))).map(d => (
              <option key={d.day} value={String(d.day)}>
                {d.label}{d.calendarDate ? ` · ${d.calendarDate}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-insights-filter">
          Направление
          <select
            className="adm-input"
            value={directionValue}
            onChange={e => {
              setDirection(e.target.value);
              setGroup('');
            }}
          >
            <option value="">Все направления</option>
            {directionOptions.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="adm-insights-filter">
          Группа
          <select className="adm-input" value={group} onChange={e => setGroup(e.target.value)}>
            <option value="">Все</option>
            {(meta?.filters?.groups ?? []).map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="adm-insights-filter">
          Возраст
          <select className="adm-input" value={ageCategory} onChange={e => setAgeCategory(e.target.value)}>
            <option value="">Все</option>
            {(meta?.filters?.ageCategories ?? []).map(a => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </label>
        <label className="adm-insights-filter">
          Деятельность
          <select className="adm-input" value={activity} onChange={e => setActivity(e.target.value)}>
            <option value="">Все</option>
            {(meta?.filters?.activities ?? []).map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
