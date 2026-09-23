import { sessionArea } from '@shared/api/session'
import { BOARD_CODE, BOARD_ID } from '@shared/config/board'
import { create } from 'zustand'

export interface BoardInfo {
  id: string
  code: string
  name: string
}

const STORAGE_KEY = 'checkly:board'

interface BoardState {
  /** The board on screen. Null until the first load finishes. */
  board: BoardInfo | null
  setBoard: (board: BoardInfo | null) => void
}

export const useBoardStore = create<BoardState>((set) => ({
  board: null,
  setBoard: (board) => set({ board }),
}))

/** Id used by writes; the shared team board until a load says otherwise. */
export const currentBoardId = (): string => useBoardStore.getState().board?.id ?? BOARD_ID
export const currentBoardCode = (): string => useBoardStore.getState().board?.code ?? BOARD_CODE

/** Which board to reopen after a reload. Per browser, like the session. */
export function readRememberedBoardId(): string | null {
  try {
    return sessionArea().getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function rememberBoardId(id: string | null): void {
  try {
    if (id) sessionArea().setItem(STORAGE_KEY, id)
    else sessionArea().removeItem(STORAGE_KEY)
  } catch {
    // storage blocked — the board simply resets to the default on reload
  }
}
