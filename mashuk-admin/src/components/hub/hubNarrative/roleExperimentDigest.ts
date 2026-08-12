import { pl, pct } from '../directionNarrative/pl';

export type NamedCount = { name: string; n: number };

export type DayResultsSlice = {
  meta: {
    day: number;
    total: number;
    submitted: number;
    transferIndex?: number | null;
    formalPct?: number | null;
  };
  experiment: NamedCount[];
  roles: NamedCount[];
  fixation: NamedCount[];
  fixationQuotes?: Array<{ text: string; meta: string }>;
  openQuotes?: Array<{ text: string; meta: string }>;
  blocks?: Array<{ label: string; mean: number; n: number }>;
};

export type ExperimentBuckets = {
  natural: number;
  unusual: number;
  unclear: number;
  failed: number;
  other: number;
  total: number;
  tried: number;
  succeeded: number;
};

export type RoleExperimentDigest = {
  day: number;
  submitted: number;
  cohort: number;
  fillPct: number;
  buckets: ExperimentBuckets;
  /** доли в % от ответивших по эксперименту */
  share: {
    succeeded: number;
    natural: number;
    unusual: number;
    unclear: number;
    failed: number;
  };
  vsPrevTransfer: 'выше' | 'ниже' | 'примерно соответствует' | null;
  prevTransfer: number | null;
  perception: {
    top: string | null;
    topPct: number;
    second: string | null;
    secondPct: number;
    reading: string;
  };
  tomorrow: {
    top: string | null;
    n: number;
    pct: number;
    delta: 'вырос' | 'снизился' | 'почти не изменился' | null;
    second: string | null;
    secondDelta: 'вырос' | 'снизился' | null;
  };
  fixation: {
    theme1: string | null;
    theme2: string | null;
    summary: string;
    quote: string | null;
  };
  verdict: {
    status: 'состоялся' | 'состоялся частично' | 'столкнулся с трудностями';
    signal: string;
    tomorrowSignal: string;
  };
  /** Готовый текст для бота / ЛС */
  markdown: string;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Классификация исхода эксперимента (choice + свободный текст). */
export function classifyExperimentOutcome(raw: string): keyof Omit<ExperimentBuckets, 'total' | 'tried' | 'succeeded'> {
  const low = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!low) return 'other';

  if (
    /осознанно\s+решил|отказал|не\s+получ.*попроб|не\s+успел|не\s+успела|не\s+попробов|не\s+состоялся|незаверш/
      .test(low)
  ) {
    return 'failed';
  }
  if (/не\s+понимаю\s+результат|пока\s+не\s+понимаю|не\s+могу\s+оценить|неясн|не\s+ясно/.test(low)) {
    return 'unclear';
  }
  if (/непривычн/.test(low) && /получ|попроб/.test(low)) {
    return 'unusual';
  }
  if (
    low.startsWith('получилось естественно')
    || (/естественн/.test(low) && /получ/.test(low))
  ) {
    return 'natural';
  }
  if (low.startsWith('получилось, но было непривычно') || (/получ/.test(low) && /непривычн/.test(low))) {
    return 'unusual';
  }
  if (/попробов/.test(low) && (/не\s+понима|оцен/.test(low))) {
    return 'unclear';
  }
  if (/получ.*естеств|естественн/.test(low)) return 'natural';
  if (/получ/.test(low) && !/не\s+полу/.test(low)) return 'unusual';
  return 'other';
}

export function bucketExperiments(items: NamedCount[]): ExperimentBuckets {
  const buckets: ExperimentBuckets = {
    natural: 0,
    unusual: 0,
    unclear: 0,
    failed: 0,
    other: 0,
    total: 0,
    tried: 0,
    succeeded: 0,
  };
  for (const item of items) {
    const kind = classifyExperimentOutcome(item.name);
    buckets[kind] += item.n;
    buckets.total += item.n;
  }
  buckets.succeeded = buckets.natural + buckets.unusual;
  buckets.tried = buckets.succeeded + buckets.unclear;
  return buckets;
}

