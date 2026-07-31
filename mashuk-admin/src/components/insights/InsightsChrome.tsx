import type { ReactNode } from 'react';
import { useInsights, type DashboardId } from './InsightsContext';

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

  const catalog = (meta?.dashboardCatalog ?? []).filter(
    item => !analyticsDashboardAllowlist?.length || analyticsDashboardAllowlist.includes(item.id),
  );
  const dayMeta = meta?.forumDays?.find(d => String(d.day) === forumDay);
  const activeEntry = catalog.find(c => c.id === activeDashboardId);

  return (
    <div className="adm-insights">
      <aside className="adm-insights-sidebar">
        <p className="adm-insights-sidebar-title">Дашборды</p>
        <nav className="adm-insights-nav">
          {catalog.map(item => (
            <button
              key={item.id}
              type="button"
              className={
                activeSection === 'analytics' && activeDashboardId === item.id
                  ? 'adm-insights-nav-item on'
                  : 'adm-insights-nav-item'
              }
              onClick={() => setActiveDashboardId(item.id as DashboardId)}
            >
              <span>{item.label}</span>
              <span className="adm-insights-tier">с {item.availabilityTier}</span>
            </button>
          ))}
        </nav>
      </aside>
      <div className="adm-insights-main">
        <div className="adm-insights-toolbar card adm-forum-block">
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
          <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            <label className="adm-insights-filter">
              Дата
              <select className="adm-input" value={forumDay} onChange={e => setForumDay(e.target.value)}>
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
              {dayMeta?.calendarDate ? `Календарь: ${dayMeta.calendarDate} · ` : ''}
              Доступен с {activeEntry.availabilityTier}
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
