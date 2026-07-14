import { pgTable, serial, varchar, text, timestamp, jsonb, integer, boolean, index } from 'drizzle-orm/pg-core';
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
  createdAt: timestamp('created_at').defaultNow(),
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
  /** Матрица диагностики: { optionToRole: RoleKey[6][4], questions?: [...] } */
  roleDiagnosticsConfig: jsonb('role_diagnostics_config'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const participantGroups = pgTable('participant_groups', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  directionId: integer('direction_id'),
  capacity: integer('capacity').default(30),
  createdAt: timestamp('created_at').defaultNow(),
});

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
  dayNumber: integer('day_number').notNull().unique(),
  isPublished: boolean('is_published').default(false),
  publishedAt: timestamp('published_at'),
});

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
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

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
  dayNumber: integer('day_number').notNull().unique(),
  title: varchar('title', { length: 255 }).notNull(),
  text: text('text'),
  keyQuestion: text('key_question'),
});

export const adminUsers = pgTable('admin_users', {
  id: serial('id').primaryKey(),
  login: varchar('login', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).default('admin'),
  vkId: integer('vk_id'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export const participants = pgTable('participants', {
  id: serial('id').primaryKey(),
  vkId: integer('vk_id').unique().notNull(),
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  age: integer('age'),
  workplace: varchar('workplace', { length: 500 }),
  position: varchar('position', { length: 500 }),
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
  hideFromLeaderboard: boolean('hide_from_leaderboard').default(false),
  qrToken: varchar('qr_token', { length: 64 }),
  groupId: integer('group_id'),
  groupName: varchar('group_name', { length: 255 }),
  consentPdVersion: integer('consent_pd_version'),
  consentAnalyticsVersion: integer('consent_analytics_version'),
  pushOptOut: jsonb('push_opt_out').default({}),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('participants_direction_id_idx').on(table.directionId),
]);

export const pedagogicalRoles = pgTable('pedagogical_roles', {
  id: serial('id').primaryKey(),
  roleKey: varchar('role_key', { length: 100 }).unique().notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  quadrant: varchar('quadrant', { length: 255 }),
  essence: text('essence'),
  inClass: text('in_class'),
  keywords: text('keywords'),
  sortOrder: integer('sort_order').default(0),
});

export const dayExperiments = pgTable('day_experiments', {
  id: serial('id').primaryKey(),
  dayNumber: integer('day_number').notNull(),
  roleKey: varchar('role_key', { length: 100 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body'),
  hint: text('hint'),
}, (table) => [
  index('day_experiments_day_role_idx').on(table.dayNumber, table.roleKey),
]);

export const participantDayState = pgTable('participant_day_state', {
  id: serial('id').primaryKey(),
  participantId: integer('participant_id').references(() => participants.id).notNull(),
  dayNumber: integer('day_number').notNull(),
  activeRoleKey: varchar('active_role_key', { length: 100 }),
  tomorrowRoleKey: varchar('tomorrow_role_key', { length: 100 }),
  experimentStatus: varchar('experiment_status', { length: 50 }).default('none'),
  eveningRatings: jsonb('evening_ratings'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('participant_day_state_participant_idx').on(table.participantId),
  index('participant_day_state_unique_idx').on(table.participantId, table.dayNumber),
]);

export const questions = pgTable('questions', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  text: text('text').notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  block: varchar('block', { length: 100 }),
  status: varchar('status', { length: 50 }).default('draft'),
  publishTime: timestamp('publish_time'),
  closeTime: timestamp('close_time'),
  points: integer('points').default(0),
  timePoint: varchar('time_point', { length: 50 }),
  dayNumber: integer('day_number'),
  direction: varchar('direction', { length: 255 }),
  allowRetry: boolean('allow_retry').default(false),
  pushOnPublish: boolean('push_on_publish').default(false),
  parentQuestionId: integer('parent_question_id'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('questions_day_number_idx').on(table.dayNumber),
  index('questions_status_idx').on(table.status),
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
  wordCount: integer('word_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('answers_participant_id_idx').on(table.participantId),
  index('answers_question_id_idx').on(table.questionId),
]);

export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
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
  qrToken: varchar('qr_token', { length: 64 }),
}, (table) => [
  index('events_day_number_idx').on(table.dayNumber),
  index('events_is_published_idx').on(table.isPublished),
]);

export const materials = pgTable('materials', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').references(() => events.id),
  dayNumber: integer('day_number'),
  speakerName: varchar('speaker_name', { length: 255 }),
  speakerInitials: varchar('speaker_initials', { length: 10 }),
  eventTitle: varchar('event_title', { length: 255 }),
  type: varchar('type', { length: 50 }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  url: varchar('url', { length: 500 }),
  isNew: boolean('is_new').default(false),
  direction: varchar('direction', { length: 255 }),
  tags: jsonb('tags'),
  isGeneral: boolean('is_general').default(false),
  includeInAnalytics: boolean('include_in_analytics').default(true),
}, (table) => [
  index('materials_event_id_idx').on(table.eventId),
  index('materials_day_number_idx').on(table.dayNumber),
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
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  points: integer('points').default(0),
  deadline: timestamp('deadline'),
  publishTime: timestamp('publish_time'),
  dayNumber: integer('day_number'),
  category: varchar('category', { length: 100 }),
  executionType: varchar('execution_type', { length: 50 }).default('once'),
  answerType: varchar('answer_type', { length: 50 }),
  autoConfirm: boolean('auto_confirm').default(true),
  pushOnPublish: boolean('push_on_publish').default(false),
  hideUntilPublish: boolean('hide_until_publish').default(true),
  allowRetry: boolean('allow_retry').default(true),
  direction: varchar('direction', { length: 255 }),
  qrToken: varchar('qr_token', { length: 64 }),
  confirmationType: varchar('confirmation_type', { length: 50 }).default('text_photo'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('tasks_day_number_idx').on(table.dayNumber),
]);

export const taskSubmissions = pgTable('task_submissions', {
  id: serial('id').primaryKey(),
  participantId: integer('participant_id').references(() => participants.id).notNull(),
  taskId: integer('task_id').references(() => tasks.id).notNull(),
  answerText: text('answer_text'),
  photoUrl: varchar('photo_url', { length: 500 }),
  postUrl: varchar('post_url', { length: 500 }),
  teamMemberIds: jsonb('team_member_ids'),
  status: varchar('status', { length: 50 }).default('pending'),
  submittedAt: timestamp('submitted_at').defaultNow(),
  checkedAt: timestamp('checked_at'),
  pointsAwarded: integer('points_awarded').default(0),
  moderatorComment: text('moderator_comment'),
}, (table) => [
  index('task_submissions_participant_id_idx').on(table.participantId),
  index('task_submissions_task_id_idx').on(table.taskId),
  index('task_submissions_status_idx').on(table.status),
]);

export const piggybank = pgTable('piggybank', {
  id: serial('id').primaryKey(),
  participantId: integer('participant_id').references(() => participants.id).notNull(),
  tag: varchar('tag', { length: 100 }),
  source: varchar('source', { length: 100 }),
  text: text('text').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('piggybank_participant_id_idx').on(table.participantId),
]);

export const exchangeQuestions = pgTable('exchange_questions', {
  id: serial('id').primaryKey(),
  participantId: integer('participant_id').references(() => participants.id).notNull(),
  text: text('text').notNull(),
  audience: varchar('audience', { length: 100 }),
  moderationStatus: varchar('moderation_status', { length: 50 }).default('pending'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('exchange_questions_participant_id_idx').on(table.participantId),
  index('exchange_questions_moderation_status_idx').on(table.moderationStatus),
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
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('points_log_participant_id_idx').on(table.participantId),
]);

export const levelsConfig = pgTable('levels_config', {
  id: serial('id').primaryKey(),
  actionType: varchar('action_type', { length: 100 }).notNull(),
  pointsPerUnit: integer('points_per_unit'),
  maxAccruals: integer('max_accruals'),
  levelThresholds: jsonb('level_thresholds'),
});

export const pushLog = pgTable('push_log', {
  id: serial('id').primaryKey(),
  triggerType: varchar('trigger_type', { length: 100 }),
  participantId: integer('participant_id'), // if specific user
  text: text('text').notNull(),
  sentAt: timestamp('sent_at'),
  deliveryStatus: varchar('delivery_status', { length: 50 }),
}, (table) => [
  index('push_log_participant_id_idx').on(table.participantId),
]);

export const dailyStats = pgTable('daily_stats', {
  id: serial('id').primaryKey(),
  direction: varchar('direction', { length: 255 }),
  statDate: timestamp('stat_date'),
  timePoint: varchar('time_point', { length: 50 }),
  avgEnergy: integer('avg_energy'),
  emotionsDistribution: jsonb('emotions_distribution'),
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
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('admin_actions_log_admin_idx').on(table.adminId, table.createdAt),
  index('admin_actions_log_critical_idx').on(table.isCritical, table.createdAt),
]);

export const medals = pgTable('medals', {
  id: serial('id').primaryKey(),
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
  way: varchar('way', { length: 50 }).default('auto'),
}, (table) => [
  index('user_medals_participant_idx').on(table.participantId),
]);

export const pdfWhitelist = pgTable('pdf_whitelist', {
  id: serial('id').primaryKey(),
  participantId: integer('participant_id').notNull().unique(),
  enabled: boolean('enabled').default(true),
  notes: text('notes'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const clubMatches = pgTable('club_matches', {
  id: serial('id').primaryKey(),
  participantId: integer('participant_id'),
  answerId: integer('answer_id'),
  clubId: varchar('club_id', { length: 100 }),
  similarity: integer('similarity'),
  verdict: text('verdict'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const delayedSurvey = pgTable('delayed_survey', {
  id: serial('id').primaryKey(),
  participantId: integer('participant_id').notNull(),
  scheduledAt: timestamp('scheduled_at'),
  sentAt: timestamp('sent_at'),
  status: varchar('status', { length: 50 }).default('pending'),
  payload: jsonb('payload'),
});
