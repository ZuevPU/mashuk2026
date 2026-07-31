export type DashboardCatalogEntry = {
  id: string;
  label: string;
  minForumDay: number;
  availabilityTier: 'D1' | 'D2' | 'D3-D4';
  path?: string;
  kind?: 'api' | 'static';
  requiresV2?: boolean;
};

export const DASHBOARD_CATALOG: DashboardCatalogEntry[] = [
  { id: 'overview', label: '1. Главный дашборд', minForumDay: 1, availabilityTier: 'D1', path: '/analytics/dashboards', kind: 'api' },
  { id: 'pulse', label: '2. Пульс форума', minForumDay: 1, availabilityTier: 'D1', path: '/analytics/dashboards/pulse', kind: 'api' },
  { id: 'portrait', label: '3. Портрет и движение', minForumDay: 1, availabilityTier: 'D1', path: '/analytics/dashboards/portrait', kind: 'api' },
  { id: 'program', label: '4. Образовательная программа', minForumDay: 1, availabilityTier: 'D1', path: '/analytics/dashboards/program', kind: 'api' },
  { id: 'activity', label: '5. Активность и рейтинг', minForumDay: 2, availabilityTier: 'D2', path: '/analytics/dashboards/activity', kind: 'api' },
  { id: 'piggybank', label: '6. Копилка', minForumDay: 1, availabilityTier: 'D1', path: '/analytics/dashboards/piggybank', kind: 'api' },
  { id: 'semantic', label: '7. Смысловая аналитика', minForumDay: 3, availabilityTier: 'D3-D4', path: '/analytics/dashboards/semantic', kind: 'api', requiresV2: true },
  { id: 'clubs', label: '8. Материал для клубов', minForumDay: 3, availabilityTier: 'D3-D4', path: '/analytics/dashboards/clubs', kind: 'api' },
  { id: 'departure', label: '9. Заезд → выезд', minForumDay: 3, availabilityTier: 'D3-D4', path: '/analytics/departure-portrait', kind: 'api' },
  { id: 'roles', label: '10. Роли 2×3', minForumDay: 2, availabilityTier: 'D2', kind: 'static' },
];

export function forumDayCalendarDate(startDate: Date | string | null | undefined, forumDay: number): string | null {
  if (!startDate || forumDay < 1) return null;
  const base = startDate instanceof Date ? startDate : new Date(startDate);
  if (Number.isNaN(base.getTime())) return null;
  const d = new Date(base);
  d.setDate(d.getDate() + (forumDay - 1));
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}
