/** Клиентский словарь копилки v11 */

export const PIGGYBANK_TAGS = [
  'идея',
  'мысль',
  'вопрос',
  'контакт',
  'на будущее',
  'в работу',
] as const;

export const PIGGYBANK_SOURCES = [
  'Направление',
  'Урок о важном',
  'Открытый урок',
  'Клуб',
  'Разговор с участником',
  'Своя мысль',
] as const;

export const ORG_TAG = 'организаторам';

export const QUICK_CAPTURE_ITEMS = [
  { icon: '💡', label: 'Идея', tag: 'идея' },
  { icon: '💭', label: 'Мысль', tag: 'мысль' },
  { icon: '❓', label: 'Вопрос', tag: 'вопрос' },
  { icon: '📇', label: 'Контакт', tag: 'контакт' },
  { icon: '📌', label: 'На будущее', tag: 'на будущее' },
  { icon: '✅', label: 'В работу', tag: 'в работу' },
] as const;
