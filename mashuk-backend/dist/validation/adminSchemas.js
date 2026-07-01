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
}).strict();
export const eventUpdateSchema = eventCreateSchema.partial();
export const taskCreateSchema = z.object({
    title: z.string().min(1, 'title required'),
    description: optionalString,
    category: optionalString,
    points: z.coerce.number().int().min(0).optional(),
    dayNumber: z.coerce.number().int().positive().optional(),
    answerType: z.enum(['text', 'photo', 'text_and_photo']).optional(),
    allowRetry: optionalBool,
    autoConfirm: optionalBool,
    pushOnPublish: optionalBool,
    hideUntilPublish: optionalBool,
    publishTime: z.coerce.date().optional().nullable(),
    deadline: z.coerce.date().optional().nullable(),
}).strict();
export const taskUpdateSchema = taskCreateSchema.partial();
export const questionCreateSchema = z.object({
    title: z.string().min(1, 'title required'),
    text: z.string().min(1, 'text required'),
    type: z.enum(['open', 'checkin', 'choice', 'multi', 'dependent']).optional(),
    block: optionalString,
    status: z.enum(['draft', 'published']).optional(),
    timePoint: optionalString,
    dayNumber: z.coerce.number().int().positive().optional(),
    points: z.coerce.number().int().min(0).optional(),
    allowRetry: optionalBool,
    pushOnPublish: optionalBool,
}).strict();
export const questionUpdateSchema = questionCreateSchema.partial();
export function parseBody(schema, body) {
    const result = schema.safeParse(body);
    if (!result.success) {
        const msg = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
        return { ok: false, error: msg };
    }
    return { ok: true, data: result.data };
}
