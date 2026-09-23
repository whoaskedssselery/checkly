import { currentBoardCode, useBoardStore } from '@entities/board/model'
import { BoardModal } from '@features/board-switch/BoardModal'
import { AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import styles from './BoardCode.module.scss'

/**
 * The board chip in the bar. It shows which board you are on and opens the
 * boards dialog: copy this board's code, join another by code, or create one.
 */
export function BoardCode() {
  const [open, setOpen] = useState(false)
  const code = useBoardStore((s) => s.board?.code) ?? currentBoardCode()

  return (
    <>
      <button
        type="button"
        className={styles.code}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Доска ${code}. Открыть: присоединиться к другой доске или создать новую`}
      >
        <svg className={styles.icon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect
            x="2"
            y="2.5"
            width="5"
            height="5"
            rx="1.2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <rect
            x="9"
            y="2.5"
            width="5"
            height="5"
            rx="1.2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <rect
            x="2"
            y="9.5"
            width="5"
            height="4"
            rx="1.2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M11.5 9.6v3.8M9.6 11.5h3.8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <span className={styles.value} data-numeric>
          {code}
        </span>
      </button>

      <AnimatePresence>{open && <BoardModal onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  )
}
