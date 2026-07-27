import { useCallback, useEffect, useState } from 'react';
import { adminDownloadBinary, downloadCsv } from '../../admin/client';
import { AdminPageHero } from '../admin/AdminPageHero';
import { label } from '../../labels/ru';
import type { AdminTabProps } from '../admin/types';

const EXPORT_DAYS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const EXPORT_TYPES = ['all', 'checkin', 'direction', 'lessons', 'evening', 'point_a', 'point_b'] as const;
const EXPORT_TYPE_LABEL_KEY: Record<string, string> = {
  all: 'export_all',
  checkin: 'export_checkin',
  direction: 'export_direction',
  lessons: 'export_lessons',
  evening: 'export_evening',
  point_a: 'export_point_a',
  point_b: 'export_point_b',
};

export function ExportsTab({ adminFetch: _adminFetch, act, reloadKey }: AdminTabProps) {
  const [exportDay, setExportDay] = useState('1');
  const [exportType, setExportType] = useState<string>('all');
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    setReady(true);
  }, []);

  useEffect(() => {
    load().catch(() => setReady(true));
  }, [load, reloadKey]);

  if (!ready) {
    return <p className="adm-muted">Загрузка…</p>;
  }

  return (
    <div className="adm-forum">
      <AdminPageHero
        title="Выгрузки"
        hint="CSV и XLSX для аналитики и отчётности. Для выгрузок нужны права export."
      />

      <div className="card adm-forum-block">
        <h3>Выгрузка по дню</h3>
        <div className="adm-forum-toolbar">
          <select
            className="adm-input"
            value={exportDay}
            onChange={e => setExportDay(e.target.value)}
          >
            {EXPORT_DAYS.map(d => (
              <option key={d} value={String(d)}>День {d}</option>
            ))}
          </select>
          <select
            className="adm-input"
            value={exportType}
            onChange={e => setExportType(e.target.value)}
          >
            {EXPORT_TYPES.map(t => (
              <option key={t} value={t}>{label(EXPORT_TYPE_LABEL_KEY[t] || t)}</option>
            ))}
          </select>
          <button
            type="button"
            className="adm-btn adm-btn-secondary"
            onClick={() =>
              downloadCsv(
                `/exports/answers?day=${exportDay}&type=${exportType}&depth=1`,
                `answers_day${exportDay}.csv`,
              )
            }
          >
            Скачать ответы дня (с ориентиром глубины)
          </button>
          <button
            type="button"
            className="adm-btn adm-btn-primary"
            onClick={() =>
              act(
                () =>
                  adminDownloadBinary(
                    `/exports/day?day=${exportDay}&type=${exportType}`,
                    `day_${exportDay}_${exportType}.xlsx`,
                  ),
                'Книга дня скачана',
              )
            }
          >
            Книга дня (XLSX / CSV)
          </button>
        </div>
      </div>

      <div className="card adm-forum-block">
        <h3>Другие выгрузки</h3>
        <div className="adm-forum-toolbar">
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadCsv('/exports/participants', 'participants.csv')}>
            Участники
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadCsv('/exports/answers', 'answers.csv')}>
            Все ответы
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadCsv('/exports/piggybank', 'piggybank.csv')}>
            Копилка
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadCsv('/exports/task-submissions', 'task_submissions.csv')}>
            Задания
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadCsv('/exports/exchange', 'exchange.csv')}>
            Обмен
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadCsv('/exports/attendance', 'attendance.csv')}>
            Посещаемость
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadCsv('/exports/points-log', 'points_log.csv')}>
            Баллы
          </button>
        </div>
        <p className="adm-forum-hint" style={{ marginTop: 12 }}>
          Ориентир глубины — качественный слой (Фиксация / Личный вывод / Перенос в практику), не оценка в баллах.
        </p>
      </div>
    </div>
  );
}
