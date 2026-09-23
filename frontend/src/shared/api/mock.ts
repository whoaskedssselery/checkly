import { ApiError } from './errors'
import { getToken, notifyUnauthorized } from './session'
import type {
  BoardDto,
  BoardSummary,
  CheckllyApi,
  ColumnDto,
  TaskDto,
  TaskPriority,
  UserDto,
} from './types'

/**
 * A localStorage-backed stand-in for the real backend.
 *
 * It is deliberately strict — it enforces the same rules the database and the
 * backend brief define (case-insensitive unique email, priority enum, a task
 * may only live in an existing column, a column with tasks cannot be deleted,
 * protected calls need a token) so that swapping in the real server changes
 * nothing the UI can observe. Sample content only, never real data.
 */

const DB_KEY = 'checkly:mock-db'
export const DEMO_EMAIL = 'demo@checkly.dev'
export const DEMO_PASSWORD = 'demo1234'
const BOARD_ID = 'board-1'
const BOARD_CODE = 'CHK-B1D4'
const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high']
const AVATAR_COLORS = ['#d8a851', '#6fa8a0', '#c46d5e', '#8a86c9', '#7fae6a']

interface StoredUser extends UserDto {
  // Plain text is acceptable ONLY because this is a browser-side mock; the
  // real backend stores a bcrypt/argon2 hash (see docs/release/backend-spec.md).
  password: string
}

interface StoredBoard {
  id: string
  code: string
  name: string
  memberIds: string[]
}

type StoredColumn = ColumnDto & { boardId: string }

interface Db {
  boards: StoredBoard[]
  seq: number
  users: StoredUser[]
  columns: StoredColumn[]
  tasks: TaskDto[]
}

type SeedTask = Partial<TaskDto> & Pick<TaskDto, 'title' | 'columnId' | 'position'>

function seedTask(n: number, over: SeedTask): TaskDto {
  return {
    id: `task-${n}`,
    boardId: BOARD_ID,
    priority: 'medium',
    tags: [],
    createdAt: '2026-09-10T09:00:00Z',
    updatedAt: '2026-09-10T09:00:00Z',
    ...over,
  }
}

function seed(): Db {
  return {
    seq: 100,
    boards: [{ id: BOARD_ID, code: BOARD_CODE, name: 'Доска команды', memberIds: ['user-demo'] }],
    users: [
      {
        id: 'user-demo',
        name: 'Демо',
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        avatarColor: AVATAR_COLORS[0],
      },
    ],
    columns: [
      {
        boardId: BOARD_ID,
        id: 'col-backlog',
        name: 'Backlog',
        color: '#d9a441',
        position: { x: 20, y: 0 },
      },
      {
        boardId: BOARD_ID,
        id: 'col-progress',
        name: 'In progress',
        color: '#cfc6b2',
        position: { x: 340, y: 0 },
      },
      {
        boardId: BOARD_ID,
        id: 'col-done',
        name: 'Done',
        color: '#9aa35e',
        position: { x: 660, y: 0 },
      },
    ],
    tasks: [
      seedTask(1, {
        title: 'Собрать макет доски',
        description: 'Набросать структуру канваса и карточек',
        columnId: 'col-done',
        tags: ['design'],
        position: { x: 686, y: 86 },
        dueDate: '2026-09-15',
      }),
      seedTask(2, {
        title: 'Настроить React Flow',
        description: 'Подключить канвас, пан/зум, кастомные ноды',
        columnId: 'col-progress',
        priority: 'high',
        tags: ['frontend'],
        position: { x: 366, y: 86 },
        dueDate: '2026-09-18',
      }),
      seedTask(3, {
        title: 'Схема БД для задач',
        description: 'Таблицы users/boards/tasks, миграции',
        columnId: 'col-progress',
        priority: 'high',
        tags: ['backend'],
        position: { x: 366, y: 252 },
        dueDate: '2026-09-18',
      }),
      seedTask(4, {
        title: 'Presence-курсоры',
        description: 'Мок живых участников на канвасе',
        columnId: 'col-backlog',
        tags: ['frontend'],
        position: { x: 46, y: 86 },
        dueDate: '2026-09-27',
      }),
      seedTask(5, {
        title: 'Фильтры и поиск',
        columnId: 'col-backlog',
        priority: 'low',
        tags: ['frontend'],
        position: { x: 46, y: 252 },
      }),
    ],
  }
}

