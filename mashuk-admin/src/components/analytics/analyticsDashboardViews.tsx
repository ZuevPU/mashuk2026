import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { AnalyticsTabProps } from './AnalyticsTab';
import { roleName } from '../onboarding/roleOptions';
import { LeaderboardTable } from '../rating/LeaderboardTable';
import { DEFAULT_LEADERBOARD_FILTERS, type LeaderboardRow } from '../rating/leaderboardTypes';
import { useInsights } from '../insights/InsightsContext';
import {
  ChartTooltipRu,
  formatForumDay,
  formatTouchpointKey,
  formatZoneName,
  PHASE_LABELS,
  ZONE_COLORS,
  ZONE_ORDER,
  zonesByDayRows,
  zonesToBarRows,
} from './chartRu';
import {
  DashCard,
  DashGrid,
  DashKpi,
  DashScreenTitle,
  LeaderList,
  QuoteList,
  RoleMatrixGrid,
  SectionLabel,
  SrcBars,
  StatusFlag,
  TagPills,
  ZoneBars,
  dashVal,
  flagFromActivityRate,
} from './dashboardUi';

function ZoneBarChart({ title, zones, hint }: { title: string; zones?: Record<string, number>; hint?: string }) {
  const data = zonesToBarRows(zones ?? {});
  if (!data.length) return null;
  return (
    <DashCard title={title}>
      {hint && <p className="adm-muted" style={{ fontSize: 12, marginTop: -4 }}>{hint}</p>}
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={56} />
          <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} label={{ value: 'Доля ответов, %', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }} />
          <Tooltip content={<ChartTooltipRu />} />
          <Bar dataKey="value" fill="var(--m-accent)" name="value" />
        </BarChart>
      </ResponsiveContainer>
    </DashCard>
  );
}

