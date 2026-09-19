import { SpliceTape } from '@shared/ui/SpliceTape'
import { Handle, type NodeProps, Position } from '@xyflow/react'
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import type { Task } from '../model'
import { priorityLabel } from '../model'
import styles from './TaskCard.module.scss'

function hash(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

// A clip does not lie perfectly square on a bench. The tilt is derived from
// the task id so it stays put across re-renders instead of re-rolling on
// every drag.
function tiltFor(id: string): number {
  return ((hash(id) % 34) - 17) / 10 // -1.7deg .. 1.7deg
}

// Film carries a latent edge code every foot, which is how an editor names
// a shot before it has a name. Derived from the id so it is stable and
// honest — it identifies this card, it is not invented data about the task.
const ROLL = 'ABCDEFGHJKLMNPRSTUVWXYZ'
function edgeCode(id: string): string {
  const h = hash(id)
  return `${ROLL[h % ROLL.length]}${((h >> 5) % 90) + 10}·${String((h >> 9) % 10000).padStart(4, '0')}`
}

export type TaskCardData = Task & { columnColor?: string; reelCode?: string }

export function TaskCard({ id, data, dragging, selected }: NodeProps & { data: TaskCardData }) {
  const task = data
  const reduceMotion = useReducedMotion()
  const tilt = reduceMotion ? 0 : tiltFor(id)
  const tape = useAnimationControls()
  const tapedTo = useRef(task.columnId)

  // The authored moment of this product: a clip that lands in a new bin is
  // taped down again, and you see the tape go on. Only on an actual move —
  // a card that re-renders for any other reason must not re-tape itself.
  useEffect(() => {
    if (tapedTo.current === task.columnId) return
    tapedTo.current = task.columnId
    if (reduceMotion) return
    tape.start({
      scaleX: [0.12, 1.06, 1],
      opacity: [0, 1, 1],
      transition: { duration: 0.42, ease: [0.16, 1, 0.3, 1] },
    })
  }, [task.columnId, tape, reduceMotion])

  const overdue = !!task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10)

  return (
    <motion.div
      className={styles.clip}
      // Settles into place from a visible default rather than fading in from
      // nothing — a clip that never arrives is worse than one that never moves.
      initial={reduceMotion ? false : { y: 9, rotate: tilt * 2.4, scale: 0.982 }}
      animate={{
        y: 0,
        scale: dragging ? 1.035 : 1,
        rotate: dragging ? 0 : tilt,
        boxShadow: dragging
          ? 'var(--lift-drag)'
          : selected
            ? 'var(--lift-hover)'
            : 'var(--lift-rest)',
      }}
      whileHover={
        dragging ? undefined : { rotate: tilt / 3, y: -3, boxShadow: 'var(--lift-hover)' }
      }
      transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.7 }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      <span className={styles.perf} aria-hidden="true" />

      <div className={styles.frame}>
        <div className={styles.head}>
          <span className={styles.code} data-numeric>
            {edgeCode(id)}
          </span>
          <span className={`${styles.prio} ${task.priority === 'high' ? styles.high : ''}`}>
            {priorityLabel[task.priority]}
          </span>
        </div>

        <div className={styles.titleWrap}>
          <p className={styles.title}>{task.title}</p>
          {task.priority === 'high' && (
            <svg
              className={styles.swipe}
              viewBox="0 0 200 9"
              preserveAspectRatio="none"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 6.2c26-2.4 54-3.4 84-3 28 .4 62 1.6 112 3.6"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                opacity="0.72"
              />
              <path
                d="M10 4.1c30-1.5 56-2 92-1.6 22 .3 48 .9 88 2.1"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.38"
              />
            </svg>
          )}
        </div>

        {task.description && <p className={styles.brief}>{task.description}</p>}

        <div className={styles.meta}>
          {task.tags[0] && <span className={styles.tag}>{`#${task.tags[0]}`}</span>}
          {task.dueDate && (
            <span
              className={`${styles.due} ${overdue ? styles.overdue : ''}`}
              data-numeric
              title={overdue ? 'Срок прошёл' : undefined}
            >
              {task.dueDate.slice(5)}
            </span>
          )}
        </div>
      </div>

      <SpliceTape className={styles.tape} length={88} thickness={20} angle={-2.4} animate={tape} />

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </motion.div>
  )
}
