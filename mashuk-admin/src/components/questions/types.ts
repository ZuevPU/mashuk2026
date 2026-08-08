export type QuestionKindTab =
  | 'all'
  | 'input'
  | 'diagnostic'
  | 'state_check'
  | 'after_blocks'
  | 'day_summary'
  | 'practices_vote'
  | 'extra'
  | 'exchange'
  | 'org_director';

export const KIND_TABS: { key: QuestionKindTab; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'input', label: 'Входные' },
  { key: 'diagnostic', label: 'Диагностика' },
  { key: 'state_check', label: 'Проверка состояния' },
  { key: 'after_blocks', label: 'После блоков' },
  { key: 'day_summary', label: 'Итоги дня' },
  { key: 'practices_vote', label: 'Практики участников' },
  { key: 'extra', label: 'Дополнительные' },
  { key: 'exchange', label: 'Обмен опытом' },
  { key: 'org_director', label: 'Связь с дирекцией' },
];

export const REFLECTIVE_KINDS = [
  'input',
  'diagnostic',
  'state_check',
  'after_blocks',
  'day_summary',
  'practices_vote',
  'extra',
] as const;

export type ReflectiveKind = typeof REFLECTIVE_KINDS[number];

export const ANSWER_TYPES = [
  { value: 'text', label: 'Свободный текст' },
  { value: 'scale_5', label: 'Шкала 1–5' },
  { value: 'scale_10', label: 'Шкала 1–10' },
  { value: 'choice', label: 'Выбор' },
  { value: 'multi', label: 'Мультивыбор' },
  { value: 'emotion', label: 'Эмоция' },
  { value: 'dependent', label: 'Зависимый' },
  { value: 'practices_vote', label: 'Голосование за практики' },
] as const;

export type PracticeDraftRow = {
  id: string;
  title: string;
  description: string;
  source: 'participant' | 'manual';
  participantId: number | null;
  participantName: string;
  direction: string;
  resultPlace: string;
  resultTime: string;
  sortOrder: number;
};

export type PracticesConfigDraft = {
  preamble: string;
  likesPerParticipant: number;
  resultsPublished: boolean;
  practices: PracticeDraftRow[];
};

export function emptyPracticeRow(): PracticeDraftRow {
  return {
    id: crypto.randomUUID(),
    title: '',
    description: '',
    source: 'manual',
    participantId: null,
    participantName: '',
    direction: '',
    resultPlace: '',
    resultTime: '',
    sortOrder: 0,
  };
}

export function emptyPracticesConfig(): PracticesConfigDraft {
  return {
    preamble: '',
    likesPerParticipant: 3,
    resultsPublished: false,
    practices: [{ ...emptyPracticeRow(), source: 'manual', sortOrder: 0 }],
  };
}

export type AdminQuestion = {
  id: number;
  title: string;
  text?: string;
  subtitle?: string | null;
  type?: string;
  answerType?: string;
  questionKind?: string;
  block?: string | null;
  reflectionKind?: string | null;
  status?: string;
  dayNumber?: number | null;
  dayNumbers?: number[];
  timePoint?: string | null;
  publishTime?: string | null;
  closeTime?: string | null;
  timeWindowLabel?: string | null;
  points?: number;
  sortOrder?: number;
  audienceType?: string;
  audienceDirectionId?: number | null;
  audienceGroupId?: number | null;
  audienceRole?: string | null;
  isRequired?: boolean;
  isHidden?: boolean;
  pushOnPublish?: boolean;
  pushTemplate?: string | null;
  allowRetry?: boolean;
  allowOther?: boolean;
  linkedEventIds?: number[];
  practicesConfig?: PracticesConfigDraft | null;
  showWhen?: { questionId: number; optionValues: string[] } | null;
  answerCount?: number;
  readOnly?: boolean;
  source?: string;
  participantName?: string;
};

export type QuestionOption = { id: number; label: string; value?: string; sortOrder?: number };

export type QuestionDraft = {
  title: string;
  subtitle: string;
  text: string;
  questionKind: ReflectiveKind;
  answerType: string;
  reflectionKind: string;
  timePoint: string;
  block: string;
  dayNumbers: number[];
  publishTime: string;
  closeTime: string;
  audienceType: string;
  audienceDirectionId: string;
  audienceGroupId: string;
  audienceRole: string;
  isRequired: boolean;
  isHidden: boolean;
  points: number;
  sortOrder: number;
  pushOnPublish: boolean;
  pushTemplate: string;
  allowRetry: boolean;
  allowOther: boolean;
  linkedEventIds: number[];
  practicesConfig: PracticesConfigDraft;
  showWhenQuestionId: string;
  showWhenOptionValues: string[];
  status: string;
  options: { label: string; value: string; id?: number }[];
};

export function kindLabel(kind?: string | null): string {
  const tab = KIND_TABS.find(t => t.key === kind);
  return tab?.label ?? kind ?? '—';
}

