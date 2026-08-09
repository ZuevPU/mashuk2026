import { useMemo, useState, type ReactNode } from 'react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ChartTooltipRu, formatForumDay, ZONE_COLORS, ZONE_LABELS } from './chartRu';
import {
  DashCard, DashGrid, DashKpi, DashScreenTitle, SectionLabel, ZoneBars, dashVal,
} from './dashboardUi';
import { EnergyAverages } from './EnergyAverages';
import { OrientableBarChart } from './orientableBars';
import { TouchpointCoveragePanel } from './TouchpointCoveragePanel';

function nLabel(v: unknown, count?: number | null): string {
  if (v == null || v === '') return '—';
  const base = typeof v === 'number' && Number.isFinite(v) ? String(v) : String(v);
  return count != null && count > 0 ? `${base} · N=${count}` : base;
}

function MethodHint({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        marginLeft: 6,
        borderRadius: '50%',
        fontSize: 10,
        fontWeight: 700,
        color: '#86868b',
        border: '1px solid #d2d2d7',
        cursor: 'help',
        verticalAlign: 'middle',
      }}
    >
      i
    </span>
  );
}

function Collapsible({
  title,
  hint,
  defaultOpen = true,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="adm-dash-card">
      <button
        type="button"
        className="adm-dash-card-title"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'none', border: 0, padding: 0, cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left',
        }}
      >
        <span>
          {title}
          {hint ? <MethodHint text={hint} /> : null}
        </span>
        <span className="adm-muted" style={{ fontSize: 12 }}>{open ? 'свернуть' : 'развернуть'}</span>
      </button>
      {open ? <div style={{ marginTop: 12 }}>{children}</div> : null}
    </div>
  );
}

