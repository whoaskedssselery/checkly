# Checkly — backend

NestJS + Prisma + PostgreSQL. Пароли хэшируются bcrypt, сессии — пара
access/refresh JWT, refresh одноразовый (ротация), в БД лежит только его
SHA-256.

## Запуск

```bash
# 1. БД
docker compose up -d

# 2. зависимости
npm install

# 3. окружение
cp .env.example .env

# 4. схема
npx prisma migrate dev --name init
# (или, если миграция уже в репо: npx prisma migrate deploy)

# 5. разработка
npm run start:dev
```

API поднимется на `http://localhost:3001`.

## Эндпоинты

### Auth
| метод | путь | что делает |
|---|---|---|
| POST | `/auth/register` | `{ email, password, name? }` → `{ user, accessToken, refreshToken }` |
| POST | `/auth/login` | `{ email, password }` → то же |
| POST | `/auth/refresh` | `{ refreshToken }` → новая пара, старый отзывается |
| POST | `/auth/logout` | `{ refreshToken? }` → 204, токен отозван |

### Boards (нужен `Authorization: Bearer <accessToken>`)
| метод | путь | что делает |
|---|---|---|
| GET | `/boards` | доски, где я участник |
| POST | `/boards` | `{ name? }` — создаётся с тремя дефолтными колонками |
| GET | `/boards/:id` | 403, если я не участник |
| POST | `/boards/:id/members` | `{ email }` — добавить участника |

### Columns
| метод | путь | что делает |
|---|---|---|
| GET | `/boards/:id/columns` | список колонок доски |
| POST | `/boards/:id/columns` | `{ name, color?, position: { x, y } }` |
| PATCH | `/columns/:id` | частичный апдейт (обычно только `position`) |
| DELETE | `/columns/:id` | задачи переезжают в первую оставшуюся; 400 на последней |

### Tasks
| метод | путь | что делает |
|---|---|---|
| GET | `/boards/:id/tasks` | все задачи доски |
| POST | `/boards/:id/tasks` | `{ title, description?, columnId, priority, tags?, dueDate?, position }` |
| PATCH | `/tasks/:id` | частичный апдейт — можно прислать только `{ position }` или `{ position, columnId }` |
| DELETE | `/tasks/:id` | удаление |

## Presence (WebSocket, socket.io)

Подключение:
```ts
io('http://localhost:3001', { auth: { token: accessToken } })
```

Протокол — см. `src/presence/presence.types.ts` (там же полный контракт
в комментарии). Кратко:

**client → server**
`board:join { boardId }`, `board:leave {}`, `cursor:move { x, y }`,
`reaction:send { emoji }`

**server → client**
`presence:state { users }` (только вошедшему), `presence:join { user }`,
`presence:leave { userId }`, `cursor:move { userId, x, y }`,
`reaction:send { userId, emoji }`, `error { message }`

Один сокет — ровно одна доска за раз. Комнаты: `board:<boardId>`.
Неавторизованный сокет отключается сразу на `handleConnection`.