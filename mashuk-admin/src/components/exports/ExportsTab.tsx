import { useCallback, useEffect, useState } from 'react';
import { adminDownloadBinary, downloadCsv } from '../../admin/client';
import { AdminPageHero } from '../admin/AdminPageHero';
import { label } from '../../labels/ru';
import type { AdminTabProps } from '../admin/types';
import { useInsights } from '../insights/InsightsContext';
import { CustomExportModal, ExportHistoryBlock } from './CustomExportModal';

const EXPORT_DAYS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
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

  const filterQs = buildQuery({
    direction: direction || undefined,
    group: group || undefined,
  });

  const downloadXlsx = (path: string, filename: string) =>
    act(() => adminDownloadBinary(path, filename), 'Файл скачан');

  const logPreset = (preset: string, source: string, params?: Record<string, unknown>) => {
    adminFetch('/exports/history/preset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset, title: preset, source, params }),
    }).then(() => setHistoryKey(k => k + 1)).catch(() => undefined);
  };

  const presetDay = () => {
    const path = `/exports/day?day=${forumDay}&type=${exportType}`;
    downloadXlsx(path, `day_${forumDay}_${exportType}.xlsx`);
    logPreset('По дню', 'answers', { day: Number(forumDay), type: exportType, direction, group });
  };

  return (
    <div className="adm-forum">
      <AdminPageHero title="Выгрузки" hint="Пресеты XLSX · кастомный конструктор · история с повторным скачиванием" />

      <div className="card adm-forum-block">
        <h3>Рейтинг (игропатики)</h3>
        <p className="adm-forum-hint">Быстрые выгрузки лидеров, заявок и журнала модерации.</p>
        <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="adm-btn adm-btn-primary" onClick={() => {
            downloadXlsx(`/exports/rating/day?day=${forumDay}`, `rating_day_${forumDay}.xlsx`);
            logPreset('Рейтинг за день', 'rating_day', { day: Number(forumDay) });
          }}>
            Рейтинг за день D{forumDay}
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => {
            downloadCsv('/exports/rating/shift', 'leaderboard_shift.csv');
            logPreset('Рейтинг смены', 'rating_shift', {});
          }}>
            Рейтинг смены (CSV)
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadXlsx('/exports/task-submissions', 'task_submissions.xlsx')}>
            Заявки на задания
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadXlsx('/exports/medals', 'medals.xlsx')}>
            Медали
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadCsv('/exports/points-log', 'points_log.csv')}>
            Журнал баллов
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadCsv('/exports/moderation-log', 'moderation_log.csv')}>
            Журнал модерации
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

      <div className="card adm-forum-block">
        <div className="adm-forum-toolbar" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Пресеты</h3>
          <button type="button" className="adm-btn adm-btn-primary" onClick={() => setCustomOpen(true)}>
            Кастомная выгрузка
          </button>
        </div>
        <table className="adm-table adm-preset-table">
          <thead>
            <tr><th>Пресет</th><th>Параметры</th><th /></tr>
          </thead>
          <tbody>
            <tr>
              <td>По дню</td>
              <td>
                <span className="adm-muted">D{forumDay} (фильтр «Дата»)</span>
                <select className="adm-input" value={exportType} onChange={e => setExportType(e.target.value)}>
                  {EXPORT_TYPES.map(t => (
                    <option key={t} value={t}>{label(EXPORT_TYPE_LABEL_KEY[t] || t)}</option>
                  ))}
                </select>
              </td>
              <td><button type="button" className="adm-btn adm-btn-primary" onClick={presetDay}>Скачать XLSX</button></td>
            </tr>
            <tr>
              <td>По участнику</td>
              <td>
                <input className="adm-input" placeholder="ID участника" value={participantId} onChange={e => setParticipantId(e.target.value)} />
              </td>
              <td>
                <button
                  type="button"
                  className="adm-btn adm-btn-primary"
                  disabled={!participantId.trim()}
                  onClick={() => {
                    downloadXlsx(`/exports/participant/${participantId.trim()}/answers?format=xlsx`, `participant_${participantId}.xlsx`);
                    logPreset('По участнику', 'answers', { participantId: Number(participantId) });
                  }}
                >
                  Скачать XLSX
                </button>
              </td>
            </tr>
            <tr>
              <td>По направлению</td>
              <td><span className="adm-muted">{direction || 'Выберите направление вверху'}</span></td>
              <td>
                <button
                  type="button"
                  className="adm-btn adm-btn-primary"
                  disabled={!direction}
                  onClick={() => {
                    downloadXlsx(`/exports/daily-summary${buildQuery({ direction })}`, 'by_direction.xlsx');
                    logPreset('По направлению', 'answers', { direction });
                  }}
                >
                  Скачать XLSX
                </button>
              </td>
            </tr>
            <tr>
              <td>По группе</td>
              <td><span className="adm-muted">{group || 'Выберите группу вверху'}</span></td>
              <td>
                <button
                  type="button"
                  className="adm-btn adm-btn-primary"
                  disabled={!group}
                  onClick={() => {
                    downloadXlsx(`/exports/daily-summary${buildQuery({ group })}`, 'by_group.xlsx');
                    logPreset('По группе', 'answers', { group });
                  }}
                >
                  Скачать XLSX
                </button>
              </td>
            </tr>
            <tr>
              <td>По типу вопроса</td>
              <td>
                <select className="adm-input" value={exportType} onChange={e => setExportType(e.target.value)}>
                  {EXPORT_TYPES.map(t => (
                    <option key={t} value={t}>{label(EXPORT_TYPE_LABEL_KEY[t] || t)}</option>
                  ))}
                </select>
              </td>
              <td>
                <button
                  type="button"
                  className="adm-btn adm-btn-primary"
                  onClick={() => {
                    downloadXlsx(`/exports/day?day=${forumDay}&type=${exportType}`, `day_type_${exportType}.xlsx`);
                    logPreset('По типу вопроса', 'answers', { day: Number(forumDay), type: exportType });
                  }}
                >
                  Скачать XLSX
                </button>
              </td>
            </tr>
            <tr>
              <td>По заданиям</td>
              <td><span className="adm-muted">Все заявки</span></td>
              <td>
                <button
                  type="button"
                  className="adm-btn adm-btn-primary"
                  onClick={() =>
                    act(async () => {
                      const row = (await adminFetch('/exports/history/preset', {
                        method: 'POST',
                        body: JSON.stringify({ preset: 'По заданиям', title: 'По заданиям', source: 'tasks', params: { direction, group } }),
                      })) as { id: string; fileName?: string };
                      await adminDownloadBinary(`/exports/history/${row.id}/download`, row.fileName || 'tasks.xlsx');
                      setHistoryKey(k => k + 1);
                    }, 'Файл скачан')
                  }
                >
                  Скачать XLSX
                </button>
              </td>
            </tr>
            <tr>
              <td>По рейтингу</td>
              <td>D{forumDay}</td>
              <td>
                <button
                  type="button"
                  className="adm-btn adm-btn-primary"
                  onClick={() =>
                    act(async () => {
                      const row = (await adminFetch('/exports/history/preset', {
                        method: 'POST',
                        body: JSON.stringify({
                          preset: 'По рейтингу',
                          title: `Рейтинг D${forumDay}`,
                          source: 'rating_day',
                          params: { day: Number(forumDay), direction, group },
                        }),
                      })) as { id: string; fileName?: string };
                      await adminDownloadBinary(`/exports/history/${row.id}/download`, row.fileName || 'rating.xlsx');
                      setHistoryKey(k => k + 1);
                    }, 'Файл скачан')
                  }
                >
                  Скачать XLSX
                </button>
              </td>
            </tr>
            <tr>
              <td>По копилке</td>
              <td><span className="adm-muted">Полная выгрузка</span></td>
              <td>
                <button
                  type="button"
                  className="adm-btn adm-btn-primary"
                  onClick={() => {
                    downloadXlsx('/exports/piggybank?format=xlsx', 'piggybank.xlsx');
                    logPreset('По копилке', 'piggybank', { direction, group });
                  }}
                >
                  Скачать XLSX
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ExportHistoryBlock adminFetch={adminFetch} reloadKey={reloadKey + historyKey} />

      <CustomExportModal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        adminFetch={adminFetch}
        act={act}
        onDone={() => setHistoryKey(k => k + 1)}
      />

      <details className="card adm-forum-block">
        <summary><strong>Дополнительные выгрузки (§11)</strong></summary>
        <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', marginTop: 12, gap: 8 }}>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadXlsx(`/exports/participants?format=xlsx${filterQs.replace('?', '&')}`, 'participants_full.xlsx')}>
            База участников
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadXlsx('/exports/roles-experiments?format=xlsx', 'roles_experiments.xlsx')}>
            Роли и эксперименты
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadXlsx('/exports/reflections?format=xlsx', 'reflections.xlsx')}>
            Рефлексия смены
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadXlsx('/exports/tasks-catalog', 'tasks_catalog.xlsx')}>
            Каталог заданий
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadCsv('/exports/rating/shift', 'leaderboard_shift.csv')}>
            Рейтинг смены
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
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadXlsx(`/exports/participants-archive?textOnly=${textOnly ? '1' : '0'}`, 'participants_answers.zip')}>
            ZIP участников
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadCsv('/exports/medals', 'medals.csv')}>Медали</button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => downloadXlsx('/exports/final-profiles.zip', 'final_profiles.zip')}>ZIP PDF</button>
        </div>
      </details>
    </div>
  );
}