function shareOf(n: number, total: number): number {
  return total > 0 ? round1((n / total) * 100) : 0;
}

function comparePct(curr: number, prev: number | null): 'выше' | 'ниже' | 'примерно соответствует' | null {
  if (prev == null || !Number.isFinite(prev)) return null;
  const d = curr - prev;
  if (Math.abs(d) < 3) return 'примерно соответствует';
  return d > 0 ? 'выше' : 'ниже';
}

function roleDelta(
  curr: NamedCount[],
  prev: NamedCount[] | null,
  roleName: string,
): 'вырос' | 'снизился' | 'почти не изменился' | null {
  if (!prev?.length || !roleName) return null;
  const currTot = curr.reduce((s, r) => s + r.n, 0) || 1;
  const prevTot = prev.reduce((s, r) => s + r.n, 0) || 1;
  const c = ((curr.find(r => r.name === roleName)?.n ?? 0) / currTot) * 100;
  const p = ((prev.find(r => r.name === roleName)?.n ?? 0) / prevTot) * 100;
  const d = c - p;
  if (Math.abs(d) < 2.5) return 'почти не изменился';
  return d > 0 ? 'вырос' : 'снизился';
}

function perceptionReading(top: string | null): string {
  const t = (top || '').toLowerCase();
  if (/знаком|привычн|естеств|способ действия/.test(t)) {
    return 'знакомый способ действия';
  }
  if (/рост|развит|усил/.test(t)) {
    return 'зона роста';
  }
  if (/непривычн|нов|необычн/.test(t)) {
    return 'непривычная, но полезная практика';
  }
  if (/сложн|не\s+могу|неясн|оцен/.test(t)) {
    return 'опыт, который пока сложно оценить';
  }
  return 'смешанный опыт: часть участников узнаёт себя в роли, часть пробует новый способ действия';
}

function cleanQuote(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^["«]|["»]$/g, '')
    .trim()
    .slice(0, 160);
}

function fixationSummary(themes: NamedCount[], quotesN: number): string {
  if (!themes.length) {
    return quotesN
      ? 'формулировки разрозненные, но уже есть развёрнутые самоописания'
      : 'пока мало содержательных самоописаний — язык дня ещё не сложился';
  }
  const top = themes[0];
  if (/рост/.test(top.name.toLowerCase())) {
    return 'замечают зону роста и готовы удерживать внимание на ней завтра';
  }
  if (/знаком|способ/.test(top.name.toLowerCase())) {
    return 'узнают в роли привычный способ действия и хотят его осознанно применять';
  }
  if (/непривычн/.test(top.name.toLowerCase())) {
    return 'фиксируют непривычность опыта как полезную практику, а не как провал';
  }
  return `чаще описывают опыт через «${top.name}» и связывают его с завтрашним выбором роли`;
}

function buildVerdict(
  share: RoleExperimentDigest['share'],
  buckets: ExperimentBuckets,
  tomorrow: RoleExperimentDigest['tomorrow'],
  perception: RoleExperimentDigest['perception'],
): RoleExperimentDigest['verdict'] {
  let status: RoleExperimentDigest['verdict']['status'];
  const triedPct = buckets.total ? round1((buckets.tried / buckets.total) * 100) : 0;
  if (share.succeeded >= 55 && share.failed <= 25) status = 'состоялся';
  else if (share.succeeded >= 35 || triedPct >= 50) status = 'состоялся частично';
  else status = 'столкнулся с трудностями';

  let signal: string;
  if (share.natural >= share.unusual && share.natural >= 25) {
    signal = 'роль «села» естественно у заметной доли участников — можно усиливать перенос в практику';
  } else if (share.unusual >= 25) {
    signal = 'опыт чаще непривычный, но состоявшийся: это хороший момент для поддержки и разбора «что помогло»';
  } else if (share.unclear >= 20) {
    signal = 'много «попробую, но не могу оценить» — завтра нужна более конкретная рамка эксперимента';
  } else if (share.failed >= 30) {
    signal = 'высокая доля незавершённых экспериментов — стоит упростить вход в роль и снять барьер старта';
  } else {
    signal = perception.top
      ? `доминанта восприятия «${perception.top}» задаёт тон обратной связи кураторам`
      : 'нужно добрать ответы, чтобы уверенно читать сигнал дня';
  }

  let tomorrowSignal: string;
  if (tomorrow.delta === 'вырос' && tomorrow.top) {
    tomorrowSignal = `продолжение интереса к «${tomorrow.top}»`;
  } else if (tomorrow.delta === 'снизился' && tomorrow.second) {
    tomorrowSignal = `переключение внимания — растёт интерес к «${tomorrow.second}»`;
  } else if (tomorrow.top) {
    tomorrowSignal = `стремление попробовать / удержать способ действия через «${tomorrow.top}»`;
  } else {
    tomorrowSignal = 'выбор на завтра пока размыт';
  }

  return { status, signal, tomorrowSignal };
}

