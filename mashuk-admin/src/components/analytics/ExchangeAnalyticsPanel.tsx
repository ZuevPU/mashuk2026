import { useMemo, useState } from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useInsights } from '../insights/InsightsContext';
import { ChartTooltipRu, formatForumDay } from './chartRu';
import {
  DashCard, DashGrid, DashKpi, LeaderList, SrcBars, dashVal,
} from './dashboardUi';
import { OrientableBarChart } from './orientableBars';

type ExchangeData = {
  kpi?: {
    total?: number;
    approved?: number;
    rejected?: number;
    pending?: number;
    answers?: number;
    uniqueAskers?: number;
    uniqueAnswerers?: number;
    approvalRatePct?: number;
    rejectRatePct?: number;
    avgAnswersPerApproved?: number;
    otherCount?: number;
    otherSharePct?: number;
  };
  byCategory?: { label: string; count: number }[];
  byDay?: {
    day: number;
    total: number;
    approved: number;
    rejected: number;
    pending: number;
    answers: number;
    uniqueAskers: number;
    approvalRatePct: number;
  }[];
  byDirectionDay?: {
    direction: string;
    day: number;
    people: number;
    questions: number;
  }[];
  topQuestions?: {
    id: number;
    text: string;
    direction: string;
    authorName: string;
    answerCount: number;
    likes: number;
    discuss: number;
    score: number;
    day: number | null;
  }[];
  topAskers?: { name: string; direction: string; count: number }[];
  topAnswerers?: { name: string; direction: string; count: number }[];
  audienceMix?: { label: string; count: number }[];
  answersByDay?: { day: number; answers: number }[];
};

