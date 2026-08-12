import { pl, pct } from '../directionNarrative/pl';
import type { Conclusion } from '../directionNarrative';

export type StateNarrInput = {
  answers: number;
  reasons: number;
  reasonCoveragePct: number;
  noReasonPct: number;
  currentNeg: number;
  negCount: number;
  themesNeg: Array<{ name: string; n: number }>;
  psychoCount: number;
};

/** Осмысленный вывод по причинам проверки состояния. */
export function stateNarr(input: StateNarrInput): Conclusion {
  const {
    answers, reasons, reasonCoveragePct, noReasonPct, currentNeg,
    negCount, themesNeg, psychoCount,
  } = input;

  if (!answers) {
    return {
      h: 'Пояснений к состоянию нет',
      p: 'За выбранный срез нет отметок состояния — собрать причины и темы нельзя.',
      a: 'Проверить, открыто ли окно проверки состояния в нужной фазе дня.',
    };
  }

  if (reasons === 0 || reasonCoveragePct < 15) {
    return {
      h: 'Причины почти не поясняют',
      p: `Из ${pl(answers, 'отметки', 'отметок', 'отметок')} текстовое пояснение оставили ${pl(reasons, 'человек', 'человека', 'человек')} (${reasonCoveragePct}%). ${noReasonPct}% состояния остаётся без текста — штаб видит зоны, но не механизм.`,
      a: 'Сделать поле причины обязательным для зон «Риск» и «Усталость» и напомнить кураторам в ближайшую проверку.',
    };
  }

  const meaningful = themesNeg.filter(t => t.name !== 'Прочее' && t.name !== 'Без пояснения');
  const top = (meaningful.length ? meaningful : themesNeg)[0];
  const topShare = top && negCount ? pct(top.n, negCount) : 0;

  if (currentNeg >= 25 && reasonCoveragePct < 40) {
    return {
      h: 'Минус высокий, а пояснений мало',
      p: `Доля в риске и усталости сейчас ${currentNeg}%, при этом пояснение есть только у ${reasonCoveragePct}% отметок. Без текста нельзя отличить быт от программы.`,
      a: 'На ближайшей проверке попросить одну фразу у всех в зонах «Усталость» и «Риск».',
    };
  }

  if (top) {
    const psychoTxt = psychoCount
      ? ` Ещё ${pl(psychoCount, 'ответ', 'ответа', 'ответов')} помечены как внешние/личные и не входят в общую ленту.`
      : '';
    return {
      h: `Ведущая тема минуса — ${top.name.toLowerCase()}`,
      p: `Среди ${pl(negCount, 'негативной причины', 'негативных причин', 'негативных причин')} первая по частоте — «${top.name}»: ${pl(top.n, 'ответ', 'ответа', 'ответов')} (${topShare}%). Пояснение оставляют ${reasonCoveragePct}% отметок состояния.${psychoTxt}`,
      a: top.name.includes('Сон') || top.name.includes('режим')
        ? 'Проверить отбой и час утренней проверки — это управляемый параметр на завтра.'
        : top.name.includes('Быт') || top.name.includes('Питан')
          ? 'Быт закрывается быстрее программы: вынести один конкретный сигнал кураторам площадки сегодня.'
          : top.name.includes('Программ') || top.name.includes('расписан')
            ? 'Сверить переходы между площадками и точность анонсов в дневной части.'
            : 'Прочитать 10–15 цитат ведущей темы целиком и вынести одно действие на штаб.',
    };
  }

  return {
    h: 'Причины собираются, темы размыты',
    p: `Пояснений ${pl(reasons, 'штука', 'штуки', 'штук')} (${reasonCoveragePct}% отметок), но единой ведущей темы в минусе нет.`,
    a: 'Держать в наблюдении и читать ленту поштучно — единого рычага пока не видно.',
  };
}
