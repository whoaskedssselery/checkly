import type { TaskDto } from '@shared/api'
import { api } from '@shared/api'
import { vi } from 'vitest'

/**
 * Make task writes succeed instantly and echo the request back, so component
 * specs can assert on what the UI does without depending on the mock
 * database's contents. `restoreAllMocks` in test-setup undoes it after each test.
 */
export function stubTaskWrites() {
  let n = 0
  vi.spyOn(api.tasks, 'create').mockImplementation(
    async (boardId, input) =>
      ({
        ...input,
        id: `srv-${++n}`,
        boardId,
        tags: input.tags ?? [],
        createdAt: '2026-09-23T00:00:00Z',
        updatedAt: '2026-09-23T00:00:00Z',
      }) as TaskDto,
  )
  vi.spyOn(api.tasks, 'update').mockImplementation(
    async (id, patch) => ({ id, ...patch }) as TaskDto,
  )
  vi.spyOn(api.tasks, 'remove').mockResolvedValue(undefined)
}

export function stubColumnWrites() {
  let n = 0
  vi.spyOn(api.columns, 'create').mockImplementation(async (_boardId, input) => ({
    ...input,
    id: `srv-col-${++n}`,
  }))
  vi.spyOn(api.columns, 'update').mockImplementation(async (id, patch) => ({
    id,
    name: '',
    color: '',
    position: { x: 0, y: 0 },
    ...patch,
  }))
  vi.spyOn(api.columns, 'remove').mockResolvedValue(undefined)
}
