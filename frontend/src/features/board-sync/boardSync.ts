import { readRememberedBoardId, rememberBoardId, useBoardStore } from '@entities/board/model'
import { useColumnStore } from '@entities/column/model'
import { useTaskStore } from '@entities/task/model'
import type { BoardDto } from '@shared/api'
import { api } from '@shared/api'
import { queryClient } from '@shared/api/queryClient'

/** Put a loaded board on screen and remember it for the next reload. */
export function openBoard(board: BoardDto): void {
  useBoardStore.getState().setBoard({ id: board.id, code: board.code, name: board.name })
  rememberBoardId(board.id)
  useColumnStore.getState().hydrate(board.columns)
  useTaskStore.getState().hydrate(board.tasks.map((t) => ({ ...t })))
}

function fetchBoard(id: string): Promise<BoardDto> {
  // Going through the query client means two concurrent loads (StrictMode
  // double-mount, login racing the boot restore) share one request.
  return queryClient.fetchQuery({
    queryKey: ['board', id],
    queryFn: () => api.boards.get(id),
    staleTime: 0,
  })
}

/**
 * Open the board the user last had open, else their first one. A brand-new
 * account already owns a board (made at registration); an account that
 * somehow has none gets one rather than an empty, unusable screen.
 */
export async function hydrateBoard(): Promise<void> {
  const boards = await queryClient.fetchQuery({
    queryKey: ['boards'],
    queryFn: () => api.boards.list(),
    staleTime: 0,
  })
  const remembered = readRememberedBoardId()
  const pick = boards.find((b) => b.id === remembered) ?? boards[0]
  if (!pick) {
    openBoard(await api.boards.create({ name: 'Моя доска' }))
    return
  }
  openBoard(await fetchBoard(pick.id))
}

/** Reload the open board from the server, e.g. after someone else changed it. */
export async function refreshOpenBoard(): Promise<void> {
  const open = useBoardStore.getState().board
  if (!open) return
  openBoard(await api.boards.get(open.id))
}

/** Forget everything belonging to the previous session (called on logout). */
export function resetBoard(): void {
  queryClient.clear()
  rememberBoardId(null)
  useBoardStore.getState().setBoard(null)
  useColumnStore.getState().hydrate([])
  useTaskStore.getState().hydrate([])
}
