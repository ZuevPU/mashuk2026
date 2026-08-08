export type OnboardingStep = 'goals' | 'interests' | 'diag' | 'roles' | 'advice' | 'preview';

export type InterestGroup = { title: string; tags: string[] };

export type DiagQuestion = { text: string; options: string[] };

export type GoalAnswerType = 'open' | 'choice' | 'multi';

export type GoalShowWhen = {
  questionId: string;
  options: string[];
};

export type GoalQuestion = {
  id: string;
  text: string;
  type: GoalAnswerType;
  options: string[];
  allowOther?: boolean;
  otherLabel?: string;
  showWhen?: GoalShowWhen | null;
};

export type RoleDiagnosticsConfig = {
  goalQuestions: GoalQuestion[];
  interestGroups: InterestGroup[];
  interestMin?: number;
  interestMax?: number;
  questions: DiagQuestion[];
  optionToRole: string[][];
};

export type AdminRole = {
  id: number;
  roleKey: string;
  name: string;
  quadrant?: string | null;
  essence?: string | null;
  inClass?: string | null;
  keywords?: string | null;
  iconKey?: string | null;
  sortOrder?: number;
};

export type DayExperiment = {
  id: number;
  dayNumber: number;
  roleKey: string;
  title: string;
  body?: string | null;
  hint?: string | null;
  status?: string | null;
};

export const ONBOARDING_STEPS: { id: OnboardingStep; label: string }[] = [
  { id: 'goals', label: 'Цели' },
  { id: 'interests', label: 'Интересы' },
  { id: 'diag', label: 'Диагностика' },
  { id: 'roles', label: 'Роли' },
  { id: 'advice', label: 'Каталог советов' },
  { id: 'preview', label: 'Превью' },
];

export const GOAL_OTHER_VALUE = '__other__';

export function newGoalQuestionId(): string {
  return `gq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
