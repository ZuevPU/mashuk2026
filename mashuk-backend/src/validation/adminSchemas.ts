import { z } from 'zod';

const optionalString = z.string().optional().nullable();
const optionalBool = z.boolean().optional();

export const eventCreateSchema = z.object({
  title: z.string().min(1, 'title required'),
  description: optionalString,
  place: optionalString,
  dayNumber: z.coerce.number().int().positive().optional(),
  timeSlot: optionalString,
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  isPublished: optionalBool,
  dayPublished: optionalBool,
  pushReminder: optionalBool,
  blockType: optionalString,
  isKeyBlock: optionalBool,
  parentEventId: z.coerce.number().int().positive().optional().nullable(),
  hasSubSessions: optionalBool,
  audienceType: z.enum(['all', 'direction']).optional(),
  audienceDirectionId: z.coerce.number().int().positive().optional().nullable(),
  speakerIds: z.array(z.coerce.number().int()).optional(),
  sortOrder: z.coerce.number().int().optional(),
}).strict();

export const eventUpdateSchema = eventCreateSchema.partial();

const confirmationMethodEnum = z.enum(['qr', 'photo', 'link', 'volunteer', 'team', 'moderator']);

export const taskCreateSchema = z.object({
  title: z.string().min(1, 'title required'),
  description: optionalString,
  descriptionHtml: optionalString,
  category: optionalString,
  categoryId: z.coerce.number().int().positive().optional().nullable(),
  points: z.coerce.number().int().min(0).optional(),
  dayNumber: z.coerce.number().int().positive().optional(),
  dayNumbers: z.array(z.coerce.number().int().min(1).max(8)).optional(),
  answerType: z.enum(['text', 'photo', 'text_and_photo']).optional(),
  confirmationType: z.enum(['photo', 'post_url', 'qr', 'auto', 'team', 'text_photo']).optional(),
  confirmationMethods: z.array(confirmationMethodEnum).optional(),
  scopeType: z.enum(['individual', 'team']).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  isHidden: optionalBool,
  requiresModeration: optionalBool,
  medalTask: optionalBool,
  nomination: z.enum(['sport', 'creative', 'media', 'education', 'culture', 'volunteer', 'team', 'general']).optional().nullable(),
  programPlaceId: z.coerce.number().int().positive().optional().nullable(),
  iconKey: optionalString,
  allowRetry: optionalBool,
  autoConfirm: optionalBool,
  pushOnPublish: optionalBool,
  hideUntilPublish: optionalBool,
  publishTime: z.coerce.date().optional().nullable(),
  deadline: z.coerce.date().optional().nullable(),
  availableFrom: z.coerce.date().optional().nullable(),
  availableTo: z.coerce.date().optional().nullable(),
  applicationDeadline: z.coerce.date().optional().nullable(),
  executionType: z.enum(['once', 'daily', 'repeatable', 'multiple']).optional(),
  dailyRepeatLimit: z.coerce.number().int().min(1).optional(),
  qrValidFrom: z.coerce.date().optional().nullable(),
  qrValidTo: z.coerce.date().optional().nullable(),
  teamConfirmHours: z.coerce.number().int().min(1).optional(),
}).strict();

export const taskUpdateSchema = taskCreateSchema.partial();

export const questionCreateSchema = z.object({
  title: z.string().min(1, 'title required'),
  text: z.union([z.string(), z.null()]).optional().transform(v => (v == null || v === '' ? undefined : v)),
  type: z.enum(['open', 'checkin', 'choice', 'multi', 'dependent']).optional(),
  answerType: z.enum(['text', 'scale_5', 'scale_10', 'choice', 'multi', 'emotion', 'dependent']).optional(),
  questionKind: z.enum(['input', 'diagnostic', 'state_check', 'after_blocks', 'day_summary', 'extra']).optional(),
  subtitle: optionalString,
  block: optionalString,
  reflectionKind: z.enum(['state_check', 'after_event', 'evening_summary', 'point_a', 'point_b']).optional().nullable(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  timePoint: optionalString,
  dayNumber: z.coerce.number().int().positive().optional(),
  dayNumbers: z.array(z.coerce.number().int().min(1).max(8)).optional(),
  points: z.coerce.number().int().min(0).optional(),
  sortOrder: z.coerce.number().int().optional(),
  audienceType: z.enum(['all', 'direction', 'group', 'role']).optional(),
  audienceDirectionId: z.coerce.number().int().positive().optional().nullable(),
  audienceGroupId: z.coerce.number().int().positive().optional().nullable(),
  audienceRole: optionalString,
  isRequired: optionalBool,
  isHidden: optionalBool,
  allowRetry: optionalBool,
  pushOnPublish: optionalBool,
  pushTemplate: optionalString,
  publishTime: z.coerce.date().optional().nullable(),
  closeTime: z.coerce.date().optional().nullable(),
}).strict();

export const questionUpdateSchema = questionCreateSchema.partial();

export const copyQuestionsSelectedSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1),
  targetDay: z.coerce.number().int().min(1).max(8),
  overwrite: z.boolean().optional().default(false),
}).strict();

