import { pl } from '../directionNarrative/pl';
import type { Conclusion } from '../directionNarrative';

export type AfterBlocksNarrInput = {
  answers: number;
  people: number;
  coveragePct: number;
  own: number;
  medLen: number;
  transferPct: number;
  reactionPct: number;
  shortPct: number;
  quotesN: number;
};

/** Вывод по осмыслению после блоков («что уносят»). */
export function afterBlocksNarr(input: AfterBlocksNarrInput): Conclusion {
  const {
    answers, people, coveragePct, own, medLen,
    transferPct, reactionPct, shortPct, quotesN,
  } = input;

  if (!answers) {
    return {
      h: 'Осмысления после блоков нет',
      p: 'За выбранный день нет текстов после блоков — оценить, что уносят участники, нельзя.',
      a: 'Проверить, открывается ли окно ответа сразу после блока, а не вечером задним числом.',
    };
  }

  if (coveragePct < 45) {
    return {
      h: 'До осмысления доходит меньше половины',
      p: `Охват ${coveragePct}% (${pl(people, 'человек', 'человека', 'человек')} из зарегистрированных), текстов ${answers}. Присвоение среди ответивших ${own}%, медиана длины ${medLen} знаков.`,
      a: 'Открыть вопрос сразу после блока и дать 2–3 минуты в зале — охват растёт сильнее, чем от вечерней рассылки.',
    };
  }

  if (transferPct >= 18 || own >= 20) {
    return {
      h: 'Уносят конкретику в практику',
      p: `Доля «переноса в практику» ${transferPct}%, индекс присвоения ${own}%. В ленте сильных формулировок ${pl(quotesN, 'ответ', 'ответа', 'ответов')} длиннее 60 знаков — это рабочий материал для методистов.`,
      a: 'Отобрать 5–7 формулировок с переносом для общего разбора направления сегодня вечером.',
    };
  }

  if (reactionPct >= 40 || shortPct >= 35) {
    return {
      h: 'Отвечают, но формально',
      p: `«Реакция» занимает ${reactionPct}% текстов, коротких ответов ${shortPct}%. Присвоение ${own}% при медиане ${medLen} знаков. Люди доходят до вопроса, но часто не находят, что ответить: дефект чаще в формулировке, а не в участниках.`,
      a: 'Переформулировать вопрос: вместо «как прошло» спросить «что попробуете завтра» — это поднимает уровень ответа сильнее всего.',
    };
  }

  return {
    h: 'Осмысление в рабочем диапазоне',
    p: `Охват ${coveragePct}%, присвоение ${own}%, перенос ${transferPct}%, медиана ${medLen} знаков. Сильных формулировок в ленте — ${quotesN}.`,
    a: 'Держать окно ответа сразу после блока и раз в день просматривать ленту «что уносят».',
  };
}
