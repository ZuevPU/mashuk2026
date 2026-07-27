export type ProfileProgressWeights = {
  touchpoints: number;
  reflection: number;
  tasks: number;
  piggybankInWork: number;
};

export const DEFAULT_PROFILE_PROGRESS_WEIGHTS: ProfileProgressWeights = {
  touchpoints: 40,
  reflection: 30,
  tasks: 20,
  piggybankInWork: 10,
};

export function resolveProfileProgressWeights(raw: unknown): ProfileProgressWeights {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PROFILE_PROGRESS_WEIGHTS };
  const o = raw as Record<string, unknown>;
  const w = {
    touchpoints: Number(o.touchpoints ?? 40),
    reflection: Number(o.reflection ?? 30),
    tasks: Number(o.tasks ?? 20),
    piggybankInWork: Number(o.piggybankInWork ?? 10),
  };
  const sum = w.touchpoints + w.reflection + w.tasks + w.piggybankInWork;
  if (sum <= 0) return { ...DEFAULT_PROFILE_PROGRESS_WEIGHTS };
  return w;
}

export function computeAbProgressPercent(input: {
  touchpointRatio: number;
  eveningDone: number;
  eveningTotal: number;
  tasksApproved: number;
  tasksTotal: number;
  piggyInWorkCount: number;
  piggyInWorkTarget?: number;
  weights?: ProfileProgressWeights;
}): number {
  const w = input.weights ?? DEFAULT_PROFILE_PROGRESS_WEIGHTS;
  const eveningTotal = Math.max(1, input.eveningTotal);
  const tasksTotal = Math.max(1, input.tasksTotal);
  const piggyTarget = input.piggyInWorkTarget ?? 3;
  const tp = Math.min(1, Math.max(0, input.touchpointRatio));
  const rf = Math.min(1, input.eveningDone / eveningTotal);
  const tk = Math.min(1, input.tasksApproved / tasksTotal);
  const pb = Math.min(1, input.piggyInWorkCount / piggyTarget);
  const raw = (tp * w.touchpoints + rf * w.reflection + tk * w.tasks + pb * w.piggybankInWork) / 100;
  return Math.min(100, Math.max(0, Math.round(raw * 100)));
}
