# QA Checklist — Машук 2026 · ТЗ v11



База: дизайн v9 + онбординг + дельта v11.

См. [GAP_V11.md](GAP_V11.md), [ROADMAP_V11.md](ROADMAP_V11.md).



## Покрытие разделов v11



| Раздел | Статус |

|--------|--------|

| Регистрация / онбординг | есть (+ сводка, 6 карточек ролей, веса) |

| 6 ролей + диагностика | есть (+ веса в админке) |

| Главная / фазы / точки | есть (+ бейдж группы) |

| Точки 4–5 выбор урока | есть |

| Точка Б (5 ответов + strong/growth) | есть |

| Программа + БЗ ≥4/7 | есть |

| Задания + QR / волонтёр | есть (deep-link Мой QR) |

| Вопросы 3 таба + реакции | есть |

| Профиль / итоговая карточка / push | есть |

| Выгрузки / PDF / роли по дням | есть |

| Аналитика + смысловые слои | есть |

| Админка: матрица прав / карточка участника | есть |



## Онбординг

- [x] Шаг 1–4 + сохранение + без повторного показа

- [x] Выбор группы при `group_assign_mode=list` (код)

- [x] Тексты согласий с версиями из `/consents/active` (код)

- [x] Reject при устаревшей версии согласия (API E2E)

- [x] Экран подтверждения данных перед save

- [x] 6 полных карточек ролей на результате диагностики

- [x] Веса диагностики в админке (`role_diagnostics_config`)



## Главная / Точка Б

- [x] 8 дней, фокус, роль дня, эксперимент, вечерняя анкета (код)

- [x] Бейдж группы в HeaderInfo

- [x] Фазы дня по МСК из API

- [x] Вечерняя анкета: 9 шкал + условные + открытые + роль на завтра

- [x] Точки 7×7: seed-touchpoints / copy-day в админке

- [x] Точки 4–5: выбор урока из events дня

- [x] Точка Б UI: 5 ответов + сильная / роль роста

- [x] Locked после смены календарного дня / `currentDay` (unit + API E2E)



## Задания / волонтёр / QR

- [x] confirmationType photo / post_url / qr / auto / team (код)

- [x] Admin QR → download image URL

- [x] Мой QR = deep-link `#/volunteer?qr=…`

- [x] Volunteer: paste ссылки/токена + confirm

- [x] QR → `/volunteer/confirm` (API E2E; native camera — P2)



## Вопросы

- [x] 3 таба: рефлексия / обмен / организаторам

- [x] Реакции 👍 / «Хочу обсудить» в UI

- [x] Level-2 комментарии



## Профиль / настройки

- [x] Push opt-out по типам + скрытие из рейтинга

- [x] Медали из `/profile/medals`

- [x] «Собрать Что получилось»

- [x] «В копилку» на материале БЗ



## Админка

- [x] Publish дня + история версий

- [x] Materials: eventId / direction / tags / isGeneral / includeInAnalytics

- [x] Merge тегов

- [x] Medals: awardType + conditionRule

- [x] Org threads / push templates / analytics semantic

- [x] Экспорт `/exports/day?type=` + листы ролей + PDF

- [x] Versioning toast при правке вопроса с ответами

- [x] Матрица прав (read-only) + карточка участника с табами



## E2E / сборка / прод

```powershell

cd mashuk-backend

npx tsx src/db/apply-0006.ts

npx tsx src/db/apply-0007.ts

npx tsx src/db/apply-0008.ts

npm run db:seed

npm run db:ops

# или: npm run db:prod-ready

npm test

npm run build



cd ..\mashuk-frontend; npm run build

cd ..\mashuk-admin; npm run build

```

- [x] Unit + E2E backend (47 tests)

- [x] Ops bootstrap + apply-0008 diagnostics config

- [ ] Финальный визуальный smoke в VK mini app на устройстве перед форумом (не блокер кода)



## Терминология

- [x] «проверка состояния» (не «чек-ин»)

- [x] «полезные знакомства» (не «нетворкинг»)

