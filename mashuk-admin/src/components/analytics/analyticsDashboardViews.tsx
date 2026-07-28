import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { AnalyticsTabProps } from './AnalyticsTab';
import { roleName } from '../onboarding/roleOptions';
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

function ZoneBarChart({ title, zones, hint }: { title: string; zones: Record<string, number>; hint?: string }) {
  const data = zonesToBarRows(zones);
  if (!data.length) return null;
  return (
    <div className="card chart-card">
      <h3>{title}</h3>
      {hint && <p className="adm-muted" style={{ fontSize: 12, marginTop: -4 }}>{hint}</p>}
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={56} />
          <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} label={{ value: 'Доля ответов, %', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }} />
          <Tooltip content={<ChartTooltipRu />} />
          <Bar dataKey="value" fill="#805AD5" name="value" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PulseView({ data }: { data: any }) {
  const zones = data.emotionalPulse?.zonesPercent ?? {};
  const zoneChart = zonesToBarRows(zones);
  const series = (data.activity?.activitySeries ?? []).map((row: { day: number; answers: number; touchpoints: number }) => ({
    ...row,
    dayLabel: formatForumDay(row.day),
  }));
  const tp = data.activity?.touchpoints ?? {};
  const stateChecks = data.activity?.stateChecks ?? {};
  const zoneDayRows = zonesByDayRows(data.emotionalPulse?.byDay ?? data.emotionalPulse?.compareZones);
  return (
    <>
      <div className="card">
        <h3>Активность</h3>
        <p>Зарегистрировано: {data.activity?.registered} · Активны сегодня: {data.activity?.activeToday}</p>
        <p style={{ fontSize: 12 }}>
          Итоги дня: {data.activity?.eveningCompleted} · Проверки состояния:{' '}
          {Object.keys(stateChecks).length > 0
            ? Object.entries(stateChecks).map(([k, v]) => `${PHASE_LABELS[k] ?? k}: ${String(v)}`).join(' · ')
            : '—'}
        </p>
        {Object.keys(tp).length > 0 && (
          <ul style={{ fontSize: 12 }}>
            {Object.entries(tp).map(([k, v]) => <li key={k}>{formatTouchpointKey(k)}: {String(v)}</li>)}
          </ul>
        )}
      </div>
      {zoneChart.length > 0 && (
        <ZoneBarChart
          title="5 эмоциональных зон — вся смена"
          hint="Процент ответов на проверки состояния (не среднее по людям)."
          zones={zones}
        />
      )}
      <ZoneBarChart title="Зоны · утро" zones={data.emotionalPulse?.byPhase?.morning} />
      <ZoneBarChart title="Зоны · день" zones={data.emotionalPulse?.byPhase?.day} />
      <ZoneBarChart title="Зоны · вечер" zones={data.emotionalPulse?.byPhase?.evening} />
      {(data.emotionalPulse?.byDirection ?? []).map((row: { direction: string; zones: Record<string, number> }) => (
        <ZoneBarChart key={row.direction} title={`Направление: ${row.direction}`} zones={row.zones} />
      ))}
      {(data.emotionalPulse?.byGroup ?? []).slice(0, 12).map((row: { direction: string; group: string; zones: Record<string, number> }) => (
        <ZoneBarChart key={`${row.direction}-${row.group}`} title={`${row.direction} / ${row.group}`} zones={row.zones} />
      ))}
      {zoneDayRows.length > 0 && (
        <div className="card chart-card">
          <h3>Зоны по дням</h3>
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
        </div>
      )}
      {series.length > 0 && (
        <div className="card chart-card">
          <h3>Динамика активности</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="dayLabel" />
              <YAxis allowDecimals={false} label={{ value: 'Количество', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }} />
              <Tooltip content={<ChartTooltipRu />} />
              <Legend />
              <Line type="monotone" dataKey="answers" stroke="#3182CE" name="Ответы" dot />
              <Line type="monotone" dataKey="touchpoints" stroke="#38A169" name="Точки осмысления" dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {data.stateReasons?.topTokens?.length > 0 && (
        <div className="card">
          <h3>Причины состояния</h3>
          <ul>{data.stateReasons.topTokens.map((t: { token: string; count: number }) => <li key={t.token}>{t.token}: {t.count}</li>)}</ul>
          {(data.stateReasons.byDay ?? []).map((d: { day: number; topTokens: { token: string; count: number }[] }) => (
            <div key={d.day}><strong>{formatForumDay(d.day)}</strong>: {d.topTokens.map(t => t.token).join(', ')}</div>
          ))}
          <p className="adm-muted">{data.stateReasons.llmDeferred}</p>
        </div>
      )}
    </>
  );
}

export function PortraitView({ data, onOpenCard }: { data: any; onOpenCard: AnalyticsTabProps['onOpenCard'] }) {
  const roles = (data.preStart?.roleDistribution ?? []).map((r: { key: string; count: number }) => ({
    ...r,
    label: roleName(r.key),
  }));
  return (
    <>
      <div className="card chart-card">
        <h3>Роли на входе</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={roles}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={70} />
            <YAxis allowDecimals={false} label={{ value: 'Участников', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }} />
            <Tooltip content={<ChartTooltipRu />} />
            <Bar dataKey="count" fill="#805AD5" name="count" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="card">
        <h3>Стартовая аналитика</h3>
        <h4>Цели (топ слов)</h4>
        <ul>{(data.preStart?.goalTopTokens ?? []).map((t: { token: string; count: number }) => <li key={t.token}>{t.token}: {t.count}</li>)}</ul>
        <h4>Интересы</h4>
        <ul>{(data.preStart?.interestTop ?? []).map((r: { key: string; count: number }) => <li key={r.key}>{r.key}: {r.count}</li>)}</ul>
        {(data.preStart?.interestsByDirection ?? []).map((row: { direction: string; top: { key: string; count: number }[] }) => (
          <div key={row.direction}><strong>{row.direction}</strong>: {row.top.map(t => t.key).join(', ')}</div>
        ))}
      </div>
      <div className="card">
        <h3>Гистограммы регистрации</h3>
        <p>Направления / группы / регион / возраст / место работы</p>
        <ul>{(data.histograms?.region ?? []).map((r: { key: string; count: number }) => <li key={r.key}>{r.key}: {r.count}</li>)}</ul>
      </div>
      <div className="card">
        <h3>Ролевая динамика</h3>
        <ul>{(data.roleDynamics?.experimentTop ?? []).map((r: { label: string; count: number }) => <li key={r.label}>{r.label}: {r.count}</li>)}</ul>
        <p>На выходе изменили роль: {data.roleDynamics?.roleExitSummary?.changed} · без изменений: {data.roleDynamics?.roleExitSummary?.same}</p>
        <table className="adm-table">
          <thead><tr><th>День</th><th>Роль</th><th>Выборов</th></tr></thead>
          <tbody>
            {(data.roleDynamics?.experimentDaySeries ?? []).slice(0, 40).map((r: { day: number; label: string; count: number }, i: number) => (
              <tr key={i}><td>{formatForumDay(r.day)}</td><td>{r.label}</td><td>{r.count}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3>Матрица ролей (выборка)</h3>
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
      </div>
      <div className="card">
        <h3>Точка А → Б</h3>
        <p>Заполнили обе: {data.departure?.completedBoth}</p>
        {(data.departure?.byDirection ?? []).map((row: { direction: string; total: number; bothPoints: number }) => (
          <p key={row.direction}>{row.direction}: {row.bothPoints}/{row.total}</p>
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
      </div>
    </>
  );
}

function ScaleTable({ title, rows }: { title: string; rows: { label: string; avg: number; responses: number }[] }) {
  if (!rows?.length) return null;
  return (
    <div className="card">
      <h3>{title}</h3>
      <table className="adm-table">
        <thead><tr><th>Блок</th><th>Средняя</th><th>Ответов</th></tr></thead>
        <tbody>
          {rows.map(s => <tr key={s.label}><td>{s.label}</td><td>{s.avg}</td><td>{s.responses}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

export function ProgramView({ data }: { data: any }) {
  const blocks = data.blocks ?? {};
  return (
    <>
      <ScaleTable title="Направление" rows={blocks.direction} />
      <ScaleTable title="Уроки о важном" rows={blocks.lessonsImportant} />
      <ScaleTable title="Открытые уроки" rows={blocks.openLessons} />
      <ScaleTable title="Практики" rows={blocks.workshops} />
      <div className="card">
        <h3>Клубы (посещение)</h3>
        <ul>{(blocks.clubs ?? []).map((e: { title: string; attendance: number }) => <li key={e.title}>{e.title}: {e.attendance}</li>)}</ul>
      </div>
      <div className="card">
        <h3>События дня — упоминания</h3>
        <ul>{(data.dayEvents?.topMentions ?? []).map((t: { token: string; count: number }) => <li key={t.token}>{t.token}: {t.count}</li>)}</ul>
        <p className="adm-muted">{data.dayEvents?.llmReflectionMentionsDeferred}</p>
      </div>
      {(data.practicesByDay ?? []).map((d: { day: number; top: { title: string; attendance: number }[] }) => (
        <div className="card" key={d.day}>
          <h4>Топ практик · {formatForumDay(d.day)}</h4>
          <ul>{d.top.map(e => <li key={e.title}>{e.title} · {e.attendance}</li>)}</ul>
        </div>
      ))}
      <div className="card">
        <h3>Расхождения</h3>
        <ul>{(data.divergenceExtended ?? data.divergence ?? []).map((d: { eventId: number; title: string; attendance: number; mentionScore?: number }) => (
          <li key={d.eventId}>{d.title} · посещ. {d.attendance}{d.mentionScore != null ? ` · упом. ${d.mentionScore}` : ''}</li>
        ))}</ul>
      </div>
      <p className="adm-muted">{data.nps?.note}</p>
    </>
  );
}

export function ActivityView({ data }: { data: any }) {
  const trackLabel: Record<string, string> = { path: 'Путь', experience: 'Опыт', total: 'Общий', day: 'За день' };
  return (
    <>
      <div className="card">
        <h3>Рейтинги</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {(['path', 'experience', 'total', 'day'] as const).map(track => (
            <div key={track}>
              <h4>{trackLabel[track] ?? track}</h4>
              <ol>{(data.ratings?.[track] ?? []).slice(0, 10).map((r: { id: number; rank: number; name: string; points: number }) => (
                <li key={r.id}>{r.rank}. {r.name} — {r.points}</li>
              ))}</ol>
            </div>
          ))}
        </div>
        {(data.ratings?.byDirection ?? []).map((row: { direction: string; top: { name: string; points: number }[] }) => (
          <div key={row.direction}><strong>{row.direction}</strong>: {row.top.map(t => `${t.name} (${t.points})`).join('; ')}</div>
        ))}
      </div>
      <div className="card">
        <h3>Задания</h3>
        <p>На модерации: {data.tasks?.pendingModeration} · Командные: {data.tasks?.pendingTeam}</p>
        <ul>{(data.tasks?.popular ?? []).map((t: { title: string; count: number }) => <li key={t.title}>{t.title}: {t.count}</li>)}</ul>
        <ul>{(data.tasks?.byCategory ?? []).map((c: { category: string; count: number }) => <li key={c.category}>{c.category}: {c.count}</li>)}</ul>
      </div>
      <div className="card">
        <h3>Медали</h3>
        <p>Открытые: {data.medalsSummary?.open} · Скрытые: {data.medalsSummary?.hidden}</p>
        <ul>{(data.medals ?? []).slice(0, 15).map((m: { name: string; medal: string; hidden: boolean }, i: number) => (
          <li key={i}>{m.name}: {m.medal}{m.hidden ? ' (скрытая)' : ''}</li>
        ))}</ul>
      </div>
    </>
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
  return (
    <>
      <div className="card">
        <h3>Копилка · записей: {data.navigation?.total}</h3>
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
      </div>
      {Object.entries(data.byTag ?? {}).map(([tag, v]) => {
        const block = v as { count: number; topThemes?: { token: string; count: number }[]; entries?: { text: string }[]; byDirection?: { direction: string; count: number }[] };
        return (
          <div className="card" key={tag}>
            <h4>Тег «{tag}» — {block.count}</h4>
            <p>{(block.topThemes ?? []).map(t => t.token).join(', ')}</p>
            <ul>{(block.byDirection ?? []).map(d => <li key={d.direction}>{d.direction}: {d.count}</li>)}</ul>
            <ul>{(block.entries ?? []).map((e, i) => <li key={i} style={{ fontSize: 12 }}>{e.text?.slice(0, 120)}</li>)}</ul>
          </div>
        );
      })}
      {Object.entries(data.bySource ?? {}).map(([src, v]) => {
        const block = v as { count: number; tagMix: { tag: string; count: number }[] };
        return (
          <div className="card" key={src}>
            <h4>Источник «{src}» — {block.count}</h4>
            <ul>{block.tagMix.map(t => <li key={t.tag}>{t.tag}: {t.count}</li>)}</ul>
          </div>
        );
      })}
      <div className="card">
        <h4>«В работу» по направлениям</h4>
        <p>Всего: {data.vRabota?.total}</p>
        <ul>{(data.vRabota?.byDirection ?? []).map((d: { direction: string; count: number }) => <li key={d.direction}>{d.direction}: {d.count}</li>)}</ul>
        <p className="adm-muted">{data.llmClusterDeferred}</p>
      </div>
    </>
  );
}

export function SemanticView({ data }: { data: any }) {
  if (!data.enabled) return <div className="card"><p>{data.message}</p></div>;
  return (
    <>
      <div className="card">
        <h3>Смысловая аналитика (эвристики)</h3>
        <p className="adm-muted">{data.llmDeferred}</p>
        <p><strong>Наблюдение дня:</strong> {data.dailyObservation}</p>
      </div>
      <div className="card">
        <h3>Профессиональная сдвижка</h3>
        <p>{data.professionalShift?.summary}</p>
        <p>Новые темы: {(data.professionalShift?.emergingThemes ?? []).join(', ')}</p>
      </div>
      <div className="card">
        <h3>Языковой трекер</h3>
        {(data.languageTracker?.byDay ?? []).map((d: { day: number; terms: { token: string }[] }) => (
          <p key={d.day}>{formatForumDay(d.day)}: {d.terms.map(t => t.token).join(', ')}</p>
        ))}
      </div>
      <div className="card">
        <h3>Кластеры дня</h3>
        <p>{(data.semanticClusters?.themesOfDay ?? []).map((t: { token: string }) => t.token).join(', ')}</p>
        <h4>Новые вопросы</h4>
        <p>{(data.semanticClusters?.newQuestions ?? []).map((t: { token: string }) => t.token).join(', ')}</p>
      </div>
      <div className="card">
        <h3>Глубина рефлексии</h3>
        <ul>{Object.entries(data.depthLayers?.distribution ?? {}).map(([k, v]) => <li key={k}>{k}: {String(v)}</li>)}</ul>
        <ul>{(data.depthLayers?.topDeepReflections ?? []).slice(0, 8).map((r: { text: string }, i: number) => (
          <li key={i} style={{ fontSize: 12 }}>{r.text.slice(0, 200)}</li>
        ))}</ul>
      </div>
    </>
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
  if (!data.enabled) return <div className="card"><p>{data.message ?? 'Клубы v2 — включите SEMANTIC_ANALYTICS_V2'}</p></div>;
  return (
    <>
      <div className="card">
        <h3>Описания клубов</h3>
        {(data.clubs ?? []).map((c: { id: string; name: string; description?: string }) => (
          <div key={c.id} style={{ marginBottom: 12 }}>
            <strong>{c.name}</strong>
            <textarea
              className="adm-input"
              style={{ width: '100%', minHeight: 64 }}
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
      </div>
      <div className="card">
        <h3>Материал для клуба</h3>
        <select className="adm-input" value={clubFilter} onChange={e => onClubFilter(e.target.value)}>
          <option value="">Все клубы</option>
          {(data.clubs ?? []).map((c: { id: string; name: string }) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <table className="adm-table">
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
      </div>
    </>
  );
}

export function OverviewView({ data }: { data: any }) {
  return (
    <>
      <div className="card">
        <h3>Обзор форума</h3>
        <p>Зарегистрировано: {data.pulse?.registered} · Ответов (серия): {data.pulse?.totalAnswers}</p>
        <p>Событий в программе: {data.program?.eventsCount}</p>
        <p>Записей копилки: {data.piggybank?.total}</p>
      </div>
      <div className="card">
        <h3>Топ событий</h3>
        <ul>{(data.program?.topEvents ?? []).slice(0, 8).map((e: { id?: number; title?: string }) => (
          <li key={e.id ?? e.title}>{e.title}</li>
        ))}</ul>
      </div>
    </>
  );
}

export function DepartureView({ data, onOpenCard }: { data: any; onOpenCard: AnalyticsTabProps['onOpenCard'] }) {
  return (
    <>
      <div className="card">
        <h3>Заезд → выезд</h3>
        <p>Заполнили обе точки: {data.completedBoth}</p>
        {(data.byDirection ?? []).map((row: { direction: string; bothPoints: number; total: number; pointATokens: { token: string }[]; pointBTokens: { token: string }[] }) => (
          <div key={row.direction}>
            <strong>{row.direction}</strong> ({row.bothPoints}/{row.total})
            <p style={{ fontSize: 12 }}>А: {row.pointATokens.map(t => t.token).join(', ')}</p>
            <p style={{ fontSize: 12 }}>Б: {row.pointBTokens.map(t => t.token).join(', ')}</p>
          </div>
        ))}
      </div>
      <div className="card">
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
      </div>
    </>
  );
}
