/**
 * The wire contract between the frontend and the backend.
 *
 * Ids are opaque strings on the wire (the database uses integer keys — the
 * server serialises them as strings), timestamps are ISO-8601, and positions
 * are `{ x, y }` objects (the database stores them as two float columns).
 * `docs/release/openapi.yaml` is the human-readable copy of this file.
 */

export type TaskPriority = 'low' | 'medium' | 'high'

export interface UserDto {
  id: string
  name: string
  email: string
  avatarColor: string
}

export interface AuthResult {
  token: string
  user: UserDto
}

export interface Point {
  x: number
  y: number
}

export interface ColumnDto {
  id: string
  name: string
  color: string
  position: Point
  /** Height the user gave it by hand; absent = the standard height. Cards can make it taller. */
  height?: number
  /** Width the user gave it by hand; absent = the standard width. */
  width?: number
}

export interface TaskDto {
  id: string
  boardId: string
  /** null = a free-floating card that belongs to no column */
  columnId: string | null
  title: string
  description?: string
  priority: TaskPriority
  tags: string[]
  position: Point
  dueDate?: string
  createdAt: string
  updatedAt: string
}

export interface BoardSummary {
  id: string
  code: string
  name: string
}

export interface BoardDto {
  id: string
  code: string
  name: string
  columns: ColumnDto[]
  tasks: TaskDto[]
}

export type ColumnCreate = Pick<ColumnDto, 'name' | 'color' | 'position'>
export type ColumnPatch = Partial<ColumnCreate> & { height?: number; width?: number }

export type TaskCreate = Pick<
  TaskDto,
  'title' | 'description' | 'columnId' | 'priority' | 'tags' | 'position' | 'dueDate'
>
export type TaskPatch = Partial<TaskCreate>

export interface CheckllyApi {
  auth: {
    register(input: { name: string; email: string; password: string }): Promise<AuthResult>
    login(input: { email: string; password: string }): Promise<AuthResult>
    me(): Promise<UserDto>
  }
  boards: {
    /** Boards the caller is a member of. */
    list(): Promise<BoardSummary[]>
    get(boardId: string): Promise<BoardDto>
    /** Make a new board (with starter columns); the caller becomes a member. */
    create(input: { name: string }): Promise<BoardDto>
    /** Join an existing board by its shareable code (idempotent). */
    join(input: { code: string }): Promise<BoardDto>
  }
  columns: {
    create(boardId: string, input: ColumnCreate): Promise<ColumnDto>
    update(columnId: string, patch: ColumnPatch): Promise<ColumnDto>
    remove(columnId: string): Promise<void>
  }
  tasks: {
    create(boardId: string, input: TaskCreate): Promise<TaskDto>
    update(taskId: string, patch: TaskPatch): Promise<TaskDto>
    remove(taskId: string): Promise<void>
  }
}
