import type { Task } from '@entities/task/model'
import { SyncBanner } from '@features/board-sync/SyncBanner'
import { startPresence } from '@features/presence/presenceChannel'
import { TaskFormModal } from '@features/task-editor/TaskFormModal'
import { BenchBar } from '@widgets/bench-bar/BenchBar'
import { BoardCanvas } from '@widgets/board-canvas/BoardCanvas'
import { AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import styles from './BoardPage.module.scss'

type ModalState = { mode: 'create' } | { mode: 'edit'; task: Task } | null

export function BoardPage() {
  const [modal, setModal] = useState<ModalState>(null)

  // Announce myself to other tabs while the board is on screen.
  useEffect(() => startPresence(), [])

  return (
    <div className={styles.wrap}>
      <BenchBar onAddTask={() => setModal({ mode: 'create' })} />
      {/* The board had no landmark and no heading at all: a screen reader
          landed on the page with nothing naming what it had arrived at. The
          name is spoken, not drawn — the bench bar already says it on screen,
          and repeating it as visible type would be chrome for its own sake. */}
      <main className={styles.canvasArea} aria-labelledby="board-heading">
        <h1 className={styles.srOnly} id="board-heading">
          Доска команды
        </h1>
        <BoardCanvas onTaskClick={(task) => setModal({ mode: 'edit', task })} />
        <SyncBanner />
      </main>

      <AnimatePresence>
        {modal && (
          <TaskFormModal
            task={modal.mode === 'edit' ? modal.task : undefined}
            onClose={() => setModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
