import { getMoscowPhase } from './timePhase.js';

export type HomeActiveCardKind =
  | 'evening_survey'
  | 'delayed_survey'
  | 'program_now'
  | 'program_soon'
  | 'state_check'
  | 'touchpoint'
  | 'point_b';

export interface HomeActiveCard {
  kind: HomeActiveCardKind;
  phase: ReturnType<typeof getMoscowPhase>;
  tag: string;
  title: string;
  subtitle: string;
  route: string;
  cta: string;
}

export interface ResolveHomeActiveCardInput {
  now?: Date;
  eveningWrap: boolean;
  currentDay: number;
  priorityAction: { type: string; title: string; subtitle: string; route: string } | null;
  eveningCard: { title: string; subtitle: string } | null;
  eveningQuestionnaire: { available: boolean; completed: boolean };
  schedule: { kind: string; title: string; time: string; place?: string | null }[];
  touchpointItems: { id: number; title?: string; state: string }[];
  delayedSurvey?: { id: number; title: string; subtitle: string } | null;
}

const phaseTag = (phase: ReturnType<typeof getMoscowPhase>): string => {
  if (phase === 'morning') return '🌅 Утро';
  if (phase === 'evening') return '🌙 Вечер';
  return '☀️ День';
};

/** Подбор главной «активной карточки» по фазе дня (МСК) и статусу точек/программы. */
export function resolveHomeActiveCard(input: ResolveHomeActiveCardInput): HomeActiveCard | null {
  const now = input.now ?? new Date();
  const phase = getMoscowPhase(now);
  const {
    eveningWrap, currentDay, priorityAction, eveningCard, eveningQuestionnaire, schedule, touchpointItems,
    delayedSurvey,
  } = input;

  if (delayedSurvey) {
    return {
      kind: 'delayed_survey',
      phase,
      tag: '📋 Отложенный замер',
      title: delayedSurvey.title,
      subtitle: delayedSurvey.subtitle,
      route: '/delayed-survey',
      cta: 'Пройти опрос →',
    };
  }

  if (currentDay === 8 && priorityAction?.type === 'question') {
    return {
      kind: 'point_b',
      phase,
      tag: '🎯 Финал смены',
      title: priorityAction.title,
      subtitle: priorityAction.subtitle,
      route: priorityAction.route,
      cta: 'Ответить →',
    };
  }

  if (
    phase === 'evening'
    && eveningWrap
    && eveningCard
    && eveningQuestionnaire.available
    && !eveningQuestionnaire.completed
  ) {
    return {
      kind: 'evening_survey',
      phase,
      tag: '✦ Завершение дня',
      title: eveningCard.title,
      subtitle: eveningCard.subtitle,
      route: '/home?evening=1',
      cta: 'Заполнить →',
    };
  }

  const nowEvents = schedule.filter(s => s.kind === 'now');
  // Show the live program card in any daytime phase (morning/day/evening).
  if (nowEvents.length > 0 && currentDay !== 8) {
    const parallel = nowEvents.length > 1;
    return {
      kind: 'program_now',
      phase,
      tag: parallel ? 'СЕЙЧАС · параллельно' : 'СЕЙЧАС · программа',
      title: parallel ? nowEvents.map(e => e.title).join(' · ') : nowEvents[0].title,
      subtitle: parallel
        ? nowEvents.map(e => `${e.time}${e.place ? ` · ${e.place}` : ''}`).join(' | ')
        : `${nowEvents[0].time}${nowEvents[0].place ? ` · ${nowEvents[0].place}` : ''}`,
      route: '/program',
      cta: 'Расписание →',
    };
  }

  if (priorityAction) {
    const isStateCheck = (priorityAction.subtitle || '').includes('Проверка состояния');
    return {
      kind: isStateCheck ? 'state_check' : 'touchpoint',
      phase,
      tag: isStateCheck ? `${phaseTag(phase)} · проверка` : '⚡ Нужно сейчас',
      title: priorityAction.title,
      subtitle: priorityAction.subtitle,
      route: priorityAction.route,
      cta: 'Ответить →',
    };
  }

  const soonEvent = schedule.find(s => s.kind === 'soon');
  if (soonEvent && currentDay !== 8 && phase !== 'evening') {
    return {
      kind: 'program_soon',
      phase,
      tag: 'СКОРО · программа',
      title: soonEvent.title,
      subtitle: `${soonEvent.time}${soonEvent.place ? ` · ${soonEvent.place}` : ''}`,
      route: '/program',
      cta: 'Расписание →',
    };
  }

  const nextEvent = schedule.find(s => s.kind === 'next');
  if (nextEvent && currentDay !== 8 && phase !== 'evening' && !soonEvent) {
    return {
      kind: 'program_soon',
      phase,
      tag: 'ДАЛЕЕ · программа',
      title: nextEvent.title,
      subtitle: `${nextEvent.time}${nextEvent.place ? ` · ${nextEvent.place}` : ''}`,
      route: '/program',
      cta: 'Расписание →',
    };
  }

  const softTp = touchpointItems.find(t => t.state === 'active' && t.title);
  if (softTp && phase === 'day' && !priorityAction) {
    return {
      kind: 'touchpoint',
      phase,
      tag: 'ДОСТУПНО · точки',
      title: softTp.title || 'Точка осмысления',
      subtitle: 'Можно ответить в своё время',
      route: `/questions?q=${softTp.id}`,
      cta: 'Ответить →',
    };
  }

  const activeTp = touchpointItems.find(t => t.state === 'active' || t.state === 'overdue');
  if (activeTp && phase === 'morning') {
    return {
      kind: 'touchpoint',
      phase,
      tag: '🌅 Утро · точки',
      title: activeTp.title || 'Точка осмысления',
      subtitle: activeTp.state === 'overdue' ? 'Можно заполнить с опозданием' : 'Открыта сейчас',
      route: `/questions?q=${activeTp.id}`,
      cta: 'Ответить →',
    };
  }

  return null;
}
