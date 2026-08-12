import { pl, pct } from './pl';
import type { Conclusion, ForumTotals, OverviewRow, StateCmpRow } from './forumConclusions';

export type DirNarrInput = {
  dir: string;
  reg: number;
  state: {
    n: number;
    byPhase: Array<{ phase: string; phaseKey?: string; n: number; dist: number[]; energy: number | null; neg: number | null }>;
    emoPhase: Array<{ emo: string; v: number[] }>;
    themes: Array<{ name: string; n: number }>;
  };
  refl: { n: number; dist: number[] };
  fbDist: number[];
  kop: {
    n: number;
    tags: Array<{ tag: string; n: number }>;
    sources: Array<{ name: string; n: number }>;
  };
  exch: {
    q: number;
    a: number;
    cats: Array<{ name: string; n: number }>;
  };
  overview: OverviewRow;
  stateCmp: StateCmpRow;
  forum: ForumTotals;
};

export type DirNarr = {
  state: Conclusion | null;
  emo: Conclusion | null;
  reason: Conclusion | null;
  fb: Conclusion | null;
  kop: Conclusion | null;
  q: Conclusion | null;
};

const NEG_EMO = ['Усталость', 'Раздражение', 'Тревога', 'Грусть'];
const MISC_THEMES = new Set(['Прочее', 'Личное / прочее', 'Без пояснения']);

const REASON_ACT: Record<string, string> = {
  'Сон и режим': 'Это управляемый параметр: время отбоя, длина вечерней программы, час утреннего старта.',
  'Сон и восстановление': 'Это управляемый параметр: время отбоя, длина вечерней программы, час утреннего старта.',
  'Быт и инфраструктура': 'Быт решается быстрее всего остального и даёт самый заметный эффект на следующий же день.',
  'Быт и условия': 'Быт решается быстрее всего остального и даёт самый заметный эффект на следующий же день.',
  'Программа и расписание': 'Сигнал к расписанию: проверить переходы между площадками и точность анонсов.',
  'Программа и организация': 'Сигнал к расписанию: проверить переходы между площадками и точность анонсов.',
  'Утренние активности': 'Утренний блок читается участниками как отдельное событие — стоит уточнить его формат и обязательность.',
  'Работа в группе': 'Это вопрос к куратору группы, а не к программе форума.',
  'Работа в команде': 'Это вопрос к куратору группы, а не к программе форума.',
  'Ожидания и настрой': 'Хороший знак: люди пишут про предвкушение, а не про усталость.',
  'Люди и общение': 'Это вопрос к куратору и атмосфере группы, а не к блоку программы.',
  'Питание': 'Бытовой параметр: проверить меню и окна питания относительно расписания.',
  'Погода и среда': 'Среду менять сложно — зафиксировать и учитывать в нагрузке дня.',
  'Технологии и бот': 'Проверить, не ломает ли интерфейс поток ответов в пиковые часы.',
  'Своё выступление': 'Пик тревоги вокруг выступлений — вопрос к подготовке и таймингу, не к мотивации.',
  'Внешние события': 'Единой темы программы нет — читать тексты поштучно.',
  Прочее: 'Единой темы нет — читать тексты поштучно.',
  'Личное / прочее': 'Единой темы нет — читать тексты поштучно.',
};

