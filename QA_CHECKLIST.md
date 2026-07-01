# QA Checklist — соответствие мокапу page.html

## Регистрация
- [x] ФИО автозаполняется из VK (readonly)
- [x] Выбор направления из API
- [x] Экран подтверждения перед сохранением
- [x] Повторный вход без регистрации

## Главная (s-home)
- [x] 4 дня форума (не 7)
- [x] Фокус дня, дата, прогресс
- [x] Карточка «Сейчас важно»
- [x] Уведомление о пропущенных вопросах (красная карточка)
- [x] Блоки «Вопросы» и «Задания»
- [x] Быстрая фиксация: Идея / Мысль / Вопрос
- [x] Статистика Путь / Опыт / Идеи
- [x] Переключатель Утро / День / Вечер
- [x] Карточки расписания СКОРО / СЕЙЧАС / ДАЛЕЕ
- [x] Touchpoints с красной точкой «пропущено»

## Программа (s-prog)
- [x] Переключатель 4 дней
- [x] Timeline событий + клик → деталь
- [x] Рекомендации по интересам
- [x] База знаний: lock banner, спикеры, материалы, badge «Новый»
- [x] VKWebAppOpenURL для внешних ссылок материалов

## Задания (s-tasks)
- [x] Header «День N · X из Y» + баллы за день
- [x] Category chips
- [x] Banner KB locked
- [x] Прогресс дня
- [x] Фильтры: Все / Актуальные / Выполненные / На проверке
- [x] Статусы: Скоро / Доступно / На проверке / Выполнено / Не принято
- [x] Отправка с текстом и фото

## Вопросы / Общение (s-chat)
- [x] Единая страница «Общение» (4 блока)
- [x] Рефлексивные вопросы + dimmed answered
- [x] Обмен опытом
- [x] «Мой вопрос»
- [x] «Написать организаторам» (копилка)
- [x] Типы: open, choice, multi, checkin

## Профиль (s-me)
- [x] Аватар (VK photo), имя, направление
- [x] Статистика активностей
- [x] Путь и Опыт с уровнями
- [x] Траектория A→B, запрос, чеклист итогов
- [x] Превью копилки

## Мобильная вёрстка
- [x] Full width на `<520px`, без горизонтального скролла
- [x] Tabbar fixed + safe-area
- [x] Flex-wrap карточек на `<360px`

## Админка CRUD
- [x] События / теги — edit + delete
- [x] Задания / вопросы — edit + delete
- [x] Материалы — edit + delete
- [x] Баллы — edit pointsPerUnit
- [x] Push — всем или по participantId

## E2E сценарий (участник)
1. Регистрация → Главная
2. Целеполагание (interests)
3. Checkin эмоций
4. Задание с отправкой
5. Быстрая запись в копилку
6. Профиль — проверка баллов

- [x] API-сценарий участника (`npm run test:e2e` — регистрация, вопросы, задания, копилка, exchange)
- [ ] UI-прогон в mini app (ручная отметка перед форумом)

## E2E «данные в админку»
1. Участник (vk_id=1) → регистрация → ответ на вопрос → задание → копилка → exchange → attendance
2. Админ → **Модерация** / **Данные** → все записи видны
3. **Выгрузки** → 7 CSV согласованы с БД
4. **Аналитика** → «Пересчитать» → графики не пустые

### Автоматизировано (API)

```powershell
cd mashuk-backend
npm run test:e2e
```

Покрывает: регистрацию E2E-участника (vk_id=999001), ответы/задания/копилку/exchange, admin CSV×7, analytics recalc, push_log.

- [x] E2E API flow (`npm run test:e2e`)

## Polish UX (спринт pre-production)
- [x] Tabbar: подписи «Главная / Программа / Задания / Общение / Профиль»
- [x] Badge на tab «Общение» (availableQuestions из `/home`)
- [x] Empty states: Program, Tasks, Questions, Profile (копилка)
- [x] Admin: расширенный edit tasks/questions/events + delete options
- [x] Admin: loading bar при смене вкладки
- [x] Zod validation admin create/update (events, tasks, questions)
- [x] [DEPLOY.md](./DEPLOY.md) — чеклист Timeweb + VK manual

## Стабильность (автоматически покрыто)
- [x] Регистрация → главная без bounce (initComplete + onRegistered)
- [x] Init не перезапускается на каждый tab
- [x] Global error при недоступном backend
- [x] Program panel: error + retry
- [x] Admin tab: loading + toast при ошибке загрузки
- [x] moderateTask: баллы не дублируются
- [x] Exchange: баллы только после approve модерации
- [x] resetRegistration: cascade delete связанных данных
- [x] Admin CRUD: 404 на missing id
- [x] `/health/ready` проверяет БД
- [x] Docker: migrate перед стартом
- [x] vk_ts expiration в vkAuth

## Сборка перед деплоем
```powershell
cd mashuk-backend; npm test; npm run build
cd mashuk-frontend; npm run build
cd mashuk-admin; npm run build
```

## VK тест (ручной прогон перед форумом)

Полный чеклист деплоя: [DEPLOY.md](./DEPLOY.md)

Скрипт: `.\scripts\vk-tunnel.ps1`

### Автоматизировано

- [x] VK sign HMAC + vk_ts expiration (`npm test` — vkSign utility)
- [x] `/auth/me` с signed Bearer при `SKIP_VK_SIGN=false` (`.\scripts\verify-vk-auth.ps1`)
- [x] Push API → запись в push_log (`npm run test:e2e`)

### Ручной прогон в реальном VK

1. **Tunnel:** `npx @vkontakte/vk-tunnel --http-protocol=http --host=localhost --port=5173`
2. **Backend .env:** `SKIP_VK_SIGN=false`, `VK_APP_SECRET=<из VK Mini App>`
3. **Открыть mini app через VK** — регистрация/главная без `X-Test-Vk-Id`
4. **Push:** задать `VK_SERVICE_TOKEN`, проверить доставку в VK

- [ ] Запуск через tunnel в реальном VK (ручная отметка после прогона)
- [ ] VK Sign в реальном клиенте — нет 401 на `/auth/me`
- [ ] Push доставляется в VK (не только push_log)

## Timeweb deploy

- [x] `docker-compose.prod.yml` + `.env.production.example` (backend, frontend, admin)
- [x] `scripts/pre-deploy.ps1` — tests + builds + docker build
- [x] `scripts/deploy-timeweb.ps1` — проверка dist + чеклист выкладки
- [ ] Фактический деплой на Timeweb (ручная отметка после выкладки)
