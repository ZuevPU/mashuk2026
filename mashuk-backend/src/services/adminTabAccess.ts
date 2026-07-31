import type { AdminSection, SectionPermissions } from './adminPermissionsDefaults.js';
import { ADMIN_SECTIONS } from './adminPermissionsDefaults.js';

/** Admin UI tabs (mirrors mashuk-admin/src/tabs.ts + rating hub). */
export const ADMIN_UI_TABS = [
  'rating',
  'participants',
  'directions',
  'onboarding',
  'forum',
  'shifts',
  'events',
  'speakers',
  'knowledge',
  'tasks',
  'questions',
  'moderation',
  'piggybank',
  'data',
  'levels',
  'analytics',
  'exports',
  'push',
  'recommendation-tags',
  'admins',
  'journal',
  'medals',
] as const;

export type AdminUiTab = (typeof ADMIN_UI_TABS)[number];

const TAB_PRIMARY_SECTION: Partial<Record<AdminUiTab, AdminSection>> = {
  participants: 'participants',
  directions: 'directions',
  onboarding: 'onboarding',
  forum: 'forum',
  shifts: 'forum',
  events: 'events',
  speakers: 'events',
  knowledge: 'knowledge',
  tasks: 'tasks',
  questions: 'questions',
  moderation: 'moderation',
  piggybank: 'piggybank',
  data: 'data',
  levels: 'levels',
  analytics: 'analytics',
  exports: 'exports',
  push: 'push',
  'recommendation-tags': 'recommendation-tags',
  admins: 'admins',
  journal: 'journal',
  medals: 'medals',
};

function sectionReadable(permissions: Record<AdminSection, SectionPermissions>, section: AdminSection): boolean {
  return !!permissions[section]?.canRead;
}

export function computeAllowedTabs(
  role: string,
  permissions: Record<AdminSection, SectionPermissions>,
): AdminUiTab[] {
  const tabs: AdminUiTab[] = ['rating'];

  if (role === 'admin' || role === 'superadmin') {
    return [...tabs, ...ADMIN_UI_TABS.filter(t => t !== 'rating')];
  }

  for (const tab of ADMIN_UI_TABS) {
    if (tab === 'rating') continue;
    const section = TAB_PRIMARY_SECTION[tab];
    if (!section) continue;
    if (sectionReadable(permissions, section)) tabs.push(tab);
  }

  return tabs;
}

export function defaultTabForRole(role: string, allowedTabs: AdminUiTab[]): AdminUiTab {
  if (allowedTabs.length === 0) return 'tasks';
  if (role === 'gamification') {
    if (allowedTabs.includes('rating')) return 'rating';
    if (allowedTabs.includes('tasks')) return 'tasks';
  }
  if (allowedTabs.includes('participants')) return 'participants';
  return allowedTabs[0]!;
}

export function allowedSectionsList(permissions: Record<AdminSection, SectionPermissions>): AdminSection[] {
  return ADMIN_SECTIONS.filter(s => sectionReadable(permissions, s));
}
