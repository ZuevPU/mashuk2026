import { useMemo, useState } from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ChartTooltipRu, formatForumDay } from './chartRu';

type DayPoint = {
  day: number;
  avg: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  responses: number;
  uniqueParticipants: number;
};

type AnswerLengths = {
  byDay?: DayPoint[];
  totalResponses?: number;
  note?: string;
};

function MethodHint({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 16, height: 16, marginLeft: 6, borderRadius: '50%',
        fontSize: 10, fontWeight: 700, color: '#86868b', border: '1px solid #d2d2d7',
        cursor: 'help', verticalAlign: 'middle',
      }}
    >
      i
    </span>
  );
}

export function AnswerLengthPanel({ data }: { data: AnswerLengths | null | undefined }) {
  const [mode, setMode] = useState<'table' | 'chart'>('table');
  const rows = data?.byDay ?? [];
  const hasData = rows.some(r => r.responses > 0);

  const chartRows = useMemo(() => rows.map(r => ({
    dayLabel: formatForumDay(r.day),
    avg: r.avg,
    median: r.median,
    responses: r.responses,
  })), [rows]);

  if (!hasData) {
    return (
      <div className="adm-dash-card" style={{ marginTop: 16 }}>
        <div className="adm-dash-card-title">Длина ответов по дням</div>
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
          Нет текстовых ответов для расчёта длины сообщений.
        </p>
      </div>
    );
  }

  return (
    <div className="adm-dash-card" style={{ marginTop: 16 }}>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 10,
        alignItems: 'center', justifyContent: 'space-between',
      }}
      >
        <div>
          <div className="adm-dash-card-title" style={{ margin: 0 }}>
            Длина ответов по дням
            <MethodHint text={data?.note ?? 'Средняя длина текстовых ответов в символах по дням смены.'} />
          </div>
          <p className="adm-muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            Все дни смены · символы в текстовых ответах · всего: {data?.totalResponses ?? 0}
          </p>
        </div>
        <button
          type="button"
          className="adm-btn adm-btn-secondary adm-btn-sm"
          onClick={() => setMode(m => (m === 'table' ? 'chart' : 'table'))}
        >
          {mode === 'table' ? 'Показать график' : 'Показать таблицу'}
        </button>
      </div>

      {mode === 'table' ? (
        <div className="adm-table-scroll" style={{ marginTop: 14 }}>
          <table className="adm-table adm-table-compact" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>День</th>
                <th>Средняя</th>
                <th>Медиана</th>
                <th>Мин</th>
                <th>Макс</th>
                <th>Ответов</th>
                <th>Участников</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.day}>
                  <td>{formatForumDay(r.day)}</td>
                  <td><strong>{r.avg ?? '—'}</strong></td>
                  <td>{r.median ?? '—'}</td>
                  <td>{r.min ?? '—'}</td>
                  <td>{r.max ?? '—'}</td>
                  <td>{r.responses}</td>
                  <td>{r.uniqueParticipants}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="adm-chart-frame" style={{ marginTop: 14 }}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartRows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />
              <XAxis dataKey="dayLabel" tick={{ fontSize: 11, fill: '#86868b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#86868b' }} width={40} />
              <Tooltip content={<ChartTooltipRu />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="avg" name="Средняя длина" stroke="#1F3A5F" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="median" name="Медиана" stroke="#0A7B6F" strokeWidth={1.5} strokeDasharray="4 4" dot={{ r: 2.5 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