export function PulseView({ data }: { data: any }) {
  const zones = data.emotionalPulse?.zonesPercent ?? {};
  const series = (data.activity?.activitySeries ?? []).map((row: { day: number; answers: number; touchpoints: number }) => ({
    ...row,
    dayLabel: formatForumDay(row.day),
  }));
  const tp = data.activity?.touchpoints ?? {};
  const stateChecks = data.activity?.stateChecks ?? {};
  const zoneDayRows = zonesByDayRows(data.emotionalPulse?.byDay ?? data.emotionalPulse?.compareZones);
  const registered = data.activity?.registered;
  const activeToday = data.activity?.activeToday;
  const coveragePct = registered > 0 && activeToday != null
    ? Math.round((Number(activeToday) / Number(registered)) * 100)
    : null;
  const eveningDone = data.activity?.eveningCompleted;
  const dirRows = (data.activity?.completionByDirection ?? []) as {
    direction: string; registered: number; activeParticipants: number; activityRatePct: number;
  }[];

  return (
    <div className="adm-dash-stack">
      <DashScreenTitle
        title="Пульс форума"
        hint="Краткий срез дня. Рейтинг и задания — в дашборде «Рейтинг»."
      />
      <DashGrid cols={4}>
        <DashKpi
          value={dashVal(activeToday)}
          label="участников активны сегодня"
          sub={registered != null ? `из ${registered} зарегистрированных` : undefined}
          accent="var(--m-text)"
        />
        <DashKpi
          value={coveragePct != null ? `${coveragePct}%` : '—'}
          label="охват активности"
          sub="доля активных от зарегистрированных"
          accent="#22c55e"
        />
        <DashKpi
          value={dashVal(eveningDone)}
          label="итоги дня"
          sub={Object.keys(stateChecks).length
            ? Object.entries(stateChecks).map(([k, v]) => `${PHASE_LABELS[k] ?? k}: ${String(v)}`).join(' · ')
            : 'проверки состояния'}
          accent="#f59e0b"
        />
        <DashKpi
          value={dashVal(Object.keys(tp).length ? (tp.total ?? Object.values(tp).reduce((a: number, b) => a + Number(b || 0), 0)) : null)}
          label="точки осмысления"
          sub={Object.keys(tp).length
            ? Object.entries(tp).filter(([k]) => k !== 'total').slice(0, 2).map(([k, v]) => `${formatTouchpointKey(k)}: ${v}`).join(' · ')
            : undefined}
          accent="var(--m-accent)"
        />
      </DashGrid>

      <DashGrid cols={2}>
        <DashCard title="Динамика активности">
          {series.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dayLabel" />
                <YAxis allowDecimals={false} />
                <Tooltip content={<ChartTooltipRu />} />
                <Legend />
                <Line type="monotone" dataKey="answers" stroke="var(--m-accent)" name="Ответы" dot />
                <Line type="monotone" dataKey="touchpoints" stroke="#38A169" name="Точки осмысления" dot />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="adm-muted" style={{ fontSize: 12 }}>Нет серии активности</p>
          )}
        </DashCard>
        <DashCard title="Эмоциональный пульс · сейчас">
          <ZoneBars zones={zones} />
        </DashCard>
      </DashGrid>

      {dirRows.length > 0 && (
        <DashCard title="Сигналы по направлениям">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Направление</th>
                <th>Зарег.</th>
                <th>Активны</th>
                <th>% активности</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {dirRows.map(row => (
                <tr key={row.direction}>
                  <td><strong>{row.direction}</strong></td>
                  <td>{row.registered}</td>
                  <td>{row.activeParticipants}</td>
                  <td>{row.activityRatePct}%</td>
                  <td><StatusFlag status={flagFromActivityRate(row.activityRatePct)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </DashCard>
      )}

      <DashGrid cols={2}>
        <ZoneBarChart title="Зоны · утро" zones={data.emotionalPulse?.byPhase?.morning} />
        <ZoneBarChart title="Зоны · день" zones={data.emotionalPulse?.byPhase?.day} />
      </DashGrid>
      <ZoneBarChart title="Зоны · вечер" zones={data.emotionalPulse?.byPhase?.evening} />

      {zoneDayRows.length > 0 && (
        <DashCard title="Зоны по дням">
          <p className="adm-muted" style={{ fontSize: 12 }}>Каждая линия — одна эмоциональная зона, ось Y — доля ответов в %.</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={zoneDayRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} />
              <Tooltip content={<ChartTooltipRu />} />
              <Legend />
              {ZONE_ORDER.map(key => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={formatZoneName(key)}
                  stroke={ZONE_COLORS[key]}
                  dot={false}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </DashCard>
      )}

      {(data.emotionalPulse?.byDirection ?? []).map((row: { direction: string; zones: Record<string, number> }) => (
        <DashCard key={row.direction} title={`Направление: ${row.direction}`}>
          <ZoneBars zones={row.zones} />
        </DashCard>
      ))}

      {data.stateReasons?.topTokens?.length > 0 && (
        <DashCard title="Причины состояния">
          <TagPills
            items={(data.stateReasons.topTokens as { token: string; count: number }[]).map(t => ({
              label: `${t.token} · ${t.count}`,
              tone: 'accent' as const,
            }))}
          />
          {(data.stateReasons.byDay ?? []).map((d: { day: number; topTokens: { token: string; count: number }[] }) => (
            <div key={d.day} style={{ fontSize: 12, marginTop: 6 }}>
              <strong>{formatForumDay(d.day)}</strong>: {d.topTokens.map(t => t.token).join(', ')}
            </div>
          ))}
        </DashCard>
      )}
    </div>
  );
}

export function PortraitView({ data, onOpenCard }: { data: any; onOpenCard: AnalyticsTabProps['onOpenCard'] }) {
  const { meta } = useInsights();
  const roles = (data.preStart?.roleDistribution ?? []).map((r: { key: string; count: number }) => ({
    ...r,
    label: roleName(r.key),
  }));
  const totalRoles = roles.reduce((s: number, r: { count: number }) => s + r.count, 0) || 1;
  const matrix = meta?.roleTaxonomy?.matrix as {
    leader?: { thinking?: string; actions?: string; people?: string };
    org?: { thinking?: string; actions?: string; people?: string };
  } | undefined;
  const catalog = meta?.roleTaxonomy?.catalog ?? [];
  const nameOf = (key?: string) => catalog.find(r => r.roleKey === key)?.name ?? (key ? roleName(key) : '—');

  const matrixCells = matrix ? {
    leader: {
      thinking: nameOf(matrix.leader?.thinking),
      actions: nameOf(matrix.leader?.actions),
      people: nameOf(matrix.leader?.people),
    },
    org: {
      thinking: nameOf(matrix.org?.thinking),
      actions: nameOf(matrix.org?.actions),
      people: nameOf(matrix.org?.people),
    },
  } : null;

  return (
    <div className="adm-dash-stack">
      <DashScreenTitle title="Портрет и движение" hint="Роли на входе, динамика и точка А → Б." />
      <DashGrid cols={4}>
        <DashKpi value={dashVal(totalRoles > 1 ? totalRoles : data.departure?.completedBoth)} label="в выборке ролей / портрета" />
        <DashKpi value={dashVal(data.roleDynamics?.exploredRolesAvg)} label="ролей в среднем на участника" />
        <DashKpi value={dashVal(data.roleDynamics?.roleExitSummary?.changed)} label="изменили роль на выходе" />
        <DashKpi value={dashVal(data.departure?.completedBoth)} label="заполнили точку А и Б" accent="var(--m-accent)" />
      </DashGrid>

      <DashGrid cols={2}>
        {matrixCells ? (
          <DashCard title="Портрет заезда · 6 ролей">
            <RoleMatrixGrid cells={matrixCells} />
          </DashCard>
        ) : (
          <DashCard title="Роли на входе">
            {roles.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={roles}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={70} />
                  <YAxis allowDecimals={false} />
                  <Tooltip content={<ChartTooltipRu />} />
                  <Bar dataKey="count" fill="var(--m-accent)" name="count" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="adm-muted" style={{ fontSize: 12 }}>Нет распределения ролей</p>
            )}
          </DashCard>
        )}
        <DashCard title="Стартовая аналитика">
          <SectionLabel>Цели (топ)</SectionLabel>
          <TagPills
            tone="accent"
            items={(data.preStart?.goalTopTokens ?? []).slice(0, 8).map((t: { token: string; count: number }) => ({
              label: `${t.token} · ${t.count}`,
            }))}
          />
          <SectionLabel>Интересы</SectionLabel>
          <TagPills
            items={(data.preStart?.interestTop ?? []).slice(0, 8).map((r: { key: string; count: number }) => ({
              label: `${r.key} · ${r.count}`,
            }))}
          />
        </DashCard>
      </DashGrid>

      <DashCard title="Ролевая динамика">
        <p style={{ fontSize: 13, marginTop: 0 }}>
          На выходе изменили роль: {dashVal(data.roleDynamics?.roleExitSummary?.changed)}
          {' · '}без изменений: {dashVal(data.roleDynamics?.roleExitSummary?.same)}
        </p>
        <LeaderList
          items={(data.roleDynamics?.experimentTop ?? []).slice(0, 6).map((r: { label: string; count: number }) => ({
            name: r.label,
            score: r.count,
          }))}
        />
        <table className="adm-table" style={{ marginTop: 12 }}>
          <thead><tr><th>День</th><th>Роль</th><th>Выборов</th></tr></thead>
          <tbody>
            {(data.roleDynamics?.experimentDaySeries ?? []).slice(0, 20).map((r: { day: number; label: string; count: number }, i: number) => (
              <tr key={i}><td>{formatForumDay(r.day)}</td><td>{r.label}</td><td>{r.count}</td></tr>
            ))}
          </tbody>
        </table>
      </DashCard>

      {(data.roleDynamics?.roleMatrix ?? []).length > 0 && (
        <DashCard title="Матрица старт × эксперимент × финал">
          <table className="adm-table">
            <thead><tr><th>Старт</th><th>Эксперимент</th><th>Финал</th><th>N</th></tr></thead>
            <tbody>
              {(data.roleDynamics.roleMatrix as { startLabel: string; experimentLabel: string; finalLabel: string; count: number }[]).slice(0, 30).map((r, i) => (
                <tr key={i}>
                  <td>{r.startLabel}</td><td>{r.experimentLabel}</td><td>{r.finalLabel}</td><td>{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DashCard>
      )}

      <DashCard title="Матрица ролей (выборка)">
        <table className="adm-table">
          <thead><tr><th>ID</th><th>Старт</th><th>Эксперименты</th><th>Сильная</th><th>Рост</th></tr></thead>
          <tbody>
            {(data.roleDynamics?.matrixSample ?? []).slice(0, 20).map((r: { participantId: number; start: string; experiments: string[]; finalStrong: string; finalGrowth: string }) => (
              <tr key={r.participantId}>
                <td><button type="button" className="adm-link" onClick={() => onOpenCard(r.participantId)}>{r.participantId}</button></td>
                <td>{r.start}</td><td>{r.experiments.join(', ')}</td><td>{r.finalStrong}</td><td>{r.finalGrowth}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DashCard>

      <DashCard title="Точка А → Б">
        <p>Заполнили обе: {dashVal(data.departure?.completedBoth)}</p>
        {(data.departure?.byDirection ?? []).map((row: { direction: string; total: number; bothPoints: number }) => (
          <p key={row.direction} style={{ fontSize: 13 }}>{row.direction}: {row.bothPoints}/{row.total}</p>
        ))}
        <table className="adm-table">
          <thead><tr><th>Участник</th><th>А</th><th>Б</th></tr></thead>
          <tbody>
            {(data.departure?.participants ?? []).slice(0, 30).map((r: { id: number; name: string; hasPointA?: boolean; hasPointB?: boolean }) => (
              <tr key={r.id}>
                <td><button type="button" className="adm-link" onClick={() => onOpenCard(r.id)}>{r.name}</button></td>
                <td>{r.hasPointA ? '✓' : '—'}</td>
                <td>{r.hasPointB ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DashCard>
    </div>
  );
}

function ScaleTable({ title, rows }: { title: string; rows: { label: string; avg: number; responses: number }[] }) {
  if (!rows?.length) return null;
  return (
    <DashCard title={title}>
      <table className="adm-table">
        <thead><tr><th>Блок</th><th>Средняя</th><th>Ответов</th></tr></thead>
        <tbody>
          {rows.map(s => <tr key={s.label}><td>{s.label}</td><td>{s.avg}</td><td>{s.responses}</td></tr>)}
        </tbody>
      </table>
    </DashCard>
  );
}

export function ProgramView({ data }: { data: any }) {
  const blocks = data.blocks ?? {};
  const allScales = [
    ...(blocks.direction ?? []),
    ...(blocks.lessonsImportant ?? []),
    ...(blocks.openLessons ?? []),
    ...(blocks.workshops ?? []),
  ] as { label: string; avg: number; responses: number }[];
  const avgScore = allScales.length
    ? (allScales.reduce((s, r) => s + (r.avg || 0), 0) / allScales.length).toFixed(1)
    : '—';
  const clubs = (blocks.clubs ?? []) as { title: string; attendance: number }[];
  const divergence = (data.divergenceExtended ?? data.divergence ?? []) as {
    eventId: number; title: string; attendance: number; mentionScore?: number;
  }[];
  const eventRows = [
    ...clubs.map(c => ({ title: c.title, day: '—', audience: c.attendance, score: null as number | null, piggy: null as number | null, flag: false })),
    ...divergence.map(d => ({
      title: d.title,
      day: '—',
      audience: d.attendance,
      score: null as number | null,
      piggy: d.mentionScore ?? null,
      flag: true,
    })),
  ];

  return (
    <div className="adm-dash-stack">
      <DashScreenTitle title="Образовательная программа" hint="Оценки блоков, посещаемость и расхождения." />
      <DashGrid cols={3}>
        <DashKpi value={dashVal(allScales.length)} label="блоков с оценками" sub="направление · уроки · практики" accent="#375623" />
        <DashKpi value={avgScore} label="средняя оценка блоков" sub="по доступным шкалам" accent="var(--m-text)" />
        <DashKpi value={dashVal(divergence.length)} label="расхождения" sub="посещаемость vs упоминания" accent="#f59e0b" />
      </DashGrid>

      {(eventRows.length > 0 || clubs.length > 0) && (
        <DashCard title="Уроки и занятия · посещаемость">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Событие</th>
                <th>Аудитория</th>
                <th>Упом. / копилка</th>
                <th>Флаг</th>
              </tr>
            </thead>
            <tbody>
              {eventRows.slice(0, 20).map((e, i) => (
                <tr key={`${e.title}-${i}`}>
                  <td><strong>{e.title}</strong></td>
                  <td>{e.audience}</td>
                  <td>{e.piggy ?? '—'}</td>
                  <td>{e.flag ? <StatusFlag status="warn" /> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DashCard>
      )}

      <DashGrid cols={2}>
        <ScaleTable title="Направление" rows={blocks.direction} />
        <ScaleTable title="Уроки о важном" rows={blocks.lessonsImportant} />
      </DashGrid>
      <DashGrid cols={2}>
        <ScaleTable title="Открытые уроки" rows={blocks.openLessons} />
        <ScaleTable title="Практики" rows={blocks.workshops} />
      </DashGrid>

      <DashCard title="События дня — упоминания">
        <TagPills
          tone="accent"
          items={(data.dayEvents?.topMentions ?? []).map((t: { token: string; count: number }) => ({
            label: `${t.token} · ${t.count}`,
          }))}
        />
      </DashCard>

      {(data.practicesByDay ?? []).map((d: { day: number; top: { title: string; attendance: number }[] }) => (
        <DashCard key={d.day} title={`Топ практик · ${formatForumDay(d.day)}`}>
          <LeaderList items={d.top.map(e => ({ name: e.title, score: e.attendance }))} />
        </DashCard>
      ))}

      {data.nps?.available && (data.nps?.byPractice ?? []).length > 0 ? (
        <DashCard title="NPS по педагогическим практикам">
          <p className="adm-muted" style={{ fontSize: 12 }}>{data.nps.note}</p>
          <table className="adm-table">
            <thead>
              <tr><th>Практика</th><th>Ответов</th><th>Средняя 1–10</th><th>NPS</th></tr>
            </thead>
            <tbody>
              {(data.nps.byPractice as { practice: string; responses: number; avgScore: number; nps: number }[]).map(row => (
                <tr key={row.practice}>
                  <td>{row.practice}</td>
                  <td>{row.responses}</td>
                  <td>{row.avgScore}</td>
                  <td>{row.nps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DashCard>
      ) : data.nps?.note ? (
        <p className="adm-muted">{data.nps.note}</p>
      ) : null}
    </div>
  );
}

export function ActivityView({
  data,
  onOpenRating,
}: {
  data: any;
  onOpenRating?: () => void;
}) {
  const trackLabel: Record<string, string> = { path: 'Путь', experience: 'Опыт', total: 'Общий', day: 'За день' };

  const toRows = (items: { id: number; rank: number; name: string; direction?: string; points: number }[]): LeaderboardRow[] =>
    items.map(r => {
      const parts = r.name.trim().split(/\s+/);
      const firstName = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
      const lastName = parts.length > 1 ? parts[0] : '';
      return {
        rank: r.rank,
        id: r.id,
        firstName,
        lastName,
        direction: r.direction ?? null,
        score: r.points,
      };
    });

  const filtersForTrack = (track: 'total' | 'path' | 'experience') => ({
    ...DEFAULT_LEADERBOARD_FILTERS,
    mode: 'points' as const,
    track,
    scope: 'shift' as const,
  });

  const pointsByDayChart = (data.pointsByDay ?? []).map((row: { day: number; points: number }) => ({
    ...row,
    dayLabel: formatForumDay(row.day),
  }));
  const nominationChart = (data.pointsByNomination ?? []).filter((n: { points: number }) => n.points > 0);
  const engagementSeries = (data.engagementSeries ?? []).map((row: { day: number; points: number; activeParticipants: number; taskCompletions: number }) => ({
    ...row,
    dayLabel: formatForumDay(row.day),
  }));
  const topTotal = (data.ratings?.total ?? []).slice(0, 5) as { name: string; points: number; direction?: string }[];

  return (
    <div className="adm-dash-stack">
      <DashScreenTitle title="Активность и рейтинг" hint="Участники, баллы, задания и медали." />
      <DashGrid cols={4}>
        <DashKpi value={dashVal(data.participants?.total)} label="всего участников" />
        <DashKpi value={dashVal(data.participants?.registered)} label="зарегистрировались" accent="#22c55e" />
        <DashKpi value={dashVal(data.participants?.activeToday)} label="активны сегодня" accent="var(--m-accent)" />
        <DashKpi value={dashVal(data.participants?.completedAtLeastOneTask)} label="≥ 1 задание" />
      </DashGrid>

      <DashGrid cols={2}>
        <DashCard title="Топ рейтинга">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            {onOpenRating && (
              <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={onOpenRating}>
                Полный рейтинг →
              </button>
            )}
          </div>
          <LeaderList
            items={topTotal.map(r => ({
              name: r.name,
              sub: r.direction,
              score: r.points,
            }))}
          />
        </DashCard>
        <DashCard title="Задания и модерация">
          <p style={{ marginTop: 0, fontSize: 13 }}>
            На модерации: {dashVal(data.tasks?.pendingModeration)} · Командные: {dashVal(data.tasks?.pendingTeam)}
            {data.moderation != null && (
              <> · Отклонено: {data.moderation.rejected} ({data.moderation.rejectedPercent}%)</>
            )}
          </p>
          <LeaderList
            items={(data.tasks?.popular ?? []).slice(0, 5).map((t: { title: string; count: number }) => ({
              name: t.title,
              score: t.count,
            }))}
          />
        </DashCard>
      </DashGrid>

      {pointsByDayChart.length > 0 && (
        <DashCard title="Баллы по дням">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={pointsByDayChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="dayLabel" />
              <YAxis allowDecimals={false} />
              <Tooltip content={<ChartTooltipRu />} />
              <Bar dataKey="points" fill="var(--m-accent)" name="points" />
            </BarChart>
          </ResponsiveContainer>
        </DashCard>
      )}

      {nominationChart.length > 0 && (
        <DashCard title="Баллы по номинациям">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={nominationChart} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 11 }} />
              <Tooltip content={<ChartTooltipRu />} />
              <Bar dataKey="points" fill="#3182CE" name="points" />
            </BarChart>
          </ResponsiveContainer>
        </DashCard>
      )}

      {engagementSeries.length > 0 && (
        <DashCard title="Динамика вовлечённости">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={engagementSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="dayLabel" />
              <YAxis allowDecimals={false} />
              <Tooltip content={<ChartTooltipRu />} />
              <Legend />
              <Line type="monotone" dataKey="points" stroke="var(--m-accent)" name="Баллы" dot />
              <Line type="monotone" dataKey="activeParticipants" stroke="#3182CE" name="Активные" dot />
              <Line type="monotone" dataKey="taskCompletions" stroke="#38A169" name="Задания" dot />
            </LineChart>
          </ResponsiveContainer>
        </DashCard>
      )}

      <DashCard title="Рейтинги">
        <p className="adm-muted" style={{ fontSize: 12, marginTop: 0 }}>
          Топ-10 с учётом фильтров аналитики. Полная таблица — во вкладке «Рейтинг».
        </p>
        <div className="lb-activity-grid">
          {(['total', 'day'] as const).map(track => (
            <div key={track} className="lb-activity-block">
              <h4>{trackLabel[track] ?? track}</h4>
              <LeaderboardTable
                rows={toRows(data.ratings?.[track] ?? [])}
                filters={{
                  ...DEFAULT_LEADERBOARD_FILTERS,
                  mode: 'points',
                  track: 'total',
                  scope: track === 'day' ? 'day' : 'shift',
                }}
                maxRows={10}
              />
            </div>
          ))}
          {(data.ratings?.medalsDay ?? []).length > 0 && (
            <div className="lb-activity-block">
              <h4>Медали за день</h4>
              <LeaderboardTable
                rows={toRows(data.ratings.medalsDay)}
                filters={{ ...DEFAULT_LEADERBOARD_FILTERS, mode: 'points', medalFilter: 'count', scope: 'day' }}
                maxRows={10}
              />
            </div>
          )}
        </div>
        {(data.ratings?.nominations ?? []).length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h4 style={{ margin: '0 0 8px' }}>Номинации (топ-10)</h4>
            <div className="lb-activity-grid">
              {(data.ratings.nominations as { key: string; label: string; top: { id: number; rank: number; name: string; points: number; direction?: string }[] }[]).map(nom => (
                <div key={nom.key} className="lb-activity-block">
                  <strong>{nom.label}</strong>
                  <LeaderboardTable
                    rows={toRows(nom.top)}
                    filters={{ ...DEFAULT_LEADERBOARD_FILTERS, mode: 'nomination', nomination: nom.key }}
                    maxRows={10}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        {(data.ratings?.byDirection ?? []).length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h4 style={{ margin: '0 0 8px' }}>По направлениям</h4>
            {(data.ratings?.byDirection ?? []).map((row: { direction: string; top: { name: string; points: number; rank?: number; id?: number }[] }) => (
              <div key={row.direction} className="lb-activity-block">
                <strong>{row.direction}</strong>
                <LeaderboardTable
                  rows={toRows((row.top ?? []).map((t, i) => ({
                    id: t.id ?? i,
                    rank: t.rank ?? i + 1,
                    name: t.name,
                    points: t.points,
                    direction: row.direction,
                  })))}
                  filters={filtersForTrack('total')}
                  maxRows={5}
                />
              </div>
            ))}
          </div>
        )}
      </DashCard>

      <DashGrid cols={2}>
        <DashCard title="Популярные / сложные задания">
          {(data.tasks?.hardest ?? []).length > 0 && (
            <>
              <SectionLabel>Редко выполняемые</SectionLabel>
              <ul style={{ fontSize: 13 }}>
                {(data.tasks?.hardest ?? []).map((t: { taskId: number; title: string; approved: number; approvalRate: number | null }) => (
                  <li key={t.taskId}>
                    {t.title}: {t.approved} одобр.
                    {t.approvalRate != null ? ` (${t.approvalRate}%)` : ''}
                  </li>
                ))}
              </ul>
            </>
          )}
          {(data.tasks?.byCategory ?? []).length > 0 && (
            <>
              <SectionLabel>По категориям</SectionLabel>
              <TagPills
                items={(data.tasks.byCategory as { category: string; count: number }[]).map(c => ({
                  label: `${c.category} · ${c.count}`,
                }))}
              />
            </>
          )}
        </DashCard>
        <DashCard title="Медали">
          <p style={{ marginTop: 0, fontSize: 13 }}>
            Открытые: {dashVal(data.medalsSummary?.open)} · Скрытые: {dashVal(data.medalsSummary?.hidden)}
          </p>
          <div className="adm-dash-tags">
            {(data.medals ?? []).slice(0, 12).map((m: { name: string; medal: string; hidden: boolean }, i: number) => (
              <span key={i} className="adm-dash-tag adm-dash-tag-accent">
                {m.name}: {m.medal}{m.hidden ? ' (скрыт.)' : ''}
              </span>
            ))}
          </div>
        </DashCard>
      </DashGrid>
    </div>
  );
}

const PIGGY_TAGS = ['идея', 'мысль', 'вопрос', 'контакт', 'на будущее', 'в работу'];
const PIGGY_SOURCES = ['Направление', 'Урок о важном', 'Открытый урок', 'Клуб', 'Разговор с участником', 'Своя мысль'];

export function PiggybankView({
  data,
  tagFilter,
  sourceFilter,
  onTagFilter,
  onSourceFilter,
}: {
  data: any;
  tagFilter: string;
  sourceFilter: string;
  onTagFilter: (v: string) => void;
  onSourceFilter: (v: string) => void;
}) {
  const bySource = Object.entries(data.bySource ?? {}) as [string, { count: number; tagMix: { tag: string; count: number }[] }][];
  const srcItems = bySource.map(([label, v]) => ({ label, count: v.count }));
  const total = data.navigation?.total ?? srcItems.reduce((s, i) => s + i.count, 0);
  const vRabotaTop = (data.vRabota?.byDirection ?? []) as { direction: string; count: number }[];

  return (
    <div className="adm-dash-stack">
      <DashScreenTitle title="Копилка" hint="Теги, источники и топ «в работу»." />
      <DashGrid cols={3}>
        <DashKpi value={dashVal(total)} label="записей в копилке" accent="var(--m-accent)" />
        <DashKpi value={dashVal(data.vRabota?.total)} label="тег «в работу»" accent="#22c55e" />
        <DashKpi value={dashVal(Object.keys(data.byTag ?? {}).length)} label="активных тегов" />
      </DashGrid>

      <DashCard title="Фильтры">
        <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap' }}>
          <select className="adm-input" value={tagFilter} onChange={e => onTagFilter(e.target.value)}>
            <option value="">Все теги</option>
            {PIGGY_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="adm-input" value={sourceFilter} onChange={e => onSourceFilter(e.target.value)}>
            <option value="">Все источники</option>
            {PIGGY_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </DashCard>

      <DashGrid cols={2}>
        <DashCard title="Источники">
          <SrcBars items={srcItems} />
        </DashCard>
        <DashCard title="«В работу» по направлениям">
          <LeaderList
            items={vRabotaTop.slice(0, 8).map(d => ({ name: d.direction, score: d.count }))}
          />
        </DashCard>
      </DashGrid>

      {Object.entries(data.byTag ?? {}).map(([tag, v]) => {
        const block = v as { count: number; topThemes?: { token: string; count: number }[]; entries?: { text: string }[]; byDirection?: { direction: string; count: number }[] };
        return (
          <DashCard key={tag} title={`Тег «${tag}» — ${block.count}`}>
            <TagPills
              tone="accent"
              items={(block.topThemes ?? []).map(t => ({ label: `${t.token} · ${t.count}` }))}
            />
            <QuoteList
              items={(block.entries ?? []).slice(0, 4).map(e => ({ text: e.text?.slice(0, 160) || '—' }))}
            />
          </DashCard>
        );
      })}
    </div>
  );
}

export function SemanticView({ data }: { data: any }) {
  if (!data.enabled) {
    return (
      <div className="adm-dash-stack">
        <DashScreenTitle title="Смысловая аналитика" hint="Раздел пока недоступен на сервере." />
        <DashCard title="Нет данных">
          <p className="adm-muted" style={{ margin: 0, fontSize: 13 }}>
            {data.message || 'Смысловая аналитика отключена в настройках сервера.'}
          </p>
        </DashCard>
      </div>
    );
  }
  return (
    <div className="adm-dash-stack">
      <DashScreenTitle title="Смысловая аналитика" hint="Эвристики и языковой трекер." />
      <DashCard title="Наблюдение дня">
        <p style={{ marginTop: 0 }}>{data.dailyObservation || '—'}</p>
      </DashCard>
      <DashGrid cols={2}>
        <DashCard title="Профессиональная сдвижка">
          <p>{data.professionalShift?.summary}</p>
          <TagPills
            tone="ok"
            items={(data.professionalShift?.emergingThemes ?? []).map((t: string) => ({ label: t }))}
          />
        </DashCard>
        <DashCard title="Языковой трекер">
          {(data.languageTracker?.byDay ?? []).map((d: { day: number; terms: { token: string }[] }) => (
            <div key={d.day} style={{ marginBottom: 8 }}>
              <strong style={{ fontSize: 12 }}>{formatForumDay(d.day)}</strong>
              <TagPills items={d.terms.map(t => ({ label: t.token, tone: 'accent' as const }))} />
            </div>
          ))}
        </DashCard>
      </DashGrid>
      <DashCard title="Кластеры дня">
        <SectionLabel>Темы</SectionLabel>
        <TagPills
          tone="accent"
          items={(data.semanticClusters?.themesOfDay ?? []).map((t: { token: string }) => ({ label: t.token }))}
        />
        <SectionLabel>Новые вопросы</SectionLabel>
        <TagPills
          items={(data.semanticClusters?.newQuestions ?? []).map((t: { token: string }) => ({ label: t.token }))}
        />
      </DashCard>
      <DashCard title="Глубина рефлексии">
        <TagPills
          items={Object.entries(data.depthLayers?.distribution ?? {}).map(([k, v]) => ({
            label: `${k}: ${String(v)}`,
          }))}
        />
        <QuoteList
          items={(data.depthLayers?.topDeepReflections ?? []).slice(0, 8).map((r: { text: string }) => ({
            text: r.text.slice(0, 220),
          }))}
        />
      </DashCard>
    </div>
  );
}

export function ClubsView({
  data,
  clubFilter,
  onClubFilter,
  onSaveClub,
  editDraft,
  onEditDraft,
}: {
  data: any;
  clubFilter: string;
  onClubFilter: (v: string) => void;
  onSaveClub?: (id: string, description: string) => Promise<void>;
  editDraft: Record<string, string>;
  onEditDraft: (id: string, text: string) => void;
}) {
  if (!data.enabled) {
    return (
      <div className="adm-dash-stack">
        <DashScreenTitle title="Материал для клубов" hint="Раздел пока недоступен на сервере." />
        <DashCard title="Нет данных">
          <p className="adm-muted" style={{ margin: 0, fontSize: 13 }}>
            {data.message ?? 'Материал для клубов отключён в настройках сервера.'}
          </p>
        </DashCard>
      </div>
    );
  }
  return (
    <div className="adm-dash-stack">
      <DashScreenTitle title="Материал для клубов" hint="Описания клубов и совпадения." />
      <DashGrid cols={2}>
        <DashCard title="Описания клубов">
          {(data.clubs ?? []).map((c: { id: string; name: string; description?: string }) => (
            <div key={c.id} style={{ marginBottom: 12 }}>
              <strong>{c.name}</strong>
              <textarea
                className="adm-input"
                style={{ width: '100%', minHeight: 64, marginTop: 4 }}
                value={editDraft[c.id] ?? c.description ?? ''}
                onChange={e => onEditDraft(c.id, e.target.value)}
              />
              {onSaveClub && (
                <button type="button" className="adm-btn adm-btn-secondary" onClick={() => onSaveClub(c.id, editDraft[c.id] ?? c.description ?? '')}>
                  Сохранить
                </button>
              )}
            </div>
          ))}
        </DashCard>
        <DashCard title="Совпадения">
          <select className="adm-input" value={clubFilter} onChange={e => onClubFilter(e.target.value)}>
            <option value="">Все клубы</option>
            {(data.clubs ?? []).map((c: { id: string; name: string }) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {(data.matches ?? []).length === 0 ? (
            <p className="adm-muted" style={{ fontSize: 12, marginTop: 8 }}>Пока нет совпадений</p>
          ) : (
            <table className="adm-table" style={{ marginTop: 8 }}>
              <thead><tr><th>Клуб</th><th>%</th><th>Источник</th><th>Фрагмент</th></tr></thead>
              <tbody>
                {(data.matches ?? []).slice(0, 50).map((m: { id: number; clubId: string; similarity: number; sourceType: string; snippet: string }) => (
                  <tr key={m.id}>
                    <td>{m.clubId}</td>
                    <td>{m.similarity}</td>
                    <td>{m.sourceType}</td>
                    <td style={{ fontSize: 12 }}>{m.snippet}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DashCard>
      </DashGrid>
    </div>
  );
}

export function OverviewView({ data }: { data: any }) {
  const { meta, setActiveDashboardId } = useInsights();
  const zones = data.activity?.emotionZones ?? {};
  const registered = data.pulse?.registered;
  const activeToday = data.pulse?.activeToday ?? data.activity?.participants?.activeToday;
  const coveragePct = registered > 0 && activeToday != null
    ? Math.round((Number(activeToday) / Number(registered)) * 100)
    : null;
  const roleList = (data.portrait?.roleList ?? Object.entries(data.portrait?.roleDistribution ?? {}).map(([key, count]) => ({
    key, count: Number(count),
  }))) as { key: string; count: number }[];
  const matrix = meta?.roleTaxonomy?.matrix as {
    leader?: { thinking?: string; actions?: string; people?: string };
    org?: { thinking?: string; actions?: string; people?: string };
  } | undefined;
  const catalog = meta?.roleTaxonomy?.catalog ?? [];
  const nameOf = (key?: string) => catalog.find(r => r.roleKey === key)?.name ?? (key ? roleName(key) : '—');
  const matrixCells = matrix ? {
    leader: {
      thinking: nameOf(matrix.leader?.thinking),
      actions: nameOf(matrix.leader?.actions),
      people: nameOf(matrix.leader?.people),
    },
    org: {
      thinking: nameOf(matrix.org?.thinking),
      actions: nameOf(matrix.org?.actions),
      people: nameOf(matrix.org?.people),
    },
  } : null;
  const dirRows = (data.pulse?.completionByDirection ?? []) as {
    direction: string; registered: number; activeParticipants: number; activityRatePct: number;
  }[];
  const topTotal = (data.activity?.topTotal ?? data.activity?.pathLeaders ?? []) as {
    name: string; points: number; direction?: string;
  }[];
  const piggySeries = (data.piggybank?.series ?? Object.entries(data.piggybank?.byTag ?? {}).map(([tag, value]) => ({
    tag, value: Number(value),
  }))) as { tag: string; value: number }[];
  const go = (id: Parameters<typeof setActiveDashboardId>[0]) => () => setActiveDashboardId(id);

  return (
    <div className="adm-dash-stack">
      <DashScreenTitle
        title="Главный дашборд"
        hint="Сводка дня: KPI, пульс, портрет, программа, копилка и активность."
      />

      <DashGrid cols={4}>
        <DashKpi
          value={dashVal(activeToday)}
          label="активны сегодня"
          sub={registered != null ? `из ${registered} зарегистрированных` : undefined}
          accent="var(--m-text)"
        />
        <DashKpi
          value={coveragePct != null ? `${coveragePct}%` : '—'}
          label="охват активности"
          accent="#22c55e"
        />
        <DashKpi
          value={dashVal(data.pulse?.eveningCompleted)}
          label="итоги дня"
          accent="#f59e0b"
        />
        <DashKpi
          value={dashVal(data.piggybank?.total)}
          label="записей копилки"
          sub={data.piggybank?.vRabotaTotal != null ? `в работу: ${data.piggybank.vRabotaTotal}` : undefined}
          accent="var(--m-accent)"
        />
      </DashGrid>

      <DashGrid cols={4}>
        <DashKpi value={dashVal(data.pulse?.totalAnswers)} label="ответов (серия)" />
        <DashKpi value={dashVal(data.program?.eventsCount)} label="событий программы" />
        <DashKpi value={dashVal(data.activity?.tasksPendingModeration)} label="заданий на модерации" accent="#f59e0b" />
        <DashKpi value={dashVal(data.portrait?.completedBoth)} label="точка А и Б" accent="var(--m-accent)" />
      </DashGrid>

      <DashGrid cols={2}>
        <DashCard title="Эмоциональный пульс">
          <ZoneBars zones={zones} />
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" style={{ marginTop: 10 }} onClick={go('pulse')}>
            Открыть пульс →
          </button>
        </DashCard>
        <DashCard title="Сигналы по направлениям">
          {dirRows.length > 0 ? (
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Направление</th>
                  <th>% акт.</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {dirRows.slice(0, 8).map(row => (
                  <tr key={row.direction}>
                    <td><strong>{row.direction}</strong></td>
                    <td>{row.activityRatePct}%</td>
                    <td><StatusFlag status={flagFromActivityRate(row.activityRatePct)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет среза по направлениям</p>
          )}
        </DashCard>
      </DashGrid>

      <DashGrid cols={2}>
        {matrixCells ? (
          <DashCard title="Портрет · роли 2×3">
            <RoleMatrixGrid cells={matrixCells} />
            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" style={{ marginTop: 10 }} onClick={go('roles')}>
              Матрица ролей →
            </button>
          </DashCard>
        ) : (
          <DashCard title="Роли на входе">
            <LeaderList
              items={roleList.slice(0, 6).map(r => ({
                name: roleName(r.key),
                score: r.count,
              }))}
            />
            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" style={{ marginTop: 10 }} onClick={go('portrait')}>
              Портрет →
            </button>
          </DashCard>
        )}
        <DashCard title="Цели и интересы (старт)">
          <SectionLabel>Цели</SectionLabel>
          <TagPills
            tone="accent"
            items={(data.portrait?.goalTopTokens ?? []).slice(0, 8).map((t: { token: string; count: number }) => ({
              label: `${t.token} · ${t.count}`,
            }))}
          />
          <SectionLabel>Направления</SectionLabel>
          <TagPills
            items={Object.entries(data.portrait?.directionDistribution ?? {}).slice(0, 8).map(([k, v]) => ({
              label: `${k} · ${String(v)}`,
            }))}
          />
        </DashCard>
      </DashGrid>

      <DashGrid cols={2}>
        <DashCard title="Программа · топ событий">
          <LeaderList
            items={(data.program?.topEvents ?? []).slice(0, 6).map((e: { id?: number; title?: string }, i: number) => ({
              name: e.title || `Событие ${e.id ?? i}`,
              score: i + 1,
            }))}
          />
          {(data.program?.topMentions ?? []).length > 0 && (
            <>
              <SectionLabel>Упоминания</SectionLabel>
              <TagPills
                tone="accent"
                items={(data.program.topMentions as { token: string; count: number }[]).map(t => ({
                  label: `${t.token} · ${t.count}`,
                }))}
              />
            </>
          )}
          {data.program?.divergenceCount != null && data.program.divergenceCount > 0 && (
            <p style={{ fontSize: 12, marginBottom: 0 }}>
              Расхождений посещаемость/упоминания: <strong>{data.program.divergenceCount}</strong>
            </p>
          )}
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" style={{ marginTop: 10 }} onClick={go('program')}>
            Программа →
          </button>
        </DashCard>
        <DashCard title="Копилка">
          <SrcBars
            items={piggySeries.slice(0, 8).map(s => ({ label: s.tag, count: s.value }))}
          />
          {(data.piggybank?.vRabotaByDirection ?? []).length > 0 && (
            <>
              <SectionLabel>«В работу» по направлениям</SectionLabel>
              <LeaderList
                items={(data.piggybank.vRabotaByDirection as { direction: string; count: number }[]).map(d => ({
                  name: d.direction,
                  score: d.count,
                }))}
              />
            </>
          )}
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" style={{ marginTop: 10 }} onClick={go('piggybank')}>
            Копилка →
          </button>
        </DashCard>
      </DashGrid>

      <DashGrid cols={2}>
        <DashCard title="Топ рейтинга">
          <LeaderList
            items={topTotal.slice(0, 5).map(r => ({
              name: r.name,
              sub: r.direction,
              score: r.points,
            }))}
          />
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" style={{ marginTop: 10 }} onClick={go('activity')}>
            Рейтинг →
          </button>
        </DashCard>
        <DashCard title="Задания и модерация">
          <p style={{ marginTop: 0, fontSize: 13 }}>
            Одобрено (популярные): {dashVal(data.activity?.tasksApproved)}
            {' · '}на модерации: {dashVal(data.activity?.tasksPendingModeration)}
            {' · '}командные: {dashVal(data.activity?.teamPendingConfirm)}
          </p>
          <LeaderList
            items={(data.activity?.popularTasks ?? []).slice(0, 5).map((t: { title: string; count: number }) => ({
              name: t.title,
              score: t.count,
            }))}
          />
        </DashCard>
      </DashGrid>

      {(data.pulse?.stateReasonsTop ?? []).length > 0 && (
        <DashCard title="Причины состояния (топ)">
          <TagPills
            tone="accent"
            items={(data.pulse.stateReasonsTop as { token: string; count: number }[]).map(t => ({
              label: `${t.token} · ${t.count}`,
            }))}
          />
        </DashCard>
      )}
    </div>
  );
}

type EveningAnswerRow = {
  participantId: number;
  name: string;
  direction: string;
  group: string;
  day: number;
  answer: string | number;
  filledAt: string | null;
};

type EveningQuestionStat = {
  key: string;
  label: string;
  type: string;
  answered: number;
  avg?: number | null;
  distribution: { label: string; count: number; pct: number }[];
  answers: EveningAnswerRow[];
};

export function EveningView({
  data,
  onOpenCard,
}: {
  data: any;
  onOpenCard: AnalyticsTabProps['onOpenCard'];
}) {
  const { forumDay } = useInsights();
  const submitted = data.activity?.submitted ?? 0;
  const drafts = data.activity?.drafts ?? 0;
  const cohortSize = data.activity?.cohortSize ?? 0;
  const fillRatePct = data.activity?.fillRatePct;
  const questions = (data.questions ?? []) as EveningQuestionStat[];
  const notes = (data.diagnostics?.notes ?? []) as string[];
  const byDirection = (data.byDirection ?? data.activity?.byDirection ?? []) as {
    direction: string; submitted: number; registered: number; fillRatePct: number;
  }[];
  const directionChart = byDirection.map(r => ({
    name: r.direction,
    submitted: r.submitted,
    registered: r.registered,
  }));
  const exportPath = typeof data.exportPath === 'string'
    ? data.exportPath
    : `/exports/evening-summary?day=${forumDay}`;

  const downloadFull = async () => {
    const { adminDownloadBinary } = await import('../../admin/client');
    const dayMatch = exportPath.match(/[?&]day=(\d+)/);
    const dayPart = dayMatch ? `d${dayMatch[1]}` : 'shift';
    await adminDownloadBinary(exportPath, `evening_summary_${dayPart}.xlsx`);
  };

  return (
    <div className="adm-dash-stack">
      <DashScreenTitle
        title="Итоговая анкета вечера"
        hint="Сданные анкеты с главной: статистика по вопросам и полный список ответов. Черновики в KPI отдельно."
      />
      <DashGrid cols={4}>
        <DashKpi
          value={dashVal(submitted)}
          label="сдано анкет"
          sub={cohortSize ? `из ${cohortSize} зарегистрированных` : undefined}
          accent="var(--m-accent)"
        />
        <DashKpi
          value={fillRatePct != null ? `${fillRatePct}%` : '—'}
          label="охват заполнения"
          sub="доля сдавших от зарегистрированных"
          accent="#22c55e"
        />
        <DashKpi
          value={dashVal(drafts)}
          label="черновики"
          sub="начали, но не отправили"
          accent="#f59e0b"
        />
        <DashKpi
          value={dashVal(questions.length)}
          label="вопросов с ответами"
          sub={data.diagnostics?.eveningForceUnpublished
            ? 'анкета снята с публикации'
            : (data.diagnostics?.eveningOpenNow ? 'анкета открыта' : 'по расписанию / закрыта')}
        />
      </DashGrid>

      {notes.length > 0 && (
        <DashCard title="Примечания">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {notes.map(n => <li key={n}>{n}</li>)}
          </ul>
        </DashCard>
      )}

      {byDirection.length > 0 && (
        <DashCard title="Заполнили по направлениям">
          <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
            Сколько участников из каждого направления сдали итоговую анкету вечера
          </p>
          <ResponsiveContainer width="100%" height={Math.max(220, directionChart.length * 36)}>
            <BarChart data={directionChart} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
              <Tooltip content={<ChartTooltipRu />} />
              <Legend />
              <Bar dataKey="submitted" name="Сдали анкету" fill="var(--m-accent)" />
              <Bar dataKey="registered" name="Зарегистрировано" fill="#cbd5e1" />
            </BarChart>
          </ResponsiveContainer>
          <table className="adm-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Направление</th>
                <th>Сдали</th>
                <th>Зарегистрировано</th>
                <th>Охват</th>
              </tr>
            </thead>
            <tbody>
              {byDirection.map(r => (
                <tr key={r.direction}>
                  <td>{r.direction}</td>
                  <td>{r.submitted}</td>
                  <td>{r.registered}</td>
                  <td>{r.fillRatePct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DashCard>
      )}

      {!questions.length && (
        <DashCard title="Нет сданных анкет">
          <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
            Пока никто не нажал «Отправить» в итоговой анкете вечера на выбранном срезе.
            Проверьте, что анкета опубликована.
          </p>
        </DashCard>
      )}

      {questions.map(q => (
        <DashCard
          key={q.key}
          title={q.label}
        >
          <div className="adm-muted" style={{ fontSize: 12, marginBottom: 8 }}>
            Ответов: {q.answered}
            {q.avg != null ? ` · средняя: ${q.avg}` : ''}
            {q.type ? ` · тип: ${q.type}` : ''}
          </div>
          {q.distribution?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <SrcBars items={q.distribution.map(d => ({ label: `${d.label} (${d.pct}%)`, count: d.count }))} />
            </div>
          )}
          <div style={{ maxHeight: 280, overflow: 'auto' }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Участник</th>
                  <th>Направление</th>
                  <th>Группа</th>
                  <th>День</th>
                  <th>Ответ</th>
                </tr>
              </thead>
              <tbody>
                {q.answers.map((a, idx) => (
                  <tr key={`${q.key}-${a.participantId}-${a.day}-${idx}`}>
                    <td>
                      <button type="button" className="adm-link" onClick={() => onOpenCard(a.participantId)}>
                        {a.name || `#${a.participantId}`}
                      </button>
                    </td>
                    <td>{a.direction || '—'}</td>
                    <td>{a.group || '—'}</td>
                    <td>{a.day}</td>
                    <td style={{ whiteSpace: 'pre-wrap', maxWidth: 420 }}>{String(a.answer)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DashCard>
      ))}

      <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0 8px' }}>
        <button
          type="button"
          className="adm-btn adm-btn-primary"
          onClick={() => { void downloadFull(); }}
        >
          Скачать полностью данные по Итоговой анкете вечера (Excel)
        </button>
      </div>
    </div>
  );
}

export function DepartureView({ data, onOpenCard }: { data: any; onOpenCard: AnalyticsTabProps['onOpenCard'] }) {
  return (
    <div className="adm-dash-stack">
      <DashScreenTitle title="Заезд → выезд" hint="Точка А и точка Б по направлениям." />
      <DashGrid cols={3}>
        <DashKpi value={dashVal(data.completedBoth)} label="заполнили обе точки" accent="var(--m-accent)" />
        <DashKpi
          value={dashVal((data.byDirection ?? []).length)}
          label="направлений в срезе"
        />
        <DashKpi
          value={dashVal((data.participants ?? []).length)}
          label="участников в таблице"
        />
      </DashGrid>
      <DashCard title="По направлениям">
        {(data.byDirection ?? []).map((row: { direction: string; bothPoints: number; total: number; pointATokens: { token: string }[]; pointBTokens: { token: string }[] }) => (
          <div key={row.direction} style={{ marginBottom: 12 }}>
            <strong>{row.direction}</strong>
            <span className="adm-muted" style={{ fontSize: 12 }}> ({row.bothPoints}/{row.total})</span>
            <div style={{ fontSize: 12, marginTop: 4 }}>А: {row.pointATokens.map(t => t.token).join(', ') || '—'}</div>
            <div style={{ fontSize: 12 }}>Б: {row.pointBTokens.map(t => t.token).join(', ') || '—'}</div>
          </div>
        ))}
      </DashCard>
      <DashCard title="Участники">
        <table className="adm-table">
          <thead><tr><th>Участник</th><th>А</th><th>Б</th></tr></thead>
          <tbody>
            {(data.participants ?? []).slice(0, 50).map((r: { id: number; name: string; hasPointA?: boolean; hasPointB?: boolean }) => (
              <tr key={r.id}>
                <td><button type="button" className="adm-link" onClick={() => onOpenCard(r.id)}>{r.name}</button></td>
                <td>{r.hasPointA ? '✓' : '—'}</td>
                <td>{r.hasPointB ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DashCard>
    </div>
  );
}