/** 6 выводов по направлению — логика из hq_directions_dashboard.html / TZ. */
export function dirNarr(input: DirNarrInput): DirNarr {
  const { state, refl, kop, exch, overview: OV, stateCmp: S, forum: F, reg: REG } = input;
  const N: DirNarr = { state: null, emo: null, reason: null, fb: null, kop: null, q: null };

  // — состояние —
  {
    const ph = state.byPhase;
    const morn = ph.find(p => p.phase === 'Утро' || p.phaseKey === 'morning') ?? ph[0];
    const dayP = ph.find(p => p.phase === 'День' || p.phaseKey === 'day') ?? ph[1];
    const eve = ph.find(p => p.phase === 'Вечер' || p.phaseKey === 'evening') ?? ph[2];
    const tot = (p?: { dist: number[] }) => (p ? p.dist.reduce((a, b) => a + b, 0) : 0);
    const negOf = (p?: { dist: number[]; neg: number | null }) => {
      if (!p) return null;
      if (p.neg != null) return p.neg;
      const t = tot(p);
      return t ? ((p.dist[3]! + p.dist[4]!) / t) * 100 : null;
    };
    const nm = negOf(morn);
    const nd = negOf(dayP);
    const dz = S.d != null && S.m != null ? +(S.d - S.m).toFixed(1) : null;
    let head: string;
    let body: string;
    if (nd != null && nm != null && nd - nm >= 8) {
      head = 'День отнимает больше, чем даёт';
      body = `Утром в усталости и риске ${nm.toFixed(0)}% отметок, днём уже ${nd.toFixed(0)}% — рост на ${pl(Math.round(nd - nm), 'пункт', 'пункта', 'пунктов')} внутри одного дня. Провал приходится на дневную часть программы, а не на подъём.`;
    } else if (nd != null && nm != null && nm - nd >= 8) {
      head = 'Направление добирает ресурс за день';
      body = `Утром в минусе ${nm.toFixed(0)}% отметок, днём ${nd.toFixed(0)}% — состояние улучшается по ходу дня. Тяжёлая точка здесь утро, а не нагрузка: это вопрос отбоя и старта, а не программы.`;
    } else {
      head = 'Состояние держится ровно';
      body = `Разница между утренней и дневной проверкой невелика: ${nm == null ? '—' : nm.toFixed(0)}% против ${nd == null ? '—' : nd.toFixed(0)}% в минусе. Резких провалов внутри дня нет.`;
    }
    const cmp = ` По доле риска днём направление ${S.neg > F.negDay ? 'выше' : 'ниже'} форума: ${S.neg}% против ${F.negDay}%.`;
    const en = dz == null
      ? ''
      : ` Энергия сдвинулась на ${dz > 0 ? '+' : ''}${dz} — читать это стоит только как направление сдвига: абсолютный уровень на этой шкале недостоверен.`;
    const evN = tot(eve);
    const dayN = tot(dayP);
    const cav = evN && dayN && evN < dayN * 0.4
      ? ` Вечерних отметок всего ${evN} против ${dayN} дневных — выводы по вечеру делать рано.`
      : '';
    let act: string;
    if (S.neg >= F.negDay * 1.5) {
      act = 'Доля риска днём в полтора раза выше форумной — разобрать дневную часть расписания: сколько блоков подряд и есть ли пауза после обеда.';
    } else if (nd != null && nm != null && nd - nm >= 8) {
      act = 'Провал приходит в дневной части. Посмотреть, что идёт после обеда и есть ли перерыв между площадками.';
    } else if (nm != null && nm >= 25) {
      act = 'Минус приходит в направление уже утром — вопрос к отбою и часу утренней проверки, а не к программе дня.';
    } else if (evN && dayN && evN < dayN * 0.4) {
      act = 'Вечерняя проверка собирает заметно меньше дневной — проверить, во сколько открывается окно ответа.';
    } else {
      act = 'Отдельного действия не требуется, держать в наблюдении.';
    }
    if (S.neg >= F.negDay * 1.5 && head === 'Состояние держится ровно') {
      head = 'Внутри дня ровно, но уровень риска выше форумного';
    }
    N.state = { h: head, p: body + cmp + en + cav, a: act };
  }

  // — эмоции —
  {
    const rows = state.emoPhase.filter(e => e.v.some(v => v > 0));
    if (rows.length) {
      const sum = (e: { v: number[] }) => e.v.reduce((a, b) => a + b, 0);
      const top = [...rows].sort((a, b) => sum(b) - sum(a))[0]!;
      const grow = rows
        .map(e => ({ emo: e.emo, d: (e.v[1] || 0) - (e.v[0] || 0), neg: NEG_EMO.includes(e.emo) }))
        .sort((a, b) => b.d - a.d);
      const up = grow[0];
      const negUp = grow.filter(g => g.neg && g.d > 0).sort((a, b) => b.d - a.d)[0];
      const totAll = rows.reduce((a, e) => a + sum(e), 0);
      const negShare = pct(rows.filter(e => NEG_EMO.includes(e.emo)).reduce((a, e) => a + sum(e), 0), totAll);
      let head: string;
      let body: string;
      if (negUp && negUp.d >= 4) {
        head = `«${negUp.emo}» набирает к дню`;
        body = `За день отметок «${negUp.emo.toLowerCase()}» стало на ${negUp.d} больше, чем утром. Одна и та же эмоция в разное время означает разное: утром это про сон, днём — про нагрузку блока, и лечится это по-разному.`;
      } else if (up && up.d >= 4) {
        head = `День работает: «${up.emo}» растёт`;
        body = `Отметок «${up.emo.toLowerCase()}» к дневной проверке на ${up.d} больше, чем утром — программа втягивает, а не выматывает.`;
      } else {
        head = 'Эмоциональный фон устойчив';
        body = `Заметных сдвигов между утром и днём нет, преобладает «${top.emo.toLowerCase()}».`;
      }
      N.emo = {
        h: head,
        p: `${body} Всего отметок с негативной окраской — ${negShare}% (${NEG_EMO.join(', ').toLowerCase()}).`,
        a: negShare >= 25
          ? 'Проверить, совпадают ли пики негатива с конкретным блоком расписания: если да — вопрос к блоку, если нет — к бытовым условиям.'
          : 'Использовать как фон: значимые решения принимаются по зонам и текстам причин, а не по эмоциям.',
      };
    }
  }

  // — причины —
  {
    const rs = state.themes.filter(r => r.name !== 'Без пояснения');
    const noExp = state.themes.find(r => r.name === 'Без пояснения')?.n ?? 0;
    const totR = rs.reduce((a, r) => a + r.n, 0);
    if (!totR) {
      N.reason = {
        h: 'Причины не поясняют',
        p: `Из ${state.n} отметок пояснение оставили единицы — понять, что стоит за состоянием, по этим данным нельзя.`,
        a: 'Сделать поле причины обязательным для зон «Риск» и «Усталость» — именно там текст нужнее всего.',
      };
    } else {
      const meaningful = rs.filter(r => !MISC_THEMES.has(r.name));
      const top = [...(meaningful.length ? meaningful : rs)].sort((a, b) => b.n - a.n)[0]!;
      const misc = rs.find(r => MISC_THEMES.has(r.name) && r.name !== 'Без пояснения')?.n ?? 0;
      N.reason = {
        h: `Ведущая тема причин — ${top.name.toLowerCase()}`,
        p: `Среди тематических пояснений первая по частоте — «${top.name}»: ${pl(top.n, 'ответ', 'ответа', 'ответов')} из ${totR}.${
          misc ? ` Ещё ${pl(misc, 'пояснение', 'пояснения', 'пояснений')} не сводятся к общей теме — их читают поштучно.` : ''
        } Пояснение оставляют не все: ${pl(noExp, 'отметка', 'отметки', 'отметок')} без текста, то есть ${pct(noExp, noExp + totR)}% состояния остаётся необъяснённым.`,
        a: REASON_ACT[top.name] || 'Прочитать тексты категории целиком.',
      };
    }
  }

  // — обратная связь —
  {
    const fbDist = input.fbDist;
    const tot = fbDist.reduce((a, b) => a + b, 0);
    if (!tot && !refl.n) {
      N.fb = {
        h: 'Обратной связи нет',
        p: 'За день направление не оставило комментариев после блоков — оценить содержание программы по этим данным невозможно.',
        a: 'Проверить, доходит ли до участников сам вопрос: возможно, окно ответа открывается не вовремя.',
      };
    } else {
      const base = tot || refl.n;
      const sub = pct(fbDist[2] ?? 0, base);
      const empty = pct(fbDist[1] ?? 0, base);
      const prob = pct(fbDist[3] ?? 0, base);
      const fTot = F.fbDist.reduce((a, b) => a + b, 0) || 1;
      const fsub = pct(F.fbDist[2] ?? 0, fTot);
      const per = (refl.n / Math.max(REG, 1)).toFixed(2);
      const fper = (F.fb / Math.max(F.reg, 1)).toFixed(2);
      let head: string;
      let body: string;
      if (sub >= fsub + 8) {
        head = 'Пишут содержательно';
        body = `${sub}% комментариев несут конкретику по работе против ${fsub}% по форуму. Это направление, чью обратную связь стоит читать целиком: там формулировки, а не вежливость.`;
      } else if (empty >= 40) {
        head = 'Отвечают, но формально';
        body = `${empty}% комментариев — короткие и несодержательные, содержательных лишь ${sub}%. Люди доходят до вопроса, но не находят, что ответить: чаще это дефект формулировки вопроса, а не участников.`;
      } else {
        head = 'Обратная связь в норме';
        body = `Содержательных комментариев ${sub}% при ${fsub}% по форуму, объём ${per} на человека против ${fper}.`;
      }
      const probN = fbDist[3] ?? 0;
      const probTxt = probN
        ? ` Сигналов о сложностях — ${pl(probN, 'штука', 'штуки', 'штук')}, ${prob}% от всех комментариев.`
        : ' Сигналов о сложностях нет.';
      N.fb = {
        h: head,
        p: body + probTxt,
        a: probN >= 3
          ? `Прочитать ${pl(probN, 'проблемный комментарий', 'проблемных комментария', 'проблемных комментариев')} целиком и вынести на разбор.`
          : empty >= 40
            ? 'Переформулировать вопрос после блока: вместо «как прошло» спросить «что попробуете» — это меняет уровень ответа сильнее всего.'
            : 'Отобрать 2–3 содержательные формулировки для общего разбора.',
      };
    }
  }

  // — копилка —
  {
    const tags = kop.tags;
    const tot = tags.reduce((a, t) => a + t.n, 0);
    if (!tot) {
      N.kop = {
        h: 'Копилка не используется',
        p: 'За день направление не сделало ни одной содержательной записи. Копилка — добровольный инструмент, и низкий охват обычно означает, что о ней не знают, а не что нечего записать.',
        a: 'Напомнить о копилке сразу после блока, а не в вечерней рассылке: она живёт днём.',
      };
    } else {
      const top = [...tags].sort((a, b) => b.n - a.n)[0]!;
      const intent = tags
        .filter(t => ['в работу', 'на будущее', 'идея'].includes(t.tag))
        .reduce((a, t) => a + t.n, 0);
      const sh = pct(intent, tot);
      const per = (kop.n / Math.max(REG, 1)).toFixed(2);
      const fper = (F.kop / Math.max(F.reg, 1)).toFixed(2);
      let head: string;
      let body: string;
      if (sh >= 55) {
        head = 'Записи доходят до намерения';
        body = `${sh}% записей помечены как «идея», «в работу» или «на будущее» — люди не просто фиксируют услышанное, а отбирают то, что собираются использовать.`;
      } else if (top.tag === 'мысль') {
        head = 'Копилка работает как блокнот';
        body = `Преобладает тег «мысль» (${top.n} из ${tot}), до намерения доходит ${sh}% записей. Люди записывают чужие тезисы, но не переводят их в собственное действие.`;
      } else {
        head = `Преобладает тег «${top.tag}»`;
        body = `До намерения доходит ${sh}% записей из ${tot}.`;
      }
      const src = kop.sources[0];
      const srcTxt = src ? ` Больше всего записей приходит из источника «${src.name}».` : '';
      N.kop = {
        h: head,
        p: `${body}${srcTxt} Объём — ${per} записи на человека при ${fper} по форуму.`,
        a: sh >= 55
          ? 'Отобрать 3–5 записей «в работу» для общего разбора: это готовый материал итогового сборника направления.'
          : 'Одна фраза куратора в конце блока — «запишите одно, что попробуете» — поднимает долю намерения сильнее любой доработки интерфейса.',
      };
    }
  }

  // — обмен —
  {
    const Q = exch.q;
    const per = Math.round((Q / Math.max(REG, 1)) * 100);
    const fper = Math.round((F.q / Math.max(F.reg, 1)) * 100);
    const other = exch.cats.find(c => c.name === 'Не размечено')?.n ?? 0;
    if (!Q) {
      N.q = {
        h: 'Вопросов нет',
        p: `Направление не задало ни одного вопроса в обмене опытом, при этом написало ${exch.a} ответов. Спрашивать и отвечать — разные роли, и здесь работает только вторая.`,
        a: 'Дать повод: вопрос от спикера сразу после блока запускает площадку лучше, чем призыв заходить.',
      };
    } else {
      let head: string;
      let body: string;
      if (per >= fper * 1.4) {
        head = 'Направление активно спрашивает';
        body = `${pl(Q, 'вопрос', 'вопроса', 'вопросов')} — это ${per} на 100 человек против ${fper} по форуму.`;
      } else if (per <= fper * 0.6) {
        head = 'Вопросов заметно меньше ожидаемого';
        body = `Всего ${pl(Q, 'вопрос', 'вопроса', 'вопросов')}, ${per} на 100 человек при ${fper} по форуму. При этом ответов написано ${exch.a}: направление читает и отвечает, но не спрашивает.`;
      } else {
        head = 'Обмен опытом в норме';
        body = `${pl(Q, 'вопрос', 'вопроса', 'вопросов')}, ${per} на 100 человек при ${fper} по форуму, ответов ${exch.a}.`;
      }
      const otherTxt = other
        ? ` Без рубрики ${other} из ${Q} — это архив, созданный до включения рубрикатора.`
        : '';
      N.q = {
        h: head,
        p: body + otherTxt,
        a: per <= fper * 0.6
          ? 'Вопрос дня от куратора направления: один заданный вопрос вытягивает за собой пять-шесть ответов.'
          : 'Отобрать 2–3 вопроса с наибольшим числом откликов для разбора на общем сборе.',
      };
    }
  }

  return N;
}

export function dirSummary(n: DirNarr): { titles: string; actions: string[] } {
  const items = [n.state, n.emo, n.reason, n.fb, n.kop, n.q].filter(Boolean) as Conclusion[];
  return {
    titles: items.map(c => c.h).join(' · '),
    actions: items.map(c => c.a).slice(0, 3),
  };
}