export const copyQuestionToDaySchema = z.object({
  targetDay: z.coerce.number().int().min(1).max(8),
}).strict();

export const reorderQuestionOptionsSchema = z.object({
  optionIds: z.array(z.coerce.number().int().positive()).min(1),
}).strict();

export const copyQuestionsDaySchema = z.object({
  fromDay: z.coerce.number().int().min(1).max(8),
  toDay: z.coerce.number().int().min(1).max(8),
  overwrite: z.boolean().optional().default(false),
}).strict();

export const seedTouchpointsSchema = z.object({
  days: z.array(z.coerce.number().int().min(1).max(7)).optional(),
  overwrite: z.boolean().optional().default(false),
}).strict();

export const ADMIN_USER_ROLES = [
  'admin', 'director', 'analyst', 'curator', 'moderator', 'volunteer', 'organizer',
] as const;

export const adminUserCreateSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(ADMIN_USER_ROLES).optional(),
  directionId: z.coerce.number().int().positive().optional().nullable(),
  login: z.string().min(1).optional(),
}).refine(d => d.email || d.login, { message: 'email or login required' });

export const adminUserUpdateSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(ADMIN_USER_ROLES).optional(),
  directionId: z.coerce.number().int().positive().optional().nullable(),
  isActive: z.boolean().optional(),
}).strict();

const pushNotificationTypeEnum = z.enum([
  'state_check', 'reminder', 'day_summary', 'program', 'task', 'org',
]);
const pushSendModeEnum = z.enum(['now', 'scheduled', 'trigger']);
const pushAudienceEnum = z.enum(['all', 'direction', 'group', 'ids', 'rule']);
const pushStatusEnum = z.enum(['draft', 'queued', 'sent', 'cancelled']);

export const pushNotificationCreateSchema = z.object({
  internalName: optionalString,
  pushTitle: optionalString,
  body: z.string().min(1).max(2000),
  icon: optionalString,
  imageUrl: optionalString,
  notificationType: pushNotificationTypeEnum.optional(),
  status: pushStatusEnum.optional(),
  programDay: z.coerce.number().int().min(1).max(8).optional().nullable(),
  programDate: optionalString,
  publishAt: optionalString,
  visibleUntil: optionalString,
  sendMode: pushSendModeEnum.optional(),
  triggerConfig: z.record(z.unknown()).optional(),
  audienceType: pushAudienceEnum.optional(),
  audiencePayload: z.record(z.unknown()).optional(),
  templateId: z.coerce.number().int().positive().optional().nullable(),
}).strict();

export const pushNotificationUpdateSchema = pushNotificationCreateSchema.partial();

export const pushTemplatePresetSchema = z.object({
  key: z.string().min(1).max(100),
  title: optionalString,
  pushTitle: optionalString,
  body: z.string().min(1),
  icon: optionalString,
  notificationType: pushNotificationTypeEnum.optional(),
  presetCategory: z.enum(['morning', 'state_check', 'question_of_day', 'reminder', 'urgent']).optional(),
  kind: z.enum(['preset', 'auto_slot']).optional(),
  slotKey: optionalString,
  isActive: optionalBool,
}).strict();

export const medalCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: optionalString,
  conditionRule: optionalString,
  iconUrl: optionalString,
  category: optionalString,
  level: z.enum(['bronze', 'silver', 'gold']).optional(),
  awardType: z.enum(['manual', 'auto']).optional(),
  visibility: z.enum(['open', 'hidden']).optional(),
  isActive: optionalBool,
}).strict();

export const medalUpdateSchema = medalCreateSchema.partial();

const adviceStatusEnum = z.enum(['draft', 'published']);

export const dayAdviceUpsertSchema = z.object({
  dayNumber: z.coerce.number().int().min(1).max(7),
  roleKey: z.string().min(1),
  title: z.string().min(1).max(60),
  body: z.string().max(500).optional().nullable(),
  hint: z.string().optional().nullable(),
  status: adviceStatusEnum.optional(),
}).strict();

export const pedagogicalRoleUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  quadrant: z.string().max(255).optional().nullable(),
  essence: z.string().optional().nullable(),
  inClass: z.string().optional().nullable(),
  keywords: z.string().optional().nullable(),
  iconKey: z.string().max(32).optional().nullable(),
  sortOrder: z.coerce.number().int().optional(),
}).strict();

export const dayAdviceImportSchema = z.object({
  csv: z.string().min(1),
}).strict();

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const msg = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    return { ok: false, error: msg };
  }
  return { ok: true, data: result.data };
}
