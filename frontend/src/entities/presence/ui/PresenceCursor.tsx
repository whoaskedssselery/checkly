import { Avatar } from '@shared/ui/Avatar'
import type { NodeProps } from '@xyflow/react'
import { motion, useReducedMotion } from 'framer-motion'
import type { CSSProperties } from 'react'
import type { PresenceUser } from '../model'
import styles from './PresenceCursor.module.scss'

export function PresenceCursor({ data }: NodeProps & { data: PresenceUser }) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className={styles.wrap}
      style={{ '--live-color': data.color } as CSSProperties}
      // A hand resting on the bench, not a beacon. The drift is small and
      // slow enough to read as someone being there rather than as an
      // animation playing at you; the pulsing ring this used to have was the
      // latter.
      animate={reduceMotion ? undefined : { x: [0, 9, -6, 0], y: [0, -6, 5, 0] }}
      transition={{ duration: 14, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
    >
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
    </motion.div>
  )
}