function SortTable({
  columns,
  rows,
  initialKey,
}: {
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: Record<string, unknown>[];
  initialKey?: string;
}) {
  const [sortKey, setSortKey] = useState(initialKey ?? columns[0]?.key);
  const [asc, setAsc] = useState(false);
  const sorted = useMemo(() => {
    const col = columns.find(c => c.key === sortKey);
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (col?.numeric || typeof av === 'number') {
        return asc ? Number(av) - Number(bv) : Number(bv) - Number(av);
      }
      return asc
        ? String(av).localeCompare(String(bv), 'ru')
        : String(bv).localeCompare(String(av), 'ru');
    });
  }, [rows, sortKey, asc, columns]);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="adm-table" style={{ width: '100%', fontSize: 12 }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key}>
                <button
                  type="button"
                  style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit' }}
                  onClick={() => {
                    if (sortKey === c.key) setAsc(a => !a);
                    else { setSortKey(c.key); setAsc(false); }
                  }}
                >
                  {c.label}{sortKey === c.key ? (asc ? ' ↑' : ' ↓') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i}>
              {columns.map(c => (
                <td key={c.key}>{r[c.key] == null || r[c.key] === '' ? '—' : String(r[c.key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PRIORITY_STYLE: Record<string, { color: string; label: string }> = {
  high: { color: '#b91c1c', label: 'высокий' },
  medium: { color: '#b45309', label: 'средний' },
  watch: { color: '#64748b', label: 'наблюдение' },
};

type ThemeItem = {
  label: string;
  count: number;
  pct?: number | null;
  uniqueParticipants?: number;
};

function ThemeList({
  items,
  mentionOnly,
}: {
  items?: ThemeItem[];
  /** true = нет дедупа участников: показываем только упоминания */
  mentionOnly?: boolean;
}) {
  if (!items?.length) {
    return <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет данных</p>;
  }
  return (
    <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', fontSize: 12 }}>
      {items.slice(0, 10).map((it, i) => (
        <li
          key={`${it.label}-${i}`}
          style={{
            display: 'flex', justifyContent: 'space-between', gap: 8,
            padding: '4px 0', borderBottom: '1px solid #f0f0f2',
          }}
        >
          <span>{it.label}</span>
          <span className="adm-muted">
            {mentionOnly || it.uniqueParticipants == null
              ? `${it.count} упом.`
              : `${it.pct != null ? `${it.pct}% уч.` : '—'} · ${it.count} упом. · ${it.uniqueParticipants} чел.`}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ParticipantProfileView({ data }: { data: any }) {
  const sample = data?.sample ?? {};
  const typical = data?.typical ?? {};
  const feeling = data?.feeling ?? {};
  const eng = data?.engagement ?? {};
  const program = data?.programPerception ?? {};
  const meanings = data?.meanings ?? {};
  const methodology = data?.methodology ?? {};
  const segments = (data?.segments ?? []) as {
    id: string; label: string; count: number; pct: number | null;
    avgTouchpoints: number | null; avgEnergy: number | null; avgProgramPct: number | null;
    tasksApprox: number | null; avgActivityPct?: number | null;
    topEmotions: { label: string; count: number }[];
    topDirections: { direction: string; count: number }[];
  }[];
  const recommendations = (data?.recommendations ?? []) as {
    id: string; priority: string; title: string; evidence: string;
  }[];

  const energyLine = useMemo(() => (
    (feeling.energyByDay ?? []).map((d: { day: number; avg: number | null; responses: number }) => ({
      dayLabel: formatForumDay(d.day),
      avg: d.avg,
      responses: d.responses,
    }))
  ), [feeling.energyByDay]);

  const emotionBars = useMemo(() => (
    (feeling.emotions ?? []).map((e: { label: string; count: number; pct: number }) => ({
      name: e.label,
      count: e.count,
      pct: e.pct,
    }))
  ), [feeling.emotions]);

  const distBars = useMemo(() => (
    (eng.distribution ?? []).map((d: { completed: number; count: number }) => ({
      name: `${d.completed}`,
      count: d.count,
    }))
  ), [eng.distribution]);

  const questionBars = useMemo(() => (
    (program.questions ?? []).map((q: { label: string; avgPct: number; answered: number; avg: number; max: number }) => ({
      name: q.label.length > 42 ? `${q.label.slice(0, 40)}…` : q.label,
      avgPct: q.avgPct,
      answered: q.answered,
      avg: q.avg,
    }))
  ), [program.questions]);

  const programDayLine = useMemo(() => (
    (program.byDay ?? []).map((d: { day: number; overallPct: number | null; answered: number }) => ({
      dayLabel: formatForumDay(d.day),
      overallPct: d.overallPct,
      answered: d.answered,
    }))
  ), [program.byDay]);

  const energyTable = useMemo(() => (
    (feeling.energyByDay ?? []).map((d: {
      day: number; avg: number | null; median?: number | null; responses: number; riskFatiguePct?: number | null;
    }) => ({
      day: formatForumDay(d.day),
      avg: d.avg,
      median: d.median ?? '—',
      responses: d.responses,
      risk: d.riskFatiguePct != null ? `${d.riskFatiguePct}%` : '—',
    }))
  ), [feeling.energyByDay]);

  const dirTable = useMemo(() => (
    (eng.directionTable ?? []).map((r: Record<string, unknown>) => ({
      direction: r.direction,
      participants: r.participants,
      avg: r.avgTouchpoints,
      median: r.medianTouchpoints,
      all7: r.all7,
      tasks: r.tasks,
      evening: r.eveningFillPct != null ? `${r.eveningFillPct}%` : '—',
      coverage: r.coveragePct != null ? `${r.coveragePct}%` : '—',
    }))
  ), [eng.directionTable]);

  const questionTable = useMemo(() => (
    (program.questions ?? []).map((q: {
      label: string; avg: number; median: number | null; max: number; answered: number;
      deltaPrevDay: number | null; insufficient: boolean; avgPct: number;
    }) => ({
      question: q.insufficient ? `${q.label} ⚠ мало ответов` : q.label,
      avg: `${q.avg} (N=${q.answered})`,
      median: q.median ?? '—',
      pct: `${q.avgPct}%`,
      scale: `1–${q.max}`,
      answered: q.answered,
      delta: q.deltaPrevDay != null ? (q.deltaPrevDay > 0 ? `+${q.deltaPrevDay}` : String(q.deltaPrevDay)) : '—',
    }))
  ), [program.questions]);

  const phaseLine = useMemo(() => {
    const phases = ['morning', 'day', 'evening'] as const;
    const labels = { morning: 'Утро', day: 'День', evening: 'Вечер' };
    return phases.map(p => {
      const z = feeling.byPhase?.[p] ?? {};
      return {
        name: labels[p],
        engagement: Number(z.engagement ?? 0),
        lift: Number(z.lift ?? 0),
        risk: Number(z.risk ?? 0),
        fatigue: Number(z.fatigue ?? 0),
        count: feeling.phaseCounts?.[p] ?? 0,
      };
    });
  }, [feeling.byPhase, feeling.phaseCounts]);

  return (
    <div className="adm-dash-stack">
      <DashScreenTitle
        title={data?.title ?? 'Образ участника'}
        hint={data?.subtitle ?? 'Целостный портрет выбранной группы'}
      />

      {sample.warning ? (
        <DashCard>
          <p style={{ margin: 0, color: '#b45309', fontWeight: 600 }}>{sample.warning}</p>
          <p className="adm-muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
            Выборка меньше 5 участников — рекомендации и устойчивый портрет скрыты.
          </p>
        </DashCard>
      ) : null}

      <DashCard title="Типичный участник">
        <p style={{ fontSize: 15, lineHeight: 1.55, margin: '0 0 14px', maxWidth: 720 }}>
          {typical.summary ?? 'Недостаточно данных для текстового резюме.'}
          <MethodHint text={methodology.energy ?? 'Агрегаты строятся на уровне участника, затем по когорте.'} />
        </p>
        <DashGrid cols={4}>
          <DashKpi value={dashVal(sample.size)} label="размер выборки" />
          <DashKpi
            value={sample.dataCompletenessPct != null ? `${sample.dataCompletenessPct}%` : '—'}
            label="полнота данных"
          />
          <DashKpi value={dashVal(sample.activeParticipants)} label="активных" />
          <DashKpi
            value={nLabel(eng.touchpoints?.avg, eng.touchpoints?.count)}
            label="ср. точек"
            sub={eng.touchpoints?.median != null ? `медиана ${eng.touchpoints.median}` : undefined}
          />
        </DashGrid>
        <div style={{ height: 10 }} />
        <DashGrid cols={4}>
          <DashKpi
            value={nLabel(feeling.energy?.avg, feeling.energy?.count)}
            label="ср. энергия"
            sub={[
              feeling.energy?.median != null ? `медиана ${feeling.energy.median}` : null,
              feeling.energy?.min != null ? `min ${feeling.energy.min}` : null,
              feeling.energy?.max != null ? `max ${feeling.energy.max}` : null,
            ].filter(Boolean).join(' · ') || undefined}
          />
          <DashKpi
            value={program.overall?.overallPct != null ? `${program.overall.overallPct}%` : '—'}
            label="оценка программы"
            sub={program.overall?.scale5?.avg != null ? `${program.overall.scale5.avg}/5 · N=${program.overall.scale5.count}` : 'норм. % от шкалы'}
            accent="#16a34a"
          />
          <DashKpi
            value={eng.eveningCoveragePct != null ? `${eng.eveningCoveragePct}%` : '—'}
            label="охват evening"
          />
          <DashKpi
            value={sample.noDataPct != null ? `${sample.noDataPct}%` : '—'}
            label="без данных по точкам"
            accent={Number(sample.noDataPct) >= 40 ? '#b91c1c' : undefined}
          />
        </DashGrid>
      </DashCard>

      <SectionLabel>Как себя чувствует участник</SectionLabel>
      <Collapsible title="Состояние и эмоции" hint={methodology.energy}>
        <DashGrid cols={4}>
          <DashKpi value={nLabel(feeling.energy?.avg, feeling.energy?.count)} label="средняя энергия 1–10" />
          <DashKpi value={dashVal(feeling.energy?.median)} label="медианная энергия" />
          <DashKpi
            value={feeling.riskFatiguePct != null ? `${feeling.riskFatiguePct}%` : '—'}
            label="риск + усталость"
            accent={Number(feeling.riskFatiguePct) >= 30 ? '#b91c1c' : undefined}
          />
          <DashKpi
            value={dashVal(feeling.mostFrequentEmotion)}
            label="частая эмоция"
            sub={feeling.mostFrequentZone ? `зона: ${feeling.mostFrequentZone}` : undefined}
          />
        </DashGrid>

        <div style={{ marginTop: 16 }} className="adm-chart-frame">
          <div className="adm-dash-card-title">
            Энергия по дням
            <MethodHint text="Линия — средняя энергия ответов за день. N в tooltip = число ответов." />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={energyLine} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />
              <XAxis dataKey="dayLabel" tick={{ fontSize: 11, fill: '#86868b' }} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: '#86868b' }} width={32} />
              <Tooltip content={<ChartTooltipRu />} />
              <Line type="monotone" dataKey="avg" name="Средняя энергия" stroke="#1F3A5F" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={{ marginTop: 16 }}>
          <EnergyAverages
            avg={feeling.energy?.avg}
            byDay={feeling.energyByDay}
            byDirectionDay={feeling.energyByDirectionDay}
            title="Энергия по направлениям"
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <div className="adm-dash-card-title">
            Эмоции
            <MethodHint text="Категории не усредняются: доли и мода по ответам проверки состояния." />
          </div>
          <OrientableBarChart
            data={emotionBars}
            categoryKey="name"
            series={[{ dataKey: 'count', name: 'Ответов', fill: '#1F3A5F' }]}
            height={Math.max(180, emotionBars.length * 28)}
            yAxisWidth={130}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <div className="adm-dash-card-title">Эмоциональные зоны</div>
          <ZoneBars zones={feeling.zonesPercent} />
        </div>

        {(feeling.topReasons ?? []).length ? (
          <p className="adm-muted" style={{ fontSize: 12, marginTop: 12 }}>
            Частые причины: {(feeling.topReasons as { token: string; count: number }[])
              .slice(0, 8)
              .map(t => `${t.token} (${t.count})`)
              .join(' · ')}
          </p>
        ) : null}

        <div style={{ marginTop: 12 }}>
          <div className="adm-dash-card-title">День / энергия / риск</div>
          <SortTable
            columns={[
              { key: 'day', label: 'День' },
              { key: 'avg', label: 'Средняя', numeric: true },
              { key: 'median', label: 'Медиана' },
              { key: 'responses', label: 'Ответов', numeric: true },
              { key: 'risk', label: 'Риск+усталость' },
            ]}
            rows={energyTable}
            initialKey="day"
          />
        </div>

        {phaseLine.some(p => p.count > 0) ? (
          <div style={{ marginTop: 16 }}>
            <div className="adm-dash-card-title">Динамика утро → день → вечер (зоны, %)</div>
            <OrientableBarChart
              data={phaseLine}
              categoryKey="name"
              series={[
                { dataKey: 'engagement', name: ZONE_LABELS.engagement ?? 'Включение', fill: ZONE_COLORS.engagement },
                { dataKey: 'lift', name: ZONE_LABELS.lift ?? 'Подъём', fill: ZONE_COLORS.lift },
                { dataKey: 'risk', name: ZONE_LABELS.risk ?? 'Риск', fill: ZONE_COLORS.risk },
                { dataKey: 'fatigue', name: ZONE_LABELS.fatigue ?? 'Усталость', fill: ZONE_COLORS.fatigue },
              ]}
              height={200}
              showLegend
            />
          </div>
        ) : null}
      </Collapsible>

      <SectionLabel>Как участвует</SectionLabel>
      <Collapsible title="Вовлечённость и выполнение" hint={methodology.touchpoints}>
        <DashGrid cols={4}>
          <DashKpi
            value={nLabel(eng.touchpoints?.avg, eng.touchpoints?.count)}
            label={`ср. точек из ${eng.slotsTotal ?? 7}`}
            sub={eng.touchpoints?.median != null ? `медиана ${eng.touchpoints.median}` : undefined}
          />
          <DashKpi value={dashVal(eng.atLeast?.[7])} label="закрыли все 7" sub={eng.atLeastPct?.[7] != null ? `${eng.atLeastPct[7]}%` : undefined} accent="#16a34a" />
          <DashKpi value={eng.stateCheckCoveragePct != null ? `${eng.stateCheckCoveragePct}%` : '—'} label="охват состояния" />
          <DashKpi value={eng.afterBlocksCoveragePct != null ? `${eng.afterBlocksCoveragePct}%` : '—'} label="охват после блоков" />
        </DashGrid>
        <div style={{ height: 10 }} />
        <DashGrid cols={4}>
          <DashKpi value={eng.eveningCoveragePct != null ? `${eng.eveningCoveragePct}%` : '—'} label="охват evening" />
          <DashKpi value={dashVal(eng.tasks?.approved)} label="одобренных заданий" sub={eng.tasks?.approvalPct != null ? `${eng.tasks.approvalPct}%` : undefined} />
          <DashKpi value={dashVal(eng.avgPoints)} label="ср. баллов" />
          <DashKpi
            value={eng.nothingDonePct != null ? `${eng.nothingDonePct}%` : '—'}
            label="ничего не сделали"
            accent={Number(eng.nothingDonePct) >= 30 ? '#b91c1c' : undefined}
          />
        </DashGrid>
        <p className="adm-muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
          Обмен опытом: {dashVal(eng.exchangeParticipants)} участников · копилка: {dashVal(eng.piggyEntries)} записей
          <MethodHint text={methodology.coverage ?? 'Охват — уникальные участники.'} />
        </p>

        <div style={{ marginTop: 14 }}>
          <div className="adm-dash-card-title">
            Распределение по точкам 0–{eng.slotsTotal ?? 7}
            <MethodHint text="Сколько участников в среднем закрыли k точек за дни среза (округление avg)." />
          </div>
          <OrientableBarChart
            data={distBars}
            categoryKey="name"
            series={[{ dataKey: 'count', name: 'Участников', fill: '#1F3A5F' }]}
            height={220}
            yAxisWidth={40}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <TouchpointCoveragePanel data={eng.touchpointThreshold} />
        </div>
        <div style={{ marginTop: 14 }}>
          <div className="adm-dash-card-title">Направления</div>
          <SortTable
            columns={[
              { key: 'direction', label: 'Направление' },
              { key: 'participants', label: 'Участников', numeric: true },
              { key: 'avg', label: 'Ср. точек', numeric: true },
              { key: 'median', label: 'Медиана', numeric: true },
              { key: 'all7', label: 'Все 7', numeric: true },
              { key: 'tasks', label: 'Задания', numeric: true },
              { key: 'evening', label: 'Evening' },
              { key: 'coverage', label: 'Охват' },
            ]}
            rows={dirTable}
            initialKey="coverage"
          />
        </div>
      </Collapsible>

      <SectionLabel>Как оценивает программу</SectionLabel>
      <Collapsible title="Восприятие программы" hint={methodology.program}>
        <DashGrid cols={3}>
          <DashKpi
            value={program.overall?.overallPct != null ? `${program.overall.overallPct}%` : '—'}
            label="общая средняя (норм.)"
            sub={`N=${program.overall?.answered ?? 0} · шкалы не смешиваются без нормализации`}
          />
          <DashKpi
            value={program.highest ? `${program.highest.avg}/${program.highest.max}` : '—'}
            label="наивысшая"
            sub={program.highest?.label}
            accent="#16a34a"
          />
          <DashKpi
            value={program.lowest ? `${program.lowest.avg}/${program.lowest.max}` : '—'}
            label="наинизшая"
            sub={program.lowest?.label}
            accent={program.lowest && program.lowest.max === 5 && program.lowest.avg < 3.5 ? '#b91c1c' : undefined}
          />
        </DashGrid>
        {program.draftsExcluded ? (
          <p className="adm-muted" style={{ fontSize: 12 }}>Черновики исключены: {program.draftsExcluded}</p>
        ) : null}
        <p className="adm-muted" style={{ fontSize: 12 }}>
          ⚠ у вопроса — меньше {sample.thresholds?.rules?.minSample ?? 5} ответов.
        </p>

        <div style={{ marginTop: 14 }}>
          <div className="adm-dash-card-title">Средние по вопросам (% от максимума)</div>
          <OrientableBarChart
            data={questionBars}
            categoryKey="name"
            series={[{ dataKey: 'avgPct', name: '% от max', fill: '#1F3A5F' }]}
            height={Math.max(200, questionBars.length * 30)}
            yAxisWidth={160}
          />
        </div>

        <div style={{ marginTop: 14 }} className="adm-chart-frame">
          <div className="adm-dash-card-title">Общая средняя по дням (норм. %)</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={programDayLine}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />
              <XAxis dataKey="dayLabel" tick={{ fontSize: 11, fill: '#86868b' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#86868b' }} width={36} />
              <Tooltip content={<ChartTooltipRu />} />
              <Line type="monotone" dataKey="overallPct" name="% от max" stroke="#1F3A5F" strokeWidth={2} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={{ marginTop: 12 }}>
          <SortTable
            columns={[
              { key: 'question', label: 'Вопрос' },
              { key: 'avg', label: 'Средняя (N)' },
              { key: 'median', label: 'Медиана' },
              { key: 'pct', label: '% max' },
              { key: 'scale', label: 'Шкала' },
              { key: 'answered', label: 'Ответов', numeric: true },
              { key: 'delta', label: 'Δ к пр. дню' },
            ]}
            rows={questionTable}
            initialKey="answered"
          />
        </div>
      </Collapsible>

      <SectionLabel>Что важно участнику</SectionLabel>
      <Collapsible title="Смыслы, цели и интересы" hint={methodology.themes} defaultOpen={false}>
        <DashGrid cols={2}>
          <DashCard title="Цели">
            <ThemeList items={meanings.goals} />
          </DashCard>
          <DashCard title="Интересы">
            <ThemeList items={meanings.interests} />
          </DashCard>
        </DashGrid>
        <div style={{ height: 10 }} />
        <DashGrid cols={2}>
          <DashCard title="Темы рефлексий">
            <ThemeList items={meanings.reflectionThemes} />
          </DashCard>
          <DashCard title="Темы копилки">
            <ThemeList items={meanings.piggyThemes} />
          </DashCard>
        </DashGrid>
        <div style={{ height: 10 }} />
        <DashGrid cols={2}>
          <DashCard title="В работу">
            <p style={{ margin: '0 0 8px', fontSize: 13 }}>Записей: {dashVal(meanings.vRabota?.total)}</p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#3a3a3c' }}>
              {(meanings.vRabota?.sample ?? []).slice(0, 5).map((t: string, i: number) => (
                <li key={i} style={{ marginBottom: 4 }}>{t}</li>
              ))}
            </ul>
          </DashCard>
          <DashCard title="Обмен опытом · топ вопросов">
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', fontSize: 12 }}>
              {(meanings.exchangeTopQuestions ?? []).slice(0, 6).map((q: { id?: number; text?: string; answers?: number }, i: number) => (
                <li key={q.id ?? i} style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f2' }}>
                  {q.text || '—'}
                  <span className="adm-muted"> · ответов {dashVal(q.answers)}</span>
                </li>
              ))}
              {!meanings.exchangeTopQuestions?.length ? (
                <li className="adm-muted">Нет данных</li>
              ) : null}
            </ul>
          </DashCard>
        </DashGrid>
        <div style={{ height: 10 }} />
        <DashGrid cols={2}>
          <DashCard title="Роли на входе">
            <ThemeList items={meanings.rolesOnEntry} />
          </DashCard>
          <DashCard title="Точка А → Б и роли">
            <p style={{ fontSize: 13, margin: '0 0 6px' }}>
              Обе точки: {dashVal(meanings.pointAB?.completedBoth)} · A: {dashVal(meanings.pointAB?.withPointA)} · B: {dashVal(meanings.pointAB?.withPointB)}
            </p>
            <p style={{ fontSize: 13, margin: '0 0 8px' }}>
              Роль изменилась: {dashVal(meanings.roleChanges?.changed)} · та же: {dashVal(meanings.roleChanges?.same)}
            </p>
            {(meanings.pointAB?.byDirection ?? []).slice(0, 5).map((d: {
              direction: string; total: number; bothPoints: number;
            }) => (
              <p key={d.direction} className="adm-muted" style={{ fontSize: 12, margin: '2px 0' }}>
                {d.direction}: {d.bothPoints}/{d.total} с обеими точками
              </p>
            ))}
          </DashCard>
        </DashGrid>

        {(meanings.quotes?.goals?.length || meanings.quotes?.piggy?.length || meanings.quotes?.reflections?.length) ? (
          <div style={{ marginTop: 12 }}>
            <div className="adm-dash-card-title">Обезличенные цитаты / темы</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
              {(meanings.quotes?.goals ?? []).slice(0, 2).map((t: string, i: number) => (
                <li key={`g-${i}`} style={{ marginBottom: 4 }}>Цель: «{t}»</li>
              ))}
              {(meanings.quotes?.reflections ?? []).slice(0, 2).map((t: string, i: number) => (
                <li key={`r-${i}`} style={{ marginBottom: 4 }}>Рефлексия: «{t}»</li>
              ))}
              {(meanings.quotes?.piggy ?? []).slice(0, 2).map((t: string, i: number) => (
                <li key={`p-${i}`} style={{ marginBottom: 4 }}>Копилка: «{t}»</li>
              ))}
            </ul>
          </div>
        ) : null}

        {(meanings.themesByDay ?? []).length ? (
          <div style={{ marginTop: 12 }}>
            <div className="adm-dash-card-title">Темы по дням</div>
            <SortTable
              columns={[
                { key: 'day', label: 'День' },
                { key: 'piggy', label: 'Копилка (топ)' },
                { key: 'reflections', label: 'Рефлексии (топ)' },
              ]}
              rows={(meanings.themesByDay as {
                day: number;
                piggy: ThemeItem[];
                reflections: ThemeItem[];
              }[]).map(d => ({
                day: formatForumDay(d.day),
                piggy: (d.piggy ?? []).slice(0, 3).map(t => t.label).join(', ') || '—',
                reflections: (d.reflections ?? []).slice(0, 3).map(t => t.label).join(', ') || '—',
              }))}
              initialKey="day"
            />
          </div>
        ) : null}
      </Collapsible>

      <SectionLabel>Сегменты участников</SectionLabel>
      <Collapsible title="Сегменты вовлечённости" hint={methodology.segments} defaultOpen>
        <DashGrid cols={2}>
          {segments.map(s => (
            <DashCard key={s.id} title={s.label} badge={s.pct != null ? `${s.pct}%` : undefined}>
              <p style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700 }}>{s.count}</p>
              <p className="adm-muted" style={{ fontSize: 12, margin: '0 0 6px' }}>
                энергия {dashVal(s.avgEnergy)} · точки {dashVal(s.avgTouchpoints)} · программа {s.avgProgramPct != null ? `${s.avgProgramPct}%` : '—'} · задания {dashVal(s.tasksApprox)}
              </p>
              {s.topEmotions?.length ? (
                <p className="adm-muted" style={{ fontSize: 12, margin: '0 0 6px' }}>
                  эмоции: {s.topEmotions.map(e => e.label).join(', ')}
                </p>
              ) : null}
              {s.topDirections?.length ? (
                <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>
                  чаще: {s.topDirections.slice(0, 3).map(d => d.direction).join(', ')}
                </p>
              ) : null}
            </DashCard>
          ))}
        </DashGrid>
      </Collapsible>

      <SectionLabel>Что делать дальше</SectionLabel>
      <Collapsible title="Рекомендации по правилам" defaultOpen>
        {!recommendations.length ? (
          <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
            {sample.insufficientSample
              ? 'Тревоги скрыты: выборка меньше 5 человек.'
              : 'Пороговые правила не сработали — критических сигналов нет.'}
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {recommendations.map(r => {
              const st = PRIORITY_STYLE[r.priority] ?? PRIORITY_STYLE.watch;
              return (
                <li key={r.id} style={{ padding: '12px 0', borderBottom: '1px solid #e5e5ea' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: st.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {st.label}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{r.title}</div>
                  <div className="adm-muted" style={{ fontSize: 12, marginTop: 4 }}>{r.evidence}</div>
                </li>
              );
            })}
          </ul>
        )}
      </Collapsible>
    </div>
  );
}