// Stands in for the server pushing changes: other tabs hear "the data moved"
// and reload the board. Not created under test (an open channel would keep
// the test worker alive).
let channel: BroadcastChannel | null | undefined
function dbChannel(): BroadcastChannel | null {
  if (channel === undefined)
    channel =
      import.meta.env.MODE !== 'test' && typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel('checkly-mock-db')
        : null
  return channel
}

/** Subscribe to writes made by OTHER tabs. Returns an unsubscribe function. */
export function onMockDbChange(callback: () => void): () => void {
  const c = dbChannel()
  if (!c) return () => {}
  c.addEventListener('message', callback)
  return () => c.removeEventListener('message', callback)
}

function save(db: Db): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db))
    dbChannel()?.postMessage('changed')
  } catch {
    // storage full/blocked: the mock degrades to "forgets on reload"
  }
}

// A database saved before boards had members: give it the shared board back.
function migrate(db: Db): Db {
  if (db.boards) return db
  db.boards = [
    { id: BOARD_ID, code: BOARD_CODE, name: 'Доска команды', memberIds: db.users.map((u) => u.id) },
  ]
  db.columns = db.columns.map((c) => ({ ...c, boardId: c.boardId ?? BOARD_ID }))
  return db
}

function load(): Db {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) return migrate(JSON.parse(raw) as Partial<Db> as Db)
  } catch {
    // fall through to a fresh seed
  }
  const fresh = seed()
  save(fresh)
  return fresh
}

/** Test/QA helper: wipe the mock database back to the seed. */
export function resetMockDb(): void {
  save(seed())
}

const publicUser = ({ password: _password, ...user }: StoredUser): UserDto => user

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HEX_RE = /^#[0-9a-fA-F]{6}$/

const isPoint = (p: unknown): p is { x: number; y: number } =>
  typeof p === 'object' &&
  p !== null &&
  Number.isFinite((p as { x: unknown }).x) &&
  Number.isFinite((p as { y: unknown }).y)

function invalid(fields: Record<string, string>): never {
  throw new ApiError(400, 'VALIDATION_ERROR', 'Validation failed', fields)
}

function latency(): Promise<void> {
  // Zero under test so store/UI specs stay fast and deterministic.
  const ms = import.meta.env.MODE === 'test' ? 0 : 120
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function currentUser(db: Db): StoredUser {
  const token = getToken()
  const id = token?.startsWith('mock.') ? token.slice(5) : null
  const user = id ? db.users.find((u) => u.id === id) : undefined
  if (!user) {
    // Same side effect the HTTP client has on a 401, so the app behaves alike.
    notifyUnauthorized()
    throw new ApiError(401, 'UNAUTHORIZED', 'Missing or invalid token')
  }
  return user
}

/** The board, or 404 if it does not exist, or 403 if the caller is not a member. */
function memberBoard(db: Db, boardId: string): StoredBoard {
  const user = currentUser(db)
  const board = db.boards.find((b) => b.id === boardId)
  if (!board) throw new ApiError(404, 'NOT_FOUND', 'Board not found')
  if (!board.memberIds.includes(user.id))
    throw new ApiError(403, 'FORBIDDEN', 'Not a member of this board')
  return board
}

function boardDto(db: Db, board: StoredBoard): BoardDto {
  return {
    id: board.id,
    code: board.code,
    name: board.name,
    columns: db.columns
      .filter((c) => c.boardId === board.id)
      .map(({ boardId: _boardId, ...column }) => column),
    tasks: db.tasks.filter((t) => t.boardId === board.id),
  }
}

/** A board with the three starter columns, owned by `userId`. Caller saves. */
function createBoard(db: Db, name: string, userId: string): StoredBoard {
  db.seq += 1
  const board: StoredBoard = {
    id: `board-${db.seq}`,
    code: newBoardCode(db),
    name,
    memberIds: [userId],
  }
  db.boards.push(board)
  const starters = [
    ['Backlog', '#d9a441', 20],
    ['In progress', '#cfc6b2', 340],
    ['Done', '#9aa35e', 660],
  ] as const
  for (const [colName, color, x] of starters) {
    db.seq += 1
    db.columns.push({
      boardId: board.id,
      id: `col-${db.seq}`,
      name: colName,
      color,
      position: { x, y: 0 },
    })
  }
  return board
}

function newBoardCode(db: Db): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I to misread aloud
  for (;;) {
    let suffix = ''
    for (let i = 0; i < 4; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)]
    const code = `CHK-${suffix}`
    if (!db.boards.some((b) => b.code === code)) return code
  }
}

