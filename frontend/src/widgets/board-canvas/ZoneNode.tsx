import { COLUMN_HEIGHT, COLUMN_WIDTH } from '@entities/column/model'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { CSSProperties } from 'react'
import styles from './BoardCanvas.module.scss'

export interface ZoneData {
  [key: string]: unknown
  label: string
  color: string
  count: number
  canDelete: boolean
  onDelete: () => void
}

export function ZoneNode({ data }: { data: ZoneData }) {
  return (
    <motion.div
      className={styles.bin}
      style={
        { '--reel-color': data.color, width: COLUMN_WIDTH, height: COLUMN_HEIGHT } as CSSProperties
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