function buildMarkdown(d: RoleExperimentDigest): string {
  const lines: string[] = [];
  lines.push('## Ежедневный комментарий · ролевой эксперимент');
  lines.push('');
  lines.push(`Сегодня анкету заполнили **${pl(d.submitted, 'участник', 'участника', 'участников')}**.`);
  lines.push('');
  lines.push('### Насколько эксперимент состоялся');
  lines.push('');
  if (d.buckets.total === 0) {
    lines.push('По исходам ролевого эксперимента данных пока недостаточно.');
  } else {
    lines.push(`${d.share.succeeded}% участников попробовали выбранную роль:`);
    lines.push('');
    lines.push(`- у ${d.share.natural}% это получилось естественно;`);
    lines.push(`- у ${d.share.unusual}% — получилось, хотя было непривычно;`);
    lines.push(`- ${d.share.unclear}% попробовали, но пока не могут оценить результат.`);
    lines.push('');
    const vs = d.vsPrevTransfer
      ? ` Это ${d.vsPrevTransfer} результату предыдущего дня${d.prevTransfer != null ? ` (${d.prevTransfer}%)` : ''}.`
      : '';
    lines.push(
      `У ${d.share.failed}% участников эксперимент не состоялся или остался незавершённым.${vs}`,
    );
  }
  lines.push('');
  lines.push('### Как участники воспринимают опыт');
  lines.push('');
  if (d.perception.top) {
    lines.push(
      `Чаще всего участники воспринимали роль как **${d.perception.top}** — так ответили ${d.perception.topPct}%.`
      + (d.perception.second
        ? ` На втором месте — **${d.perception.second}** (${d.perception.secondPct}%).`
        : ''),
    );
    lines.push('');
    lines.push(`Это показывает, что эксперимент преимущественно воспринимается как ${d.perception.reading}.`);
  } else {
    lines.push('Оценок восприятия роли пока мало — блок фиксации ещё не дал устойчивой картины.');
  }
  lines.push('');
  lines.push('### Выбор на завтра');
  lines.push('');
  if (d.tomorrow.top) {
    lines.push(
      `Самая востребованная роль на завтра — **«${d.tomorrow.top}»**: её выбрали ${pl(d.tomorrow.n, 'участник', 'участника', 'участников')} (${d.tomorrow.pct}%).`,
    );
    lines.push('');
    if (d.tomorrow.delta) {
      let line = `По сравнению с предыдущим днём интерес к ней ${d.tomorrow.delta}.`;
      if (d.tomorrow.second && d.tomorrow.secondDelta) {
        line += ` Также заметно ${d.tomorrow.secondDelta} выбор роли **«${d.tomorrow.second}»**.`;
      }
      lines.push(line);
    }
  } else {
    lines.push('Выбор роли на завтра пока не сформировался в данных.');
  }
  lines.push('');
  lines.push('### Что участники фиксируют для себя');
  lines.push('');
  if (d.fixation.theme1) {
    lines.push(
      `В открытых ответах чаще всего встречаются темы **${d.fixation.theme1}**`
      + (d.fixation.theme2 ? ` и **${d.fixation.theme2}**` : '')
      + `. Участники отмечают, что ${d.fixation.summary}.`,
    );
  } else {
    lines.push(`Участники отмечают, что ${d.fixation.summary}.`);
  }
  if (d.fixation.quote) {
    lines.push('');
    lines.push(`Характерная обезличенная формулировка: «${d.fixation.quote}».`);
  }
  lines.push('');
  lines.push('### Итог');
  lines.push('');
  lines.push(
    `Сегодняшний эксперимент скорее **${d.verdict.status}**. Главный сигнал дня — ${d.verdict.signal}. `
    + `Выбор на завтра показывает ${d.verdict.tomorrowSignal}.`,
  );
  return lines.join('\n');
}

