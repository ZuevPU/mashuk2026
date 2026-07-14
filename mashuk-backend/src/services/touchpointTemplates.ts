/**
 * Шаблон 7 точек осмысления по ТЗ v11 (окна МСК).
 * Дни 1–7; день 8 — только Точка Б (отдельно).
 */

import { getMoscowParts } from './timePhase.js';

export type TouchpointSlot = {
  index: number;
  title: string;
  text: string;
  type: 'checkin' | 'open';
  block: 'Проверка состояния' | 'Точки осмысления' | 'Итоги дня';
  timePoint: 'утро' | 'день' | 'вечер';
  openMin: number;
  closeMin: number;
  points: number;
};

export const TOUCHPOINT_SLOTS: TouchpointSlot[] = [
  {
    index: 1,
    title: 'Утренняя проверка состояния',
    text: 'Как ты себя чувствуешь этим утром? Выбери эмоцию и энергию.',
    type: 'checkin',
    block: 'Проверка состояния',
    timePoint: 'утро',
    openMin: 8 * 60,
    closeMin: 10 * 60,
    points: 5,
  },
  {
    index: 2,
    title: 'Осмысление по направлению',
    text: 'Что сегодня важного ты берёшь из работы по направлению?',
    type: 'open',
    block: 'Точки осмысления',
    timePoint: 'день',
    openMin: 12 * 60 + 50,
    closeMin: 14 * 60 + 30,
    points: 5,
  },
  {
    index: 3,
    title: 'Дневная проверка состояния',
    text: 'Короткая проверка состояния в середине дня.',
    type: 'checkin',
    block: 'Проверка состояния',
    timePoint: 'день',
    openMin: 13 * 60,
    closeMin: 14 * 60 + 30,
    points: 5,
  },
  {
    index: 4,
    title: 'Осмысление урока (слот 1)',
    text: 'На каком уроке / блоке ты был(а)? Что зафиксировал(а)?',
    type: 'open',
    block: 'Точки осмысления',
    timePoint: 'день',
    openMin: 16 * 60,
    closeMin: 18 * 60,
    points: 5,
  },
  {
    index: 5,
    title: 'Осмысление урока (слот 2)',
    text: 'Вечерний слот: что уносишь с открытых уроков / практик?',
    type: 'open',
    block: 'Точки осмысления',
    timePoint: 'вечер',
    openMin: 18 * 60 + 30,
    closeMin: 20 * 60,
    points: 5,
  },
  {
    index: 6,
    title: 'Вечерняя проверка состояния',
    text: 'Как ты себя чувствуешь вечером?',
    type: 'checkin',
    block: 'Проверка состояния',
    timePoint: 'вечер',
    openMin: 18 * 60 + 30,
    closeMin: 20 * 60,
    points: 5,
  },
  {
    index: 7,
    title: 'Итоговая анкета по дню',
    text: 'Оцени день и зафиксируй выводы. Основная форма — на главной (Завершение дня).',
    type: 'open',
    block: 'Итоги дня',
    timePoint: 'вечер',
    openMin: 22 * 60,
    closeMin: 24 * 60,
    points: 15,
  },
];

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** UTC-момент полуночи МСК для календарного дня форума. */
export function forumDayStartUtc(startDate: Date, dayNumber: number): number {
  const { dateKey } = getMoscowParts(startDate);
  const [y, m, d] = dateKey.split('-').map(Number);
  const day1MidnightMskAsUtc = Date.UTC(y, m - 1, d) - MSK_OFFSET_MS;
  return day1MidnightMskAsUtc + (dayNumber - 1) * 86_400_000;
}

/** Абсолютные publish/close для дня смены. */
export function windowsForDay(
  startDate: Date,
  dayNumber: number,
  slot: TouchpointSlot,
): { publishTime: Date; closeTime: Date } {
  const dayStart = forumDayStartUtc(startDate, dayNumber);
  return {
    publishTime: new Date(dayStart + slot.openMin * 60_000),
    closeTime: new Date(dayStart + slot.closeMin * 60_000),
  };
}

export const EVENING_SCALE_KEYS = [
  'direction',
  'lessonsImportant',
  'openLessons',
  'morningHealth',
  'workshops',
  'eveningAtmosphere',
  'food',
  'housing',
  'curator',
] as const;

export type EveningScaleKey = (typeof EVENING_SCALE_KEYS)[number];

export const EVENING_SCALE_LABELS: Record<EveningScaleKey, string> = {
  direction: 'Работа в рамках тематического направления',
  lessonsImportant: 'Уроки о важном',
  openLessons: 'Открытые уроки / практики',
  morningHealth: 'Утренняя программа здоровья',
  workshops: 'Мастер-классы и альтернативная программа',
  eveningAtmosphere: 'Вечерняя атмосферная программа',
  food: 'Организация питания',
  housing: 'Организация проживания и быта',
  curator: 'Работа куратора группы',
};