export function answerTypeLabel(t?: string | null): string {
  return ANSWER_TYPES.find(a => a.value === t)?.label ?? t ?? '—';
}

export function audienceLabel(q: AdminQuestion): string {
  const t = q.audienceType || 'all';
  if (t === 'all') return 'Все';
  if (t === 'direction') return q.audienceDirectionId ? `Направление #${q.audienceDirectionId}` : 'Направление';
  if (t === 'group') return q.audienceGroupId ? `Группа #${q.audienceGroupId}` : 'Группа';
  if (t === 'role') return q.audienceRole ? `Роль: ${q.audienceRole}` : 'Роль';
  return t;
}

export function statusLabel(q: AdminQuestion): string {
  if (q.isHidden) return 'Скрыт';
  if (q.status === 'published') return 'Опубликован';
  if (q.status === 'archived') return 'Архив (версия)';
  return 'Черновик';
}

export function emptyDraft(day: number): QuestionDraft {
  return {
    title: '',
    subtitle: '',
    text: '',
    questionKind: 'extra',
    answerType: 'text',
    reflectionKind: '',
    timePoint: '',
    block: '',
    dayNumbers: [day],
    publishTime: '',
    closeTime: '',
    audienceType: 'all',
    audienceDirectionId: '',
    audienceGroupId: '',
    audienceRole: '',
    isRequired: false,
    isHidden: false,
    points: 10,
    sortOrder: 0,
    pushOnPublish: false,
    pushTemplate: '',
    allowRetry: false,
    allowOther: false,
    linkedEventIds: [],
    practicesConfig: emptyPracticesConfig(),
    showWhenQuestionId: '',
    showWhenOptionValues: [],
    status: 'draft',
    options: [],
  };
}

