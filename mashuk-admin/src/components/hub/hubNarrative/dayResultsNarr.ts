import { pl } from '../directionNarrative/pl';
import type { Conclusion } from '../directionNarrative';

export type DayOpenNarrInput = {
  submitted: number;
  formalPct: number;
  open: Array<{ label: string; n: number; fill: number; junk: number; medLen: number }>;
  openQuotesN: number;
};

export type DayFixationNarrInput = {
  fixationN: number;
  submitted: number;
  fixation: Array<{ name: string; n: number }>;
  fixationQuotesN: number;
};

/** Вывод по открытым комментариям итоговой анкеты. */
export function dayOpenNarr(input: DayOpenNarrInput): Conclusion {
  const { submitted, formalPct, open, openQuotesN } = input;
  if (!submitted) {
    return {
      h: 'Итоговой анкеты ещё нет',
      p: 'За выбранный день нет сданных анкет — комментарии и качество открытых ответов посчитать нельзя.',
      a: 'Проверить, открыто ли окно итоговой анкеты и доходит ли напоминание до участников.',
    };
  }

  const weakest = [...open].sort((a, b) => b.junk - a.junk || a.fill - b.fill)[0];
  const richest = [...open].sort((a, b) => b.medLen - a.medLen || b.fill - a.fill)[0];

  if (formalPct >= 35) {
    return {
      h: 'Много формальных ответов в анкете',
      p: `Средняя доля формальных формулировок по открытым полям — ${formalPct}%.${
        weakest ? ` Слабее всего поле «${weakest.label}»: заполненность ${weakest.fill}%, формальных ${weakest.junk}%.` : ''
      } В ленте ${pl(openQuotesN, 'развернутый комментарий', 'развернутых комментария', 'развернутых комментариев')}.`,
      a: 'Сократить число открытых полей до 1–2 и спросить про одно конкретное действие на завтра.',
    };
  }

  if (richest && richest.medLen >= 80 && richest.fill >= 50) {
    return {
      h: 'Открытые ответы дают материал штабу',
      p: `Формальных в среднем ${formalPct}%. Поле «${richest.label}» держит медиану ${richest.medLen} знаков при заполненности ${richest.fill}%. В ленте ${openQuotesN} развёрнутых комментариев.`,
      a: 'Отобрать 5–7 формулировок из ленты для утреннего разбора направлений.',
    };
  }

  return {
    h: 'Комментарии анкеты в норме',
    p: `Сдано ${pl(submitted, 'анкета', 'анкеты', 'анкет')}, формальных в среднем ${formalPct}%, в ленте ${openQuotesN} развёрнутых текстов.`,
    a: 'Пролистать ленту комментариев и вынести один повторяющийся сигнал кураторам.',
  };
}

/** Вывод по блоку «Что зафиксировали о себе». */
export function dayFixationNarr(input: DayFixationNarrInput): Conclusion {
  const { fixationN, submitted, fixation, fixationQuotesN } = input;
  if (!fixationN) {
    return {
      h: 'Фиксацию о себе почти не заполняют',
      p: `За день нет содержательных ответов в полях фиксации при ${pl(submitted, 'сданной анкете', 'сданных анкетах', 'сданных анкетах')}.`,
      a: 'Проверить подпись и место поля в анкете: оно должно быть в конце и звучать как «что зафиксировали о себе».',
    };
  }

  const top = [...fixation].sort((a, b) => b.n - a.n)[0];
  const per = submitted ? (fixationN / submitted).toFixed(2) : '0';
  const coverage = submitted ? Math.round((fixationN / submitted) * 100) : 0;

  if (top && top.n >= Math.max(3, fixationN * 0.25)) {
    return {
      h: `Чаще всего фиксируют: «${top.name.slice(0, 48)}${top.name.length > 48 ? '…' : ''}»`,
      p: `Ответов фиксации ${pl(fixationN, 'штука', 'штуки', 'штук')} (${coverage}% от сдавших, ${per} на анкету). Повторяющаяся формулировка встречается ${top.n} раз. В ленте ${fixationQuotesN} развёрнутых текстов.`,
      a: 'Вынести топ формулировок на утренний штаб: это готовый язык самоописания направления.',
    };
  }

  return {
    h: 'Фиксация о себе работает',
    p: `${pl(fixationN, 'ответ', 'ответа', 'ответов')} (${coverage}% сдавших). Формулировки разбросаны — единой доминанты нет. В ленте ${fixationQuotesN} текстов.`,
    a: 'Прочитать 10–15 цитат фиксации и собрать 3 повторяющихся мотива без сведения в один рейтинг.',
  };
}
