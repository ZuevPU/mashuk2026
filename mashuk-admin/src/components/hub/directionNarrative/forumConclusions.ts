import { genitive } from './types';

export type Conclusion = {
  h: string;
  p: string;
  a: string;
};

export type OverviewRow = {
  dir: string;
  reg: number;
  state: number;
  fb: number;
  kop: number;
  q: number;
  ans?: number;
  eMorn: number | null;
  eDay: number | null;
  negDay: number;
  topEmoDay: string | null;
  points: number;
  path: number;
  exp: number;
  fbDist: number[];
  kopTop: string | null;
  kopTopN: number;
  qOther: number;
};

export type StateCmpRow = {
  dir: string;
  m: number | null;
  d: number | null;
  neg: number;
  emo: string | null;
};

export type ActCmpRow = {
  dir: string;
  n: number;
  path: number;
  exp: number;
  pts: number;
};

export type ForumTotals = {
  reg: number;
  state: number;
  fb: number;
  kop: number;
  q: number;
  fbDist: number[];
  negDay: number;
  points: number;
};

function by<T>(arr: T[], f: (x: T) => number, up: boolean): T[] {
  return [...arr].sort((a, b) => (up ? f(b) - f(a) : f(a) - f(b)));
}

function spreadPct(vals: number[]): string {
  if (!vals.length) return '0';
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (!avg) return '0';
  return (((Math.max(...vals) - Math.min(...vals)) / avg) * 100).toFixed(0);
}

