/**
 * Обновляет колонку «Реализовано» в spec-tracker-dashboard.tsv по сверке с кодом.
 * Запуск: node scripts/sync-dashboard-implementation-status.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TSV_PATH = path.join(__dirname, 'spec-tracker-dashboard.tsv');

/** @type {{ match: RegExp | string, status: string, noteAppend?: string }[]} */
const RULES = [
  // —— §11 Выгрузки ——
  { match: /Основной пресет — «Выгрузка по дню»/, status: 'Да', noteAppend: 'ExportsTab + GET /exports/day XLSX + README' },
  { match: /фильтр по типу точки\/вопроса/, status: 'Да', noteAppend: 'lesson_important|lesson_open + touchpointFilter' },
  { match: /НЕ делать каждую точку осмысления отдельной выгрузкой/, status: 'Да', noteAppend: 'единый фильтр type в дне' },
  { match: /На дашборде — автоматическая статистика/, status: 'Да', noteAppend: 'GET /exports/day/stats + карточка ExportsTab' },
  { match: /Каждая выгрузка должна давать понятный результат/, status: 'Да', noteAppend: 'пресеты XLSX/CSV/ZIP + README листы' },

  { match: /^База участников \(сквозная\)\tID, ФИО/, status: 'Да', noteAppend: 'GET /exports/participants full XLSX/CSV' },
  { match: /Общий Путь, общий Опыт, количество Идей/, status: 'Да', noteAppend: 'participantEnrichment' },
  { match: /Согласия \(ПД \+ аналитика\)/, status: 'Да', noteAppend: 'consent fields + README семантика' },
  { match: /Точка А \(3–5 ответов/, status: 'Да', noteAppend: 'point A/B JSON в participants export' },
  { match: /Ведущая роль на входе/, status: 'Да', noteAppend: 'roles в enrichment + roles-experiments' },
  { match: /Педагогический архетип/, status: 'Да', noteAppend: 'roleAnswers / D7 state' },
  { match: /Интересы \(мультивыбор\)/, status: 'Да', noteAppend: 'interests JSON' },

  { match: /Итоги дня — полная сводка/, status: 'Да', noteAppend: 'GET /exports/daily-summary' },
  { match: /Собирается автоматически из точки 7/, status: 'Да', noteAppend: 'eveningRatings + scales' },
  { match: /Роли и эксперименты — таблица по дням/, status: 'Да', noteAppend: 'GET /exports/roles-experiments' },
  { match: /Ответы рефлексии — сквозная/, status: 'Да', noteAppend: 'GET /exports/reflections' },
  { match: /Одна выгрузка на все текстовые ответы/, status: 'Да', noteAppend: 'reflections + exportCommon 11 полей' },
  { match: /Все ответы участника \(сквозная по участнику\)/, status: 'Да', noteAppend: 'participant answers + archive ZIP' },
  { match: /^Копилка\tID участника/, status: 'Да', noteAppend: '/exports/piggybank XLSX + агрегаты' },
  { match: /сводки по тегам и по источникам/, status: 'Да', noteAppend: 'листы По тегам / По источникам' },
  { match: /^Задания и заявки\tКаталог/, status: 'Да', noteAppend: 'GET /exports/tasks-catalog' },
  { match: /Заявки участников: ID участника/, status: 'Да', noteAppend: '/exports/task-submissions' },
  { match: /Таблица лидеров за день/, status: 'Да', noteAppend: '/exports/rating/day' },
  { match: /Общий рейтинг смены/, status: 'Да', noteAppend: '/exports/rating/shift' },
  { match: /Рейтинг по каждой номинации/, status: 'Да', noteAppend: '/exports/rating/nominations/:key' },
  { match: /Список медалей по участникам/, status: 'Да', noteAppend: '/exports/medals' },
  { match: /Журнал действий модераторов/, status: 'Да', noteAppend: '/exports/moderation-log' },
  { match: /Журнал ручных начислений/, status: 'Да', noteAppend: '/exports/points-manual' },
  { match: /^Общение\tID участника/, status: 'Да', noteAppend: '/exports/exchange' },
  { match: /^Активность\tВходы/, status: 'Да', noteAppend: '/exports/activity' },
  { match: /PDF финального профиля каждого/, status: 'Да', noteAppend: '/exports/final-profiles.zip' },
  { match: /Отсроченный замер/, status: 'Частично', noteAppend: 'GET /exports/delayed-measure-template — ручной импорт' },
  { match: /Сквозные поля во всех выгрузках \(11\)/, status: 'Да', noteAppend: 'exportCommon.buildAnswerRow' },

  // —— §12 Аналитика ——
  { match: /6-РОЛЕВАЯ МОДЕЛЬ/, status: 'Да', noteAppend: 'ROLE_MATRIX + AnalyticsShell banner' },
  { match: /Матрица 2×3/, status: 'Да', noteAppend: 'roleTaxonomy / meta' },
  { match: /Роли: Исследователь смыслов/, status: 'Да', noteAppend: 'ROLE_CATALOG' },
  { match: /Ежедневный выбор роли для эксперимента/, status: 'Да', noteAppend: 'participantDayState + portrait dashboard' },
  { match: /ведущая_роль_диагностика/, status: 'Да', noteAppend: 'pedagogicalRole + portrait' },
  { match: /Общий принцип для ВСЕХ дашбордов/, status: 'Да', noteAppend: '4 modes today/day/shift/compare' },
  { match: /Фильтры на каждом дашборде/, status: 'Да', noteAppend: 'direction/group/roleKey query' },
  { match: /Экспорт: PNG · CSV · XLSX/, status: 'Да', noteAppend: 'html-to-image + §11 presets' },
  { match: /Автообновление данных/, status: 'Да', noteAppend: 'ANALYTICS_REFRESH_MINUTES default 15' },
  { match: /ДИНАМИЧЕСКИЕ ГРАФИКИ/, status: 'Да', noteAppend: 'shift/compare line charts' },
  { match: /v1 \(обязательно к запуску/, status: 'Да', noteAppend: 'dashboards 1,2,3,5,6' },
  { match: /v2 \(ИИ-слой/, status: 'Частично', noteAppend: 'SEMANTIC_ANALYTICS_V2 flag' },
  { match: /1\. ДАШБОРД «ПУЛЬС ФОРУМА»/, status: 'Да', noteAppend: 'GET /analytics/dashboards/pulse' },
  { match: /НЕ показывать среднее значение/, status: 'Да', noteAppend: 'zone % only in UI' },
  { match: /2\. ДАШБОРД «ПОРТРЕТ УЧАСТНИКОВ/, status: 'Да', noteAppend: 'portrait dashboard + region' },
  { match: /разрез по регионам/, status: 'Да', noteAppend: 'participants.region migration' },
  { match: /3\. ДАШБОРД «ОБРАЗОВАТЕЛЬНАЯ ПРОГРАММА»/, status: 'Да', noteAppend: 'program dashboard' },
  { match: /Расхождения выбора и оценки/, status: 'Да', noteAppend: 'divergence block v1' },
  { match: /4\. ДАШБОРД «СМЫСЛОВАЯ АНАЛИТИКА»/, status: 'Частично', noteAppend: 'semantic dashboard v2 flag' },
  { match: /4a\. АНАЛИТИКА ДЛЯ КЛУБОВ/, status: 'Частично', noteAppend: 'forum_clubs + clubMatch + clubs tab' },
  { match: /5\. ДАШБОРД «АКТИВНОСТЬ/, status: 'Да', noteAppend: 'activity dashboard path/exp/total' },
  { match: /6\. ДАШБОРД «КОПИЛКА»/, status: 'Да', noteAppend: 'piggybank dashboard tag/source' },
  { match: /^club_matches —/, status: 'Частично', noteAppend: 'forum_clubs + nightly match' },

  // —— Админка · Дашборды и Выгрузки (§9–10 UI) ——
  { match: /Сайдбар с 10 дашбордами/, status: 'Да', noteAppend: 'InsightsChrome + dashboardCatalog meta' },
  { match: /Верхний фильтр: Дата · Направление · Группа/, status: 'Да', noteAppend: 'InsightsChrome toolbar' },
  { match: /Кнопки: \[Обновить\] \[Скачать PNG\] \[Скачать CSV\]/, status: 'Да', noteAppend: 'AnalyticsShell actions' },
  { match: /Индикатор доступности: «Доступен с Д1/, status: 'Да', noteAppend: 'availabilityTier badge + minForumDay' },
  { match: /^10\. Выгрузки · Основной экран\tЗаголовок: «Выгрузки»/, status: 'Да', noteAppend: 'ExportsTab hero' },
  { match: /Пресеты: «По дню»/, status: 'Да', noteAppend: 'ExportsTab preset table 8 rows' },
  { match: /Кнопка «Кастомная выгрузка» — конструктор/, status: 'Да', noteAppend: 'CustomExportModal + POST /exports/custom' },
  { match: /^10\. Выгрузки · Основной экран\tИстория выгрузок/, status: 'Да', noteAppend: 'export_history + ExportHistoryBlock' },
  { match: /^\tИстория выгрузок\t/, status: 'Да', noteAppend: 'export_history + ExportHistoryBlock' },
  { match: /10\. Выгрузки · Сквозные поля/, status: 'Да', noteAppend: 'cross-fields card + exportCommon' },

  // —— §13 Базы данных ——
  { match: /^participants: ID, vk_id/, status: 'Да', noteAppend: 'schema participants' },
  { match: /^participants: ведущая_роль/, status: 'Частично', noteAppend: 'roles fields partial' },
  { match: /^participants_check:/, status: 'Нет', noteAppend: 'answers, не отдельная таблица' },
  { match: /^role_experiments:/, status: 'Нет', noteAppend: 'participantDayState вместо role_experiments' },
  { match: /^role_experiments_catalog:/, status: 'Да', noteAppend: 'day_experiments' },
  { match: /^osmysleniya_points:/, status: 'Нет', noteAppend: 'touchpoints in code, не таблица' },
  { match: /^states: ID/, status: 'Нет', noteAppend: 'checkin в answers' },
  { match: /^reflections: ID/, status: 'Нет', noteAppend: 'answers table' },
  { match: /^ratings: ID/, status: 'Нет', noteAppend: 'evening в answers' },
  { match: /^piggybank: ID/, status: 'Да', noteAppend: 'schema piggybank' },
  { match: /^events: ID/, status: 'Да', noteAppend: 'schema events' },
  { match: /^event_attendance:/, status: 'Да', noteAppend: 'event_attendance' },
  { match: /^materials: ID/, status: 'Да', noteAppend: 'schema materials' },
  { match: /^knowledge_unlock:/, status: 'Частично', noteAppend: 'kb_day_unlocks' },
  { match: /^tasks: ID/, status: 'Да', noteAppend: 'schema tasks' },
  { match: /^task_submissions:/, status: 'Да', noteAppend: 'schema task_submissions' },
  { match: /^medals: ID/, status: 'Да', noteAppend: 'schema medals' },
  { match: /^user_medals:/, status: 'Да', noteAppend: 'user_medals' },
  { match: /^exchange_questions:/, status: 'Да', noteAppend: 'exchange_questions' },
  { match: /^points_log:/, status: 'Да', noteAppend: 'points_log' },
  { match: /^levels_config:/, status: 'Да', noteAppend: 'levels_config' },
  { match: /^push_log:/, status: 'Да', noteAppend: 'push_log' },
  { match: /^daily_stats:/, status: 'Да', noteAppend: 'daily_stats' },
  { match: /^daily_summary:/, status: 'Нет' },
  { match: /^admin_actions_log —/, status: 'Да', noteAppend: 'admin_actions_log + JournalTab' },
  { match: /^questions: id · текст_текущий/, status: 'Частично', noteAppend: 'fork versions, не question_versions table' },
  { match: /вопрос_текст_snapshot/, status: 'Частично', noteAppend: 'answers.questionTextSnapshot' },
  { match: /История версий вопроса/, status: 'Частично', noteAppend: 'QuestionForm versions tab' },
  { match: /^club_matches —/, status: 'Частично', noteAppend: 'forum_clubs + nightly match' },

  // —— §13 Базы данных (краткий чеклист) ——
  { match: /^participants — участники$/, status: 'Да' },
  { match: /^groups —/, status: 'Да', noteAppend: 'participant_groups' },
  { match: /^directions —/, status: 'Да' },
  { match: /^answers —/, status: 'Да' },
  { match: /^questions —/, status: 'Да' },
  { match: /^tags —/, status: 'Частично', noteAppend: 'thematic_tags + interests' },
];

function matches(line, rule) {
  const taskPart = line.split('\t')[1] ?? '';
  const full = line;
  if (rule.match instanceof RegExp) {
    return rule.match.test(taskPart) || rule.match.test(full);
  }
  return taskPart.includes(rule.match) || full.includes(rule.match);
}

export function syncDashboardImplementationStatus(tsvPath = TSV_PATH) {
  if (!fs.existsSync(tsvPath)) {
    console.warn('spec-tracker-dashboard.tsv not found, skip sync');
    return { updated: 0, unmatched: 0, counts: {} };
  }

  const raw = fs.readFileSync(tsvPath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/);
  let updated = 0;
  let unmatched = 0;
  let currentSection = 0;

  const out = lines.map((line, i) => {
  if (i === 0 || !line.trim()) return line;
  const parts = line.split('\t');
  if (parts.length < 3) return line;
  const col0 = (parts[0] ?? '').trim();
  if (/^11\. Выгрузки/.test(col0)) currentSection = 11;
  else if (/^12\. Аналитика/.test(col0)) currentSection = 12;
  else if (/^13\. Базы/.test(col0)) currentSection = 13;
  else if (/^9\. Дашборды|^10\. Выгрузки|Админка · экран/.test(col0)) currentSection = 910;

  const task = (parts[1] ?? '').trim();
  if (!task) return line;
  if (currentSection === 12) return line;

  let rule = null;
    for (const r of RULES) {
      if (matches(line, r)) {
        rule = r;
        break;
      }
    }
    if (!rule) {
      unmatched++;
      return line;
    }

    const prev = parts[2]?.trim();
    if (prev === rule.status && !rule.noteAppend) return line;

    parts[2] = rule.status;
    if (rule.noteAppend) {
      const note = (parts[3] ?? '').trim();
      const tag = `[код: ${rule.noteAppend}]`;
      if (!note.includes(rule.noteAppend)) {
        parts[3] = note ? `${note} · ${tag}` : tag;
      }
    }
    updated++;
    return parts.join('\t');
  });

  fs.writeFileSync(tsvPath, out.join('\n') + '\n', 'utf8');

  const counts = { Да: 0, Нет: 0, Частично: 0, other: 0 };
  for (const line of out.slice(1)) {
    const parts = line.split('\t');
    if (!(parts[1] ?? '').trim()) continue;
    const s = (parts[2] ?? '').trim();
    if (counts[s] !== undefined) counts[s]++;
    else counts.other++;
  }

  console.log(`Dashboard TSV: updated ${updated} rows, ${unmatched} without rule.`);
  console.log('Статусы §11–13/16:', counts);
  return { updated, unmatched, counts };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  syncDashboardImplementationStatus();
}
