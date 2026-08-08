import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
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
import { OrientableBarChart } from './orientableBars';

function ZoneBarChart({ title, zones, hint }: { title: string; zones?: Record<string, number>; hint?: string }) {
  const data = zonesToBarRows(zones ?? {});
  if (!data.length) return null;
  return (
    <DashCard title={title}>
      {hint && <p className="adm-muted" style={{ fontSize: 12, marginTop: -4 }}>{hint}</p>}
      <OrientableBarChart
        data={data}
        categoryKey="name"
        series={[{ dataKey: 'value', name: 'Доля, %', fill: 'var(--m-accent)' }]}
        height={200}
        yAxisWidth={90}
      />
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
              <OrientableBarChart
                data={roles}
                categoryKey="label"
                series={[{ dataKey: 'count', name: 'Участников', fill: 'var(--m-accent)' }]}
                yAxisWidth={100}
              />
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
          <OrientableBarChart
            data={pointsByDayChart}
            categoryKey="dayLabel"
            series={[{ dataKey: 'points', name: 'Баллы', fill: 'var(--m-accent)' }]}
          />
        </DashCard>
      )}

      {nominationChart.length > 0 && (
        <DashCard title="Баллы по номинациям">
          <OrientableBarChart
            data={nominationChart}
            categoryKey="label"
            series={[{ dataKey: 'points', name: 'Баллы', fill: '#3182CE' }]}
            yAxisWidth={100}
          />
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
  const { meta, setActiveDashboardId, setTab } = useInsights();
  const zones = data.activity?.emotionZones ?? {};
  const registered = data.pulse?.registered;
  const activeToday = data.pulse?.activeToday ?? data.activity?.participants?.activeToday;
  const coveragePct = registered > 0 && activeToday != null
    ? Math.round((Number(activeToday) / Number(registered)) * 100)
    : null;
  const community = data.community ?? {};
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

      <SectionLabel>Очереди и сообщество</SectionLabel>
      <DashGrid cols={3}>
        <DashCard title="На модерации · обмен">
          <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, color: Number(community.pendingExchange) > 0 ? '#f59e0b' : undefined }}>
            {dashVal(community.pendingExchange)}
          </div>
          <p className="adm-muted" style={{ fontSize: 12, margin: '6px 0 10px' }}>
            вопросов обмена опытом ждут проверки
          </p>
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setTab('moderation')}>
            Открыть модерацию →
          </button>
        </DashCard>
        <DashCard title="Вопросы организаторам">
          <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, color: Number(community.orgQuestionsWaiting) > 0 ? '#B8621A' : undefined }}>
            {dashVal(community.orgQuestionsWaiting)}
          </div>
          <p className="adm-muted" style={{ fontSize: 12, margin: '6px 0 10px' }}>
            обращений ждут ответа дирекции
          </p>
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setTab('forum')}>
            Открыть обращения →
          </button>
        </DashCard>
        <DashCard title="Активный обмен опытом">
          <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, color: 'var(--m-accent)' }}>
            {dashVal(community.activeExchange)}
          </div>
          <p className="adm-muted" style={{ fontSize: 12, margin: '6px 0 10px' }}>
            одобренных вопросов сейчас в ленте
          </p>
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setTab('moderation')}>
            Архив обмена →
          </button>
        </DashCard>
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
          <OrientableBarChart
            data={directionChart}
            categoryKey="name"
            series={[
              { dataKey: 'submitted', name: 'Сдали анкету', fill: 'var(--m-accent)' },
              { dataKey: 'registered', name: 'Зарегистрировано', fill: '#cbd5e1' },
            ]}
            showLegend
            yAxisWidth={120}
          />
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

type KindAnswerRow = {
  participantId: number;
  name: string;
  direction: string;
  group: string;
  day: number;
  answer: string;
  eventTitle?: string | null;
  emotion?: string | null;
  emotionZone?: string | null;
  energy?: number | null;
  timePoint?: string | null;
  filledAt?: string | null;
};

type KindQuestionStat = {
  key: string;
  label: string;
  day: number | null;
  answered: number;
  uniqueParticipants: number;
  distribution: { label: string; count: number; pct: number }[];
  answers: KindAnswerRow[];
};

