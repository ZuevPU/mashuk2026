export type AdminTask = {
  id: number;
  title: string;
  description?: string | null;
  category?: string | null;
  points?: number;
  dayNumber?: number;
  answerType?: string;
  confirmationType?: string;
  allowRetry?: boolean;
  autoConfirm?: boolean;
  pushOnPublish?: boolean;
  hideUntilPublish?: boolean;
  executionType?: string;
  dailyRepeatLimit?: number;
  teamConfirmHours?: number;
};

export type TaskDraft = {
  title: string;
  category: string;
  points: number;
  dayNumber: number;
  description: string;
  confirmationType: string;
  pushOnPublish: boolean;
  allowRetry: boolean;
  autoConfirm: boolean;
  executionType: string;
  dailyRepeatLimit: number;
  teamConfirmHours: number;
};

export function draftFromTask(t: AdminTask): TaskDraft {
  return {
    title: t.title || '',
    category: t.category || '',
    points: t.points ?? 0,
    dayNumber: t.dayNumber ?? 1,
    description: t.description || '',
    confirmationType: t.confirmationType || 'text_photo',
    pushOnPublish: !!t.pushOnPublish,
    allowRetry: t.allowRetry !== false,
    autoConfirm: !!t.autoConfirm,
    executionType: t.executionType || 'once',
    dailyRepeatLimit: t.dailyRepeatLimit ?? 1,
    teamConfirmHours: t.teamConfirmHours ?? 24,
  };
}

export function taskDraftDirty(t: AdminTask, draft: TaskDraft): boolean {
  const base = draftFromTask(t);
  return (Object.keys(base) as (keyof TaskDraft)[]).some(k => base[k] !== draft[k]);
}

export function patchBodyFromDraft(draft: TaskDraft): Record<string, unknown> {
  return {
    title: draft.title,
    category: draft.category,
    points: Number(draft.points),
    dayNumber: Number(draft.dayNumber),
    description: draft.description,
    confirmationType: draft.confirmationType,
    pushOnPublish: draft.pushOnPublish,
    allowRetry: draft.allowRetry,
    autoConfirm: draft.autoConfirm,
    executionType: draft.executionType,
    dailyRepeatLimit: Number(draft.dailyRepeatLimit),
    teamConfirmHours: Number(draft.teamConfirmHours),
  };
}

export type NewTaskForm = {
  title: string;
  description: string;
  category: string;
  points: number;
  answerType: string;
  confirmationType: string;
  allowRetry: boolean;
  autoConfirm: boolean;
  pushOnPublish: boolean;
  hideUntilPublish: boolean;
  dayNumber: number;
  executionType: string;
  dailyRepeatLimit: number;
  teamConfirmHours: number;
};

export const emptyNewTask = (dayNumber: number): NewTaskForm => ({
  title: '',
  description: '',
  category: '',
  points: 20,
  answerType: 'text_and_photo',
  confirmationType: 'text_photo',
  allowRetry: true,
  autoConfirm: false,
  pushOnPublish: false,
  hideUntilPublish: true,
  dayNumber,
  executionType: 'once',
  dailyRepeatLimit: 1,
  teamConfirmHours: 24,
});
