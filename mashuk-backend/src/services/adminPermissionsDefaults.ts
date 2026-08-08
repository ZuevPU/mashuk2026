export const ADMIN_ROLES = [
  'admin',
  'director',
  'analyst',
  'curator',
  'moderator',
  'volunteer',
  'organizer',
  'gamification',
] as const;

export type AdminRoleKey = (typeof ADMIN_ROLES)[number] | 'superadmin';

export const ADMIN_SECTIONS = [
  'participants',
  'directions',
  'onboarding',
  'forum',
  'events',
  'knowledge',
  'tasks',
  'questions',
  'moderation',
  'data',
  'levels',
  'analytics',
  'exports',
  'push',
  'admins',
  'journal',
  'medals',
  'piggybank',
  'recommendation-tags',
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'confirm' | 'export';

export type SectionPermissions = {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canConfirm: boolean;
  canExport: boolean;
};

export type RoleSectionRow = {
  role: string;
  section: AdminSection;
} & SectionPermissions;

const allTrue = (): SectionPermissions => ({
  canRead: true,
  canCreate: true,
  canUpdate: true,
  canDelete: true,
  canConfirm: true,
  canExport: true,
});

const readOnly = (): SectionPermissions => ({
  canRead: true,
  canCreate: false,
  canUpdate: false,
  canDelete: false,
  canConfirm: false,
  canExport: false,
});

const readExport = (): SectionPermissions => ({
  ...readOnly(),
  canExport: true,
});

function row(role: string, section: AdminSection, p: SectionPermissions): RoleSectionRow {
  return { role, section, ...p };
}

/** Default matrix — mirrors legacy roleCan, extended per section. */
export function buildDefaultPermissionRows(): RoleSectionRow[] {
  const rows: RoleSectionRow[] = [];

  for (const section of ADMIN_SECTIONS) {
    rows.push(row('admin', section, allTrue()));
    rows.push(row('superadmin', section, allTrue()));
  }

  for (const section of ADMIN_SECTIONS) {
    rows.push(row('director', section, readExport()));
    rows.push(row('analyst', section, readExport()));
  }

  for (const section of ADMIN_SECTIONS) {
    const base = readOnly();
    if (['moderation', 'tasks', 'participants', 'piggybank'].includes(section)) {
      rows.push(row('moderator', section, {
        ...base,
        canConfirm: true,
        canUpdate: section === 'tasks' || section === 'piggybank',
        canExport: section === 'piggybank',
      }));
    } else if (section === 'levels') {
      rows.push(row('moderator', section, { ...base, canUpdate: true }));
    } else {
      rows.push(row('moderator', section, base));
    }
  }

  for (const section of ADMIN_SECTIONS) {
    const base = readOnly();
    if (section === 'participants') {
      rows.push(row('curator', section, { ...base, canUpdate: true, canConfirm: true }));
    } else if (section === 'moderation' || section === 'tasks') {
      rows.push(row('curator', section, { ...base, canConfirm: true }));
    } else {
      rows.push(row('curator', section, base));
    }
  }

  for (const section of ADMIN_SECTIONS) {
    const base = readOnly();
    if (section === 'moderation' || section === 'tasks') {
      rows.push(row('volunteer', section, { ...base, canConfirm: true }));
    } else {
      rows.push(row('volunteer', section, base));
    }
  }

  for (const section of ADMIN_SECTIONS) {
    const base = readOnly();
    if (['events', 'forum', 'knowledge'].includes(section)) {
      rows.push(row('organizer', section, { ...base, canCreate: true, canUpdate: true }));
    } else if (section === 'recommendation-tags') {
      // Теги правятся из «Программы» — без update/delete организатор может только создавать
      rows.push(row('organizer', section, {
        ...base,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      }));
    } else {
      rows.push(row('organizer', section, base));
    }
  }

  // admins + journal: only admin/superadmin (already set); tighten others
  for (const role of ['director', 'analyst', 'moderator', 'curator', 'volunteer', 'organizer']) {
    for (const section of ['admins', 'journal'] as AdminSection[]) {
      const idx = rows.findIndex(r => r.role === role && r.section === section);
      if (idx >= 0) rows[idx] = row(role, section, readOnly());
    }
  }

  const gamificationDeny = (): SectionPermissions => ({
    canRead: false,
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    canConfirm: false,
    canExport: false,
  });

  for (const section of ADMIN_SECTIONS) {
    rows.push(row('gamification', section, gamificationDeny()));
  }

  const gamificationOverrides: Partial<Record<AdminSection, SectionPermissions>> = {
    tasks: {
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canConfirm: false,
      canExport: false,
    },
    moderation: {
      canRead: true,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canConfirm: true,
      canExport: false,
    },
    medals: {
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: false,
      canConfirm: false,
      canExport: false,
    },
    levels: {
      canRead: true,
      canCreate: false,
      canUpdate: true,
      canDelete: false,
      canConfirm: false,
      canExport: false,
    },
    participants: {
      canRead: true,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canConfirm: true,
      canExport: false,
    },
    exports: {
      canRead: true,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canConfirm: false,
      canExport: true,
    },
    analytics: {
      canRead: true,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canConfirm: false,
      canExport: false,
    },
    data: {
      canRead: true,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canConfirm: false,
      canExport: false,
    },
  };

  for (const [section, perms] of Object.entries(gamificationOverrides) as [AdminSection, SectionPermissions][]) {
    const idx = rows.findIndex(r => r.role === 'gamification' && r.section === section);
    if (idx >= 0) rows[idx] = row('gamification', section, perms);
  }

  return rows;
}

export const SECTION_LABELS: Record<AdminSection, string> = {
  participants: 'Участники',
  directions: 'Направления',
  onboarding: 'Регистрация',
  forum: 'Форум',
  events: 'Программа',
  knowledge: 'База знаний',
  tasks: 'Задания',
  questions: 'Вопросы',
  moderation: 'Модерация',
  data: 'Данные',
  levels: 'Рейтинг',
  analytics: 'Аналитика',
  exports: 'Выгрузки',
  push: 'Уведомления',
  admins: 'Пользователи админки',
  journal: 'Журнал изменений',
  medals: 'Медали',
  piggybank: 'Копилка',
  'recommendation-tags': 'Теги рекомендаций',
};

export const ROLE_LABELS: Record<string, string> = {
  admin: 'администратор',
  superadmin: 'суперадмин',
  director: 'дирекция',
  analyst: 'аналитик',
  curator: 'куратор',
  moderator: 'модератор',
  volunteer: 'волонтёр',
  organizer: 'организатор',
  gamification: 'игропатика',
};

export const PERMISSION_ACTION_LABELS: Record<PermissionAction, string> = {
  read: 'чтение',
  create: 'создание',
  update: 'редактирование',
  delete: 'удаление',
  confirm: 'подтверждение',
  export: 'выгрузка',
};
