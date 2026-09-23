import { useBoardStore } from '@entities/board/model'
import { peersOnBoard, usePresenceStore } from '@entities/presence/model'
import { useUserStore } from '@entities/user/model'
import { useUiStore } from '@shared/lib/useUiStore'
import { Avatar, AvatarStack } from '@shared/ui/Avatar'
import { AddMenu } from '@widgets/add-menu/AddMenu'
import styles from './BenchBar.module.scss'
import { BoardCode } from './BoardCode'

interface BenchBarProps {
  onAddTask: () => void
}

export function BenchBar({ onAddTask }: BenchBarProps) {
  const user = useUserStore((s) => s.user)
  const setScreen = useUiStore((s) => s.setScreen)
  const boardId = useBoardStore((s) => s.board?.id)
  const peers = usePresenceStore((s) => s.peers)
  // One avatar per person, even if they have the board open in two tabs.
  const here = [...new Map(peersOnBoard(peers, boardId).map((p) => [p.userId, p])).values()]

  return (
    <header className={styles.bar}>
      <span className={styles.word}>Checkly</span>

      <span className={styles.rule} aria-hidden="true" />
      <BoardCode />

      <AddMenu onAddTask={onAddTask} />

      <span className={styles.spacer} />

      {/* The stack is self-explanatory by shape; the caption is for screen
          readers rather than another labelled widget in the corner. */}
      <span className={styles.stack}>
        <AvatarStack gap="var(--deck-lift)">
          <span className={styles.srOnly}>на доске сейчас</span>
          {here.map((p) => (
            <Avatar key={p.userId} name={p.name} color={p.color} size="md" title={p.name} />
          ))}
        </AvatarStack>
      </span>

      <span className={styles.rule} aria-hidden="true" />

      <button
        type="button"
        className={styles.profile}
        onClick={() => setScreen('profile')}
        aria-label="Профиль"
      >
        <Avatar name={user?.name ?? '?'} size="md" />
        <span className={styles.meName}>{user?.name ?? 'Гость'}</span>
      </button>
    </header>
  )
}
