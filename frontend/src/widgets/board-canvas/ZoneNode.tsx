import {
  MIN_COLUMN_HEIGHT,
  MIN_COLUMN_WIDTH,
  type Rect,
  type ResizeDir,
  resizeRect,
} from '@entities/column/model'
import { useSyncStore } from '@shared/api/sync'
import { useStore } from '@xyflow/react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { type CSSProperties, type KeyboardEvent, type PointerEvent, useRef } from 'react'
import styles from './BoardCanvas.module.scss'

export interface ZoneData {
  [key: string]: unknown
  label: string
  color: string
  count: number
  /** Where the column is and how big it is drawn right now. */
  x: number
  y: number
  width: number
  height: number
  canDelete: boolean
  onDelete: () => void
  /** Called with the new rectangle while an edge is dragged (or nudged by key). */
  onResize: (rect: Rect) => void
  /** Called once when the resize ends, to save it. */
  onResizeEnd: () => void
}

const KEY_STEP = 24

const EDGES: { dir: ResizeDir; label: string; cursor: string }[] = [
  { dir: 'n', label: 'Изменить высоту колонки сверху', cursor: 'ns-resize' },
  { dir: 's', label: 'Изменить высоту колонки снизу', cursor: 'ns-resize' },
  { dir: 'w', label: 'Изменить ширину колонки слева', cursor: 'ew-resize' },
  { dir: 'e', label: 'Изменить ширину колонки справа', cursor: 'ew-resize' },
]

const CORNERS: { dir: ResizeDir; label: string; cursor: string }[] = [
  { dir: 'nw', label: 'Растянуть колонку за левый верхний угол', cursor: 'nwse-resize' },
  { dir: 'ne', label: 'Растянуть колонку за правый верхний угол', cursor: 'nesw-resize' },
  { dir: 'sw', label: 'Растянуть колонку за левый нижний угол', cursor: 'nesw-resize' },
  { dir: 'se', label: 'Растянуть колонку за правый нижний угол', cursor: 'nwse-resize' },
]

/** Arrow key → how far the dragged edge moves, in canvas units. */
function nudge(dir: ResizeDir, key: string): { dx: number; dy: number } | null {
  const step = KEY_STEP
  if (dir === 's' || dir === 'n') {
    if (key === 'ArrowDown') return { dx: 0, dy: step }
    if (key === 'ArrowUp') return { dx: 0, dy: -step }
  }
  if (dir === 'e' || dir === 'w') {
    if (key === 'ArrowRight') return { dx: step, dy: 0 }
    if (key === 'ArrowLeft') return { dx: -step, dy: 0 }
  }
  return null
}

export function ZoneNode({ data }: { data: ZoneData }) {
  // Pointer distance is in screen pixels; the column lives in canvas units.
  const zoom = useStore((s) => s.transform[2])
  const drag = useRef<{ dir: ResizeDir; px: number; py: number; start: Rect } | null>(null)

  const current = (): Rect => ({ x: data.x, y: data.y, width: data.width, height: data.height })

  const onPointerDown = (dir: ResizeDir) => (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { dir, px: e.clientX, py: e.clientY, start: current() }
    useSyncStore.getState().setInteracting(true)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    data.onResize(resizeRect(d.dir, d.start, (e.clientX - d.px) / zoom, (e.clientY - d.py) / zoom))
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    drag.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    useSyncStore.getState().setInteracting(false)
    data.onResizeEnd()
  }
  const onKeyDown = (dir: ResizeDir) => (e: KeyboardEvent<HTMLDivElement>) => {
    const move = nudge(dir, e.key)
    if (!move) return
    e.preventDefault()
    data.onResize(resizeRect(dir, current(), move.dx, move.dy))
    data.onResizeEnd()
  }

  return (
    <motion.div
      className={styles.bin}
      style={
        { '--reel-color': data.color, width: data.width, height: data.height } as CSSProperties
      }
      initial={{ scale: 0.99 }}
      animate={{ scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* The reel's colour lives in the marks that define its region, so the
          bin needs no swatch and no code chip to say which reel it is. */}
      <span className={styles.gate} aria-hidden="true" />

      <div className={styles.binHead}>
        <span className={styles.binName}>{data.label}</span>
        <span className={styles.binCount} data-numeric>
          {data.count}
        </span>
        <button
          type="button"
          className={`${styles.binTool} nodrag`}
          onClick={data.onDelete}
          disabled={!data.canDelete}
          aria-label="Удалить колонку"
          title={data.canDelete ? 'Удалить колонку' : 'Нельзя удалить последнюю колонку'}
        >
          <X size={13} strokeWidth={2.2} />
        </button>
      </div>

      {EDGES.map(({ dir, label, cursor }) => {
        const vertical = dir === 'e' || dir === 'w'
        return (
          // biome-ignore lint/a11y/useSemanticElements: WAI-ARIA "window splitter" — a focusable separator with a value; <hr> cannot carry focus or keyboard resizing
          <div
            key={dir}
            className={`${styles.resize} nodrag nopan`}
            data-dir={dir}
            style={{ cursor }}
            role="separator"
            aria-orientation={vertical ? 'vertical' : 'horizontal'}
            aria-label={label}
            aria-valuenow={Math.round(vertical ? data.width : data.height)}
            aria-valuemin={vertical ? MIN_COLUMN_WIDTH : MIN_COLUMN_HEIGHT}
            aria-valuemax={5000}
            tabIndex={0}
            onPointerDown={onPointerDown(dir)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onKeyDown={onKeyDown(dir)}
          />
        )
      })}

      {/* Corners are for the mouse and touch only; the edges cover the keyboard. */}
      {CORNERS.map(({ dir, label, cursor }) => (
        <div
          key={dir}
          className={`${styles.resize} nodrag nopan`}
          data-dir={dir}
          style={{ cursor }}
          title={label}
          aria-hidden="true"
          onPointerDown={onPointerDown(dir)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      ))}

      {data.count === 0 && (
        <p className={styles.empty}>
          <span className={styles.emptyGate} aria-hidden="true" />
          перетащите клип сюда,
          <br />
          чтобы склеить его с этим роликом
        </p>
      )}
    </motion.div>
  )
}