interface TaskLike {
  title?: unknown
  priority?: unknown
  columnId?: unknown
  position?: unknown
  tags?: unknown
}

function checkTask(db: Db, input: TaskLike, partial: boolean): void {
  const fields: Record<string, string> = {}
  if (!partial || input.title !== undefined) {
    if (typeof input.title !== 'string' || !input.title.trim()) fields.title = 'Title is required'
    else if (input.title.length > 255) fields.title = 'Title is too long (max 255)'
  }
  if (input.priority !== undefined && !PRIORITIES.includes(input.priority as TaskPriority))
    fields.priority = 'Priority must be low, medium or high'
  if (input.position !== undefined && !isPoint(input.position))
    fields.position = 'Position must be {x, y} numbers'
  if (
    input.tags !== undefined &&
    !(Array.isArray(input.tags) && input.tags.every((x) => typeof x === 'string'))
  )
    fields.tags = 'Tags must be an array of strings'
  if (Object.keys(fields).length) invalid(fields)
  if (
    input.columnId !== undefined &&
    input.columnId !== null &&
    !db.columns.some((c) => c.id === input.columnId)
  )
    throw new ApiError(404, 'NOT_FOUND', 'Column not found')
}

export const mockApi: CheckllyApi = {
  auth: {
    async register({ name, email, password }) {
      await latency()
      const db = load()
      const fields: Record<string, string> = {}
      if (typeof email !== 'string' || !EMAIL_RE.test(email)) fields.email = 'Invalid email'
      if (typeof password !== 'string' || password.length < 6) fields.password = 'Min 6 characters'
      if (Object.keys(fields).length) invalid(fields)
      if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase()))
        throw new ApiError(409, 'EMAIL_TAKEN', 'Email already registered')
      db.seq += 1
      const user: StoredUser = {
        id: `user-${db.seq}`,
        name: name?.trim() || email.split('@')[0],
        email,
        password,
        avatarColor: AVATAR_COLORS[db.users.length % AVATAR_COLORS.length],
      }
      db.users.push(user)
      // Every new account gets a board of its own to start on; more boards come
      // from create/join.
      createBoard(db, `Доска ${user.name}`.slice(0, 150), user.id)
      save(db)
      return { token: `mock.${user.id}`, user: publicUser(user) }
    },

    async login({ email, password }) {
      await latency()
      const db = load()
      const user = db.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase())
      // One error for both "no such user" and "wrong password": never reveal
      // which emails are registered.
      if (!user || user.password !== password)
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'Wrong email or password')
      return { token: `mock.${user.id}`, user: publicUser(user) }
    },

    async me() {
      await latency()
      return publicUser(currentUser(load()))
    },
  },

  boards: {
    async get(boardId): Promise<BoardDto> {
      await latency()
      const db = load()
      currentUser(db)
      return boardDto(db, memberBoard(db, boardId))
    },

    async create({ name }): Promise<BoardDto> {
      await latency()
      const db = load()
      const user = currentUser(db)
      const trimmed = typeof name === 'string' ? name.trim() : ''
      if (!trimmed) invalid({ name: 'Name is required' })
      if (trimmed.length > 150) invalid({ name: 'Name is too long (max 150)' })
      const board = createBoard(db, trimmed, user.id)
      save(db)
      return boardDto(db, board)
    },

    async list(): Promise<BoardSummary[]> {
      await latency()
      const db = load()
      const user = currentUser(db)
      return db.boards
        .filter((b) => b.memberIds.includes(user.id))
        .map(({ id, code, name }) => ({ id, code, name }))
    },

    async join({ code }): Promise<BoardDto> {
      await latency()
      const db = load()
      const user = currentUser(db)
      const wanted = String(code).trim().toUpperCase()
      const board = db.boards.find((b) => b.code === wanted)
      if (!board) throw new ApiError(404, 'NOT_FOUND', 'No board with this code')
      // Joining twice is a no-op, not an error.
      if (!board.memberIds.includes(user.id)) board.memberIds.push(user.id)
      save(db)
      return boardDto(db, board)
    },
  },

  columns: {
    async create(boardId, input) {
      await latency()
      const db = load()
      currentUser(db)
      const fields: Record<string, string> = {}
      if (typeof input.name !== 'string' || !input.name.trim()) fields.name = 'Name is required'
      else if (input.name.length > 50) fields.name = 'Name is too long (max 50)'
      if (!HEX_RE.test(String(input.color))) fields.color = 'Color must be #rrggbb (VARCHAR(7))'
      if (!isPoint(input.position)) fields.position = 'Position must be {x, y} numbers'
      if (Object.keys(fields).length) invalid(fields)
      db.seq += 1
      memberBoard(db, boardId)
      const column: ColumnDto = { ...input, id: `col-${db.seq}`, name: input.name.trim() }
      db.columns.push({ ...column, boardId })
      save(db)
      return column
    },

    async update(columnId, patch) {
      await latency()
      const db = load()
      currentUser(db)
      const column = db.columns.find((c) => c.id === columnId)
      if (!column) throw new ApiError(404, 'NOT_FOUND', 'Column not found')
      if (patch.name !== undefined && !String(patch.name).trim())
        invalid({ name: 'Name is required' })
      if (patch.position !== undefined && !isPoint(patch.position))
        invalid({ position: 'Position must be {x, y} numbers' })
      if (
        patch.height !== undefined &&
        !(Number.isFinite(patch.height) && patch.height >= 120 && patch.height <= 5000)
      )
        invalid({ height: 'Height must be between 120 and 5000' })
      if (
        patch.width !== undefined &&
        !(Number.isFinite(patch.width) && patch.width >= 200 && patch.width <= 5000)
      )
        invalid({ width: 'Width must be between 200 and 5000' })
      Object.assign(column, patch)
      save(db)
      return column
    },

    async remove(columnId) {
      await latency()
      const db = load()
      currentUser(db)
      if (!db.columns.some((c) => c.id === columnId))
        throw new ApiError(404, 'NOT_FOUND', 'Column not found')
      // Mirrors ON DELETE RESTRICT on tasks(board_id, column_id).
      if (db.tasks.some((t) => t.columnId === columnId))
        throw new ApiError(409, 'COLUMN_NOT_EMPTY', 'Column still has tasks')
      db.columns = db.columns.filter((c) => c.id !== columnId)
      save(db)
    },
  },

  tasks: {
    async create(boardId, input) {
      await latency()
      const db = load()
      currentUser(db)
      checkTask(db, input, false)
      memberBoard(db, boardId)
      // The composite FK in the database: a task lives in a column of ITS OWN board.
      if (
        input.columnId != null &&
        !db.columns.some((c) => c.id === input.columnId && c.boardId === boardId)
      )
        throw new ApiError(404, 'NOT_FOUND', 'Column not found')
      db.seq += 1
      const now = new Date().toISOString()
      const task: TaskDto = {
        ...input,
        title: input.title.trim(),
        id: `task-${db.seq}`,
        boardId,
        columnId: input.columnId ?? null,
        tags: input.tags ?? [],
        createdAt: now,
        updatedAt: now,
      }
      db.tasks.push(task)
      save(db)
      return task
    },

    async update(taskId, patch) {
      await latency()
      const db = load()
      currentUser(db)
      const task = db.tasks.find((t) => t.id === taskId)
      if (!task) throw new ApiError(404, 'NOT_FOUND', 'Task not found')
      checkTask(db, patch, true)
      Object.assign(task, patch, { updatedAt: new Date().toISOString() })
      if (typeof patch.title === 'string') task.title = patch.title.trim()
      save(db)
      return task
    },

    async remove(taskId) {
      await latency()
      const db = load()
      currentUser(db)
      if (!db.tasks.some((t) => t.id === taskId))
        throw new ApiError(404, 'NOT_FOUND', 'Task not found')
      db.tasks = db.tasks.filter((t) => t.id !== taskId)
      save(db)
    },
  },
}