function practicesFromQuestion(raw: unknown): PracticesConfigDraft {
  const base = emptyPracticesConfig();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  const practices = Array.isArray(o.practices) ? o.practices : [];
  return {
    preamble: String(o.preamble ?? ''),
    likesPerParticipant: Number(o.likesPerParticipant) > 0 ? Number(o.likesPerParticipant) : 3,
    resultsPublished: o.resultsPublished === true,
    practices: practices.length
      ? practices.map((p, i) => {
        const row = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
        return {
          id: typeof row.id === 'string' && row.id ? row.id : crypto.randomUUID(),
          title: String(row.title ?? ''),
          description: String(row.description ?? ''),
          source: row.source === 'manual' ? 'manual' as const : 'participant' as const,
          participantId: row.participantId != null ? Number(row.participantId) : null,
          participantName: String(row.participantName ?? ''),
          direction: String(row.direction ?? ''),
          resultPlace: String(row.resultPlace ?? ''),
          resultTime: String(row.resultTime ?? ''),
          sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : i,
        };
      })
      : base.practices,
  };
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function draftFromQuestion(q: AdminQuestion, options: QuestionOption[] = []): QuestionDraft {
  const days = q.dayNumbers?.length ? q.dayNumbers : (q.dayNumber ? [q.dayNumber] : [1]);
  return {
    title: q.title || '',
    subtitle: q.subtitle || '',
    text: q.text || '',
    questionKind: (REFLECTIVE_KINDS.includes(q.questionKind as ReflectiveKind) ? q.questionKind : 'extra') as ReflectiveKind,
    answerType: q.answerType || (q.questionKind === 'practices_vote' ? 'practices_vote' : 'text'),
    reflectionKind: q.reflectionKind === 'after_blocks'
      ? 'after_event'
      : (q.reflectionKind || (q.questionKind === 'after_blocks' ? 'after_event' : '')),
    timePoint: q.timePoint || '',
    block: q.block || '',
    dayNumbers: [...days],
    publishTime: toLocalInput(q.publishTime),
    closeTime: toLocalInput(q.closeTime),
    audienceType: q.audienceType || 'all',
    audienceDirectionId: q.audienceDirectionId != null ? String(q.audienceDirectionId) : '',
    audienceGroupId: q.audienceGroupId != null ? String(q.audienceGroupId) : '',
    audienceRole: q.audienceRole || '',
    isRequired: !!q.isRequired,
    isHidden: !!q.isHidden,
    points: q.points ?? 10,
    sortOrder: q.sortOrder ?? 0,
    pushOnPublish: !!q.pushOnPublish,
    pushTemplate: q.pushTemplate || '',
    allowRetry: q.questionKind === 'practices_vote' ? true : !!q.allowRetry,
    allowOther: !!q.allowOther,
    linkedEventIds: q.linkedEventIds ?? [],
    practicesConfig: practicesFromQuestion(q.practicesConfig),
    showWhenQuestionId: q.showWhen?.questionId != null ? String(q.showWhen.questionId) : '',
    showWhenOptionValues: q.showWhen?.optionValues ?? [],
    status: q.status || 'draft',
    options: options.map(o => ({ id: o.id, label: o.label, value: o.value || o.label })),
  };
}

const REFLECTION_KINDS = new Set([
  'state_check', 'after_event', 'evening_summary', 'point_a', 'point_b',
]);

/** API accepts only REFLECTION_KINDS — after_blocks is questionKind, not reflectionKind. */
export function normalizeReflectionKindForApi(
  questionKind: string,
  reflectionKind: string | null | undefined,
): string | null {
  const rk = (reflectionKind || '').trim();
  if (rk === 'after_blocks' || (questionKind === 'after_blocks' && (!rk || rk === 'after_blocks'))) {
    return 'after_event';
  }
  if (!rk) return null;
  return REFLECTION_KINDS.has(rk) ? rk : null;
}

export function bodyFromDraft(draft: QuestionDraft, publish: boolean): Record<string, unknown> {
  const isPractices = draft.questionKind === 'practices_vote' || draft.answerType === 'practices_vote';
  const body: Record<string, unknown> = {
    title: draft.title.trim(),
    subtitle: draft.subtitle.trim() || null,
    text: isPractices
      ? (draft.practicesConfig.preamble.trim() || draft.text.trim() || draft.title.trim())
      : (draft.text.trim() || draft.title.trim()),
    questionKind: draft.questionKind,
    answerType: isPractices ? 'practices_vote' : draft.answerType,
    type: isPractices ? 'practices_vote' : undefined,
    reflectionKind: normalizeReflectionKindForApi(draft.questionKind, draft.reflectionKind),
    timePoint: draft.timePoint || null,
    block: draft.block || null,
    dayNumbers: draft.dayNumbers.length ? draft.dayNumbers : [1],
    audienceType: draft.audienceType,
    audienceDirectionId: draft.audienceDirectionId ? Number(draft.audienceDirectionId) : null,
    audienceGroupId: draft.audienceGroupId ? Number(draft.audienceGroupId) : null,
    audienceRole: draft.audienceRole.trim() || null,
    isRequired: draft.isRequired,
    isHidden: draft.isHidden,
    points: Number(draft.points),
    sortOrder: Number(draft.sortOrder),
    pushOnPublish: draft.pushOnPublish,
    pushTemplate: draft.pushTemplate.trim() || null,
    linkedEventIds: draft.linkedEventIds,
    allowRetry: isPractices ? true : draft.allowRetry,
    allowOther: ['choice', 'multi'].includes(draft.answerType) ? draft.allowOther : false,
    showWhen: draft.showWhenQuestionId && draft.showWhenOptionValues.length
      ? {
        questionId: Number(draft.showWhenQuestionId),
        optionValues: draft.showWhenOptionValues,
      }
      : null,
    status: publish ? 'published' : draft.status === 'published' ? 'published' : 'draft',
  };
  if (isPractices) {
    body.practicesConfig = {
      preamble: draft.practicesConfig.preamble.trim(),
      likesPerParticipant: Math.max(1, Number(draft.practicesConfig.likesPerParticipant) || 3),
      resultsPublished: !!draft.practicesConfig.resultsPublished,
      practices: draft.practicesConfig.practices.map((p, i) => ({
        id: p.id || crypto.randomUUID(),
        title: p.title.trim(),
        description: p.description.trim(),
        source: p.source,
        participantId: p.source === 'participant' ? p.participantId : null,
        participantName: p.participantName.trim(),
        direction: p.direction.trim(),
        resultPlace: p.resultPlace.trim() || null,
        resultTime: p.resultTime.trim() || null,
        sortOrder: i,
      })).filter(p => p.title),
    };
  }
  if (draft.publishTime) body.publishTime = new Date(draft.publishTime).toISOString();
  else body.publishTime = null;
  if (draft.closeTime) body.closeTime = new Date(draft.closeTime).toISOString();
  else body.closeTime = null;
  if (publish && !draft.publishTime) body.publishTime = new Date().toISOString();
  return body;
}

export function buildListQuery(params: {
  kindTab: QuestionKindTab;
  q: string;
  day: string;
  audienceType: string;
  status: string;
}): string {
  const sp = new URLSearchParams();
  if (params.kindTab === 'exchange') {
    sp.set('source', 'exchange');
  } else if (params.kindTab === 'org_director') {
    sp.set('source', 'org');
  } else if (params.kindTab !== 'all') {
    sp.set('questionKind', params.kindTab);
  }
  if (params.q.trim()) sp.set('q', params.q.trim());
  if (params.day) sp.set('day', params.day);
  if (params.audienceType) sp.set('audienceType', params.audienceType);
  if (params.status) sp.set('status', params.status);
  sp.set('includeArchived', 'false');
  sp.set('includeHidden', 'true');
  return sp.toString();
}
