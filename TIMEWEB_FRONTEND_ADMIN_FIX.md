# Frontend / Admin — деплой на Timeweb Apps

## Проблема

Сборка (`npm run build`) проходит успешно, но деплой зависает на «Pulling image from registry».
Причина: контейнер собирается без команды запуска — некому раздавать папку `dist`.

## Решение

В репозитории добавлены `Dockerfile` + `nginx.conf` для `mashuk-frontend` и `mashuk-admin`.
Nginx слушает порт **8080** и отдаёт SPA с fallback на `index.html`.

## Настройки Timeweb Apps

### mashuk-frontend

| Поле | Значение |
|------|----------|
| Тип | **Dockerfile** |
| Путь до директории | `mashuk-frontend` |
| Порт | `8080` |
| Health check path | `/` |
| Команда запуска | **оставить пустой** (CMD задан в Dockerfile) |
| Команда сборки | **не нужна** (сборка внутри Dockerfile) |

Переменные окружения (нужны **на этапе сборки**):

```
VITE_API_URL=https://zuevpu-mashuk2026-ae82.twc1.net/api
```

### mashuk-admin

| Поле | Значение |
|------|----------|
| Тип | **Dockerfile** |
| Путь до директории | `mashuk-admin` |
| Порт | `8080` |
| Health check path | `/` |
| Команда запуска | **оставить пустой** |
| Команда сборки | **не нужна** |

Переменные окружения:

```
VITE_API_URL=https://zuevpu-mashuk2026-ae82.twc1.net/api
```

Вход — логин/пароль из БД (`admin_users`), см. `mashuk-backend/ADMIN_USERS.md`.

## Проверка после деплоя

```
https://zuevpu-mashuk2026-dc9b.twc1.net/
https://zuevpu-mashuk2026-9a9a.twc1.net/
```

Оба должны открываться без бесконечной загрузки.

## Если раньше был тип «Сборка npm»

Переключите приложение на **Dockerfile** и укажите путь `mashuk-frontend` / `mashuk-admin`.
Удалите старые поля «команда сборки» и «команда запуска» — всё в Dockerfile.
