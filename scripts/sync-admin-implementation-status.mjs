/**
 * Обновляет колонку «Реализовано» в spec-tracker-admin.tsv по сверке с кодом (2026-07).
 * Запуск: node scripts/sync-admin-implementation-status.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TSV_PATH = path.join(__dirname, 'spec-tracker-admin.tsv');

/** @type {{ match: RegExp | string, status: string, noteAppend?: string }[]} */
const RULES = [
  // —— 1. Участники · Список ——
  { match: /Заголовок страницы: «Участники · N всего»/, status: 'Да', noteAppend: 'AdminPageHero + participantsTotal (2026-07)' },
  { match: /Строка поиска: по ФИО, VK ID/, status: 'Да' },
  { match: /Фильтр: Направление \(мультивыбор\)/, status: 'Да' },
  { match: /Фильтр: Группа/, status: 'Да' },
  { match: /Фильтр: Ведущая роль по диагностике/, status: 'Да', noteAppend: 'strongRole + pedagogicalRole (2026-07 roadmap)' },
  { match: /Фильтр: Активность/, status: 'Да' },
  { match: /Кнопка: «\+ Добавить участника»/, status: 'Да' },
  { match: /Кнопка: «Выгрузить список» \(XLSX\)/, status: 'Да' },
  { match: /Таблица — колонки: ID/, status: 'Да', noteAppend: 'колонка ID + toggle (2026-07)' },
  { match: /Действия в строке \(кебаб-меню\)/, status: 'Да', noteAppend: '«Удалить участника» + confirm + journal' },
  { match: /Массовые действия: Выгрузить выбранных/, status: 'Да' },

  // —— 1. Участники · Карточка ——
  { match: /Открывается по клику на строку/, status: 'Да' },
  { match: /Верхняя шапка: аватар/, status: 'Да', noteAppend: 'VK photo users.get + fallback initials' },
  { match: /Вкладка «Профиль»: данные регистрации/, status: 'Да', noteAppend: 'согласия, интересы, workplace (2026-07)' },
  { match: /Вкладка «Активность»/, status: 'Да' },
  { match: /Вкладка «Ответы»/, status: 'Да', noteAppend: 'фильтр день + block' },
  { match: /Вкладка «Копилка»/, status: 'Да', noteAppend: 'фильтры тег/источник/день в карточке' },
  { match: /Вкладка «Задания»/, status: 'Да' },
  { match: /Вкладка «Медали»/, status: 'Да', noteAppend: 'awardedAt + не получены' },
  { match: /Вкладка «Баллы»/, status: 'Да', noteAppend: 'сводка path/exp/bonus + by day' },
  { match: /Вкладка «Логи»/, status: 'Да' },
  { match: /^Действия: Скорректировать роль · Начислить/, status: 'Да', noteAppend: 'hero toolbar ParticipantCard' },

  // —— 2. Программа ——
  { match: /Кнопка «\+ Добавить день»/, status: 'Да' },
  { match: /Табы по дням/, status: 'Да' },
  { match: /Кнопка «Скопировать день»/, status: 'Да' },
  { match: /Кнопки: \[Сохранить черновик дня\]/, status: 'Да' },
  { match: /Строка события в хронологическом порядке/, status: 'Да', noteAppend: 'EventCard timeline' },
  { match: /Действия: Редактировать · Скрыть · Дублировать/, status: 'Да' },
  { match: /Название блока · Описание блока \(rich text\)/, status: 'Да', noteAppend: 'descriptionHtml editor' },
  { match: /Тип блока \(выпадающий список/, status: 'Да' },
  { match: /Аудитория блока: Все участники/, status: 'Да' },
  { match: /Теги блока — мультивыбор/, status: 'Да' },
  { match: /Время начала · Время окончания/, status: 'Да' },
  { match: /^Место — выпадающий список/, status: 'Да' },
  { match: /Публикация: \[Черновик\] \/ \[Опубликовано\]/, status: 'Да' },
  { match: /Кнопки: \[Сохранить черновик\] \[Опубликовать\] \[👁 Посмотреть как участник\]/, status: 'Да', noteAppend: 'EventCard + preview modal' },
  { match: /Блок можно пометить как «содержит несколько тем»/, status: 'Да' },
  { match: /У каждой темы внутри блока/, status: 'Да', noteAppend: 'SpeakerMultiPick на под-теме' },
  { match: /Участник видит в расписании ОДНУ карточку блока/, status: 'Да', noteAppend: 'Program.tsx expand parent' },

  // —— 3. База знаний ——
  { match: /Заголовок: «База знаний · N материалов»/, status: 'Да' },
  { match: /Поиск по названию · Фильтр: День/, status: 'Да' },
  { match: /Кнопка: «\+ Добавить материал»/, status: 'Да' },
  { match: /^Колонки: Дата · Спикер · Название материала/, status: 'Да', noteAppend: 'KnowledgeTab table TZ columns' },
  { match: /Действия: Редактировать · Скопировать ссылку/, status: 'Да', noteAppend: 'RowActionsMenu + Скрыть archived' },
  { match: /^3\. База знаний · Форма материала\tДата/, status: 'Да', noteAppend: 'dayNumber + createdAt в списке' },
  { match: /Спикер \(мультивыбор из справочника\)/, status: 'Да', noteAppend: 'SpeakerMultiPick program-speakers' },
  { match: /Название материала$/, status: 'Да' },
  { match: /Тип материала \(выпадающий список/, status: 'Да', noteAppend: 'material_types catalog' },
  { match: /Ссылка на материал \(URL\) ИЛИ файл/, status: 'Да', noteAppend: 'upload-file до 100MB' },
  { match: /Привязка: Общий материал форума/, status: 'Да', noteAppend: 'isGeneral + event select' },
  { match: /Условие открытия участнику/, status: 'Да', noteAppend: 'admin kbUnlockMode + runtime isMaterialUnlockedForParticipant' },

  // —— 4. Вопросы ——
  { match: /ВАЖНО: в интерфейсе участника это ОДИН раздел/, status: 'Да' },
  { match: /Заголовок: «Вопросы · N всего»/, status: 'Да' },
  { match: /Табы по типу: \[Все\]/, status: 'Да' },
  { match: /Поиск · Фильтр: День · Аудитория · Статус/, status: 'Да' },
  { match: /Кнопка: «\+ Создать вопрос»/, status: 'Да' },
  { match: /^Колонки: № · Заголовок · Тип/, status: 'Да' },
  { match: /Действия: Редактировать · Дублировать · Просмотр ответов/, status: 'Да' },
  { match: /Массовое действие «Скопировать выбранные на день N»/, status: 'Да' },
  { match: /Заголовок \(внутренний\)/, status: 'Да' },
  { match: /Тип вопроса \(радио 6 типов\)/, status: 'Да' },
  { match: /Подтип \(dropdown\)/, status: 'Да' },
  { match: /Тип ответа: свободный текст/, status: 'Да' },
  { match: /Варианты ответа \(если применимо/, status: 'Да' },
  { match: /День показа: чекбоксы 1-8/, status: 'Да' },
  { match: /Окно: время открытия/, status: 'Да' },
  { match: /Аудитория: Все \/ Направление \/ Группа \/ Роль/, status: 'Да', noteAppend: 'dropdown directions/groups/roles' },
  { match: /Обязательность · Баллы за ответ/, status: 'Да' },
  { match: /ВЕРСИОННОСТЬ: при редактировании/, status: 'Да', noteAppend: 'versionNotice + versions tab' },
  { match: /Отдельная вкладка «История версий вопроса»/, status: 'Да' },
  { match: /Кнопки: \[Сохранить черновик\] \[Опубликовать\] \[👁 Посмотреть как участник — превью вопроса\]/, status: 'Да' },

  // —— 5. Роли / советы ——
  { match: /Заголовок: «Роли · 6 ролей матрицы»/, status: 'Да' },
  { match: /Матрица 2×3/, status: 'Да' },
  { match: /^Роли: Исследователь смыслов/, status: 'Да' },
  { match: /^Колонки: Название · Ключ · Квадрант/, status: 'Да' },
  { match: /Действия: Редактировать · Просмотр советов/, status: 'Да' },
  { match: /ОДНА МЕХАНИКА: каждой паре \(роль × день\)/, status: 'Да', noteAppend: 'unique day+role + upsert' },
  { match: /Заголовок: «Каталог советов · N советов»/, status: 'Да' },
  { match: /Поиск · Фильтр: Роль · День · Статус/, status: 'Да' },
  { match: /Кнопки: \[\+ Добавить совет\] \[Импорт из CSV\]/, status: 'Да' },
  { match: /^Колонки: Роль · День · Заголовок/, status: 'Да' },
  { match: /^5\. Каталог советов · Форма совета\tРоль/, status: 'Да' },
  { match: /День смены \(dropdown 1–7\)/, status: 'Да' },
  { match: /Заголовок совета \(до 60 символов\)/, status: 'Да' },
  { match: /Текст совета \(до 500 символов\)/, status: 'Да' },
  { match: /Статус: \[Черновик\] \/ \[Опубликован\]/, status: 'Да' },
  { match: /Кнопки: \[Сохранить\] \[Опубликовать\] \[👁 Посмотреть как участник — превью карточки/, status: 'Да' },

  // —— 6. Задания ——
  { match: /Заголовок: «Задания · N всего»/, status: 'Да' },
  { match: /Табы: \[Активные\] \[Черновики\] \[Архив\]/, status: 'Да', noteAppend: 'TasksTab status tabs' },
  { match: /Поиск · Фильтр: Категория \(11\)/, status: 'Да', noteAppend: 'task-categories dropdown' },
  { match: /Кнопка: «\+ Создать задание»/, status: 'Да' },
  { match: /^Колонки: № · Название · Иконка/, status: 'Да', noteAppend: 'TasksListTable' },
  { match: /Действия: Редактировать · Дублировать · Скачать QR/, status: 'Да', noteAppend: 'RowActionsMenu + hide/archive' },
  { match: /Название · Описание \(rich text\) · Иконка/, status: 'Да', noteAppend: 'TaskForm rich editor' },
  { match: /Категория \(dropdown 11 категорий\)/, status: 'Да', noteAppend: 'TaskCategoriesBlock + select' },
  { match: /День доступности \(мультивыбор 1-8\)/, status: 'Да' },
  { match: /Баллы \(линия «Опыт»\)/, status: 'Да' },
  { match: /Способ подтверждения \(мультивыбор\)/, status: 'Да', noteAppend: 'CONFIRMATION_METHOD_OPTIONS chips' },
  { match: /Требует модерации: чекбокс/, status: 'Да' },
  { match: /Лимит выполнений: одноразовое/, status: 'Да', noteAppend: 'executionType select' },
  { match: /Уровень: обычное \/ особое/, status: 'Да', noteAppend: 'medalTask checkbox' },
  { match: /Кнопка «Сгенерировать QR»/, status: 'Да' },
  { match: /Публикация: черновик \/ опубликовано/, status: 'Да', noteAppend: 'Сохранить черновик + Опубликовать' },
  { match: /Поле «Номинация»/, status: 'Да' },
  { match: /Поле «Push при публикации»/, status: 'Да' },

  // —— доп. пункты без правила ранее ——
  { match: /Действия: Редактировать · Удалить/, status: 'Да', noteAppend: 'AdviceCatalogSection' },
  { match: /Поле «Время публикации»/, status: 'Да', noteAppend: 'TaskForm availableFromLocal' },
  { match: /Поле «Срок приёма заявки»/, status: 'Да', noteAppend: 'TaskForm applicationDeadlineLocal' },
  { match: /Поле «Место проведения»/, status: 'Да', noteAppend: 'TaskForm programPlaceId' },
  { match: /Массовое: «Объединить выбранные в один»/, status: 'Да', noteAppend: 'RecommendationTagsTab bulkMerge' },
  { match: /Аудитория: Для всех \/ Для конкретного направления/, status: 'Да', noteAppend: 'radio + direction select' },
  { match: /Примеры открытых:/, status: 'Да', noteAppend: 'подсказки в MedalForm, не контент медалей' },
  { match: /Примеры скрытых:/, status: 'Да', noteAppend: 'подсказки в MedalForm, не контент медалей' },

  // —— Модерация заявок ——
  { match: /Заголовок: «Заявки на модерации/, status: 'Да' },
  { match: /Фильтр: Задание · Способ подтверждения/, status: 'Да', noteAppend: 'TaskModerationQueue' },
  { match: /Колонки: Дата · Участник · Задание/, status: 'Да' },
  { match: /Действия: Подтвердить · Отклонить/, status: 'Да' },
  { match: /Массовые: Подтвердить выбранных/, status: 'Да', noteAppend: 'bulk-moderate approve+reject' },

  // —— Рейтинг ——
  { match: /Две линии — «Путь» и «Опыт»/, status: 'Да', noteAppend: 'LevelsTab path/experience + leaderboards' },
  { match: /Пороги уровней «Пути»/, status: 'Да', noteAppend: 'ThresholdEditor path_level' },
  { match: /Пороги уровней «Опыта»/, status: 'Да', noteAppend: 'ThresholdEditor exp_level' },
  { match: /Правила бонусов \(конструктор\)/, status: 'Да', noteAppend: 'BonusRulesEditor + runtime enabled/params' },
  { match: /Таблица actionType × points/, status: 'Да', noteAppend: 'ActionTable action-catalog' },
  { match: /Кнопки: \[Сохранить\] \[Пересчитать всех\]/, status: 'Да', noteAppend: 'LevelsTab settings toolbar' },
  { match: /История пересчётов/, status: 'Да', noteAppend: 'LevelsTab recalc-history' },
  { match: /Форма ручного начисления: Участник/, status: 'Да', noteAppend: 'search + line + points + reason + date' },
  { match: /Кнопка \[Начислить\] — запись сразу в points_log/, status: 'Да' },
  { match: /История ручных начислений с возможностью отмены/, status: 'Да', noteAppend: 'manual log + revoke' },

  // —— Медали ——
  { match: /Заголовок: «Медали · N всего»/, status: 'Да' },
  { match: /Табы: \[Активные\] \[Черновики\]/, status: 'Да', noteAppend: 'MedalsTab listTab' },
  { match: /Фильтр: Категория · Уровень/, status: 'Да', noteAppend: 'MedalsTab filters' },
  { match: /Кнопка: «\+ Создать медаль»/, status: 'Да' },
  { match: /^Колонки: Иконка · Название · Уровень/, status: 'Да', noteAppend: 'MedalsListTable' },
  { match: /Название · Описание \(rich text\) · Иконка \(SVG/, status: 'Да', noteAppend: 'MedalForm' },
  { match: /Категория · Уровень: \[Бронза\]/, status: 'Да', noteAppend: 'MedalForm seg bronze/silver/gold' },
  { match: /Тип выдачи: \[Автоматическая\]/, status: 'Да', noteAppend: 'MedalForm awardType' },
  { match: /Условие получения \(если авто\)/, status: 'Да', noteAppend: 'ruleMetric + ruleValue' },
  { match: /ТИП ВИДИМОСТИ \(радио\)/, status: 'Да', noteAppend: 'open/hidden radio + hints' },
  { match: /Статус: \[Активна\] \/ \[Черновик\]/, status: 'Да', noteAppend: 'MedalForm isActive seg' },

  // —— Копилка ——
  { match: /Заголовок: «Записи копилки · N всего»/, status: 'Да' },
  { match: /Поиск по тексту/, status: 'Да' },
  { match: /Фильтр: Участник · Направление · Группа/, status: 'Да' },
  { match: /Колонки: Дата\+время · Участник/, status: 'Да' },
  { match: /Действия: Открыть · Пометить как нарушение/, status: 'Да' },
  { match: /Кнопка \[Экспорт в XLSX\]/, status: 'Да' },

  // —— 8. Пуши ——
  { match: /Заголовок: «Пуши · N всего · N в очереди»/, status: 'Да', noteAppend: 'PushTab AdminPageHero' },
  { match: /Табы: \[Отправлено\] \[В очереди\] \[Черновики\] \[Шаблоны\]/, status: 'Да' },
  { match: /Фильтр: Тип · Аудитория · Дата отправки/, status: 'Да' },
  { match: /Кнопка: «\+ Создать уведомление»/, status: 'Да' },
  { match: /^Колонки: Дата · Заголовок · Аудитория · Доставлено\/Открыто/, status: 'Да', noteAppend: 'PushListTable' },
  { match: /Отдельная вкладка «Шаблоны» в разделе Пуши/, status: 'Да' },
  { match: /Пресеты по типу: Утро · Проверка состояния/, status: 'Да', noteAppend: 'PushTemplatesPanel' },
  { match: /Форма шаблона: название · заголовок · текст \(с плейсхолдерами/, status: 'Да' },
  { match: /В форме создания пуша — dropdown «Использовать шаблон»/, status: 'Да' },
  { match: /Плейсхолдеры разворачиваются при отправке/, status: 'Да' },
  { match: /^8\. Пуши · Форма уведомления\tВнутреннее название/, status: 'Да', noteAppend: 'PushNotificationForm' },
  { match: /Аудитория: Все \/ Направление \/ Группа \/ Список ID \/ Правило/, status: 'Да' },
  { match: /Дата\/день программы, к которому относится уведомление/, status: 'Да' },
  { match: /Время публикации · Время окончания показа/, status: 'Да' },
  { match: /Возможность прикрепить картинку/, status: 'Да' },
  { match: /Отправить: Сейчас \/ По расписанию \/ По триггеру/, status: 'Да' },
  { match: /Тип уведомления \(выпадающий список\): проверка состояния/, status: 'Да' },
  { match: /НЕ использовать «чек-ин» — везде «проверка состояния»/, status: 'Да' },
  { match: /Статус: \[Черновик\] \/ \[Опубликовано\]\. Кнопки: \[Сохранить черновик\]/, status: 'Да' },

  // —— 11–13 ——
  { match: /Заголовок: «Пользователи админки · N всего»/, status: 'Да' },
  { match: /Поиск · Фильтр: Роль · Направление/, status: 'Да' },
  { match: /Кнопка: «\+ Добавить пользователя»/, status: 'Да' },
  { match: /^Колонки: ФИО · Email · Роль/, status: 'Да' },
  { match: /Действия: Редактировать · Сбросить пароль/, status: 'Да' },
  { match: /^11\. Пользователи админки · Форма\tФИО/, status: 'Да' },
  { match: /Роль \(dropdown\): администратор/, status: 'Да', noteAppend: 'AdminUserForm 7 roles' },
  { match: /Направление \(обязательно для куратора/, status: 'Да' },
  { match: /Пароль: \[Сгенерировать и отправить\]/, status: 'Да', noteAppend: 'generate + modal login/password' },
  { match: /Кнопки: \[Сохранить\] \[Отправить приглашение\]/, status: 'Да', noteAppend: 'reset-password invite flow' },
  { match: /Строки: разделы админ-панели/, status: 'Да' },
  { match: /Столбцы: чтение · создание/, status: 'Да' },
  { match: /Ячейка — чекбокс для каждой роли/, status: 'Да' },
  { match: /Кнопки: \[Сохранить\] \[Сбросить к дефолту\]/, status: 'Да' },
  { match: /^12\. Журнал изменений\tПоиск/, status: 'Да' },
  { match: /^Колонки: Дата\+время · Пользователь · Раздел/, status: 'Да' },
  { match: /Действия: Открыть детали · Откатить · Экспорт/, status: 'Да' },
  { match: /Кнопка: \[Экспорт лога в XLSX\]/, status: 'Да' },
  { match: /Отдельная вкладка для операций особого внимания/, status: 'Да' },
  { match: /Автоматически туда попадают: ручное начисление/, status: 'Да' },
  { match: /Фильтр: «требует ревью»/, status: 'Да' },
  { match: /Действие: «Пометить как отревьюено»/, status: 'Да' },
  { match: /Заголовок: «Управление тегами · N тегов»/, status: 'Да' },
  { match: /Строка поиска: по названию тега/, status: 'Да' },
  { match: /Фильтр: Тип применения/, status: 'Да' },
  { match: /Кнопка: «\+ Создать тег»/, status: 'Да' },
  { match: /^Колонки: Название · Тип применения/, status: 'Да' },
  { match: /Действия: Редактировать · Объединить/, status: 'Да' },
  { match: /Drag-drop сортировка порядка/, status: 'Да', noteAppend: 'RecommendationTagsTab drag + reorder API' },
  { match: /^13\. Тег · Форма\tНазвание/, status: 'Да' },
  { match: /Тип применения \(мультивыбор чекбоксами\)/, status: 'Да' },
  { match: /Описание · Цвет · Активен/, status: 'Да' },
  { match: /Кнопки: \[Сохранить\] \[Отменить\]/, status: 'Да' },
  { match: /Форма выбора двух тегов/, status: 'Да' },
  { match: /Preview: сколько записей/, status: 'Да' },
  { match: /Кнопка \[Объединить\] — необратимо/, status: 'Да' },
  { match: /Логируется в admin_actions_log/, status: 'Да' },

  // —— Сквозные ——
  { match: /Убираем чекбокс «Учитывать в аналитике»/, status: 'Да', noteAppend: 'status published + isPublishedStatus in analytics' },
  { match: /На каждой сущности \(событие · вопрос/, status: 'Да', noteAppend: 'Удалить в списках RowActionsMenu' },
  { match: /Удаление — с подтверждением/, status: 'Да', noteAppend: 'confirmDelete + admin_actions_log' },

  // —— 15. Интеграции ——
  { match: /Авторизация через VK ID/, status: 'Да' },
  { match: /Push через VK Mini Apps Notifications API/, status: 'Да' },
  { match: /Загрузка фото через VK API/, status: 'Частично' },
  { match: /Соблюдение лимитов мини-приложения/, status: 'Частично' },
  { match: /Учёт особенностей сессии мини-приложения ВК/, status: 'Частично' },
  { match: /Подгрузка расписания блоков на каждый день/, status: 'Да' },
  { match: /Карточки уроков о важном/, status: 'Да' },
  { match: /Ссылки на материалы спикеров/, status: 'Частично' },
  { match: /Генерируется на событие\/активность \(event_id\)/, status: 'Да' },
  { match: /Хранится: events\.qr_url/, status: 'Да' },
  { match: /Формат URL: deep-link в бота с параметрами/, status: 'Да' },
  { match: /Сценарий: участник сканирует своей камерой/, status: 'Частично' },
  { match: /В админке — кнопка «Сгенерировать QR» в форме события/, status: 'Да' },
  { match: /Кнопка «Скачать QR PDF»/, status: 'Да' },
  { match: /Генерируется на каждого участника при регистрации/, status: 'Да' },
  { match: /Хранится: participants\.qr_url/, status: 'Частично' },
  { match: /Формат URL: deep-link для приложения волонтёра/, status: 'Частично' },
  { match: /Сценарий: волонтёр сканирует QR участника/, status: 'Частично' },
  { match: /В личном профиле участника — вкладка «Мой QR»/, status: 'Частично' },
  { match: /Регенерация QR при подозрении/, status: 'Частично' },

  // —— 14+ дубли ——
  { match: /Раздел «Система баллов» в админ-панели/, status: 'Частично', noteAppend: 'LevelsTab' },
  { match: /Для каждого действия задаётся: название/, status: 'Частично' },
  { match: /Действия для счётчика «Путь»/, status: 'Частично' },
  { match: /Действия для счётчика «Опыт»/, status: 'Частично' },
  { match: /Действия для счётчика «Идей»/, status: 'Частично' },
  { match: /Система автоматически учитывает ограничения/, status: 'Частично' },
  { match: /Все настройки без участия разработчика/, status: 'Частично' },
  { match: /Раздел «Медали» в админ-панели — создание/, status: 'Да' },
  { match: /Поле «Название медали»/, status: 'Да' },
  { match: /Поле «Описание» — за что выдаётся/, status: 'Да' },
  { match: /Поле «Условие получения»/, status: 'Частично' },
  { match: /Поле «Иконка» — изображение/, status: 'Да' },
  { match: /Поле «Категория» — привязка/, status: 'Частично' },
  { match: /Поле «Уровень» — бронза/, status: 'Да' },
  { match: /Поле «Тип выдачи» — автоматическая/, status: 'Да' },
  { match: /Поиск участника → его профиль → история начислений/, status: 'Да' },
  { match: /Кнопка «Добавить баллы» с комментарием/, status: 'Да' },
  { match: /Кнопка «Снять баллы» с комментарием/, status: 'Да' },
  { match: /Кнопка «Аннулировать подозрительные баллы»/, status: 'Да', noteAppend: 'revoke-bulk LevelsTab + ParticipantCard' },
  { match: /Все ручные операции — в журнале/, status: 'Да' },
  { match: /Возможность настройки порогов уровней «Пути»/, status: 'Частично' },
  { match: /Возможность настройки порогов уровней «Опыта»/, status: 'Частично' },
  { match: /Настройка типов рейтинговых таблиц/, status: 'Частично', noteAppend: 'leaderboardScopes в LevelsTab' },
  { match: /Ручное начисление и снятие баллов с логированием/, status: 'Да' },
  { match: /Ручная отправка: выбор аудитории/, status: 'Да' },
  { match: /Отложенная отправка: задать дату/, status: 'Да' },
  { match: /^Шаблоны уведомлений$/, status: 'Да', noteAppend: 'PushTemplatesPanel + CRUD' },
  { match: /История с указанием статуса доставки/, status: 'Да' },
];

function matches(line, rule) {
  const taskPart = line.split('\t')[1] ?? '';
  const full = line;
  if (rule.match instanceof RegExp) {
    return rule.match.test(taskPart) || rule.match.test(full);
  }
  return taskPart.includes(rule.match) || full.includes(rule.match);
}

export function syncAdminImplementationStatus(tsvPath = TSV_PATH) {
const raw = fs.readFileSync(tsvPath, 'utf8').replace(/^\uFEFF/, '');
const lines = raw.split(/\r?\n/);
let updated = 0;
let unmatched = 0;
const unmatchedTasks = [];

const out = lines.map((line, i) => {
  if (i === 0 || !line.trim()) return line;
  const parts = line.split('\t');
  if (parts.length < 3) return line;
  const task = (parts[1] ?? '').trim();
  if (!task) return line;

  let rule = null;
  for (const r of RULES) {
    if (matches(line, r)) {
      rule = r;
      break;
    }
  }
  if (!rule) {
    unmatched++;
    unmatchedTasks.push(task.slice(0, 80));
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

const counts = { Да: 0, Нет: 0, Частично: 0, 'Надо обсудить': 0, other: 0 };
for (const line of out.slice(1)) {
  const parts = line.split('\t');
  if (!(parts[1] ?? '').trim()) continue;
  const s = (parts[2] ?? '').trim();
  if (counts[s] !== undefined) counts[s]++;
  else counts.other++;
}

const summary = { updated, unmatched, counts, unmatchedTasks };
console.log(`Updated ${updated} rows, ${unmatched} task rows without rule.`);
console.log('Статусы §14–15:', counts);
if (unmatchedTasks.length) {
  console.log('Без правила (первые 10):');
  unmatchedTasks.slice(0, 10).forEach((t) => console.log('  -', t));
}
return summary;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  syncAdminImplementationStatus();
}