/** 5 форумных выводов — логика из hq_directions_dashboard.html. */
export function forumConclusions(
  overview: OverviewRow[],
  stateCmp: StateCmpRow[],
  actCmp: ActCmpRow[],
): Conclusion[] {
  if (!overview.length || !stateCmp.length) return [];
  const g = genitive;
  const out: Conclusion[] = [];
  const S = stateCmp;
  const A = actCmp;
  const OV = overview;

  const negTop = by(S, r => r.neg, true)[0]!;
  const negLow = by(S, r => r.neg, true).slice(-1)[0]!;
  const tired = S.filter(r => ['Усталость', 'Раздражение', 'Тревога'].includes(r.emo || '')).map(r => r.dir);
  const ratio = (negTop.neg / Math.max(negLow.neg, 1)).toFixed(0);
  out.push({
    h: 'Нагрузка распределена неравномерно, и это не про людей',
    p: `Доля в риске и усталости днём различается в ${ratio} раз: ${negTop.neg}% у ${g(negTop.dir)} против ${negLow.neg}% у ${g(negLow.dir)} — при одной и той же программе форума. ${
      tired.length
        ? `Топ-эмоция дня — усталость или раздражение — у ${tired.length} из ${S.length} направлений: ${tired.join(', ')}. `
        : ''
    }Такой разброс не объясняется составом участников: он задаётся тем, как собран день внутри направления — плотностью блоков, длиной переходов, наличием паузы после обеда.`,
    a: `Сравнить расписание ${g(negTop.dir)} и ${g(negLow.dir)} по числу блоков и длине перерывов. Разницу искать там, а не в мотивации участников.`,
  });

  const pathSp = spreadPct(A.map(r => r.path));
  const expSp = spreadPct(A.map(r => r.exp));
  const expTop = by(A, r => r.exp, true)[0]!;
  const pathLow = by(A, r => r.path, true).slice(-1)[0]!;
  out.push({
    h: 'Программа доходит до всех, обмен опытом — нет',
    p: `Разброс балла «Путь» между направлениями — ${pathSp}%, разброс балла «Опыт» — ${expSp}%. «Путь» набирается прохождением программы и заложен в расписание, поэтому он ровнее. «Опыт» держится на добровольном участии, и здесь направления расходятся сильнее. Показательно, что лидеры не совпадают: у ${g(pathLow.dir)} худший «Путь» (${pathLow.path}) и при этом у ${g(expTop.dir)} лучший «Опыт» (${expTop.exp}).`,
    a: 'Не сводить два балла в один рейтинг. Направление с низким «Путём» и высоким «Опытом» — не отстающие, а другой сценарий участия: возвращать их надо в программу, а не мотивировать к общению.',
  });

  const wf = OV.map(r => ({
    d: r.dir,
    tot: r.fbDist.reduce((a, b) => a + b, 0),
    sub: r.fbDist[2] ?? 0,
    prob: r.fbDist[3] ?? 0,
    per: r.reg ? r.fb / r.reg : 0,
  }));
  const withFb = wf.filter(r => r.tot >= 15);
  const bestSub = by(withFb.length ? withFb : wf, r => (r.tot ? r.sub / r.tot : 0), true)[0];
  const worstPer = by(wf, r => r.per, true).slice(-1)[0];
  const probTop = by(withFb.length ? withFb : wf, r => (r.tot ? r.prob / r.tot : 0), true)[0];
  if (bestSub && worstPer && probTop) {
    out.push({
      h: 'Больше отзывов не значит содержательнее',
      p: `Самая содержательная обратная связь — у ${g(bestSub.d)}: ${Math.round((bestSub.sub / Math.max(bestSub.tot, 1)) * 100)}% комментариев несут конкретику по работе, хотя по объёму на человека это направление далеко не первое. ${worstPer.d} дают ${worstPer.per.toFixed(2)} комментария на участника — меньше всех на форуме.${
        probTop.prob > 0
          ? ` Отдельно стоят ${probTop.d}: доля сигналов о сложностях у него ${Math.round((probTop.prob / Math.max(probTop.tot, 1)) * 100)}%.`
          : ''
      }`,
      a: probTop.prob > 0
        ? `Проблемные комментарии ${g(probTop.d)} прочитать целиком сегодня. Много сложностей у направления, которое пишет содержательно, — это не жалобы, а диагностика от тех, кто разбирается.`
        : `Содержательные формулировки ${g(bestSub.d)} отобрать для общего разбора штаба.`,
    });
  }

  const intent = OV.filter(r => r.kopTop && ['в работу', 'идея', 'на будущее'].includes(r.kopTop)).map(r => r.dir);
  const blank = OV.filter(r => r.kopTop === 'мысль').map(r => r.dir);
  const kopLow = by(OV, r => (r.reg ? r.kop / r.reg : 0), true).slice(-1)[0]!;
  out.push({
    h: blank.length >= OV.length / 2
      ? 'У большинства направлений копилка работает как блокнот'
      : 'Копилка доходит до намерения не везде',
    p: `Преобладающий тег показывает, до чего доходит запись. У ${
      intent.length ? intent.map(g).join(', ') : '—'
    } чаще всего это «идея» или «в работу» — то есть намерение. У ${
      blank.length ? blank.map(g).join(', ') : '—'
    } преобладает «мысль»: люди фиксируют услышанное, но не переводят его в действие. Реже всех копилку открывают ${g(kopLow.dir)} — ${(kopLow.kop / Math.max(kopLow.reg, 1)).toFixed(2)} записи на человека.`,
    a: 'Одна фраза от куратора в конце блока — «запишите одно, что попробуете» — меняет тег записи сильнее любой доработки интерфейса. Проверить завтра на одном направлении.',
  });

  const qTop = by(OV, r => (r.reg ? r.q / r.reg : 0), true)[0]!;
  const qLow = by(OV, r => (r.reg ? r.q / r.reg : 0), true).slice(-1)[0]!;
  const otherAvg = Math.round(OV.reduce((a, r) => a + r.qOther, 0) / OV.length);
  out.push({
    h: 'Вопросы задают неравномерно',
    p: `Вопросы распределены крайне неровно: ${Math.round((qTop.q / Math.max(qTop.reg, 1)) * 100)} на 100 человек у ${g(qTop.dir)} против ${Math.round((qLow.q / Math.max(qLow.reg, 1)) * 100)} у ${g(qLow.dir)}. Доля вопросов без рубрики в среднем ${otherAvg}% — это архив, созданный до включения рубрикатора; у новых вопросов показатель должен быть близок к нулю.`,
    a: 'Площадка затухает не от нехватки отвечающих, а от нехватки вопросов. Один вопрос от спикера сразу после блока даёт больше, чем рассылка с призывом заходить.',
  });

  return out;
}

export function forumAlerts(overview: OverviewRow[], forumPoints: number): Array<{ dir: string; sig: string[] }> {
  const alerts: Array<{ dir: string; sig: string[] }> = [];
  for (const r of overview) {
    const sig: string[] = [];
    if (r.negDay >= 30) sig.push(`риск и усталость днём ${r.negDay}%`);
    if (r.reg && r.fb / r.reg < 0.6) sig.push(`мало обратной связи — ${(r.fb / r.reg).toFixed(2)} на человека`);
    if (r.reg && r.kop / r.reg < 0.2) sig.push('копилка почти не используется');
    if (r.points < 8.5) sig.push(`точки осмысления ${r.points} при ${forumPoints} по форуму`);
    if (sig.length >= 2) alerts.push({ dir: r.dir, sig });
  }
  return alerts;
}
