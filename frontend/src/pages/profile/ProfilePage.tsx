import { useBoardStore } from '@entities/board/model'
import { useColumnStore } from '@entities/column/model'
import { useTaskStore } from '@entities/task/model'
import { useUserStore } from '@entities/user/model'
import { resetBoard } from '@features/board-sync/boardSync'
import { BOARD_CODE } from '@shared/config/board'
import { useUiStore } from '@shared/lib/useUiStore'
import { Avatar } from '@shared/ui/Avatar'
import { Button } from '@shared/ui/Button'
import { SpliceTape } from '@shared/ui/SpliceTape'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import styles from './ProfilePage.module.scss'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function ProfilePage() {
  const user = useUserStore((s) => s.user)
  const logout = useUserStore((s) => s.logout)
  const setScreen = useUiStore((s) => s.setScreen)
  const code = useBoardStore((s) => s.board?.code ?? BOARD_CODE)
  const clips = useTaskStore((s) => s.tasks.length)
  const reels = useColumnStore((s) => s.columns.length)

  const handleLogout = () => {
    logout()
    resetBoard()
    setScreen('login')
  }

  return (
    <main className={styles.room}>
      <div className={styles.stage}>
        <motion.div
          className={styles.card}
          // Starts from a visible default: an entrance that fades up from zero
          // leaves a blank screen for anyone whose frames are throttled.
          initial={{ y: 14, scale: 0.99 }}
          animate={{ y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        >
          <SpliceTape className={styles.tapeTop} length={110} thickness={21} angle={2} />

          {/* Was a standalone text link floating above the card — its own
              one-off style, disconnected from the card it led back from.
              Folded into the card as the same icon-button the modal's close
              control and a bin's delete control already use, so "leave this
              screen" looks the same wherever it appears. */}
          <button
            type="button"
            className={styles.back}
            onClick={() => setScreen('board')}
            aria-label="Назад к доске"
          >
            <ArrowLeft size={16} strokeWidth={2} />
          </button>

          <div className={styles.head}>
            <Avatar name={user?.name ?? '?'} size="xl" />
            <div className={styles.who}>
              {/* The person is what this screen is about, so their name is its
                  heading rather than a styled paragraph. */}
              <h1 className={styles.name}>{user?.name ?? 'Гость'}</h1>
              <p className={styles.email}>{user?.email ?? '—'}</p>
            </div>
          </div>

          {/* Only facts this app actually knows. Nothing here is invented
              activity data — there is no backend behind it yet. */}
          <dl className={styles.facts}>
            <div>
              <dt className={styles.factKey}>код доски</dt>
              <dd className={styles.factVal} data-numeric>
                {code}
              </dd>
            </div>
            <div>
              <dt className={styles.factKey}>клипов</dt>
              <dd className={styles.factVal} data-numeric>
                {pad(clips)}
              </dd>
            </div>
            <div>
              <dt className={styles.factKey}>роликов</dt>
              <dd className={styles.factVal} data-numeric>
                {pad(reels)}
              </dd>
            </div>
          </dl>

          <div className={styles.foot}>
            <Button variant="danger" size="sm" className={styles.logout} onClick={handleLogout}>
              Выйти
            </Button>
          </div>
        </motion.div>
      </div>
    </main>
  )
}
