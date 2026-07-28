import { useEffect, useState } from 'react';
import { adminDownloadBinary, downloadCsv } from '../../admin/client';
import { AdminPageHero } from '../admin/AdminPageHero';
import { label } from '../../labels/ru';
import type { AdminTabProps } from '../admin/types';
import { useInsights } from '../insights/InsightsContext';
import { CustomExportModal, ExportHistoryBlock } from './CustomExportModal';

const EXPORT_TYPES = [
  'all', 'checkin', 'direction', 'lesson_important', 'lesson_open', 'evening', 'point_a', 'point_b',
] as const;

const EXPORT_TYPE_LABEL_KEY: Record<string, string> = {
  all: 'export_all',
  checkin: 'export_checkin',
  direction: 'export_direction',
  lesson_important: 'export_lesson_important',
  lesson_open: 'export_lesson_open',
  evening: 'export_evening',
  point_a: 'export_point_a',
  point_b: 'export_point_b',
};

const NOMINATIONS = [
  'sport', 'creative', 'media', 'education', 'culture', 'volunteer', 'team', 'general',
] as const;

const CROSS_FIELDS = [
  { ru: 'ФИО', key: 'full_name' },
  { ru: 'Направление', key: 'direction' },
  { ru: 'Группа', key: 'group_name' },
  { ru: 'День', key: 'day' },
  { ru: 'Время заполнения', key: 'filled_at' },
  { ru: 'Тип данных', key: 'question_type' },
  { ru: 'Вопрос', key: 'question_text' },
  { ru: 'Ответ', key: 'answer' },
  { ru: 'Баллы', key: 'points' },
  { ru: 'Источник', key: 'source' },
];

