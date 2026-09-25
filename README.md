# Checkly

Совместная доска задач на холсте: колонки и карточки двигаются мышью, на доске
видно, кто ещё работает, изменения приходят другим участникам без перезагрузки.

- `frontend/` — React 19, TypeScript, Zustand, TanStack Query, React Flow, Vite
- `backend/` — NestJS 10, Prisma, PostgreSQL 16, JWT (access + refresh), socket.io
- `qa/` — чёрный ящик по API и нагрузочный тест k6

## Запуск одной командой

```bash
docker compose up --build -d
```

Приложение: http://localhost:8080, API: http://localhost:3001.
Демо-вход: `demo@checkly.dev` / `demo1234`. Настройки — в `.env` (образец `.env.example`).

## Разработка

```bash
# база
docker compose up -d db
# бэкенд
cd backend && npm ci && cp .env.example .env && npx prisma migrate deploy && npm run start:dev
# фронтенд (без VITE_API_URL работает на встроенном localStorage-моке)
cd frontend && pnpm install && VITE_API_URL=http://localhost:3001 pnpm dev
```

## Тесты

| Что | Команда |
| --- | --- |
| Бэкенд, юнит | `cd backend && npm test` |
| Бэкенд, интеграция (нужна БД) | `cd backend && npm run test:e2e` |
| Фронтенд, юнит и компоненты | `cd frontend && pnpm test` |
| Контракт API против настоящего сервера | `CONTRACT_API_URL=http://localhost:3001 pnpm test contract` |
| Браузер, весь продукт (стек поднят) | `cd frontend && pnpm e2e` |
| Нагрузка | `docker run --rm -i -e BASE_URL=http://host.docker.internal:3001 grafana/k6 run - < qa/load/board.k6.js` |
| Проверка API чёрным ящиком | `node qa/backend-probe.mjs` |

Линт и типы: `pnpm lint`, `npx tsc -b` во `frontend/`, `npm run build` в `backend/`.
CI (`.github/workflows/ci.yml`) гоняет всё это на каждый push.
