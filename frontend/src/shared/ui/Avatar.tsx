import type { CSSProperties, ReactNode } from 'react'
import styles from './Avatar.module.scss'

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

interface AvatarProps {
  name: string
  /** A teammate's colour. Omitted means you — the one filled grease-pencil mark. */
  color?: string
  size?: AvatarSize
  title?: string
  className?: string
}

export function Avatar({ name, color, size = 'sm', title, className }: AvatarProps) {
  return (
    <span
      className={`${styles.avatar} ${styles[size]} ${className ?? ''}`}
      title={title}
      // A teammate's chinagraph is a light colour, so the disc takes a
      // pressed-down version of it and keeps white type on top.
      style={
        color
          ? ({
              '--avatar-color': `color-mix(in srgb, ${color} 60%, #0d1011)`,
            } as CSSProperties)
          : undefined
      }
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

/** Overlapping group of everyone currently on the board. */
export function AvatarStack({
  children,
  gap,
  className,
}: {
  children: ReactNode
  /** The surface the stack sits on, so the cut between discs matches it. */
  gap?: string
  className?: string
}) {
  return (
    <div
      className={`${styles.stack} ${className ?? ''}`}
      style={gap ? ({ '--stack-gap': gap } as CSSProperties) : undefined}
    >
      {children}
    </div>
  )
}
