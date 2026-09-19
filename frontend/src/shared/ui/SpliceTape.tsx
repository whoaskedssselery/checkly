import { type MotionProps, motion } from 'framer-motion'
import type { CSSProperties } from 'react'
import styles from './SpliceTape.module.scss'

interface SpliceTapeProps extends MotionProps {
  /** Strip length in px. */
  length?: number
  /** Strip thickness in px. */
  thickness?: number
  /** Rotation in degrees; the strip is placed by the parent's class. */
  angle?: number
  className?: string
  style?: CSSProperties
}

/**
 * The one piece of tape in the product. Everything that is held down on
 * the bench — a clip, a bin's header plate, a sheet — is held by this
 * component, so the tape is literally the same tape everywhere.
 */
export function SpliceTape({
  length = 88,
  thickness = 20,
  angle = 0,
  className,
  style,
  ...motionProps
}: SpliceTapeProps) {
  return (
    <motion.span
      aria-hidden="true"
      className={`${styles.tape} ${className ?? ''}`}
      style={
        {
          '--tape-len': `${length}px`,
          '--tape-thick': `${thickness}px`,
          '--tape-angle': `${angle}deg`,
          ...style,
        } as CSSProperties
      }
      {...motionProps}
    />
  )
}
