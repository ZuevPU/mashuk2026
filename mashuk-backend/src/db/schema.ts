import { pgTable, serial, varchar, text, timestamp, jsonb, integer, boolean, index, uniqueIndex, smallint, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const directions = pgTable('directions', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  isHidden: boolean('is_hidden').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const thematicTags = pgTable('thematic_tags', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  slug: varchar('slug', { length: 255 }),
  description: text('description'),
  color: varchar('color', { length: 32 }),
  isActive: boolean('is_active').default(true),
  sortOrder: integer('sort_order').default(0),
  applicationTypes: jsonb('application_types').default(['events', 'interests']),
  createdAt: timestamp('created_at').defaultNow(),
});

export const programPlaces = pgTable('program_places', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const taskCategories = pgTable('task_categories', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  iconKey: varchar('icon_key', { length: 64 }),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const shifts = pgTable('shifts', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  status: varchar('status', { length: 32 }).default('draft').notNull(),
  isSandbox: boolean('is_sandbox').default(false).notNull(),
  startDate: timestamp('start_date'),
  totalDays: integer('total_days').default(8),
  currentDay: integer('current_day').default(1),
  recommendationThreshold: integer('recommendation_threshold').default(1),
  sectionsVisibility: jsonb('sections_visibility').default({}),
  groupAssignMode: varchar('group_assign_mode', { length: 20 }).default('list'),
  kbUnlockThreshold: integer('kb_unlock_threshold').default(4),
  kbUnlockDisabled: boolean('kb_unlock_disabled').default(false),
  kbPastDaysPolicy: varchar('kb_past_days_policy', { length: 20 }).default('locked'),
  pushBlockTypes: jsonb('push_block_types').default({}),
  pushNightSlotEnabled: boolean('push_night_slot_enabled').default(false),
  teamConfirmHoursDefault: integer('team_confirm_hours_default').default(24),
  eveningQuestionnaireConfig: jsonb('evening_questionnaire_config'),
  eveningQuestionnaireByDay: jsonb('evening_questionnaire_by_day'),
  answerConfirmation: jsonb('answer_confirmation'),
  /** Обмен опытом: { maxQuestionsTotal (= в день), maxAnswersForPoints } */
  exchangeLimits: jsonb('exchange_limits'),
  profileProgressWeights: jsonb('profile_progress_weights'),
  shiftLabel: varchar('shift_label', { length: 100 }),
  pdfTemplate: jsonb('pdf_template'),
  recommendationTemplates: jsonb('recommendation_templates'),
  programRecEmptyNoMatchText: text('program_rec_empty_no_match_text'),
  programRecEmptyNoEventsText: text('program_rec_empty_no_events_text'),
  roleDiagnosticsConfig: jsonb('role_diagnostics_config'),
  leaderboardScopes: jsonb('leaderboard_scopes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const forumSettings = pgTable('forum_settings', {
  id: serial('id').primaryKey(),
  currentDay: integer('current_day').default(1),
  totalDays: integer('total_days').default(8),
  recommendationThreshold: integer('recommendation_threshold').default(1),
  sectionsVisibility: jsonb('sections_visibility').default({}),
  startDate: timestamp('start_date'),
  groupAssignMode: varchar('group_assign_mode', { length: 20 }).default('list'),
  kbUnlockThreshold: integer('kb_unlock_threshold').default(4),
  kbUnlockDisabled: boolean('kb_unlock_disabled').default(false),
  kbPastDaysPolicy: varchar('kb_past_days_policy', { length: 20 }).default('locked'),
  pushBlockTypes: jsonb('push_block_types').default({}),
  pushNightSlotEnabled: boolean('push_night_slot_enabled').default(false),
  teamConfirmHoursDefault: integer('team_confirm_hours_default').default(24),
  eveningQuestionnaireConfig: jsonb('evening_questionnaire_config'),
  eveningQuestionnaireByDay: jsonb('evening_questionnaire_by_day'),
  answerConfirmation: jsonb('answer_confirmation'),
  /** Обмен опытом: { maxQuestionsTotal (= в день), maxAnswersForPoints } */
  exchangeLimits: jsonb('exchange_limits'),
  profileProgressWeights: jsonb('profile_progress_weights'),
  shiftLabel: varchar('shift_label', { length: 100 }),
  pdfTemplate: jsonb('pdf_template'),
  recommendationTemplates: jsonb('recommendation_templates'),
  programRecEmptyNoMatchText: text('program_rec_empty_no_match_text'),
  programRecEmptyNoEventsText: text('program_rec_empty_no_events_text'),
  /** Онбординг: goalQuestions[{text,type,options}], interestGroups, interestMin/Max, questions, optionToRole */
  roleDiagnosticsConfig: jsonb('role_diagnostics_config'),
  leaderboardScopes: jsonb('leaderboard_scopes').default({
    total: true,
    path: true,
    experience: true,
    day: true,
    shift: true,
  }),
  activeShiftId: integer('active_shift_id'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const participantGroups = pgTable('participant_groups', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  directionId: integer('direction_id'),
  capacity: integer('capacity').default(30),
  shiftId: integer('shift_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('participant_groups_shift_id_idx').on(table.shiftId),
]);

export const consentTexts = pgTable('consent_texts', {
  id: serial('id').primaryKey(),
  kind: varchar('kind', { length: 50 }).notNull(),
  version: integer('version').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull(),
  isActive: boolean('is_active').default(false),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('consent_texts_kind_active_idx').on(table.kind, table.isActive),
]);

export const orgThreads = pgTable('org_threads', {
  id: serial('id').primaryKey(),
  participantId: integer('participant_id').notNull(),
  subject: varchar('subject', { length: 255 }),
  status: varchar('status', { length: 50 }).default('waiting'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('org_threads_participant_idx').on(table.participantId),
  index('org_threads_status_idx').on(table.status),
]);

export const orgMessages = pgTable('org_messages', {
  id: serial('id').primaryKey(),
  threadId: integer('thread_id').notNull(),
  senderType: varchar('sender_type', { length: 50 }).notNull(),
  senderId: integer('sender_id'),
  text: text('text').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('org_messages_thread_idx').on(table.threadId),
]);

export const scheduleDays = pgTable('schedule_days', {
  id: serial('id').primaryKey(),
  dayNumber: integer('day_number').notNull(),
  shiftId: integer('shift_id').notNull(),
  isPublished: boolean('is_published').default(false),
  publishedAt: timestamp('published_at'),
  calendarDate: timestamp('calendar_date'),
  displayLabel: varchar('display_label', { length: 255 }),
  shiftNumber: integer('shift_number'),
}, (table) => [
  uniqueIndex('schedule_days_shift_day_unique').on(table.shiftId, table.dayNumber),
]);

export const programBlockTypes = pgTable('program_block_types', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const materialTypes = pgTable('material_types', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  sortOrder: integer('sort_order').default(0),
});

export const programSpeakers = pgTable('program_speakers', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  credentials: text('credentials'),
  initials: varchar('initials', { length: 10 }),
  createdAt: timestamp('created_at').defaultNow(),
});

export const kbDayUnlocks = pgTable('kb_day_unlocks', {
  id: serial('id').primaryKey(),
  participantId: integer('participant_id').notNull(),
  dayNumber: integer('day_number').notNull(),
  unlockedByAdminId: integer('unlocked_by_admin_id'),
  unlockedAt: timestamp('unlocked_at').defaultNow(),
}, (table) => [
  index('kb_day_unlocks_participant_idx').on(table.participantId),
]);

export const scheduleDayVersions = pgTable('schedule_day_versions', {
  id: serial('id').primaryKey(),
  dayNumber: integer('day_number').notNull(),
  version: integer('version').notNull(),
  eventsSnapshot: jsonb('events_snapshot').notNull(),
  publishedByAdminId: integer('published_by_admin_id'),
  publishedAt: timestamp('published_at').defaultNow(),
}, (table) => [
  index('schedule_day_versions_day_idx').on(table.dayNumber),
]);

export const pushTemplates = pgTable('push_templates', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  title: varchar('title', { length: 255 }),
  body: text('body').notNull(),
  slotKey: varchar('slot_key', { length: 50 }),
  kind: varchar('kind', { length: 32 }).default('auto_slot'),
  presetCategory: varchar('preset_category', { length: 50 }),
  pushTitle: varchar('push_title', { length: 255 }),
  icon: varchar('icon', { length: 32 }),
  notificationType: varchar('notification_type', { length: 50 }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const adminPushNotifications = pgTable('admin_push_notifications', {
  id: serial('id').primaryKey(),
  shiftId: integer('shift_id'),
  internalName: varchar('internal_name', { length: 255 }),
  pushTitle: varchar('push_title', { length: 255 }),
  body: text('body').notNull(),
  icon: varchar('icon', { length: 32 }),
  imageUrl: text('image_url'),
  notificationType: varchar('notification_type', { length: 50 }).default('reminder'),
  status: varchar('status', { length: 32 }).default('draft').notNull(),
  programDay: integer('program_day'),
  programDate: timestamp('program_date'),
  publishAt: timestamp('publish_at'),
  visibleUntil: timestamp('visible_until'),
  sendMode: varchar('send_mode', { length: 32 }).default('now'),
  triggerConfig: jsonb('trigger_config').default({}),
  triggerFiredAt: timestamp('trigger_fired_at'),
  audienceType: varchar('audience_type', { length: 32 }).default('all'),
  audiencePayload: jsonb('audience_payload').default({}),
  templateId: integer('template_id'),
  createdByAdminId: integer('created_by_admin_id'),
  sentAt: timestamp('sent_at'),
  deliveredCount: integer('delivered_count').default(0),
  openedCount: integer('opened_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('admin_push_notifications_shift_id_idx').on(table.shiftId),
  index('admin_push_notifications_status_idx').on(table.status),
  index('admin_push_notifications_publish_at_idx').on(table.publishAt),
]);

export const participantPushDeliveries = pgTable('participant_push_deliveries', {
  id: serial('id').primaryKey(),
  notificationId: integer('notification_id').notNull(),
  participantId: integer('participant_id').notNull(),
  personalizedBody: text('personalized_body').notNull(),
  pushTitle: varchar('push_title', { length: 255 }),
  icon: varchar('icon', { length: 32 }),
  imageUrl: text('image_url'),
  visibleUntil: timestamp('visible_until'),
  vkDeliveryStatus: varchar('vk_delivery_status', { length: 255 }),
  openedAt: timestamp('opened_at'),
  dismissedAt: timestamp('dismissed_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('participant_push_deliveries_participant_idx').on(table.participantId),
  index('participant_push_deliveries_notification_idx').on(table.notificationId),
]);

export const pushTriggerFires = pgTable('push_trigger_fires', {
  id: serial('id').primaryKey(),
  notificationId: integer('notification_id').notNull(),
  fireKey: varchar('fire_key', { length: 255 }).notNull(),
  firedAt: timestamp('fired_at').defaultNow(),
}, (table) => [
  index('push_trigger_fires_notification_idx').on(table.notificationId),
]);

export const pushQueue = pgTable('push_queue', {
  id: serial('id').primaryKey(),
  templateId: integer('template_id'),
  text: text('text').notNull(),
  scheduledAt: timestamp('scheduled_at').notNull(),
  status: varchar('status', { length: 50 }).default('pending'),
  target: varchar('target', { length: 50 }).default('all'),
  participantIds: jsonb('participant_ids'),
  sentAt: timestamp('sent_at'),
  createdByAdminId: integer('created_by_admin_id'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('push_queue_status_scheduled_idx').on(table.status, table.scheduledAt),
]);

export const dayFocus = pgTable('day_focus', {
  id: serial('id').primaryKey(),
  dayNumber: integer('day_number').notNull(),
  shiftId: integer('shift_id').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  text: text('text'),
  textHtml: text('text_html'),
  keyQuestion: text('key_question'),
}, (table) => [
  uniqueIndex('day_focus_shift_day_unique').on(table.shiftId, table.dayNumber),
]);

/** Editorial home-screen notice (compact plate + modal), one published per shift. */
export const homeNotices = pgTable('home_notices', {
  id: serial('id').primaryKey(),
  shiftId: integer('shift_id').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull().default(''),
  ctaUrl: text('cta_url'),
  ctaLabel: varchar('cta_label', { length: 120 }),
  imageUrls: jsonb('image_urls').$type<string[]>().default([]),
  status: varchar('status', { length: 32 }).notNull().default('draft'),
  publishedAt: timestamp('published_at'),
  visibleFrom: timestamp('visible_from'),
  visibleUntil: timestamp('visible_until'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('home_notices_shift_id_idx').on(table.shiftId),
  index('home_notices_status_idx').on(table.status),
]);

export const adminUsers = pgTable('admin_users', {
  id: serial('id').primaryKey(),
  login: varchar('login', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).default('admin'),
  fullName: varchar('full_name', { length: 255 }),
  email: varchar('email', { length: 255 }),
  directionId: integer('direction_id'),
  lastLoginAt: timestamp('last_login_at'),
  vkId: integer('vk_id'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export const adminRolePermissions = pgTable('admin_role_permissions', {
  id: serial('id').primaryKey(),
  role: varchar('role', { length: 50 }).notNull(),
  section: varchar('section', { length: 64 }).notNull(),
  canRead: boolean('can_read').default(false).notNull(),
  canCreate: boolean('can_create').default(false).notNull(),
  canUpdate: boolean('can_update').default(false).notNull(),
  canDelete: boolean('can_delete').default(false).notNull(),
  canConfirm: boolean('can_confirm').default(false).notNull(),
  canExport: boolean('can_export').default(false).notNull(),
}, (table) => [
  index('admin_role_permissions_role_idx').on(table.role),
]);

export const participants = pgTable('participants', {
  id: serial('id').primaryKey(),
  vkId: integer('vk_id').notNull(),
  shiftId: integer('shift_id').notNull(),
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  age: integer('age'),
  workplace: varchar('workplace', { length: 500 }),
  position: varchar('position', { length: 500 }),
  region: varchar('region', { length: 255 }),
  consentPd: boolean('consent_pd').default(false),
  consentAnalytics: boolean('consent_analytics').default(false),
  directionId: integer('direction_id').references(() => directions.id),
  direction: varchar('direction', { length: 255 }),
  interests: jsonb('interests'),
  pedagogicalRole: varchar('pedagogical_role', { length: 100 }),
  goalAnswers: jsonb('goal_answers'),
  pointBAnswers: jsonb('point_b_answers'),
  strongRole: varchar('strong_role', { length: 100 }),
  growthRole: varchar('growth_role', { length: 100 }),
  nextExperiment: text('next_experiment'),
  outcomesEdited: jsonb('outcomes_edited'),
  nextStepsEdited: jsonb('next_steps_edited'),
  roleAnswers: jsonb('role_answers'),
  onboardingCompletedAt: timestamp('onboarding_completed_at'),
  pathPoints: integer('path_points').default(0),
  experiencePoints: integer('experience_points').default(0),
  bonusPoints: integer('bonus_points').default(0),
  forumPoints: integer('forum_points').default(0),
  hideFromLeaderboard: boolean('hide_from_leaderboard').default(false),
  qrToken: varchar('qr_token', { length: 64 }),
  groupId: integer('group_id'),
  groupName: varchar('group_name', { length: 255 }),
  consentPdVersion: integer('consent_pd_version'),
  consentAnalyticsVersion: integer('consent_analytics_version'),
  pushOptOut: jsonb('push_opt_out').default({}),
  /** Участник удалил себя из программы через настройки профиля; строка и связанные данные сохраняются */
  selfDeletedAt: timestamp('self_deleted_at'),
  lastActiveAt: timestamp('last_active_at'),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  avatarSyncedAt: timestamp('avatar_synced_at'),
  isBlocked: boolean('is_blocked').default(false),
  blockedAt: timestamp('blocked_at'),
  blockReason: varchar('block_reason', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('participants_direction_id_idx').on(table.directionId),
  index('participants_shift_id_idx').on(table.shiftId),
  uniqueIndex('participants_vk_id_shift_id_unique').on(table.vkId, table.shiftId),
]);

export const pedagogicalRoles = pgTable('pedagogical_roles', {
  id: serial('id').primaryKey(),
  roleKey: varchar('role_key', { length: 100 }).unique().notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  quadrant: varchar('quadrant', { length: 255 }),
  essence: text('essence'),
  inClass: text('in_class'),
  keywords: text('keywords'),
  iconKey: varchar('icon_key', { length: 32 }),
  sortOrder: integer('sort_order').default(0),
});

export const dayExperiments = pgTable('day_experiments', {
  id: serial('id').primaryKey(),
  shiftId: integer('shift_id').notNull(),
  dayNumber: integer('day_number').notNull(),
  roleKey: varchar('role_key', { length: 100 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body'),
  hint: text('hint'),
  title2: varchar('title2', { length: 255 }),
  body2: text('body2'),
  hint2: text('hint2'),
  title3: varchar('title3', { length: 255 }),
  body3: text('body3'),
  hint3: text('hint3'),
  status: varchar('status', { length: 32 }).default('published').notNull(),
}, (table) => [
  index('day_experiments_day_role_idx').on(table.dayNumber, table.roleKey),
  uniqueIndex('day_experiments_shift_day_role_unique').on(table.shiftId, table.dayNumber, table.roleKey),
]);

export const participantDayState = pgTable('participant_day_state', {
  id: serial('id').primaryKey(),
  participantId: integer('participant_id').references(() => participants.id).notNull(),
  dayNumber: integer('day_number').notNull(),
  activeRoleKey: varchar('active_role_key', { length: 100 }),
  tomorrowRoleKey: varchar('tomorrow_role_key', { length: 100 }),
  experimentStatus: varchar('experiment_status', { length: 50 }).default('none'),
  eveningRatings: jsonb('evening_ratings'),
  eveningDraft: jsonb('evening_draft'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('participant_day_state_participant_idx').on(table.participantId),
  index('participant_day_state_unique_idx').on(table.participantId, table.dayNumber),
]);

export const questions = pgTable('questions', {
  id: serial('id').primaryKey(),
  shiftId: integer('shift_id').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  text: text('text').notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  answerType: varchar('answer_type', { length: 50 }),
  questionKind: varchar('question_kind', { length: 50 }),
  block: varchar('block', { length: 100 }),
  reflectionKind: varchar('reflection_kind', { length: 50 }),
  subtitle: varchar('subtitle', { length: 255 }),
  status: varchar('status', { length: 50 }).default('draft'),
  publishTime: timestamp('publish_time'),
  closeTime: timestamp('close_time'),
  points: integer('points').default(0),
  timePoint: varchar('time_point', { length: 50 }),
  dayNumber: integer('day_number'),
  dayNumbers: jsonb('day_numbers').$type<number[]>().default([]),
  direction: varchar('direction', { length: 255 }),
  audienceType: varchar('audience_type', { length: 32 }).default('all'),
  audienceDirectionId: integer('audience_direction_id'),
  audienceGroupId: integer('audience_group_id'),
  audienceRole: varchar('audience_role', { length: 100 }),
  isRequired: boolean('is_required').default(false),
  isHidden: boolean('is_hidden').default(false),
  sortOrder: integer('sort_order').default(0),
  allowRetry: boolean('allow_retry').default(false),
  pushOnPublish: boolean('push_on_publish').default(false),
  pushTemplate: text('push_template'),
  parentQuestionId: integer('parent_question_id'),
  allowOther: boolean('allow_other').default(false),
  /** { questionId: number, optionValues: string[] } — show if parent answer matches */
  showWhen: jsonb('show_when').$type<{ questionId: number; optionValues: string[] } | null>(),
  /** IDs of program events (blocks) that this question belongs to (for questionKind=after_blocks) */
  linkedEventIds: jsonb('linked_event_ids').$type<number[]>().default([]),
  /** Practices voting config (questionKind=practices_vote) */
  practicesConfig: jsonb('practices_config'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('questions_shift_id_idx').on(table.shiftId),
  index('questions_day_number_idx').on(table.dayNumber),
  index('questions_status_idx').on(table.status),
  index('questions_question_kind_idx').on(table.questionKind),
  index('questions_audience_type_idx').on(table.audienceType),
]);

export const questionOptions = pgTable('question_options', {
  id: serial('id').primaryKey(),
  questionId: integer('question_id').references(() => questions.id).notNull(),
  label: varchar('label', { length: 255 }).notNull(),
  value: varchar('value', { length: 255 }).notNull(),
  sortOrder: integer('sort_order').default(0),
}, (table) => [
  index('question_options_question_id_idx').on(table.questionId),
]);

export const answers = pgTable('answers', {
  id: serial('id').primaryKey(),
  participantId: integer('participant_id').references(() => participants.id).notNull(),
  questionId: integer('question_id').references(() => questions.id).notNull(),
  answerData: jsonb('answer_data'),
  questionTextSnapshot: text('question_text_snapshot'),
  pointsAwarded: integer('points_awarded').default(0),
  /** Primary award row in points_log (for revoke-by-question). */
  pointsLogId: integer('points_log_id'),
  wordCount: integer('word_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('answers_participant_id_idx').on(table.participantId),
  index('answers_question_id_idx').on(table.questionId),
  index('answers_points_log_id_idx').on(table.pointsLogId),
]);

export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  shiftId: integer('shift_id').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  descriptionHtml: text('description_html'),
  place: varchar('place', { length: 255 }),
  dayNumber: integer('day_number'),
  eventDate: timestamp('event_date'),
  startTime: timestamp('start_time'),
  endTime: timestamp('end_time'),
  timeSlot: varchar('time_slot', { length: 20 }),
  tags: jsonb('tags'),
  isPublished: boolean('is_published').default(true),
  dayPublished: boolean('day_published').default(false),
  pushReminder: boolean('push_reminder').default(true),
  /** When true: event stays in Program, but is omitted from Home «Сейчас/Скоро». */
  hideFromHome: boolean('hide_from_home').default(false),
  blockType: varchar('block_type', { length: 50 }).default('session'),
  isKeyBlock: boolean('is_key_block').default(false),
  qrToken: varchar('qr_token', { length: 64 }),
  parentEventId: integer('parent_event_id'),
  hasSubSessions: boolean('has_sub_sessions').default(false),
  audienceType: varchar('audience_type', { length: 32 }).default('all'),
  audienceDirectionId: integer('audience_direction_id'),
  /** Empty / null = all directions. Non-empty = only these direction ids. */
  audienceDirectionIds: jsonb('audience_direction_ids').default([]),
  speakerIds: jsonb('speaker_ids').default([]),
  sortOrder: integer('sort_order').default(0),
}, (table) => [
  index('events_shift_id_idx').on(table.shiftId),
  index('events_day_number_idx').on(table.dayNumber),
  index('events_is_published_idx').on(table.isPublished),
  index('events_parent_event_id_idx').on(table.parentEventId),
]);

export const materials = pgTable('materials', {
  id: serial('id').primaryKey(),
  shiftId: integer('shift_id').notNull(),
  eventId: integer('event_id').references(() => events.id),
  dayNumber: integer('day_number'),
  speakerName: varchar('speaker_name', { length: 255 }),
  speakerIds: jsonb('speaker_ids').default([]),
  speakerInitials: varchar('speaker_initials', { length: 10 }),
  eventTitle: varchar('event_title', { length: 255 }),
  type: varchar('type', { length: 50 }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  url: varchar('url', { length: 500 }),
  isNew: boolean('is_new').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  direction: varchar('direction', { length: 255 }),
  tags: jsonb('tags'),
  isGeneral: boolean('is_general').default(false),
  includeInAnalytics: boolean('include_in_analytics').default(true), // deprecated: use status published for analytics
  status: varchar('status', { length: 50 }).default('published'),
  fileUrl: varchar('file_url', { length: 500 }),
  kbUnlockMode: varchar('kb_unlock_mode', { length: 32 }).default('touchpoints').notNull(),
  kbUnlockMinTouchpoints: integer('kb_unlock_min_touchpoints'),
  /** thematic | lessons_important | open_lessons */
  kbSection: varchar('kb_section', { length: 40 }),
  /** open | practices | reverse — только для open_lessons */
  kbSubsection: varchar('kb_subsection', { length: 40 }),
  /** Тема для группировки нескольких типов артефактов подряд */
  topicTitle: varchar('topic_title', { length: 255 }),
  sortOrder: integer('sort_order').default(0),
}, (table) => [
  index('materials_shift_id_idx').on(table.shiftId),
  index('materials_event_id_idx').on(table.eventId),
  index('materials_day_number_idx').on(table.dayNumber),
  index('materials_kb_section_idx').on(table.kbSection),
  index('materials_topic_title_idx').on(table.topicTitle),
]);

export const eventAttendance = pgTable('event_attendance', {
  id: serial('id').primaryKey(),
  participantId: integer('participant_id').references(() => participants.id).notNull(),
  eventId: integer('event_id').references(() => events.id).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('event_attendance_participant_id_idx').on(table.participantId),
  index('event_attendance_event_id_idx').on(table.eventId),
]);

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  shiftId: integer('shift_id').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  shortDescription: text('short_description'),
  description: text('description'),
  descriptionHtml: text('description_html'),
  points: integer('points').default(0),
  medalTask: boolean('medal_task').default(false),
  medalId: integer('medal_id'),
  medalCount: integer('medal_count').default(1),
  eventTime: timestamp('event_time'),
  deadline: timestamp('deadline'),
  publishTime: timestamp('publish_time'),
  dayNumber: integer('day_number'),
  dayNumbers: jsonb('day_numbers').$type<number[]>().default([]),
  category: varchar('category', { length: 100 }),
  categoryId: integer('category_id').references(() => taskCategories.id),
  status: varchar('status', { length: 32 }).default('draft'),
  isHidden: boolean('is_hidden').default(false),
  scopeType: varchar('scope_type', { length: 32 }).default('individual'),
  confirmationMethods: jsonb('confirmation_methods').$type<string[]>().default([]),
  executionType: varchar('execution_type', { length: 50 }).default('once'),
  answerType: varchar('answer_type', { length: 50 }),
  answerOptions: jsonb('answer_options').$type<Array<{ label: string; value: string }>>().default([]),
  autoConfirm: boolean('auto_confirm').default(true),
  pushOnPublish: boolean('push_on_publish').default(false),
  hideUntilPublish: boolean('hide_until_publish').default(true),
  allowRetry: boolean('allow_retry').default(true),
  direction: varchar('direction', { length: 255 }),
  nomination: varchar('nomination', { length: 64 }),
  programPlaceId: integer('program_place_id').references(() => programPlaces.id),
  iconKey: varchar('icon_key', { length: 64 }),
  qrToken: varchar('qr_token', { length: 64 }),
  confirmationType: varchar('confirmation_type', { length: 50 }).default('text_photo'),
  dailyRepeatLimit: integer('daily_repeat_limit').default(1),
  qrValidFrom: timestamp('qr_valid_from'),
  qrValidTo: timestamp('qr_valid_to'),
  availableFrom: timestamp('available_from'),
  availableTo: timestamp('available_to'),
  applicationDeadline: timestamp('application_deadline'),
  teamConfirmHours: integer('team_confirm_hours').default(24),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('tasks_shift_id_idx').on(table.shiftId),
  index('tasks_day_number_idx').on(table.dayNumber),
  index('tasks_status_idx').on(table.status),
  index('tasks_category_id_idx').on(table.categoryId),
  // Partial unique on qr_token is enforced in SQL migration 0056 (WHERE NOT NULL)
]);

export const taskSubmissions = pgTable('task_submissions', {
  id: serial('id').primaryKey(),
  participantId: integer('participant_id').references(() => participants.id).notNull(),
  taskId: integer('task_id').references(() => tasks.id).notNull(),
  answerText: text('answer_text'),
  photoUrl: varchar('photo_url', { length: 500 }),
  postUrl: varchar('post_url', { length: 500 }),
  postUrlNormalized: varchar('post_url_normalized', { length: 500 }),
  teamMemberIds: jsonb('team_member_ids'),
  status: varchar('status', { length: 50 }).default('pending'),
  proofType: varchar('proof_type', { length: 32 }),
  verificationType: varchar('verification_type', { length: 32 }),
  lifecycleStage: varchar('lifecycle_stage', { length: 32 }),
  submittedAt: timestamp('submitted_at').defaultNow(),
  checkedAt: timestamp('checked_at'),
  verifiedAt: timestamp('verified_at'),
  verifiedByAdminId: integer('verified_by_admin_id'),
  verifiedByVolunteerVkId: integer('verified_by_volunteer_vk_id'),
  pointsAwarded: integer('points_awarded').default(0),
  pointsLogId: integer('points_log_id'),
  userMedalId: integer('user_medal_id'),
  moderatorComment: text('moderator_comment'),
}, (table) => [
  index('task_submissions_participant_id_idx').on(table.participantId),
  index('task_submissions_task_id_idx').on(table.taskId),
  index('task_submissions_status_idx').on(table.status),
  index('task_submissions_lifecycle_stage_idx').on(table.lifecycleStage),
]);

export const taskQrScans = pgTable('task_qr_scans', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').references(() => tasks.id, { onDelete: 'cascade' }).notNull(),
  participantId: integer('participant_id').references(() => participants.id, { onDelete: 'cascade' }).notNull(),
  vkUserId: integer('vk_user_id'),
  deviceKey: varchar('device_key', { length: 64 }).notNull(),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  outcome: varchar('outcome', { length: 32 }).notNull(),
  submissionId: integer('submission_id').references(() => taskSubmissions.id, { onDelete: 'set null' }),
  forumDay: smallint('forum_day'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('task_qr_scans_task_id_idx').on(table.taskId),
  index('task_qr_scans_participant_id_idx').on(table.participantId),
  index('task_qr_scans_device_key_idx').on(table.deviceKey),
  index('task_qr_scans_outcome_idx').on(table.outcome),
  // Lookup index for success rows — migration 0063 (unique removed to allow repeatable QR)
]);

export const taskTeamConfirmations = pgTable('task_team_confirmations', {
  id: serial('id').primaryKey(),
  submissionId: integer('submission_id').references(() => taskSubmissions.id, { onDelete: 'cascade' }).notNull(),
  participantId: integer('participant_id').references(() => participants.id).notNull(),
  status: varchar('status', { length: 20 }).default('pending'),
  respondedAt: timestamp('responded_at'),
}, (table) => [
  index('task_team_confirm_sub_idx').on(table.submissionId),
  index('task_team_confirm_part_idx').on(table.participantId),
]);

export const piggybank = pgTable('piggybank', {
  id: serial('id').primaryKey(),
  participantId: integer('participant_id').references(() => participants.id).notNull(),
  tag: varchar('tag', { length: 100 }),
  tags: jsonb('tags').notNull().default([]),
  source: varchar('source', { length: 100 }),
  text: text('text').notNull(),
  forumDay: smallint('forum_day'),
  isHidden: boolean('is_hidden').default(false),
  isViolation: boolean('is_violation').default(false),
  /** Linked points_log row awarded on create; revoked on admin soft-delete. */
  pointsLogId: integer('points_log_id'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('piggybank_participant_id_idx').on(table.participantId),
]);

export const exchangeCategories = pgTable('exchange_categories', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 32 }).notNull().unique(),
  title: varchar('title', { length: 64 }).notNull(),
  emoji: varchar('emoji', { length: 8 }),
  hint: text('hint'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').default(true).notNull(),
  isSystem: boolean('is_system').default(false).notNull(),
});

export const exchangeTags = pgTable('exchange_tags', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 32 }).notNull().unique(),
  title: varchar('title', { length: 64 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
});

export const exchangeQuestions = pgTable('exchange_questions', {
  id: serial('id').primaryKey(),
  participantId: integer('participant_id').references(() => participants.id).notNull(),
  text: text('text').notNull(),
  audience: varchar('audience', { length: 100 }),
  moderationStatus: varchar('moderation_status', { length: 50 }).default('pending'),
  moderatorComment: text('moderator_comment'),
  categoryId: integer('category_id').references(() => exchangeCategories.id),
  classifiedBy: varchar('classified_by', { length: 16 }).default('user'),
  categoryConfirmed: boolean('category_confirmed').default(false).notNull(),
  reactions: jsonb('reactions').default({}),
  duplicateOfId: integer('duplicate_of_id'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('exchange_questions_participant_id_idx').on(table.participantId),
  index('exchange_questions_moderation_status_idx').on(table.moderationStatus),
  index('exchange_questions_category_mod_created_idx').on(
    table.categoryId,
    table.moderationStatus,
    table.createdAt,
  ),
]);

export const exchangeQuestionTags = pgTable('exchange_question_tags', {
  questionId: integer('question_id').references(() => exchangeQuestions.id).notNull(),
  tagId: integer('tag_id').references(() => exchangeTags.id).notNull(),
}, (table) => [
  index('exchange_question_tags_question_idx').on(table.questionId),
  index('exchange_question_tags_tag_idx').on(table.tagId),
]);

export const exchangeAnswers = pgTable('exchange_answers', {
  id: serial('id').primaryKey(),
  questionId: integer('question_id').references(() => exchangeQuestions.id).notNull(),
  participantId: integer('participant_id').references(() => participants.id).notNull(),
  text: text('text').notNull(),
  parentAnswerId: integer('parent_answer_id'),
  reactions: jsonb('reactions'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('exchange_answers_question_id_idx').on(table.questionId),
  index('exchange_answers_participant_id_idx').on(table.participantId),
]);

export const pointsLog = pgTable('points_log', {
  id: serial('id').primaryKey(),
  participantId: integer('participant_id').references(() => participants.id).notNull(),
  actionType: varchar('action_type', { length: 100 }),
  points: integer('points').notNull(),
  forumDay: smallint('forum_day'),
  revokedAt: timestamp('revoked_at'),
  revokeReason: text('revoke_reason'),
  relatedLogId: integer('related_log_id'),
  submissionId: integer('submission_id'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('points_log_participant_id_idx').on(table.participantId),
  index('points_log_submission_id_idx').on(table.submissionId),
]);

export const levelsConfig = pgTable('levels_config', {
  id: serial('id').primaryKey(),
  shiftId: integer('shift_id'),
  actionType: varchar('action_type', { length: 100 }).notNull(),
  pointsPerUnit: integer('points_per_unit'),
  maxAccruals: integer('max_accruals'),
  levelThresholds: jsonb('level_thresholds'),
  track: varchar('track', { length: 20 }),
  displayName: varchar('display_name', { length: 255 }),
});

export const ratingRecalcRuns = pgTable('rating_recalc_runs', {
  id: serial('id').primaryKey(),
  adminId: integer('admin_id'),
  startedAt: timestamp('started_at').defaultNow(),
  finishedAt: timestamp('finished_at'),
  participantsProcessed: integer('participants_processed').default(0),
  status: varchar('status', { length: 50 }).default('running'),
  error: text('error'),
});

export const ratingBonusRules = pgTable('rating_bonus_rules', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 100 }).notNull().unique(),
  enabled: boolean('enabled').default(true),
  params: jsonb('params'),
  pointsActionType: varchar('points_action_type', { length: 100 }),
});

export const pushLog = pgTable('push_log', {
  id: serial('id').primaryKey(),
  triggerType: varchar('trigger_type', { length: 100 }),
  participantId: integer('participant_id'), // if specific user
  text: text('text').notNull(),
  sentAt: timestamp('sent_at'),
  deliveryStatus: varchar('delivery_status', { length: 255 }),
  notificationId: integer('notification_id'),
  deliveryId: integer('delivery_id'),
}, (table) => [
  index('push_log_participant_id_idx').on(table.participantId),
]);

export const analyticsSnapshots = pgTable('analytics_snapshots', {
  id: serial('id').primaryKey(),
  snapshotKey: varchar('snapshot_key', { length: 128 }).notNull(),
  statDate: timestamp('stat_date').defaultNow(),
  dayNumber: integer('day_number'),
  direction: varchar('direction', { length: 255 }),
  groupName: varchar('group_name', { length: 255 }),
  roleKey: varchar('role_key', { length: 100 }),
  payload: jsonb('payload').notNull(),
}, (table) => [
  index('analytics_snapshots_key_idx').on(table.snapshotKey),
  index('analytics_snapshots_day_idx').on(table.dayNumber),
]);

export const forumClubs = pgTable('forum_clubs', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  embedding: jsonb('embedding'),
  isActive: boolean('is_active').default(true),
  sortOrder: integer('sort_order').default(0),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const dailyStats = pgTable('daily_stats', {
  id: serial('id').primaryKey(),
  direction: varchar('direction', { length: 255 }),
  statDate: timestamp('stat_date'),
  timePoint: varchar('time_point', { length: 50 }),
  avgEnergy: integer('avg_energy'),
  emotionsDistribution: jsonb('emotions_distribution'),
  emotionZonesDistribution: jsonb('emotion_zones_distribution'),
  completionPercent: integer('completion_percent'),
  medianWordCount: integer('median_word_count'),
  redFlag: boolean('red_flag').default(false),
});

export const adminActionsLog = pgTable('admin_actions_log', {
  id: serial('id').primaryKey(),
  adminId: integer('admin_id'),
  adminLogin: varchar('admin_login', { length: 255 }),
  actionType: varchar('action_type', { length: 100 }).notNull(),
  section: varchar('section', { length: 100 }),
  objectId: varchar('object_id', { length: 100 }),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  comment: text('comment'),
  ip: varchar('ip', { length: 100 }),
  isCritical: boolean('is_critical').default(false),
  reviewedAt: timestamp('reviewed_at'),
  reviewedByAdminId: integer('reviewed_by_admin_id'),
  reviewComment: text('review_comment'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('admin_actions_log_admin_idx').on(table.adminId, table.createdAt),
  index('admin_actions_log_critical_idx').on(table.isCritical, table.createdAt),
]);

export const medals = pgTable('medals', {
  id: serial('id').primaryKey(),
  shiftId: integer('shift_id'),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  conditionRule: text('condition_rule'),
  iconUrl: varchar('icon_url', { length: 500 }),
  category: varchar('category', { length: 100 }),
  level: varchar('level', { length: 50 }).default('bronze'),
  awardType: varchar('award_type', { length: 50 }).default('manual'),
  visibility: varchar('visibility', { length: 50 }).default('open'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export const userMedals = pgTable('user_medals', {
  id: serial('id').primaryKey(),
  participantId: integer('participant_id').notNull(),
  medalId: integer('medal_id').notNull(),
  awardedAt: timestamp('awarded_at').defaultNow(),
  awardedByAdminId: integer('awarded_by_admin_id'),
  submissionId: integer('submission_id'),
  way: varchar('way', { length: 50 }).default('auto'),
}, (table) => [
  index('user_medals_participant_idx').on(table.participantId),
  index('user_medals_submission_id_idx').on(table.submissionId),
]);

export const pdfWhitelist = pgTable('pdf_whitelist', {
  id: serial('id').primaryKey(),
  participantId: integer('participant_id').notNull().unique(),
  enabled: boolean('enabled').default(true),
  notes: text('notes'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const participantPdfDrafts = pgTable('participant_pdf_drafts', {
  id: serial('id').primaryKey(),
  participantId: integer('participant_id').notNull().unique(),
  blocks: jsonb('blocks').default({}),
  status: varchar('status', { length: 50 }).default('draft'),
  publishedAt: timestamp('published_at'),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('participant_pdf_drafts_participant_idx').on(table.participantId),
]);

export const clubMatches = pgTable('club_matches', {
  id: serial('id').primaryKey(),
  participantId: integer('participant_id'),
  answerId: integer('answer_id'),
  clubId: varchar('club_id', { length: 100 }),
  similarity: integer('similarity'),
  verdict: text('verdict'),
  sourceType: varchar('source_type', { length: 64 }),
  snippet: text('snippet'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const delayedSurvey = pgTable('delayed_survey', {
  id: serial('id').primaryKey(),
  participantId: integer('participant_id').notNull(),
  scheduledAt: timestamp('scheduled_at'),
  sentAt: timestamp('sent_at'),
  status: varchar('status', { length: 50 }).default('pending'),
  payload: jsonb('payload'),
  response: jsonb('response'),
  completedAt: timestamp('completed_at'),
});

export const exportHistory = pgTable('export_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: integer('admin_id'),
  title: varchar('title', { length: 255 }).notNull().default('Выгрузка'),
  source: varchar('source', { length: 64 }).notNull(),
  params: jsonb('params').notNull().default({}),
  columns: jsonb('columns').notNull().default([]),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  progress: integer('progress').notNull().default(0),
  doneCount: integer('done_count'),
  totalCount: integer('total_count'),
  filePath: text('file_path'),
  fileName: varchar('file_name', { length: 255 }),
  byteSize: integer('byte_size'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'),
}, (table) => [
  index('export_history_admin_created_idx').on(table.adminId, table.createdAt),
  index('export_history_expires_idx').on(table.expiresAt),
  index('export_history_status_created_idx').on(table.status, table.createdAt),
]);