/**
 * Собирает ежедневный комментарий бота по ролевому эксперименту
 * (методист + семантический анализ + данные вечерней анкеты).
 */
export function buildRoleExperimentDigest(
  today: DayResultsSlice,
  prev: DayResultsSlice | null = null,
): RoleExperimentDigest {
  const buckets = bucketExperiments(today.experiment || []);
  const base = buckets.total || 1;
  const share = {
    succeeded: shareOf(buckets.succeeded, base),
    natural: shareOf(buckets.natural, base),
    unusual: shareOf(buckets.unusual, base),
    unclear: shareOf(buckets.unclear, base),
    failed: shareOf(buckets.failed + buckets.other, base),
  };

  const prevBuckets = prev ? bucketExperiments(prev.experiment || []) : null;
  const prevTransfer = prev
    ? (prev.meta.transferIndex
      ?? (prevBuckets && prevBuckets.total
        ? Math.round((prevBuckets.succeeded / prevBuckets.total) * 100)
        : null))
    : null;
  const currTransfer = today.meta.transferIndex ?? share.succeeded;

  const fixThemes = [...(today.fixation || [])].sort((a, b) => b.n - a.n);
  const fixTot = fixThemes.reduce((s, t) => s + t.n, 0) || 1;
  const topFix = fixThemes[0] ?? null;
  const secondFix = fixThemes[1] ?? null;

  const perception = {
    top: topFix?.name ?? null,
    topPct: topFix ? pct(topFix.n, fixTot) : 0,
    second: secondFix?.name ?? null,
    secondPct: secondFix ? pct(secondFix.n, fixTot) : 0,
    reading: perceptionReading(topFix?.name ?? null),
  };

  const roles = today.roles || [];
  const rolesTot = roles.reduce((s, r) => s + r.n, 0) || 1;
  const topRole = roles[0] ?? null;
  const secondRole = roles[1] ?? null;
  const prevRoles = prev?.roles ?? null;

  let secondDelta: 'вырос' | 'снизился' | null = null;
  if (secondRole && prevRoles) {
    const d = roleDelta(roles, prevRoles, secondRole.name);
    if (d === 'вырос' || d === 'снизился') secondDelta = d;
  }

  const tomorrow = {
    top: topRole?.name ?? null,
    n: topRole?.n ?? 0,
    pct: topRole ? pct(topRole.n, rolesTot) : 0,
    delta: topRole ? roleDelta(roles, prevRoles, topRole.name) : null,
    second: secondRole?.name ?? null,
    secondDelta,
  };

  const quoteRaw = today.fixationQuotes?.[0]?.text
    || today.openQuotes?.[0]?.text
    || null;

  const fixation = {
    theme1: topFix?.name ?? null,
    theme2: secondFix?.name ?? null,
    summary: fixationSummary(fixThemes, today.fixationQuotes?.length ?? 0),
    quote: quoteRaw ? cleanQuote(quoteRaw) : null,
  };

  const verdict = buildVerdict(share, buckets, tomorrow, perception);

  const digest: RoleExperimentDigest = {
    day: today.meta.day,
    submitted: today.meta.submitted,
    cohort: today.meta.total,
    fillPct: pct(today.meta.submitted, today.meta.total || 1),
    buckets,
    share,
    vsPrevTransfer: comparePct(currTransfer, prevTransfer),
    prevTransfer,
    perception,
    tomorrow,
    fixation,
    verdict,
    markdown: '',
  };
  digest.markdown = buildMarkdown(digest);
  return digest;
}
