import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { syncAdminImplementationStatus } from './sync-admin-implementation-status.mjs';
import { syncDashboardImplementationStatus } from './sync-dashboard-implementation-status.mjs';

function R(
  sectionId,
  sectionTitle,
  pointCount,
  subsection,
  task,
  statusUser,
  statusAudit,
  note = '',
  llmDeferred = false,
  auditNote = '',
) {
  return {
    sectionId,
    sectionTitle,
    pointCount,
    subsection,
    task,
    statusUser,
    statusAudit,
    note,
    llmDeferred,
    auditNote,
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function repairUtf8FromFile(buffer) {
  return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

function loadSpecTableTsv() {
  const parts = ['spec-tracker-source.tsv', 'spec-tracker-admin.tsv'];
  return parts
    .map((name) => {
      const p = path.join(__dirname, name);
      if (!fs.existsSync(p)) return '';
      return repairUtf8FromFile(fs.readFileSync(p));
    })
    .filter(Boolean)
    .join('\n');
}

function loadDashboardTsv() {
  const p = path.join(__dirname, 'spec-tracker-dashboard.tsv');
  if (!fs.existsSync(p)) return '';
  return repairUtf8FromFile(fs.readFileSync(p));
}

const adminTsvPath = path.join(__dirname, 'spec-tracker-admin.tsv');
if (fs.existsSync(adminTsvPath)) {
  syncAdminImplementationStatus(adminTsvPath);
}

const dashboardTsvPath = path.join(__dirname, 'spec-tracker-dashboard.tsv');
if (fs.existsSync(dashboardTsvPath)) {
  syncDashboardImplementationStatus(dashboardTsvPath);
}

const SPEC_TABLE_TSV = loadSpecTableTsv();

function normalizeStatus(s) {
  const t = s.trim();
  if (/^да$/i.test(t) || t === 'Да') return 'Да';
  if (/^нет$/i.test(t)) return 'Нет';
  if (t.includes('Частично')) return 'Частично';
  if (t.includes('обсудить')) return 'Надо обсудить';
  if (t.includes('Проверить') || t.includes('позже')) return 'Проверить позже';
  return t;
}

function parseSectionHeader(text) {
  const m = text.match(/^(\d+)\.\s+(.+?)\s+[·.]?\s*(\d+)\s+пункт/i);
  if (m) {
    return {
      sectionId: Number(m[1]),
      sectionTitle: m[2].trim(),
      pointCount: Number(m[3]),
    };
  }
  const m2 = text.match(/^(\d+)\.\s+(.+?)\s+[·.]?\s*(\d+)/);
  if (m2 && /пункт/i.test(text)) {
    return {
      sectionId: Number(m2[1]),
      sectionTitle: m2[2].trim(),
      pointCount: Number(m2[3]),
    };
  }
  return null;
}

function parseUserTable(tsv) {
  const rows = [];
  let sectionId = 0;
  let sectionTitle = '';
  let pointCount = 0;
  let subsection = '';

  for (const line of tsv.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const col0 = (parts[0] ?? '').trim();
    const task = (parts[1] ?? '').trim();
    const statusUser = normalizeStatus(parts[2] ?? '');
    const note = parts.slice(3).join('\t').trim();

    if (col0 === 'Подраздел' && task.includes('Задача')) continue;

    const header = parseSectionHeader(col0) ?? (task ? parseSectionHeader(task) : null);
    const isHeaderRow =
      header &&
      (!statusUser ||
        /^(\d+)\.\s/.test(col0) ||
        (col0.startsWith(`${header.sectionId}.`) && !task));
    if (isHeaderRow) {
      sectionId = header.sectionId;
      sectionTitle = header.sectionTitle;
      pointCount = header.pointCount;
      continue;
    }

    if (col0) subsection = col0;
    if (!task) continue;

    rows.push({ sectionId, sectionTitle, pointCount, subsection, task, statusUser, note });
  }
  return rows;
}

function deriveAudit(row) {
  const { sectionId, subsection, task, statusUser, note } = row;
  const blob = `${subsection} ${task} ${note}`;
  let llmDeferred = false;
  let auditNote = '';

  if (sectionId === 7) {
    const s7 = auditOverride(row);
    if (s7) {
      return {
        statusAudit: s7.statusAudit,
        llmDeferred: s7.llmDeferred ?? false,
        auditNote: s7.auditNote ?? '',
      };
    }
  }

  if (
    /llm|gigachat|автоген|рекомендация ии/i.test(blob) ||
    (sectionId === 9 && task.includes('бонус за содержательность'))
  ) {
    llmDeferred = true;
    auditNote = 'v2 / LLM, не блокер';
    return { statusAudit: 'Потом (v2)', llmDeferred, auditNote };
  }

  const productStatuses = new Set(['Надо обсудить', 'Проверить позже']);
  if (productStatuses.has(statusUser) && sectionId <= 2) {
    return { statusAudit: statusUser, llmDeferred, auditNote };
  }

  const overrides = auditOverride(row);
  if (overrides) {
    return {
      statusAudit: overrides.statusAudit,
      llmDeferred: overrides.llmDeferred ?? llmDeferred,
      auditNote: overrides.auditNote ?? auditNote,
    };
  }

  return { statusAudit: defaultAudit(sectionId, statusUser), llmDeferred, auditNote };
}

function defaultAudit(sectionId, statusUser) {
  if (sectionId === 1) {
    if (statusUser === 'Да') return 'Да';
    if (statusUser === 'Проверить позже') return 'Проверить позже';
    return statusUser;
  }
  if (statusUser === 'Надо обсудить' || statusUser === 'Проверить позже') return statusUser;
  return '—';
}

function auditOverride(row) {
  const { sectionId, subsection, task, statusUser, note = '' } = row;
  const t = task;

  if (sectionId === 1) {
    if (t.includes('Группа присваивается')) {
      return { statusAudit: 'Частично', auditNote: 'режимы группы — уточнить' };
    }
    if (t.includes('веса ответов')) {
      return { statusAudit: 'Частично', auditNote: 'админка ролей' };
    }
    if (statusUser === 'Да') return { statusAudit: 'Да', auditNote: '' };
  }

  if (sectionId === 2) {
    if (t.includes('Логика подбора карточки')) {
      return { statusAudit: 'Да', auditNote: 'homeActiveCard + activeCard API' };
    }
    if (t.includes('Нужно сейчас')) return { statusAudit: 'Да', auditNote: '' };
    if (t.includes('СЕЙЧАС')) return { statusAudit: 'Да', auditNote: '' };
    if (t.includes('СКОРО')) return { statusAudit: 'Частично', auditNote: 'fb41edc/e72d92a' };
    if (t.includes('Завершение дня')) return { statusAudit: 'Частично', auditNote: '' };
    if (
      t.includes('Точки осмысления · N из 7') ||
      t.includes('Семь кружков') ||
      t.includes('нажатии на кружок')
    ) {
      return { statusAudit: 'Да', auditNote: '' };
    }
    if (
      t.includes('Счётчик «Путь»') ||
      t.includes('Счётчик «Опыт»') ||
      t.includes('Общий рейтинг') ||
      t.includes('Счётчик «Идей»')
    ) {
      return { statusAudit: 'Да', auditNote: '' };
    }
    if (
      t.includes('быстрого ввода') ||
      t.includes('Теги (6') ||
      (t.includes('Источник:') && !t.includes('спрашивается ПОСЛЕ')) ||
      t.includes('Источник спрашивается') ||
      t.includes('сохраняется в копилку')
    ) {
      return { statusAudit: 'Да', auditNote: 'c41a43d quick capture' };
    }
    if (t.includes('Быстрые кнопки') && t.includes('дневной фазе')) {
      return { statusAudit: 'Да', auditNote: '' };
    }
    if (t.includes('тег ставится автоматически')) return { statusAudit: 'Да', auditNote: '' };
    if (t.includes('Раздел «Копилка» доступен')) {
      return { statusAudit: 'Да', auditNote: 'Tabbar +, Profile, quick capture' };
    }
    if (t.includes('карточка «Роль дня»') || t.includes('Каталог экспериментов')) {
      return { statusAudit: 'Частично', auditNote: '' };
    }
    if (t.includes('role_experiments')) return { statusAudit: 'Частично', auditNote: '' };
    if (t.includes('пропущенные точки')) return { statusAudit: 'Да', auditNote: 'missedToday + MissedTouchpointsCard' };
    if (t.includes('замораживаются (locked)')) {
      return { statusAudit: 'Частично', auditNote: 'dayState locked' };
    }
    if (statusUser === 'Да') return { statusAudit: 'Да', auditNote: '' };
  }

  if (sectionId === 3) {
    if (t.includes('несколько привязок одновременно')) {
      return { statusAudit: 'Да', auditNote: 'event+day+direction+tags OR-query' };
    }
    if (t.includes('К направлению')) {
      return { statusAudit: 'Да', auditNote: 'direction filter' };
    }
    if (t.includes('К теме / тегу')) {
      return { statusAudit: 'Да', auditNote: 'tags + interests overlap' };
    }
    if (t.includes('два независимых раздела')) {
      return { statusAudit: 'Да', auditNote: 'табы Программа / База знаний' };
    }
    if (t.includes('автоматически открывать текущий день')) {
      return { statusAudit: 'Да', auditNote: 'ProgramPanel activeDay=currentDay' };
    }
    if (t.includes('параллельных событий')) {
      return { statusAudit: 'Да', auditNote: 'parallel slots + horizontal scroll' };
    }
    if (t.includes('день прошёл и порог не достигнут')) {
      return { statusAudit: 'Да', auditNote: 'kb_past_days_policy + kb_day_unlocks' };
    }
    if (t.includes('Бейдж «Новый»')) {
      return { statusAudit: 'Да', auditNote: 'created_at 24h + isNew' };
    }
    if (t.includes('Триггер push настраивается')) {
      return { statusAudit: 'Да', auditNote: 'block_type, is_key_block, push_block_types' };
    }
    if (t.includes('Минимальный порог совпадений')) {
      return { statusAudit: 'Частично', auditNote: 'recommendationThreshold в settings' };
    }
    if (subsection.includes('Персональные рекомендации')) {
      if (t.includes('«Рекомендуем тебе»')) {
        return { statusAudit: 'Да', auditNote: 'UI + click → modal' };
      }
      if (t.includes('совпадению тегов')) {
        return { statusAudit: 'Да', auditNote: 'score по interests' };
      }
      if (t.includes('короткой формулировкой')) {
        return { statusAudit: 'Да', auditNote: 'recommendationSubtitle' };
      }
      if (t.includes('ранжировать')) {
        return { statusAudit: 'Да', auditNote: 'score + startTime' };
      }
      return { statusAudit: 'Частично', auditNote: '' };
    }
    if (subsection.includes('Тематические')) {
      return { statusAudit: 'Да', auditNote: 'tags на events + picker в админке' };
    }
    if (
      subsection.includes('Виды привязок') ||
      subsection.includes('Разделение') ||
      subsection.includes('Вкладки')
    ) {
      if (statusUser === 'Да') return { statusAudit: 'Да', auditNote: '' };
    }
    if (t.includes('Вкладки по дням') || t.includes('хронологическом порядке')) {
      return { statusAudit: 'Да', auditNote: '' };
    }
    if (t.includes('Тег «Сейчас»') || t.includes('Статусы блоков')) {
      return { statusAudit: 'Да', auditNote: 'TimelineEvent past/now/future MSK' };
    }
    if (t.includes('время начала и окончания')) {
      return { statusAudit: 'Да', auditNote: 'subtitle place + description' };
    }
    if (
      subsection.includes('Будущие дни') ||
      t.includes('Черновик расписания') ||
      t.includes('Опубликовать день') ||
      t.includes('История версий') ||
      t.includes('Расписание появится')
    ) {
      return { statusAudit: 'Да', auditNote: 'scheduleDays + publish + versions' };
    }
    if (subsection.startsWith('База знаний — структура') || subsection.startsWith('База знаний — условный доступ')) {
      return { statusAudit: 'Да', auditNote: 'KB API + Program tab UI' };
    }
    if (subsection.startsWith('База знаний — материалы')) {
      return { statusAudit: 'Да', auditNote: '' };
    }
    if (subsection === 'Push' || t.includes('Push за 10')) {
      return { statusAudit: 'Да', auditNote: 'pushScheduler + pushReminder + opt-out' };
    }
    if (subsection.includes('Порог базы') || t.includes('Порог МОЖЕТ БЫТЬ ОТКЛЮЧЁН')) {
      return { statusAudit: 'Да', auditNote: 'kbUnlockThreshold/Disabled admin' };
    }
    if (statusUser === 'Да') return { statusAudit: 'Да', auditNote: '' };
    if (statusUser === 'Нет') return { statusAudit: 'Нет', auditNote: '' };
  }

  if (sectionId === 4) {
    if (t.includes('Заголовок «Задания»')) {
      return { statusAudit: 'Да', auditNote: 'баннер experienceTotal + pointsToday' };
    }
    if (t.includes('поиск по ФИО')) {
      return { statusAudit: 'Да', auditNote: 'GET /participants/teammates-search' };
    }
    if (t.includes('push с запросом подтверждения')) {
      return { statusAudit: 'Да', auditNote: 'team confirm push + deep link' };
    }
    if (t.includes('После подтверждения всеми членами')) {
      return { statusAudit: 'Да', auditNote: 'tryFinalizeTeamSubmission + awardPoints' };
    }
    if (t.includes('не подтвердил в течение N часов')) {
      return { statusAudit: 'Да', auditNote: 'expireStaleTeamSubmissions scheduler' };
    }
    if (t.includes('не должны повторяться') || t.includes('отслеживает дубли')) {
      return { statusAudit: 'Да', auditNote: 'postUrlNormalized + assertPostUrlUnique' };
    }
    if (t.includes('аннулировать подозрительные')) {
      return { statusAudit: 'Да', auditNote: 'POST revoke + ParticipantCard' };
    }
    if (subsection.includes('Античит')) {
      return { statusAudit: 'Да', auditNote: 'taskEligibility + QR window + daily limits' };
    }
    if (t.includes('push участнику')) return { statusAudit: 'Да', auditNote: 'moderateTask push' };
    if (t.includes('распечатать пакет')) return { statusAudit: 'Да', auditNote: 'GET /admin/qr/pack' };
    if (t.includes('Прогресс дня (%)') && t.includes('Базой знаний')) {
      return { statusAudit: 'Да', auditNote: '29d722b progress + KB hint' };
    }
    if (t.includes('«N из M выполнено»')) {
      return { statusAudit: 'Да', auditNote: '29d722b' };
    }
    if (
      subsection.includes('Отображение') ||
      subsection.includes('Выполнение') ||
      subsection.includes('Способы') ||
      subsection.includes('QR') ||
      subsection.includes('Workflow')
    ) {
      return { statusAudit: 'Да', auditNote: '29d722b tasks UI/API' };
    }
    if (subsection.includes('Командные')) return { statusAudit: 'Да', auditNote: 'team flow + admin confirmations' };
    if (subsection.includes('Категории')) return { statusAudit: 'Да', auditNote: '' };
    return { statusAudit: 'Частично', auditNote: '' };
  }

  if (sectionId === 5) {
    if (t.includes('5 зон')) return { statusAudit: 'Да', auditNote: 'emotionZones + daily_stats + dashboards' };
    if (t.includes('Блок-конструктор')) {
      return { statusAudit: 'Да', auditNote: 'evening_questionnaire_by_day + admin CRUD' };
    }
    if (t.includes('отложить и вернуться')) {
      return { statusAudit: 'Да', auditNote: 'evening_draft PATCH + EveningQuestionnaire' };
    }
    if (t.includes('Портрет заезда')) return { statusAudit: 'Да', auditNote: 'GET /analytics/departure-portrait' };
    if (t.includes('Окно 22:00') && t.includes('главная содержательная')) {
      return { statusAudit: 'Да', auditNote: 'isEveningQuestionnaireOpen + opensAt UI' };
    }
    if (t.includes('Открытие по push в 22:00')) {
      return { statusAudit: 'Да', auditNote: 'slot_2200 + #?evening=1' };
    }
    if (t.includes('Метаданные, подтягиваемые в выгрузку')) {
      return { statusAudit: 'Да', auditNote: 'group_name CSV + лист Итоговая анкета XLSX' };
    }
    if (t.includes('Все вопросы пропускаемые')) {
      return { statusAudit: 'Да', auditNote: 'optional fields + Point B goals' };
    }
    if (t.includes('В Д8 утром')) {
      return { statusAudit: 'Да', auditNote: 'D8 priority point B' };
    }
    if (subsection.includes('Осмысление уроков')) {
      return { statusAudit: 'Да', auditNote: 'lessonSlotEvents filter by schedule window' };
    }
    if (
      subsection.includes('Итоговая анкета') ||
      subsection.includes('9 шкал') ||
      subsection.includes('Условные') ||
      subsection.includes('Содержательные') ||
      subsection.includes('эксперимент')
    ) {
      return { statusAudit: 'Да', auditNote: 'dynamic evening config + day-state/evening' };
    }
    if (subsection.includes('Точка Б')) return { statusAudit: 'Да', auditNote: 'Point B + D7 CTA + portrait API' };
    return { statusAudit: 'Да', auditNote: '' };
  }

  if (sectionId === 6) {
    if (subsection.includes('Логика раздела') || t.includes('ТРИ ТАБА')) {
      return { statusAudit: 'Да', auditNote: 'Questions panel tabs' };
    }
    if (t.includes('АДМИНКЕ') || t.includes('три спокойных вкладки')) {
      return { statusAudit: 'Да', auditNote: '' };
    }
    if (t.includes('Вопросы от бота') && t.includes('копи Путь')) {
      return { statusAudit: 'Да', auditNote: 's6 banner + cards' };
    }
    if (t.includes('Не отвечено')) {
      return { statusAudit: 'Да', auditNote: 'reflectionLabel + timeWindow + Path points' };
    }
    if (t.includes('Отвечено сегодня')) {
      return { statusAudit: 'Да', auditNote: 'answeredToday MSK' };
    }
    if (t.includes('Настройка типов и окон')) {
      return { statusAudit: 'Да', auditNote: 'admin reflectionKind + publish/close' };
    }
    if (subsection.includes('Таб 1') || subsection.includes('Рефлексия')) {
      return { statusAudit: 'Да', auditNote: '' };
    }
    if (subsection.includes('Таб 2') || subsection.includes('Обмен')) {
      return { statusAudit: 'Да', auditNote: '' };
    }
    if (t.includes('Прямая линия к дирекции')) {
      return { statusAudit: 'Да', auditNote: '' };
    }
    if (t.includes('Твои переписки')) {
      return { statusAudit: 'Да', auditNote: 'preview + status labels' };
    }
    if (t.includes('мессенджера')) {
      return { statusAudit: 'Да', auditNote: 'OrgThreadMessenger modal' };
    }
    if (t.includes('Написать в дирекцию')) {
      return { statusAudit: 'Да', auditNote: 'bottom CTA + compose modal' };
    }
    if (t.includes('Обмен с организаторами')) {
      return { statusAudit: 'Да', auditNote: 'admin questions tab subsection' };
    }
    if (subsection.includes('Таб 3') || subsection.includes('Организаторам')) {
      return { statusAudit: 'Да', auditNote: '' };
    }
    if (subsection.includes('Реакции')) return { statusAudit: 'Да', auditNote: 'react + nested replies' };
    if (subsection.includes('Баллы')) {
      if (t.includes('обмене опытом') && t.includes('модерации')) {
        return { statusAudit: 'Да', auditNote: 'exchange_question → Experience' };
      }
      if (t.includes('ответ другому участнику')) {
        return { statusAudit: 'Да', auditNote: 'exchange_answer → Experience' };
      }
      if (t.includes('рефлексивный вопрос')) {
        return { statusAudit: 'Да', auditNote: 'question_answer default 5 Path' };
      }
      if (t.includes('итогов дня')) {
        return { statusAudit: 'Да', auditNote: 'evening_complete +15 Path' };
      }
      if (t.includes('точки А')) {
        return { statusAudit: 'Да', auditNote: 'point_a_complete +20 Path' };
      }
      if (t.includes('точки Б')) {
        return { statusAudit: 'Да', auditNote: 'point_b_complete +30 Path' };
      }
      return { statusAudit: 'Да', auditNote: '' };
    }
    if (subsection.includes('Сообщения после')) {
      if (t.includes('подтверждение')) {
        return { statusAudit: 'Да', auditNote: 'AnswerSuccessOverlay' };
      }
      if (t.includes('Ответ отправлен')) {
        return { statusAudit: 'Да', auditNote: 'card + Дальше →' };
      }
      if (t.includes('медаль')) {
        return { statusAudit: 'Да', auditNote: 'newMedals in overlay' };
      }
      if (t.includes('админке')) {
        return { statusAudit: 'Да', auditNote: 'forum_settings.answer_confirmation' };
      }
      return { statusAudit: 'Да', auditNote: '' };
    }
    return { statusAudit: 'Частично', auditNote: '' };
  }

  if (sectionId === 7) {
    if (subsection.includes('Карточка участника')) {
      if (t.includes('смена') || t.includes('Смена')) {
        return { statusAudit: 'Да', auditNote: 'shiftLabel + direction · group в Profile' };
      }
      return { statusAudit: 'Да', auditNote: '' };
    }
    if (subsection.includes('Прогресс А') || t.includes('Формула настраивается')) {
      return { statusAudit: 'Да', auditNote: 'profileProgress + forum_settings weights' };
    }
    if (subsection.includes('Четыре метрики')) {
      return { statusAudit: 'Да', auditNote: 'metrics в GET /profile + Profile UI' };
    }
    if (subsection.includes('Мой запрос')) {
      if (t.includes('дословно') && t.includes('точк')) {
        return { statusAudit: 'Да', auditNote: 'goalAnswers список в Profile' };
      }
      return { statusAudit: 'Да', auditNote: '' };
    }
    if (subsection.includes('Твой способ')) {
      if (t.includes('попадают в финальный PDF')) {
        return { statusAudit: 'Да', auditNote: 'profilePdfBuilder + draft blocks' };
      }
      if (t.includes('маршрут') && /LLM/i.test(t)) {
        return { statusAudit: 'Да', auditNote: 'buildRoleRoute heuristic', llmDeferred: true };
      }
      if (t.includes('счётчик по каждой из 6 ролей')) {
        return { statusAudit: 'Да', auditNote: 'actionStyle.roleCounts grid' };
      }
      return { statusAudit: 'Да', auditNote: '' };
    }
    if (subsection.includes('Что получилось')) {
      if (t.includes('редактирование аналитиком')) {
        return { statusAudit: 'Да', auditNote: 'ParticipantCard outcomesEdited' };
      }
      if (t.includes('начиная с дня 3')) {
        return { statusAudit: 'Да', auditNote: 'outcomes.visible D3+' };
      }
      if (/LLM|GigaChat/i.test(t)) {
        return { statusAudit: 'Да', auditNote: 'heuristic synthesize', llmDeferred: true };
      }
      return { statusAudit: 'Да', auditNote: 'buildOutcomesHeuristic' };
    }
    if (subsection.includes('Моя копилка')) {
      return { statusAudit: 'Да', auditNote: 'chips tags/sources + piggybank tab' };
    }
    if (subsection.includes('Следующие шаги')) {
      if (/LLM/i.test(t)) {
        return { statusAudit: 'Да', auditNote: 'buildNextStepsFromSources', llmDeferred: true };
      }
      return { statusAudit: 'Да', auditNote: 'D6–7 showNextSteps + admin edit' };
    }
    if (subsection.includes('Рекомендация ИИ')) {
      if (/LLM|GigaChat/i.test(t)) {
        return { statusAudit: 'Потом (v2)', llmDeferred: true, auditNote: 'шаблоны без LLM' };
      }
      return { statusAudit: 'Да', auditNote: 'profileRecommendations templates' };
    }
    if (subsection.includes('Мой трекер')) {
      return { statusAudit: 'Да', auditNote: 'dailyTracker + collapsible UI' };
    }
    if (subsection.includes('Финальный PDF')) {
      if (t.includes('генерация финального PDF')) {
        return { statusAudit: 'Да', auditNote: 'GET /profile/pdf D7+ publish' };
      }
      if (t.includes('Просмотр PDF в админке')) {
        return { statusAudit: 'Да', auditNote: 'pdf-preview + ParticipantCard' };
      }
      return { statusAudit: 'Да', auditNote: 'profilePdfBuilder full cycle' };
    }
    if (subsection.includes('Итоговая карточка')) {
      if (t.includes('Состав карточки')) {
        return { statusAudit: 'Да', auditNote: 'piggybankAll filters + experienceSummary' };
      }
      return { statusAudit: 'Да', auditNote: 'final tab + finalCard API' };
    }
    return { statusAudit: 'Да', auditNote: '§7 baseline' };
  }

  if (sectionId === 8) {
    if (t.includes('быстрые кнопки на главной')) {
      return { statusAudit: 'Да', auditNote: 'day phase 9:30–20:00 + auto tag; FAB вне дня' };
    }
    if (t.includes('раздел «Копилка»') && t.includes('выбирает тег')) {
      return { statusAudit: 'Да', auditNote: 'Profile + FAB QuickCapture all phases' };
    }
    if (t.includes('материала Базы знаний') || t.includes('Базы знаний')) {
      return { statusAudit: 'Да', auditNote: 'KB tags + source confirm' };
    }
    if (t.includes('эксперимента дня') || t.includes('Сохранить фиксацию')) {
      return { statusAudit: 'Да', auditNote: 'ExperimentCard → quick capture' };
    }
    if (t.includes('Теги записи (6')) {
      return { statusAudit: 'Да', auditNote: 'piggybankDict + multi jsonb tags' };
    }
    if (t.includes('Источник записи (6')) {
      return { statusAudit: 'Да', auditNote: 'QuickCapture + KB source step' };
    }
    if (subsection.includes('Форма записи')) {
      if (t.includes('РАЗНЫХ независимых')) {
        return { statusAudit: 'Да', auditNote: 'tag + source columns' };
      }
      if (t.includes('Текст записи — свободный')) {
        return { statusAudit: 'Да', auditNote: '/piggybank/quick + POST /piggybank' };
      }
      if (t.includes('один или несколько тегов')) {
        return { statusAudit: 'Да', auditNote: 'tags jsonb up to 3' };
      }
      if (t.includes('Источник по умолчанию НЕ')) {
        return { statusAudit: 'Да', auditNote: 'required source; KB preselect only' };
      }
      if (t.includes('Привязка к дню')) {
        return { statusAudit: 'Да', auditNote: 'forum_day on insert' };
      }
      return { statusAudit: 'Да', auditNote: '' };
    }
    if (subsection.includes('Просмотр')) {
      if (t.includes('сортировкой по дате')) {
        return { statusAudit: 'Да', auditNote: 'GET /piggybank orderBy createdAt' };
      }
      if (t.includes('по тегу и по источнику')) {
        return { statusAudit: 'Да', auditNote: 'Profile filters + API' };
      }
      if (t.includes('фильтр по дню')) {
        return { statusAudit: 'Да', auditNote: '?day= forum_day' };
      }
      if (t.includes('Поиск по тексту')) {
        return { statusAudit: 'Да', auditNote: '?q= ILIKE' };
      }
      if (t.includes('раздела «Я»')) {
        return { statusAudit: 'Да', auditNote: 'Profile → Копилка' };
      }
      return { statusAudit: 'Да', auditNote: '' };
    }
    if (subsection.includes('Экспорт')) {
      if (t.includes('Кнопка «Экспортировать»')) {
        return { statusAudit: 'Да', auditNote: 'Profile .txt export UI' };
      }
      if (t.includes('финальный PDF')) {
        return { statusAudit: 'Да', auditNote: '§7 profilePdfBuilder piggybank section' };
      }
      if (t.includes('в любой момент')) {
        return { statusAudit: 'Да', auditNote: 'GET /piggybank/export + filters' };
      }
      return { statusAudit: 'Да', auditNote: '' };
    }
    return { statusAudit: 'Да', auditNote: '§8 baseline' };
  }

  if (sectionId === 9) {
    if (t.includes('БАЛЛЫ ПУТИ') && t.includes('источники')) {
      return { statusAudit: 'Частично', auditNote: '§9: рефлексия/обмен→Path; фото/командные через модерацию' };
    }
    if (t.includes('ОБЩИЙ РЕЙТИНГ') && t.includes('Опыт') && t.includes('Путь')) {
      return { statusAudit: 'Да', auditNote: 'path+experience+bonus totalRatingScore' };
    }
    if (t.includes('Разрезы рейтинга')) {
      return {
        statusAudit: 'Частично',
        auditNote: 'total/path/exp + direction + day/shift scope; номинации — вне scope',
      };
    }
    if (t.includes('Отдельные таблицы лидеров')) {
      return { statusAudit: 'Да', auditNote: 'Profile→Рейтинг track=path|experience|total' };
    }
    if (subsection.includes('Три счётчика')) {
      return { statusAudit: 'Да', auditNote: 'Home StatsRow: Путь/Опыт/Рейтинг/Идей' };
    }
    if (subsection.includes('Уровни') && t.includes('Push участнику при переходе')) {
      return { statusAudit: 'Да', auditNote: 'afterPointsAwarded level_up push' };
    }
    if (subsection.includes('Уровни') && t.includes('Отображение уровня в профиле')) {
      return { statusAudit: 'Да', auditNote: 'Profile + Home progress bars' };
    }
    if (subsection.includes('Формула итогового')) {
      if (t.includes('Итоговый рейтинг = баллы за задания')) {
        return { statusAudit: 'Да', auditNote: 'path+experience+bonusPoints; медали отдельно' };
      }
      if (t.includes('регулярность')) {
        return { statusAudit: 'Да', auditNote: 'bonus_regularity 6+ дней, levelsConfig' };
      }
      if (t.includes('разнообразие')) {
        return { statusAudit: 'Да', auditNote: 'bonus_diversity 4+ категорий заданий' };
      }
      if (t.includes('коэффициенты настраиваются')) {
        return { statusAudit: 'Да', auditNote: 'levelsConfig CRUD для бонусов и ставок' };
      }
    }
    if (subsection.includes('Отображение медалей')) {
      if (t.includes('финальном PDF')) {
        return { statusAudit: 'Да', auditNote: 'profilePdfBuilder + GET /profile/pdf' };
      }
      if (t.includes('Все медали')) {
        return { statusAudit: 'Да', auditNote: 'GET /profile/medals/catalog earned/locked' };
      }
      if (t.includes('отдельный блок')) {
        return { statusAudit: 'Да', auditNote: 'Profile overview + вкладка Медали' };
      }
      if (t.includes('push участнику')) {
        return { statusAudit: 'Да', auditNote: 'medalEvaluator medal_auto push' };
      }
    }
    if (subsection.includes('Таблицы лидеров')) {
      if (t.includes('лидеров дня')) {
        return { statusAudit: 'Да', auditNote: 'GET /leaderboard?scope=day&day=' };
      }
      if (t.includes('лидеры по линии «Путь»')) {
        return { statusAudit: 'Да', auditNote: 'track=path в UI рейтинга' };
      }
      if (t.includes('подсвечивается')) {
        return { statusAudit: 'Да', auditNote: 'isMe highlight в списке' };
      }
      if (t.includes('скрыть себя')) {
        return { statusAudit: 'Да', auditNote: 'hideFromLeaderboard + API filter' };
      }
      if (t.includes('Фильтры') && t.includes('медал')) {
        return { statusAudit: 'Да', auditNote: 'GET /leaderboard?medalId=' };
      }
      if (t.includes('номинациям')) {
        return { statusAudit: 'Нет', auditNote: 'вне scope §9 (номинации)' };
      }
      if (t.includes('доступен из меню')) {
        return { statusAudit: 'Частично', auditNote: 'Profile→Рейтинг, не отдельный root-раздел' };
      }
    }
    if (subsection.includes('Личный итог')) {
      if (t.includes('Скачать итог')) {
        return { statusAudit: 'Да', auditNote: 'GET /profile/pdf + кнопка в finalCard' };
      }
      if (t.includes('после окончания смены')) {
        return { statusAudit: 'Да', auditNote: 'bundle.pdf.available gating' };
      }
      if (t.includes('Мои результаты')) {
        return { statusAudit: 'Частично', auditNote: 'Profile overview, не отдельный экран бота' };
      }
    }
    if (subsection.includes('Пути') && subsection.includes('рефлексию')) {
      if (t.includes('проверки состояния') && t.includes('5 XP')) {
        return { statusAudit: 'Да', auditNote: 'state_check_morning/day/evening 5 Path' };
      }
      if (t.includes('итогов дня') && t.includes('15 XP')) {
        return { statusAudit: 'Да', auditNote: 'evening_complete 15 Path' };
      }
      if (t.includes('точки Б') && t.includes('30 XP')) {
        return { statusAudit: 'Да', auditNote: 'point_b_complete 30 Path' };
      }
      if (t.includes('другого участника') || t.includes('Заданный вопрос')) {
        return { statusAudit: 'Да', auditNote: 'exchange_answer/question → Path' };
      }
      if (t.includes('ВСЕХ точек дня')) {
        return { statusAudit: 'Да', auditNote: 'day_complete_bonus 20 Path' };
      }
      if (t.includes('Стрик рефлексии')) {
        return { statusAudit: 'Да', auditNote: 'reflection_streak_7 +50 Path' };
      }
      if (t.includes('ставки настраиваются')) {
        return { statusAudit: 'Да', auditNote: 'levelsConfig CRUD' };
      }
    }
    if (subsection.includes('Опыта') && subsection.includes('базовые ставки')) {
      if (t.includes('медалью') && t.includes('× 2')) {
        return { statusAudit: 'Да', auditNote: 'tasks.medalTask + effectiveTaskPoints ×2' };
      }
    }
    return { statusAudit: 'Частично', auditNote: '§9 baseline' };
  }

  if (sectionId === 10) {
    if (t.includes('начале временного окна каждой точки')) {
      return { statusAudit: 'Да', auditNote: 'touchpointPushPlanner + publishTime окно' };
    }
    if (t.includes('23:00')) {
      return { statusAudit: 'Да', auditNote: 'pushNightSlotEnabled + slot_2300' };
    }
    if (t.includes('30 минут')) {
      return { statusAudit: 'Да', auditNote: 'touchpoint_retry_* + auto_retry слоты' };
    }
    if (t.includes('отключил уведомления')) {
      return { statusAudit: 'Да', auditNote: 'pushCategoryOf + Profile pushOptOut' };
    }
    if (t.includes('10–15 минут') || t.includes('ключевых блоков программы')) {
      return { statusAudit: 'Да', auditNote: 'event_reminder 10–15 мин, isKeyBlock/pushReminder' };
    }
    if (t.includes('по типу блока')) {
      return { statusAudit: 'Да', auditNote: 'forum_settings.push_block_types + админ UI' };
    }
    if (t.includes('ответа на свой вопрос')) {
      return { statusAudit: 'Да', auditNote: 'transactional_exchange_answer_received' };
    }
    if (t.includes('смене статуса задания')) {
      return { statusAudit: 'Да', auditNote: 'transactional_task_pending/approved/rejected' };
    }
    if (t.includes('медали в системе рейтинга')) {
      return { statusAudit: 'Да', auditNote: 'transactional_medal' };
    }
    if (t.includes('новый уровень')) {
      return { statusAudit: 'Да', auditNote: 'transactional_level_up' };
    }
    if (t.includes('чек-ин')) {
      return { statusAudit: 'Да', auditNote: 'UI «проверка состояния»; type checkin внутренний' };
    }
    if (t.includes('нетворкинг')) {
      return { statusAudit: 'Да', auditNote: 'seed/UI «полезные знакомства»' };
    }
    if (t.includes('08:00') || t.includes('13:00') || t.includes('16:00') || t.includes('18:30') || t.includes('22:00')) {
      return { statusAudit: 'Да', auditNote: 'PUSH_SLOTS + pushTemplates' };
    }
    return { statusAudit: 'Да', auditNote: '§10 dual push docs/PUSH_VK_SETUP.md' };
  }

  if (sectionId === 14) {
    if (statusUser === 'Да') {
      return { statusAudit: 'Да', auditNote: note ? note.slice(0, 120) : 'admin-panel §14' };
    }
    if (statusUser === 'Частично') {
      return { statusAudit: 'Частично', auditNote: note ? note.slice(0, 120) : 'см. spec-tracker-admin.tsv' };
    }
    if (statusUser === 'Нет') {
      return { statusAudit: 'Нет', auditNote: '' };
    }
  }

  if (sectionId === 15) {
    if (subsection.includes('14+. Рейтинг') || subsection.includes('14+. Push')) {
      if (statusUser === 'Да') {
        return { statusAudit: 'Да', auditNote: 'admin wave: LevelsTab/MedalsTab/PushTab' };
      }
      if (statusUser === 'Частично') {
        return { statusAudit: 'Частично', auditNote: 'см. note в spec-tracker-admin.tsv' };
      }
      if (statusUser === 'Нет') {
        return { statusAudit: 'Нет', auditNote: '' };
      }
    }
  }

  return null;
}


function enrichNote(note, llmDeferred) {
  if (!llmDeferred) return note;
  const tag = 'Потом · LLM, не горит';
  if (note.includes(tag)) return note;
  return note ? `${note} · ${tag}` : tag;
}

const parsed = parseUserTable(SPEC_TABLE_TSV);
const ROWS = parsed.map((p) => {
  const { statusAudit, llmDeferred, auditNote } = deriveAudit(p);
  return R(
    p.sectionId,
    p.sectionTitle,
    p.pointCount,
    p.subsection,
    p.task,
    p.statusUser,
    statusAudit,
    enrichNote(p.note, llmDeferred),
    llmDeferred,
    auditNote,
  );
});

const DASHBOARD_EXPECTED = { 11: 54, 12: 84, 13: 87 };
const dashboardParsed = parseUserTable(loadDashboardTsv());
const dashboardBySection = new Map();
for (const p of dashboardParsed) {
  dashboardBySection.set(p.sectionId, (dashboardBySection.get(p.sectionId) || 0) + 1);
}
for (const [sid, expected] of Object.entries(DASHBOARD_EXPECTED)) {
  const n = dashboardBySection.get(Number(sid)) || 0;
  if (n !== expected) {
    console.warn(`Dashboard §${sid}: expected ${expected} rows, got ${n}`);
  }
}

const DASHBOARD_ROWS = dashboardParsed.map((p) =>
  R(
    p.sectionId,
    p.sectionTitle,
    p.pointCount,
    p.subsection,
    p.task,
    p.statusUser,
    p.statusUser,
    p.note,
    false,
    '',
  ),
);

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = JSON.stringify(ROWS, null, 2);
fs.writeFileSync(path.join(root, 'docs/spec-tracker-data.json'), json);
fs.writeFileSync(path.join(root, 'docs/spec-tracker-dashboard-data.json'), JSON.stringify(DASHBOARD_ROWS, null, 2));
let html = fs.readFileSync(path.join(root, 'docs/spec-tracker-template.html'), 'utf8');
html = html.replace('__SPEC_DATA__', JSON.stringify(ROWS));
html = html.replace('__DASHBOARD_DATA__', JSON.stringify(DASHBOARD_ROWS));
fs.writeFileSync(path.join(root, 'docs/spec-tracker.html'), html);
console.log('Rows:', ROWS.length, '| Dashboard:', DASHBOARD_ROWS.length);
