import { pgTable, serial, varchar, text, timestamp, jsonb, integer, boolean } from 'drizzle-orm/pg-core';
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
    totalDays: integer('total_days').default(4),
    recommendationThreshold: integer('recommendation_threshold').default(1),
    sectionsVisibility: jsonb('sections_visibility').default({}),
    updatedAt: timestamp('updated_at').defaultNow(),
});
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
    createdAt: timestamp('created_at').defaultNow(),
});
export const participants = pgTable('participants', {
    id: serial('id').primaryKey(),
    vkId: integer('vk_id').unique().notNull(),
    firstName: varchar('first_name', { length: 255 }),
    lastName: varchar('last_name', { length: 255 }),
    directionId: integer('direction_id').references(() => directions.id),
    direction: varchar('direction', { length: 255 }),
    interests: jsonb('interests'),
    pathPoints: integer('path_points').default(0),
    experiencePoints: integer('experience_points').default(0),
    createdAt: timestamp('created_at').defaultNow(),
});
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
});
export const questionOptions = pgTable('question_options', {
    id: serial('id').primaryKey(),
    questionId: integer('question_id').references(() => questions.id).notNull(),
    label: varchar('label', { length: 255 }).notNull(),
    value: varchar('value', { length: 255 }).notNull(),
    sortOrder: integer('sort_order').default(0),
});
export const answers = pgTable('answers', {
    id: serial('id').primaryKey(),
    participantId: integer('participant_id').references(() => participants.id).notNull(),
    questionId: integer('question_id').references(() => questions.id).notNull(),
    answerData: jsonb('answer_data'), // text or JSON for multiple choice
    pointsAwarded: integer('points_awarded').default(0),
    wordCount: integer('word_count').default(0),
    createdAt: timestamp('created_at').defaultNow(),
});
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
});
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
});
export const eventAttendance = pgTable('event_attendance', {
    id: serial('id').primaryKey(),
    participantId: integer('participant_id').references(() => participants.id).notNull(),
    eventId: integer('event_id').references(() => events.id).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});
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
    createdAt: timestamp('created_at').defaultNow(),
});
export const taskSubmissions = pgTable('task_submissions', {
    id: serial('id').primaryKey(),
    participantId: integer('participant_id').references(() => participants.id).notNull(),
    taskId: integer('task_id').references(() => tasks.id).notNull(),
    answerText: text('answer_text'),
    photoUrl: varchar('photo_url', { length: 500 }),
    status: varchar('status', { length: 50 }).default('pending'), // pending, approved, rejected
    submittedAt: timestamp('submitted_at').defaultNow(),
    checkedAt: timestamp('checked_at'),
    pointsAwarded: integer('points_awarded').default(0),
    moderatorComment: text('moderator_comment'),
});
export const piggybank = pgTable('piggybank', {
    id: serial('id').primaryKey(),
    participantId: integer('participant_id').references(() => participants.id).notNull(),
    tag: varchar('tag', { length: 100 }),
    source: varchar('source', { length: 100 }),
    text: text('text').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});
export const exchangeQuestions = pgTable('exchange_questions', {
    id: serial('id').primaryKey(),
    participantId: integer('participant_id').references(() => participants.id).notNull(),
    text: text('text').notNull(),
    audience: varchar('audience', { length: 100 }),
    moderationStatus: varchar('moderation_status', { length: 50 }).default('pending'),
    createdAt: timestamp('created_at').defaultNow(),
});
export const exchangeAnswers = pgTable('exchange_answers', {
    id: serial('id').primaryKey(),
    questionId: integer('question_id').references(() => exchangeQuestions.id).notNull(),
    participantId: integer('participant_id').references(() => participants.id).notNull(),
    text: text('text').notNull(),
    reactions: jsonb('reactions'),
    createdAt: timestamp('created_at').defaultNow(),
});
export const pointsLog = pgTable('points_log', {
    id: serial('id').primaryKey(),
    participantId: integer('participant_id').references(() => participants.id).notNull(),
    actionType: varchar('action_type', { length: 100 }),
    points: integer('points').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});
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
});
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