function KindDirectionChart({
  byDirection,
  subtitle,
}: {
  byDirection: { direction: string; submitted: number; registered: number; fillRatePct: number; answers?: number }[];
  subtitle: string;
}) {
  if (!byDirection.length) return null;
  const chartData = byDirection.map(r => ({
    name: r.direction,
    submitted: r.submitted,
    registered: r.registered,
  }));
  return (
    <DashCard title="Заполнили по направлениям">
      <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>{subtitle}</p>
      <OrientableBarChart
        data={chartData}
        categoryKey="name"
        series={[
          { dataKey: 'submitted', name: 'Участников с ответом', fill: 'var(--m-accent)' },
          { dataKey: 'registered', name: 'Зарегистрировано', fill: '#cbd5e1' },
        ]}
        showLegend
        yAxisWidth={120}
      />
      <table className="adm-table" style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Направление</th>
            <th>Заполнили</th>
            <th>Ответов</th>
            <th>Зарегистрировано</th>
            <th>Охват</th>
          </tr>
        </thead>
        <tbody>
          {byDirection.map(r => (
            <tr key={r.direction}>
              <td>{r.direction}</td>
              <td>{r.submitted}</td>
              <td>{r.answers ?? '—'}</td>
              <td>{r.registered}</td>
              <td>{r.fillRatePct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DashCard>
  );
}

export function AfterBlocksView({
  data,
  onOpenCard,
}: {
  data: any;
  onOpenCard: AnalyticsTabProps['onOpenCard'];
}) {
  const { forumDay, direction, group } = useInsights();
  const submitted = data.activity?.submitted ?? 0;
  const answerCount = data.activity?.answerCount ?? 0;
  const cohortSize = data.activity?.cohortSize ?? 0;
  const fillRatePct = data.activity?.fillRatePct;
  const questions = (data.questions ?? []) as KindQuestionStat[];
  const notes = (data.diagnostics?.notes ?? []) as string[];
  const byDirection = (data.byDirection ?? data.activity?.byDirection ?? []) as {
    direction: string; submitted: number; registered: number; fillRatePct: number; answers?: number;
  }[];
  const byEvent = (data.byEvent ?? []) as { label: string; count: number; pct: number }[];
  const exportPath = (() => {
    if (typeof data.exportPath === 'string' && data.exportPath) return data.exportPath;
    const u = new URLSearchParams();
    if (forumDay) u.set('day', forumDay);
    if (direction) u.set('direction', direction);
    if (group) u.set('group', group);
    const qs = u.toString();
    return qs ? `/exports/after-blocks?${qs}` : '/exports/after-blocks';
  })();

  const downloadFull = async () => {
    const { adminDownloadBinary } = await import('../../admin/client');
    const dayMatch = exportPath.match(/[?&]day=(\d+)/);
    const dayPart = dayMatch ? `d${dayMatch[1]}` : 'shift';
    await adminDownloadBinary(exportPath, `after_blocks_${dayPart}.xlsx`);
  };

  return (
    <div className="adm-dash-stack">
      <DashScreenTitle
        title="После блоков"
        hint="Осмысление после блоков программы: охват по направлениям, разрез по вопросам и блокам, полный список ответов."
      />
      <DashGrid cols={4}>
        <DashKpi value={dashVal(submitted)} label="участников ответили" sub={cohortSize ? `из ${cohortSize} зарегистрированных` : undefined} accent="var(--m-accent)" />
        <DashKpi value={fillRatePct != null ? `${fillRatePct}%` : '—'} label="охват заполнения" sub="доля ответивших" accent="#22c55e" />
        <DashKpi value={dashVal(answerCount)} label="ответов всего" />
        <DashKpi value={dashVal(data.activity?.questionsPublished ?? questions.length)} label="вопросов в срезе" />
      </DashGrid>

      {notes.length > 0 && (
        <DashCard title="Примечания">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {notes.map(n => <li key={n}>{n}</li>)}
          </ul>
        </DashCard>
      )}

      <KindDirectionChart byDirection={byDirection} subtitle="Сколько участников направления заполнили вопросы «После блоков»" />

      {byEvent.length > 0 && (
        <DashCard title="По блокам программы">
          <SrcBars items={byEvent.map(d => ({ label: `${d.label} (${d.pct}%)`, count: d.count }))} />
        </DashCard>
      )}

      {!questions.length && (
        <DashCard title="Нет данных">
          <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
            В выбранном срезе нет опубликованных вопросов «После блоков» или ответов ещё нет.
          </p>
        </DashCard>
      )}

      {questions.map(q => (
        <DashCard key={q.key} title={`${q.label}${q.day != null ? ` · D${q.day}` : ''}`}>
          <div className="adm-muted" style={{ fontSize: 12, marginBottom: 8 }}>
            Ответов: {q.answered} · уникальных участников: {q.uniqueParticipants}
          </div>
          {q.distribution?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <SrcBars items={q.distribution.map(d => ({ label: `${d.label} (${d.pct}%)`, count: d.count }))} />
            </div>
          )}
          {q.answers.length === 0 ? (
            <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Ответов по этому вопросу пока нет.</p>
          ) : (
            <div style={{ maxHeight: 280, overflow: 'auto' }}>
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Участник</th>
                    <th>Направление</th>
                    <th>Группа</th>
                    <th>Блок</th>
                    <th>Ответ</th>
                  </tr>
                </thead>
                <tbody>
                  {q.answers.map((a, idx) => (
                    <tr key={`${q.key}-${a.participantId}-${idx}`}>
                      <td>
                        <button type="button" className="adm-link" onClick={() => onOpenCard(a.participantId)}>
                          {a.name || `#${a.participantId}`}
                        </button>
                      </td>
                      <td>{a.direction || '—'}</td>
                      <td>{a.group || '—'}</td>
                      <td>{a.eventTitle || '—'}</td>
                      <td style={{ whiteSpace: 'pre-wrap', maxWidth: 420 }}>{a.answer || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DashCard>
      ))}

      <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0 8px' }}>
        <button type="button" className="adm-btn adm-btn-primary" onClick={() => { void downloadFull(); }}>
          Скачать полностью данные «После блоков» (Excel)
        </button>
      </div>
    </div>
  );
}

export function StateChecksView({
  data,
  onOpenCard,
}: {
  data: any;
  onOpenCard: AnalyticsTabProps['onOpenCard'];
}) {
  const { forumDay, direction, group } = useInsights();
  const submitted = data.activity?.submitted ?? 0;
  const answerCount = data.activity?.answerCount ?? 0;
  const cohortSize = data.activity?.cohortSize ?? 0;
  const fillRatePct = data.activity?.fillRatePct;
  const questions = (data.questions ?? []) as KindQuestionStat[];
  const notes = (data.diagnostics?.notes ?? []) as string[];
  const byDirection = (data.byDirection ?? data.activity?.byDirection ?? []) as {
    direction: string; submitted: number; registered: number; fillRatePct: number; answers?: number;
  }[];
  const pulse = data.emotionalPulse ?? {};
  const exportPath = (() => {
    if (typeof data.exportPath === 'string' && data.exportPath) return data.exportPath;
    const u = new URLSearchParams();
    if (forumDay) u.set('day', forumDay);
    if (direction) u.set('direction', direction);
    if (group) u.set('group', group);
    const qs = u.toString();
    return qs ? `/exports/state-checks?${qs}` : '/exports/state-checks';
  })();

  const downloadFull = async () => {
    const { adminDownloadBinary } = await import('../../admin/client');
    const dayMatch = exportPath.match(/[?&]day=(\d+)/);
    const dayPart = dayMatch ? `d${dayMatch[1]}` : 'shift';
    await adminDownloadBinary(exportPath, `state_checks_${dayPart}.xlsx`);
  };

  return (
    <div className="adm-dash-stack">
      <DashScreenTitle
        title="Проверка состояния"
        hint="Утро / день / вечер: зоны эмоций, энергия, охват по направлениям и полный список ответов по каждому вопросу."
      />
      <DashGrid cols={4}>
        <DashKpi value={dashVal(submitted)} label="участников ответили" sub={cohortSize ? `из ${cohortSize} зарегистрированных` : undefined} accent="var(--m-accent)" />
        <DashKpi value={fillRatePct != null ? `${fillRatePct}%` : '—'} label="охват заполнения" accent="#22c55e" />
        <DashKpi value={dashVal(pulse.avgEnergy)} label="средняя энергия" sub="шкала 1–10" accent="#f59e0b" />
        <DashKpi value={pulse.riskFatiguePct != null ? `${pulse.riskFatiguePct}%` : '—'} label="риск + усталость" sub="доля зон" accent="#ef4444" />
      </DashGrid>

      <DashGrid cols={3}>
        <DashKpi value={dashVal(pulse.phaseCounts?.morning)} label="ответов · утро" />
        <DashKpi value={dashVal(pulse.phaseCounts?.day)} label="ответов · день" />
        <DashKpi value={dashVal(pulse.phaseCounts?.evening)} label="ответов · вечер" />
      </DashGrid>

      {notes.length > 0 && (
        <DashCard title="Примечания">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {notes.map(n => <li key={n}>{n}</li>)}
          </ul>
        </DashCard>
      )}

      <KindDirectionChart byDirection={byDirection} subtitle="Сколько участников направления заполнили проверки состояния" />

      <ZoneBarChart title="Зоны эмоций · всего" zones={pulse.zonesPercent} />
      <DashGrid cols={3}>
        <ZoneBarChart title="Зоны · утро" zones={pulse.byPhase?.morning} />
        <ZoneBarChart title="Зоны · день" zones={pulse.byPhase?.day} />
        <ZoneBarChart title="Зоны · вечер" zones={pulse.byPhase?.evening} />
      </DashGrid>

      {(pulse.emotions ?? []).length > 0 && (
        <DashCard title="Эмоции">
          <SrcBars items={(pulse.emotions as { label: string; count: number; pct: number }[]).map(d => ({
            label: `${d.label} (${d.pct}%)`,
            count: d.count,
          }))} />
        </DashCard>
      )}

      {(pulse.topReasons ?? []).length > 0 && (
        <DashCard title="Частые слова в причинах">
          <TagPills items={(pulse.topReasons as { token: string; count: number }[]).map(t => ({
            label: `${t.token} · ${t.count}`,
          }))} />
        </DashCard>
      )}

      {!questions.length && (
        <DashCard title="Нет данных">
          <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
            В выбранном срезе нет опубликованных проверок состояния или ответов ещё нет.
          </p>
        </DashCard>
      )}

      {questions.map(q => (
        <DashCard key={q.key} title={`${q.label}${q.day != null ? ` · D${q.day}` : ''}`}>
          <div className="adm-muted" style={{ fontSize: 12, marginBottom: 8 }}>
            Ответов: {q.answered} · участников: {q.uniqueParticipants}
            {answerCount ? ` · всего ответов в срезе: ${answerCount}` : ''}
          </div>
          {q.distribution?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <SrcBars items={q.distribution.map(d => ({ label: `${d.label} (${d.pct}%)`, count: d.count }))} />
            </div>
          )}
          {q.answers.length === 0 ? (
            <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Ответов по этому вопросу пока нет.</p>
          ) : (
            <div style={{ maxHeight: 280, overflow: 'auto' }}>
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Участник</th>
                    <th>Направление</th>
                    <th>Группа</th>
                    <th>Фаза</th>
                    <th>Эмоция</th>
                    <th>Зона</th>
                    <th>Энергия</th>
                    <th>Причина</th>
                  </tr>
                </thead>
                <tbody>
                  {q.answers.map((a, idx) => (
                    <tr key={`${q.key}-${a.participantId}-${idx}`}>
                      <td>
                        <button type="button" className="adm-link" onClick={() => onOpenCard(a.participantId)}>
                          {a.name || `#${a.participantId}`}
                        </button>
                      </td>
                      <td>{a.direction || '—'}</td>
                      <td>{a.group || '—'}</td>
                      <td>{a.timePoint || '—'}</td>
                      <td>{a.emotion || '—'}</td>
                      <td>{a.emotionZone ? formatZoneName(a.emotionZone) : '—'}</td>
                      <td>{a.energy ?? '—'}</td>
                      <td style={{ whiteSpace: 'pre-wrap', maxWidth: 360 }}>{a.answer || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DashCard>
      ))}

      <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0 8px' }}>
        <button type="button" className="adm-btn adm-btn-primary" onClick={() => { void downloadFull(); }}>
          Скачать полностью данные «Проверка состояния» (Excel)
        </button>
      </div>
    </div>
  );
}

function MissingPeopleCard({
  title,
  people,
  onOpenCard,
}: {
  title: string;
  people: { participantId: number; name: string; group: string }[];
  onOpenCard: AnalyticsTabProps['onOpenCard'];
}) {
  return (
    <DashCard title={`${title} · ${people.length}`}>
      {people.length === 0 ? (
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Все зарегистрированные в срезе заполнили.</p>
      ) : (
        <div style={{ maxHeight: 220, overflow: 'auto' }}>
          <table className="adm-table">
            <thead>
              <tr><th>Участник</th><th>Группа</th></tr>
            </thead>
            <tbody>
              {people.map(p => (
                <tr key={p.participantId}>
                  <td>
                    <button type="button" className="adm-link" onClick={() => onOpenCard(p.participantId)}>
                      {p.name}
                    </button>
                  </td>
                  <td>{p.group || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashCard>
  );
}

export function DirectionView({
  data,
  onOpenCard,
}: {
  data: any;
  onOpenCard: AnalyticsTabProps['onOpenCard'];
}) {
  const { direction, setDirection, forumDay, group, setGroup, meta } = useInsights();
  const needsDirection = data?.requiresDirection || !direction;
  const directionOptions = meta?.filters?.directions ?? [];
  const groupsAvailable = (() => {
    const base = (data?.groupsAvailable?.length
      ? data.groupsAvailable
      : (meta?.filters?.groups ?? [])) as string[];
    if (group && !base.includes(group)) return [group, ...base];
    return base;
  })();

  if (needsDirection) {
    return (
      <div className="adm-dash-stack">
        <DashScreenTitle
          title="Аналитика направления"
          hint="Полный пакет по одному направлению: состояние, анкеты, программа, активность и операционные списки."
        />
        <DashCard title="Выберите направление">
          <p style={{ margin: '0 0 12px', fontSize: 15, lineHeight: 1.5 }}>
            Выберите направление — откроется command center только по его участникам. Группу можно уточнить после выбора.
          </p>
          <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 10 }}>
            <label className="adm-insights-filter">
              Направление
              <select
                className="adm-input"
                value={direction}
                onChange={e => {
                  setDirection(e.target.value);
                  setGroup('');
                }}
              >
                <option value="">Выберите…</option>
                {directionOptions.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
          </div>
        </DashCard>
      </div>
    );
  }

  const header = data.header ?? {};
  const kpi = data.kpi ?? {};
  const pulse = data.stateCheck?.emotionalPulse ?? {};
  const compare = data.forumCompare ?? {};
  const notes = (data.diagnostics?.notes ?? []) as string[];
  const byGroup = (data.ops?.byGroup ?? []) as {
    group: string; registered: number; eveningFillPct: number; afterBlocksFillPct: number; stateCheckFillPct: number;
    evening: number; afterBlocks: number; stateCheck: number;
  }[];
  const eveningQuestions = (data.evening?.questions ?? []) as KindQuestionStat[];
  const afterQuestions = (data.afterBlocks?.questions ?? []) as KindQuestionStat[];
  const stateQuestions = (data.stateCheck?.questions ?? []) as KindQuestionStat[];
  const byEvent = (data.afterBlocks?.byEvent ?? []) as { label: string; count: number; pct: number }[];
  const ratingTop = (data.activity?.ratingTop ?? []) as {
    rank?: number; id: number; name: string; points?: number;
  }[];
  const exportPath = typeof data.exportPath === 'string'
    ? data.exportPath
    : `/exports/direction-pack?day=${forumDay}&direction=${encodeURIComponent(direction)}${group ? `&group=${encodeURIComponent(group)}` : ''}`;

  const download = async (path: string, file: string) => {
    const { adminDownloadBinary } = await import('../../admin/client');
    await adminDownloadBinary(path, file);
  };

  const dayPart = header.day != null ? `d${header.day}` : 'shift';
  const dirPart = String(direction).replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40);

  return (
    <div className="adm-dash-stack">
      <DashScreenTitle
        title={header.direction || direction}
        hint={`${header.dayLabel || `D${forumDay}`}${header.calendarDate ? ` · ${header.calendarDate}` : ''}${group ? ` · группа ${group}` : ''} · полный пакет аналитики направления`}
      />

      <DashCard title="Срез направления">
        <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 10, marginTop: 0 }}>
          <label className="adm-insights-filter">
            Направление
            <select
              className="adm-input"
              value={direction}
              onChange={e => {
                setDirection(e.target.value);
                setGroup('');
              }}
            >
              {directionOptions.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="adm-insights-filter">
            Группа
            <select
              className="adm-input"
              value={group}
              onChange={e => setGroup(e.target.value)}
            >
              <option value="">Все группы направления</option>
              {groupsAvailable.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="adm-muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
          Группы в списке — только из выбранного направления. Фильтр применяется ко всем блокам и Excel.
        </p>
      </DashCard>

      <DashGrid cols={3}>
        <DashKpi value={dashVal(kpi.registered)} label="зарегистрировано" sub="в направлении" accent="var(--m-accent)" />
        <DashKpi
          value={kpi.touchpointCoveragePct != null ? `${kpi.touchpointCoveragePct}%` : '—'}
          label="охват активности"
          sub={compare.activityRatePct != null ? `форум ${compare.activityRatePct}%` : undefined}
          accent="#22c55e"
        />
        <DashKpi value={dashVal(kpi.activeToday)} label="активны в срезе" />
      </DashGrid>
      <DashGrid cols={3}>
        <DashKpi value={dashVal(kpi.avgEnergy)} label="средняя энергия" sub="state check" accent="#f59e0b" />
        <DashKpi
          value={kpi.riskFatiguePct != null ? `${kpi.riskFatiguePct}%` : '—'}
          label="риск + усталость"
          accent="#ef4444"
        />
        <DashKpi
          value={`${dashVal(kpi.eveningSubmitted)} / ${dashVal(kpi.afterBlocksSubmitted)}`}
          label="evening / после блоков"
          sub={`охват ${kpi.eveningFillPct ?? '—'}% · ${kpi.afterBlocksFillPct ?? '—'}%`}
        />
      </DashGrid>

      {notes.length > 0 && (
        <DashCard title="Примечания">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {notes.map(n => <li key={n}>{n}</li>)}
          </ul>
        </DashCard>
      )}

      <SectionLabel>Пульс и состояние</SectionLabel>
      <DashGrid cols={3}>
        <DashKpi value={dashVal(pulse.phaseCounts?.morning)} label="ответов · утро" />
        <DashKpi value={dashVal(pulse.phaseCounts?.day)} label="ответов · день" />
        <DashKpi value={dashVal(pulse.phaseCounts?.evening)} label="ответов · вечер" />
      </DashGrid>
      <ZoneBarChart title="Зоны эмоций · направление" zones={pulse.zonesPercent} />
      <DashGrid cols={3}>
        <ZoneBarChart title="Зоны · утро" zones={pulse.byPhase?.morning} />
        <ZoneBarChart title="Зоны · день" zones={pulse.byPhase?.day} />
        <ZoneBarChart title="Зоны · вечер" zones={pulse.byPhase?.evening} />
      </DashGrid>
      {(pulse.topReasons ?? []).length > 0 && (
        <DashCard title="Частые слова в причинах">
          <TagPills items={(pulse.topReasons as { token: string; count: number }[]).map(t => ({
            label: `${t.token} · ${t.count}`,
          }))} />
        </DashCard>
      )}
      {stateQuestions.slice(0, 4).map(q => (
        <DashCard key={`sc-${q.key}`} title={`Состояние · ${q.label}`}>
          <div className="adm-muted" style={{ fontSize: 12, marginBottom: 8 }}>
            Ответов: {q.answered} · участников: {q.uniqueParticipants}
          </div>
          {q.distribution?.length > 0 && (
            <SrcBars items={q.distribution.map(d => ({ label: `${d.label} (${d.pct}%)`, count: d.count }))} />
          )}
          <div style={{ maxHeight: 220, overflow: 'auto', marginTop: 8 }}>
            <table className="adm-table">
              <thead>
                <tr><th>Участник</th><th>Группа</th><th>Фаза</th><th>Зона</th><th>Энергия</th><th>Причина</th></tr>
              </thead>
              <tbody>
                {q.answers.map((a, idx) => (
                  <tr key={`${q.key}-${a.participantId}-${idx}`}>
                    <td>
                      <button type="button" className="adm-link" onClick={() => onOpenCard(a.participantId)}>
                        {a.name || `#${a.participantId}`}
                      </button>
                    </td>
                    <td>{a.group || '—'}</td>
                    <td>{a.timePoint || '—'}</td>
                    <td>{a.emotionZone ? formatZoneName(a.emotionZone) : (a.emotion || '—')}</td>
                    <td>{a.energy ?? '—'}</td>
                    <td style={{ whiteSpace: 'pre-wrap', maxWidth: 320 }}>{a.answer || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DashCard>
      ))}

      <SectionLabel>Смысловые точки</SectionLabel>
      <DashGrid cols={3}>
        <DashKpi value={kpi.eveningFillPct != null ? `${kpi.eveningFillPct}%` : '—'} label="охват evening" />
        <DashKpi value={kpi.afterBlocksFillPct != null ? `${kpi.afterBlocksFillPct}%` : '—'} label="охват после блоков" />
        <DashKpi value={kpi.stateCheckFillPct != null ? `${kpi.stateCheckFillPct}%` : '—'} label="охват state check" />
      </DashGrid>
      {byEvent.length > 0 && (
        <DashCard title="После блоков · по блокам программы">
          <SrcBars items={byEvent.map(d => ({ label: `${d.label} (${d.pct}%)`, count: d.count }))} />
        </DashCard>
      )}
      {eveningQuestions.map(q => (
        <DashCard key={`ev-${q.key}`} title={`Evening · ${q.label}`}>
          {q.distribution?.length > 0 && (
            <SrcBars items={q.distribution.map(d => ({ label: `${d.label} (${d.pct}%)`, count: d.count }))} />
          )}
          <div style={{ maxHeight: 200, overflow: 'auto', marginTop: 8 }}>
            <table className="adm-table">
              <thead><tr><th>Участник</th><th>Группа</th><th>Ответ</th></tr></thead>
              <tbody>
                {q.answers.map((a, idx) => (
                  <tr key={`ev-${q.key}-${a.participantId}-${idx}`}>
                    <td>
                      <button type="button" className="adm-link" onClick={() => onOpenCard(a.participantId)}>
                        {a.name}
                      </button>
                    </td>
                    <td>{a.group || '—'}</td>
                    <td style={{ whiteSpace: 'pre-wrap', maxWidth: 360 }}>{a.answer != null && a.answer !== '' ? String(a.answer) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DashCard>
      ))}
      {afterQuestions.map(q => (
        <DashCard key={`ab-${q.key}`} title={`После блоков · ${q.label}${q.day != null ? ` · D${q.day}` : ''}`}>
          {q.distribution?.length > 0 && (
            <SrcBars items={q.distribution.map(d => ({ label: `${d.label} (${d.pct}%)`, count: d.count }))} />
          )}
          <div style={{ maxHeight: 200, overflow: 'auto', marginTop: 8 }}>
            <table className="adm-table">
              <thead><tr><th>Участник</th><th>Группа</th><th>Блок</th><th>Ответ</th></tr></thead>
              <tbody>
                {q.answers.map((a, idx) => (
                  <tr key={`ab-${q.key}-${a.participantId}-${idx}`}>
                    <td>
                      <button type="button" className="adm-link" onClick={() => onOpenCard(a.participantId)}>
                        {a.name}
                      </button>
                    </td>
                    <td>{a.group || '—'}</td>
                    <td>{a.eventTitle || '—'}</td>
                    <td style={{ whiteSpace: 'pre-wrap', maxWidth: 320 }}>{a.answer || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DashCard>
      ))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {data.sectionExports?.evening && (
          <button type="button" className="adm-btn" onClick={() => { void download(data.sectionExports.evening, `evening_${dirPart}_${dayPart}.xlsx`); }}>
            Excel · Evening
          </button>
        )}
        {data.sectionExports?.afterBlocks && (
          <button type="button" className="adm-btn" onClick={() => { void download(data.sectionExports.afterBlocks, `after_blocks_${dirPart}_${dayPart}.xlsx`); }}>
            Excel · После блоков
          </button>
        )}
        {data.sectionExports?.stateChecks && (
          <button type="button" className="adm-btn" onClick={() => { void download(data.sectionExports.stateChecks, `state_checks_${dirPart}_${dayPart}.xlsx`); }}>
            Excel · Состояние
          </button>
        )}
      </div>

      <SectionLabel>Программа и активность</SectionLabel>
      {(data.program?.directionRatings ?? []).length > 0 && (
        <DashCard title="Оценка программы направления">
          <SrcBars items={(data.program.directionRatings as { label: string; avg?: number; responses?: number }[]).map(r => ({
            label: `${r.label}${r.avg != null ? ` · ср. ${r.avg}` : ''}`,
            count: r.responses ?? 0,
          }))} />
        </DashCard>
      )}
      {(data.program?.topMentions ?? []).length > 0 && (
        <DashCard title="Упоминания дня">
          <TagPills items={(data.program.topMentions as { token: string; count: number }[]).map(t => ({
            label: `${t.token} · ${t.count}`,
            tone: 'accent' as const,
          }))} />
        </DashCard>
      )}
      {ratingTop.length > 0 && (
        <DashCard title="Рейтинг направления">
          <table className="adm-table">
            <thead><tr><th>#</th><th>Участник</th><th>Баллы</th></tr></thead>
            <tbody>
              {ratingTop.map(r => (
                <tr key={r.id}>
                  <td>{r.rank ?? '—'}</td>
                  <td>
                    <button type="button" className="adm-link" onClick={() => onOpenCard(r.id)}>{r.name}</button>
                  </td>
                  <td>{r.points ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DashCard>
      )}
      {(data.piggybank?.topThemes ?? []).length > 0 && (
        <DashCard title="Копилка · темы">
          <TagPills items={(data.piggybank.topThemes as { token: string; count: number }[]).map(t => ({
            label: `${t.token} · ${t.count}`,
          }))} />
        </DashCard>
      )}
      {(data.portrait?.roleDistribution ?? []).length > 0 && (
        <DashCard title="Роли в направлении">
          <SrcBars items={(data.portrait.roleDistribution as { key: string; count: number }[]).map(r => ({
            label: roleName(r.key) || r.key,
            count: r.count,
          }))} />
        </DashCard>
      )}

      <SectionLabel>Портрет</SectionLabel>
      {(data.portrait?.goalTopTokens ?? []).length > 0 && (
        <DashCard title="Точка А · частые слова">
          <TagPills items={(data.portrait.goalTopTokens as { token: string; count: number }[]).map(t => ({
            label: `${t.token} · ${t.count}`,
            tone: 'accent' as const,
          }))} />
        </DashCard>
      )}
      {(data.portrait?.themeTokens ?? []).length > 0 && (
        <DashCard title="Темы ответов направления">
          <TagPills items={(data.portrait.themeTokens as { token: string; count: number }[]).map(t => ({
            label: `${t.token} · ${t.count}`,
          }))} />
        </DashCard>
      )}
      {(data.portrait?.quotes ?? []).length > 0 && (
        <DashCard title="Цитаты">
          <QuoteList items={(data.portrait.quotes as { text: string }[])} />
        </DashCard>
      )}
      {data.portrait?.departure && (
        <DashCard title="Заезд → выезд · направление">
          <p className="adm-muted" style={{ fontSize: 13, marginTop: 0 }}>
            Обе точки: {data.portrait.departure.bothPoints ?? 0} / {data.portrait.departure.total ?? 0}
            {data.portrait.completedBoth != null ? ` · всего в срезе portrait: ${data.portrait.completedBoth}` : ''}
          </p>
          <div style={{ fontSize: 12 }}>
            А: {(data.portrait.departure.pointATokens ?? []).map((t: { token: string }) => t.token).join(', ') || '—'}
          </div>
          <div style={{ fontSize: 12 }}>
            Б: {(data.portrait.departure.pointBTokens ?? []).map((t: { token: string }) => t.token).join(', ') || '—'}
          </div>
        </DashCard>
      )}

      <SectionLabel>Операционка куратора</SectionLabel>
      {byGroup.length > 0 && (
        <DashCard title="Охват по группам">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Группа</th>
                <th>Зарег.</th>
                <th>Evening</th>
                <th>После блоков</th>
                <th>State check</th>
              </tr>
            </thead>
            <tbody>
              {byGroup.map(g => (
                <tr key={g.group}>
                  <td>{g.group}</td>
                  <td>{g.registered}</td>
                  <td>{g.evening} · {g.eveningFillPct}%</td>
                  <td>{g.afterBlocks} · {g.afterBlocksFillPct}%</td>
                  <td>{g.stateCheck} · {g.stateCheckFillPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DashCard>
      )}
      <DashGrid cols={3}>
        <MissingPeopleCard title="Не сдали evening" people={data.ops?.missingEvening ?? []} onOpenCard={onOpenCard} />
        <MissingPeopleCard title="Нет после блоков" people={data.ops?.missingAfterBlocks ?? []} onOpenCard={onOpenCard} />
        <MissingPeopleCard title="Нет state check" people={data.ops?.missingStateCheck ?? []} onOpenCard={onOpenCard} />
      </DashGrid>

      <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0 8px' }}>
        <button
          type="button"
          className="adm-btn adm-btn-primary"
          onClick={() => { void download(exportPath, `direction_${dirPart}_${dayPart}.xlsx`); }}
        >
          Скачать полный пакет направления (Excel)
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

