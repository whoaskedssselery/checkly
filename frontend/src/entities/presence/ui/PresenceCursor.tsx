import { Avatar } from '@shared/ui/Avatar'
import type { NodeProps } from '@xyflow/react'
import type { CSSProperties } from 'react'
import type { PresenceUser } from '../model'
import styles from './PresenceCursor.module.scss'

/** Someone else's pointer on the board, at the position they last sent. */
export function PresenceCursor({ data }: NodeProps & { data: PresenceUser }) {
  return (
    <div className={styles.wrap} style={{ '--live-color': data.color } as CSSProperties}>
      {/* A grease-pencil arrow: one stroke, drawn, matching the icon weight
          used everywhere else. */}
      <svg
        className={styles.arrow}
        width="20"
        height="22"
        viewBox="0 0 20 22"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M2.5 1.6 17 10.2l-6.4 1.1L8 19z"
          fill={data.color}
          stroke="var(--deck)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>

      <span className={styles.tag}>
        <Avatar name={data.name} color={data.color} size="xs" />
        <span className={styles.name}>{data.name}</span>
      </span>
    </div>
  )
}