function buildQuery(params: Record<string, string | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') u.set(k, v);
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

export function ExportsTab({ adminFetch, act, reloadKey }: AdminTabProps) {
  const { forumDay, direction, group } = useInsights();
  const [exportType, setExportType] = useState<string>('all');
  const [participantId, setParticipantId] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [textOnly, setTextOnly] = useState(false);
  const [nominationKey, setNominationKey] = useState<string>('sport');
  const [delayedStatus, setDelayedStatus] = useState<string>('');

  useEffect(() => {
    adminFetch('/integrations/delayed-survey/status')
      .then(d => {
        const by = (d as { byStatus?: Record<string, number> }).byStatus ?? {};
        const parts = Object.entries(by).map(([k, v]) => `${k}: ${v}`);
        setDelayedStatus(parts.length ? parts.join(' · ') : 'нет записей');
      })
      .catch(() => setDelayedStatus(''));
  }, [adminFetch, historyKey, reloadKey]);

  const enqueueJob = (kind: string, title: string, params?: Record<string, unknown>) =>
    act(async () => {
      await adminFetch('/exports/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, title, params }),
      });
      setHistoryKey(k => k + 1);
    }, 'Задача в истории — скачайте, когда статус ready');

  const filterQs = buildQuery({
    direction: direction || undefined,
    group: group || undefined,
  });

  const cohortParams = {
    direction: direction || undefined,
    group: group || undefined,
  };

  const downloadXlsx = (path: string, filename: string) =>
    act(() => adminDownloadBinary(path, filename), 'Файл скачан');

  const downloadJson = (path: string, filename: string) =>
    act(async () => {
      const data = await adminFetch(path);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
    }, 'Файл скачан');

  const downloadPresetHistory = (
    body: { preset: string; title: string; source: string; params?: Record<string, unknown> },
    fallbackName: string,
  ) =>
    act(async () => {
      const row = (await adminFetch('/exports/history/preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })) as { id: string; fileName?: string; status?: string; errorMessage?: string };
      if (row.status === 'failed') {
        throw new Error(row.errorMessage || 'Не удалось сформировать выгрузку');
      }
      await adminDownloadBinary(`/exports/history/${row.id}/download`, row.fileName || fallbackName);
      setHistoryKey(k => k + 1);
    }, 'Файл скачан');

  const renderTypeSelect = () => (
    <select className="adm-input" value={exportType} onChange={e => setExportType(e.target.value)}>
      {EXPORT_TYPES.map(t => (
        <option key={t} value={t}>{label(EXPORT_TYPE_LABEL_KEY[t] || t)}</option>
      ))}
    </select>
  );

  return (
    <div className="adm-forum">
      <AdminPageHero title="Выгрузки" hint="Пресеты XLSX · кастомный конструктор · история с повторным скачиванием" />

      <div className="card adm-forum-block">
        <div className="adm-forum-toolbar" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Кастомная выгрузка</h3>
          <button type="button" className="adm-btn adm-btn-primary" onClick={() => setCustomOpen(true)}>
            Открыть конструктор
          </button>
        </div>
        <p className="adm-forum-hint">Источник + колонки → файл скачивается сразу и лежит в истории 30 дней.</p>
      </div>

      <div className="card adm-forum-block">
        <h3>Аналитические</h3>
        <p className="adm-forum-hint">Для Excel / Power BI. Зернистость: участник или ответ.</p>
        <table className="adm-table adm-preset-table">
          <thead>
            <tr><th>Пресет</th><th>Для кого / зернистость</th><th>Параметры</th><th /></tr>
          </thead>
          <tbody>
            <tr>
              <td>Полная выгрузка по дню</td>
              <td className="adm-muted">Аналитик · 1 строка = участник × активности дня</td>
              <td><span className="adm-muted">D{forumDay}{direction ? ` · ${direction}` : ''}{group ? ` · ${group}` : ''}</span></td>
              <td>
                <button
                  type="button"
                  className="adm-btn adm-btn-primary"
                  onClick={() =>
                    downloadPresetHistory({
                      preset: 'Полная выгрузка по дню',
                      title: `Участники×активности D${forumDay}`,
                      source: 'participant_activity_wide',
                      params: { day: Number(forumDay), ...cohortParams },
                    }, `participant_activity_d${forumDay}.xlsx`)
                  }
                >
                  Скачать XLSX
                </button>
              </td>
            </tr>
            <tr>
              <td>Полная выгрузка участников (все активности смены)</td>
              <td className="adm-muted">Аналитик · 1 строка = участник × активности смены</td>
              <td><span className="adm-muted">{direction || group ? [direction, group].filter(Boolean).join(' · ') : 'Вся смена'}</span></td>
              <td>
                <button
                  type="button"
                  className="adm-btn adm-btn-primary"
                  onClick={() =>
                    downloadPresetHistory({
                      preset: 'Полная выгрузка участников',
                      title: 'Участники×активности смена',
                      source: 'participant_activity_wide',
                      params: { ...cohortParams },
                    }, 'participant_activity_shift.xlsx')
                  }
                >
                  Скачать XLSX
                </button>
              </td>
            </tr>
            <tr>
              <td>По дню (много листов)</td>
              <td className="adm-muted">Куратор · ответы + события + сдачи; тип фильтрует лист «Ответы дня»</td>
              <td>
                <span className="adm-muted">D{forumDay}</span>
                {renderTypeSelect()}
              </td>
              <td>
                <button
                  type="button"
                  className="adm-btn adm-btn-primary"
                  onClick={() =>
                    downloadXlsx(`/exports/day?day=${forumDay}&type=${exportType}`, `day_${forumDay}_${exportType}.xlsx`)
                  }
                >
                  Скачать XLSX
                </button>
              </td>
            </tr>
            <tr>
              <td>По направлению / группе</td>
              <td className="adm-muted">Куратор · сводка по когорте</td>
              <td>
                <span className="adm-muted">{direction || 'направление?'} · {group || 'группа?'}</span>
              </td>
              <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="adm-btn adm-btn-primary"
                  disabled={!direction}
                  onClick={() => downloadXlsx(`/exports/daily-summary${buildQuery({ direction })}`, 'by_direction.xlsx')}
                >
                  По направлению
                </button>
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary"
                  disabled={!group}
                  onClick={() => downloadXlsx(`/exports/daily-summary${buildQuery({ group })}`, 'by_group.xlsx')}
                >
                  По группе
                </button>
              </td>
            </tr>
            <tr>
              <td>По участнику</td>
              <td className="adm-muted">Куратор · 1 строка = ответ одного человека</td>
              <td>
                <input className="adm-input" placeholder="ID участника" value={participantId} onChange={e => setParticipantId(e.target.value)} />
              </td>
              <td>
                <button
                  type="button"
                  className="adm-btn adm-btn-primary"
                  disabled={!participantId.trim()}
                  onClick={() =>
                    downloadXlsx(
                      `/exports/participant/${participantId.trim()}/answers?format=xlsx`,
                      `participant_${participantId}.xlsx`,
                    )
                  }
                >
                  Скачать XLSX
                </button>
              </td>
            </tr>
            <tr>
              <td>По копилке</td>
              <td className="adm-muted">Аналитик · 1 строка = запись копилки</td>
              <td><span className="adm-muted">Все записи{direction ? ` · ${direction}` : ''}</span></td>
              <td>
                <button
                  type="button"
                  className="adm-btn adm-btn-primary"
                  onClick={() =>
                    downloadXlsx(
                      `/exports/piggybank?format=xlsx${filterQs.replace('?', '&')}`,
                      'piggybank.xlsx',
                    )
                  }
                >
                  Скачать XLSX
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card adm-forum-block">
        <h3>Операционные</h3>
        <p className="adm-forum-hint">Рейтинг, модерация, заявки — для ежедневной работы команды.</p>
        <table className="adm-table adm-preset-table">
          <thead>
            <tr><th>Пресет</th><th>Для кого / зернистость</th><th>Параметры</th><th /></tr>
          </thead>
          <tbody>
            <tr>
              <td>Рейтинг за день</td>
              <td className="adm-muted">Игропрактик · 1 строка = участник</td>
              <td>D{forumDay}</td>
              <td>
                <button
                  type="button"
                  className="adm-btn adm-btn-primary"
                  onClick={() =>
                    downloadPresetHistory({
                      preset: 'По рейтингу',
                      title: `Рейтинг D${forumDay}`,
                      source: 'rating_day',
                      params: { day: Number(forumDay), ...cohortParams },
                    }, `rating_day_${forumDay}.xlsx`)
                  }
                >
                  Скачать XLSX
                </button>
              </td>
            </tr>
            <tr>
              <td>Рейтинг смены</td>
              <td className="adm-muted">Игропрактик · 1 строка = участник</td>
              <td><span className="adm-muted">Вся смена</span></td>
              <td>
                <button
                  type="button"
                  className="adm-btn adm-btn-primary"
                  onClick={() => downloadCsv('/exports/rating/shift', 'leaderboard_shift.csv')}
                >
                  Скачать CSV
                </button>
              </td>
            </tr>
            <tr>
              <td>По заданиям</td>
              <td className="adm-muted">Модератор · 1 строка = заявка</td>
              <td><span className="adm-muted">Все заявки</span></td>
              <td>
                <button
                  type="button"
                  className="adm-btn adm-btn-primary"
                  onClick={() =>
                    downloadPresetHistory({
                      preset: 'По заданиям',
                      title: 'По заданиям',
                      source: 'tasks',
                      params: { ...cohortParams },
                    }, 'tasks.xlsx')
                  }
                >
                  Скачать XLSX
                </button>
              </td>
            </tr>
            <tr>
              <td>Заявки / медали / журналы</td>
              <td className="adm-muted">Операционка · быстрые срезы</td>
              <td />
              <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadXlsx('/exports/task-submissions', 'task_submissions.xlsx')}>
                  Заявки
                </button>
                <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadXlsx('/exports/medals?format=xlsx', 'medals.xlsx')}>
                  Медали
                </button>
                <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadCsv('/exports/points-log', 'points_log.csv')}>
                  Журнал баллов
                </button>
                <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadCsv('/exports/moderation-log', 'moderation_log.csv')}>
                  Модерация
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card adm-forum-block">
        <h3>Архив</h3>
        <p className="adm-forum-hint">Полные базы, сводки и ZIP — реже, тяжелее. Лимит базы участников: 5000 строк.</p>
        <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadXlsx(`/exports/participants?format=xlsx${filterQs.replace('?', '&')}`, 'participants_full.xlsx')}>
            База участников (профиль)
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadXlsx('/exports/roles-experiments?format=xlsx', 'roles_experiments.xlsx')}>
            Роли и эксперименты
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadXlsx('/exports/reflections?format=xlsx', 'reflections.xlsx')}>
            Рефлексия смены
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadCsv('/exports/point-a-b-summary', 'point_a_b_summary.csv')}>
            Точка А → Б
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadCsv('/exports/activity', 'activity.csv')}>
            Активность (touchpoints)
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadJson(`/exports/day/stats?day=${forumDay}`, `day_stats_d${forumDay}.json`)}>
            Статистика дня (JSON)
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadCsv('/exports/delayed-measure-template', 'delayed_measure_template.csv')}>
            Шаблон отсроченного замера
          </button>
          <button
            type="button"
            className="adm-btn adm-btn-secondary"
            onClick={() =>
              act(async () => {
                await adminFetch('/exports/delayed-survey/schedule', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ weeks: 7 }),
                });
                setHistoryKey(k => k + 1);
              }, 'Замер запланирован от конца смены')
            }
          >
            Запланировать замер (+7 нед.)
          </button>
          {delayedStatus && (
            <span className="adm-muted" style={{ fontSize: 12 }}>Статус замера: {delayedStatus}</span>
          )}
          <button
            type="button"
            className="adm-btn adm-btn-secondary"
            onClick={() => downloadXlsx('/exports/shift-summary.pdf', 'shift_summary.pdf')}
          >
            PDF итога смены
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadXlsx('/exports/tasks-catalog', 'tasks_catalog.xlsx')}>
            Каталог заданий
          </button>
          <select className="adm-input" value={nominationKey} onChange={e => setNominationKey(e.target.value)}>
            {NOMINATIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadCsv(`/exports/rating/nominations/${nominationKey}`, `nomination_${nominationKey}.csv`)}>
            Номинация
          </button>
          <label className="adm-muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={textOnly} onChange={e => setTextOnly(e.target.checked)} />
            ZIP текстовые
          </label>
          <button
            type="button"
            className="adm-btn adm-btn-primary"
            onClick={() => enqueueJob('participants_archive', 'ZIP участников', { textOnly })}
          >
            ZIP участников (фон)
          </button>
          <button
            type="button"
            className="adm-btn adm-btn-primary"
            onClick={() => enqueueJob('final_profiles_zip', 'ZIP PDF профилей')}
          >
            ZIP PDF (фон)
          </button>
          <button
            type="button"
            className="adm-btn adm-btn-secondary"
            onClick={() => enqueueJob('shift_summary_pdf', 'PDF итога смены')}
          >
            PDF итога смены (фон)
          </button>
        </div>
      </div>

      <div className="card adm-forum-block">
        <h3>Сквозные поля</h3>
        <p className="adm-forum-hint">Во всех текстовых выгрузках (§10):</p>
        <ul className="adm-cross-fields">
          {CROSS_FIELDS.map(f => (
            <li key={f.key}><strong>{f.ru}</strong> <span className="adm-muted">({f.key})</span></li>
          ))}
        </ul>
      </div>

      <ExportHistoryBlock adminFetch={adminFetch} reloadKey={reloadKey + historyKey} />

      <CustomExportModal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        adminFetch={adminFetch}
        act={act}
        onDone={() => setHistoryKey(k => k + 1)}
      />
    </div>
  );
}
