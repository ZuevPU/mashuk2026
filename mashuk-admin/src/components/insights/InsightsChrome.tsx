import type { ReactNode } from 'react';
import { useInsights, type DashboardId } from './InsightsContext';
import { DASH_TAB_SHORT } from '../analytics/dashboardUi';
import { isAllForumDay } from '../hub/hubQuery';

export function InsightsChrome({ children }: { children: ReactNode }) {
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
    activeDashboardId,
    setActiveDashboardId,
    meta,
    setTab,
    activeSection,
    analyticsDashboardAllowlist,
  } = useInsights();

  const HIDDEN_DASH_TILES = new Set(['semantic', 'clubs']);
  const catalog = (meta?.dashboardCatalog ?? []).filter(
    item => !HIDDEN_DASH_TILES.has(item.id)
      && (!analyticsDashboardAllowlist?.length || analyticsDashboardAllowlist.includes(item.id)),
  );
  const dayMeta = meta?.forumDays?.find(d => String(d.day) === forumDay);
  const activeEntry = catalog.find(c => c.id === activeDashboardId);
  const selectedDay = Number(forumDay) || 1;
  const liveDay = meta?.currentForumDay ?? selectedDay;

  return (
    <div className="adm-insights">
      <div className="adm-insights-main">
        <div className="adm-insights-toolbar card adm-forum-block">
          <div className="adm-insights-toolbar-top">
            <div className="adm-insights-section-tabs">
              <button
                type="button"
                className={activeSection === 'analytics' ? 'adm-btn adm-btn-primary' : 'adm-btn adm-btn-secondary'}
                onClick={() => setTab('analytics')}
              >
                Дашборды
              </button>
              <button
                type="button"
                className={activeSection === 'exports' ? 'adm-btn adm-btn-primary' : 'adm-btn adm-btn-secondary'}
                onClick={() => setTab('exports')}
              >
                Выгрузки
              </button>
            </div>
            <div className="adm-insights-meta-line">
              <span className="adm-insights-day-badge">Срез: день {selectedDay}</span>
              {liveDay !== selectedDay ? (
                <span className="adm-muted" style={{ fontSize: 12 }}>сейчас идёт день {liveDay}</span>
              ) : null}
              {dayMeta?.calendarDate ? (
                <span className="adm-muted" style={{ fontSize: 12 }}>{dayMeta.calendarDate}</span>
              ) : null}
            </div>
          </div>

          {activeSection === 'analytics' && catalog.length > 0 && (
            <nav className="adm-insights-tabs" aria-label="Дашборды">
              {catalog.map(item => {
                const short = DASH_TAB_SHORT[item.id] ?? item.label.replace(/^\d+\.\s*/, '');
                const on = activeDashboardId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={item.label}
                    aria-label={item.label}
                    aria-current={on ? 'page' : undefined}
                    className={on ? 'adm-insights-tab on' : 'adm-insights-tab'}
                    onClick={() => setActiveDashboardId(item.id as DashboardId)}
                  >
                    <span className="adm-insights-tab-label">{short}</span>
                  </button>
                );
              })}
            </nav>
          )}

          <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            <label className="adm-insights-filter">
              Дата
              <select className="adm-input" value={isAllForumDay(forumDay) ? 'all' : forumDay} onChange={e => setForumDay(e.target.value)}>
                <option value="all">Весь форум</option>
                {(meta?.forumDays ?? [1, 2, 3, 4, 5, 6, 7, 8].map(d => ({ day: d, label: `D${d}`, calendarDate: null }))).map(d => (
                  <option key={d.day} value={String(d.day)}>
                    {d.label}{d.calendarDate ? ` · ${d.calendarDate}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="adm-insights-filter">
              Направление
              <select className="adm-input" value={direction} onChange={e => setDirection(e.target.value)}>
                <option value="">Все</option>
                {(meta?.filters?.directions ?? []).map(d => (
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
          {activeSection === 'analytics' && activeEntry && (
            <p className="adm-muted" style={{ fontSize: 12, marginTop: 8 }}>
              {activeEntry.label}
              {dayMeta?.calendarDate ? ` · календарь: ${dayMeta.calendarDate}` : ''}
              {' · '}доступен с {activeEntry.availabilityTier}
              {(meta?.currentForumDay ?? 1) < activeEntry.minForumDay && (
                <span className="adm-insights-warn"> · данных может быть мало до D{activeEntry.minForumDay}</span>
              )}
            </p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
