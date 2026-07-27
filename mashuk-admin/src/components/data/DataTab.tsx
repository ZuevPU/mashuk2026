import { useCallback, useEffect, useState } from 'react';
import { label } from '../../labels/ru';
import { AdminPageHero } from '../admin/AdminPageHero';
import { Pagination } from '../admin/Pagination';
import type { AdminTabProps } from '../admin/types';

export function DataTab({ adminFetch, reloadKey }: AdminTabProps) {
  const [loading, setLoading] = useState(true);
  const [allSubmissions, setAllSubmissions] = useState<any[]>([]);
  const [submissionsPage, setSubmissionsPage] = useState(1);
  const [submissionsTotal, setSubmissionsTotal] = useState(0);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [attendancePage, setAttendancePage] = useState(1);
  const [attendanceTotal, setAttendanceTotal] = useState(0);
  const [exchangeArchive, setExchangeArchive] = useState<any[]>([]);
  const [exchangePage, setExchangePage] = useState(1);
  const [exchangeTotal, setExchangeTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const subRes = await adminFetch(`/task-submissions?page=${submissionsPage}`);
      setAllSubmissions(subRes.submissions || []);
      setSubmissionsTotal(subRes.totalCount || 0);

      const attRes = await adminFetch(`/event-attendance?page=${attendancePage}`);
      setAttendance(attRes.attendance || []);
      setAttendanceTotal(attRes.totalCount || 0);

      const exRes = await adminFetch(`/exchange?page=${exchangePage}`);
      setExchangeArchive(exRes.questions || []);
      setExchangeTotal(exRes.totalCount || 0);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, submissionsPage, attendancePage, exchangePage]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  if (loading && allSubmissions.length === 0) {
    return <p className="adm-muted">Загрузка данных…</p>;
  }

  return (
    <div className="adm-forum">
      <AdminPageHero title="Данные" hint="Ответы на задания, посещаемость и архив обмена опытом." />

      <h3>Ответы на задания</h3>
      <table className="adm-table">
        <thead><tr><th>Участник</th><th>Задание</th><th>Статус</th><th>Ответ</th><th>Дата</th></tr></thead>
        <tbody>
          {allSubmissions.map(s => (
            <tr key={s.id}>
              <td>{s.participantName}</td>
              <td>{s.taskTitle}</td>
              <td>{label(s.status)}</td>
              <td>{s.answerText?.slice(0, 40)}</td>
              <td>{s.submittedAt ? new Date(s.submittedAt).toLocaleString('ru-RU') : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination page={submissionsPage} total={submissionsTotal} setPage={setSubmissionsPage} />

      <h3 style={{ marginTop: 24 }}>Посещаемость событий</h3>
      <table className="adm-table">
        <thead><tr><th>Участник</th><th>Направление</th><th>Событие</th><th>День</th><th>Дата</th></tr></thead>
        <tbody>
          {attendance.map(a => (
            <tr key={a.id}>
              <td>{a.participantName}</td>
              <td>{a.direction}</td>
              <td>{a.eventTitle}</td>
              <td>{a.eventDay}</td>
              <td>{a.createdAt ? new Date(a.createdAt).toLocaleString('ru-RU') : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination page={attendancePage} total={attendanceTotal} setPage={setAttendancePage} />

      <h3 style={{ marginTop: 24 }}>Обмен опытом (все)</h3>
      {exchangeArchive.map(q => (
        <div key={q.id} className="card">
          <strong>{label(q.moderationStatus)}</strong> · {q.text}
          <div style={{ fontSize: 11 }}>{q.authorName} · ответов: {q.answers?.length ?? 0}</div>
        </div>
      ))}
      <Pagination page={exchangePage} total={exchangeTotal} setPage={setExchangePage} />
    </div>
  );
}