export function ExchangeAnalyticsPanel({ data }: { data: ExchangeData | null | undefined }) {
  const { forumDay, meta, setTab } = useInsights();
  const byDay = data?.byDay ?? [];
  const byDirectionDay = data?.byDirectionDay ?? [];
  const kpi = data?.kpi ?? {};

  const dayOptions = useMemo(() => {
    if (byDay.length) return byDay.map(d => d.day);
    const cur = meta?.currentForumDay ?? (Number(forumDay) || 1);
    return Array.from({ length: Math.min(Math.max(1, cur), 7) }, (_, i) => i + 1);
  }, [byDay, meta?.currentForumDay, forumDay]);

  const defaultDay = dayOptions.includes(Number(forumDay))
    ? Number(forumDay)
    : (dayOptions[dayOptions.length - 1] ?? 1);
  const [dirDay, setDirDay] = useState(defaultDay);

  const dayChart = useMemo(() => byDay.map(row => ({
    dayLabel: formatForumDay(row.day),
    total: row.total,
    approved: row.approved,
    rejected: row.rejected,
  })), [byDay]);

  const answersChart = useMemo(() => (data?.answersByDay ?? byDay).map(row => ({
    dayLabel: formatForumDay(row.day),
    answers: row.answers,
  })), [data?.answersByDay, byDay]);

  const dirChart = useMemo(() => {
    return byDirectionDay
      .filter(r => r.day === dirDay)
      .map(r => ({
        name: r.direction,
        people: r.people,
        questions: r.questions,
      }))
      .filter(r => r.people > 0 || r.questions > 0)
      .sort((a, b) => b.people - a.people || b.questions - a.questions || a.name.localeCompare(b.name, 'ru'));
  }, [byDirectionDay, dirDay]);

  const topQuestions = data?.topQuestions ?? [];

  return (
    <div className="adm-dash-stack" style={{ gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div className="adm-dash-section-label" style={{ marginBottom: 4 }}>Обмен опытом</div>
          <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>
            Модерация, вовлечённость по дням и направлениям, топ вопросов по ответам и реакциям.
          </p>
        </div>
        <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 10, margin: 0 }}>
          <label className="adm-insights-filter">
            День (направления)
            <select
              className="adm-input"
              value={dirDay}
              onChange={e => setDirDay(Number(e.target.value))}
            >
              {dayOptions.map(d => (
                <option key={d} value={d}>{formatForumDay(d)}</option>
              ))}
            </select>
          </label>
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setTab('moderation')}>
            Модерация →
          </button>
        </div>
      </div>

      <DashGrid cols={4}>
        <DashKpi value={dashVal(kpi.total)} label="вопросов подано" sub={`в очереди: ${kpi.pending ?? 0}`} />
        <DashKpi value={dashVal(kpi.approved)} label="принято" accent="#22c55e" sub={`охват ${kpi.approvalRatePct ?? 0}%`} />
        <DashKpi value={dashVal(kpi.rejected)} label="отклонено" accent="#ef4444" sub={`доля ${kpi.rejectRatePct ?? 0}%`} />
        <DashKpi
          value={`${kpi.otherSharePct ?? 0}%`}
          label="доля «Другое»"
          accent="#B8621A"
          sub={`${kpi.otherCount ?? 0} вопросов · качество рубрик`}
        />
      </DashGrid>
      {(data?.byCategory?.length ?? 0) > 0 && (
        <DashCard title="Распределение по рубрикам">
          <SrcBars items={(data?.byCategory || []).map(r => ({ label: r.label, count: r.count }))} />
        </DashCard>
      )}
      <DashGrid cols={4}>
        <DashKpi
          value={dashVal(kpi.answers)}
          label="ответов в ленте"
          accent="var(--m-accent)"
          sub={`ср. на вопрос: ${kpi.avgAnswersPerApproved ?? 0}`}
        />
      </DashGrid>

      <DashGrid cols={2}>
        <DashCard title="Подача и модерация по дням">
          <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
            Синяя — всего подано · зелёная — принято · красная — отказ.
          </p>
          {dayChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={dayChart} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />
                <XAxis dataKey="dayLabel" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTooltipRu />} />
                <Legend />
                <Line type="monotone" dataKey="total" name="Всего" stroke="#2563eb" strokeWidth={2.5} dot />
                <Line type="monotone" dataKey="approved" name="Принято" stroke="#22c55e" strokeWidth={2} dot />
                <Line type="monotone" dataKey="rejected" name="Отказ" stroke="#ef4444" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет данных по дням</p>
          )}
        </DashCard>

        <DashCard title={`Авторы по направлениям · ${formatForumDay(dirDay)}`}>
          <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
            Сколько человек из направления подали вопросы в выбранный день.
          </p>
          {dirChart.length > 0 ? (
            <OrientableBarChart
              data={dirChart}
              categoryKey="name"
              series={[
                { dataKey: 'people', name: 'Человек', fill: 'var(--m-accent)' },
                { dataKey: 'questions', name: 'Вопросов', fill: '#93c5fd' },
              ]}
              showLegend
              yAxisWidth={120}
            />
          ) : (
            <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>
              В этот день никто из направлений не подавал вопросы.
            </p>
          )}
        </DashCard>
      </DashGrid>

      <DashGrid cols={2}>
        <DashCard title="Ответы по дням">
          <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
            Сколько ответов написали участники в ленте обмена.
          </p>
          {answersChart.some(r => r.answers > 0) ? (
            <OrientableBarChart
              data={answersChart}
              categoryKey="dayLabel"
              series={[{ dataKey: 'answers', name: 'Ответы', fill: '#3182CE' }]}
              height={220}
            />
          ) : (
            <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Ответов пока нет</p>
          )}
        </DashCard>

        <DashCard title="Топ вопросов обмена">
          <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
            Рейтинг одобренных: ответы ×3 + лайки + «обсудить» ×2.
          </p>
          {topQuestions.length > 0 ? (
            <div className="adm-dash-leader-list">
              {topQuestions.slice(0, 6).map((q, i) => (
                <div key={q.id} className="adm-dash-leader-row" style={{ alignItems: 'flex-start' }}>
                  <span className={`adm-dash-leader-rank rank-${i < 3 ? i + 1 : 'n'}`}>{i + 1}</span>
                  <div className="adm-dash-leader-body" style={{ minWidth: 0 }}>
                    <div className="adm-dash-leader-name" style={{ whiteSpace: 'normal', fontWeight: 500 }}>
                      {q.text}
                    </div>
                    <div className="adm-dash-leader-sub">
                      {q.authorName} · {q.direction}
                      {q.day != null ? ` · ${formatForumDay(q.day)}` : ''}
                      {' · '}
                      {q.answerCount} отв. · 👍 {q.likes} · обсуд. {q.discuss}
                    </div>
                  </div>
                  <div className="adm-dash-leader-score">{q.score}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Пока нет одобренных вопросов с ответами</p>
          )}
        </DashCard>
      </DashGrid>

      <DashGrid cols={3}>
        <DashCard title="Кто спрашивает">
          <LeaderList
            items={(data?.topAskers ?? []).map(a => ({
              name: a.name,
              sub: a.direction,
              score: a.count,
            }))}
          />
        </DashCard>
        <DashCard title="Кто отвечает">
          <LeaderList
            items={(data?.topAnswerers ?? []).map(a => ({
              name: a.name,
              sub: a.direction,
              score: a.count,
            }))}
          />
        </DashCard>
        <DashCard title="Аудитория вопросов">
          <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
            Кому адресованы вопросы (поле audience).
          </p>
          <SrcBars
            items={(data?.audienceMix ?? []).map(a => ({
              label: a.label,
              count: a.count,
            }))}
          />
          <div className="adm-muted" style={{ fontSize: 12, marginTop: 10 }}>
            Уникальных авторов: {dashVal(kpi.uniqueAskers)} · отвечающих: {dashVal(kpi.uniqueAnswerers)}
          </div>
        </DashCard>
      </DashGrid>
    </div>
  );
}
