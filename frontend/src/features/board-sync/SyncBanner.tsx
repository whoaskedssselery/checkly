import { useSyncStore } from '@shared/api/sync'
import { X } from 'lucide-react'
import styles from './SyncBanner.module.scss'

/** Says so when a change made on screen could not be saved and was undone. */
export function SyncBanner() {
  const error = useSyncStore((s) => s.error)
  const pending = useSyncStore((s) => s.pending)
  const dismiss = useSyncStore((s) => s.dismiss)

  if (error) {
    return (
      <div className={styles.banner} role="alert">
        <span>{error}. Изменение отменено.</span>
        <button type="button" className={styles.close} onClick={dismiss} aria-label="Закрыть">
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    )
  }

  return (
    <div className={styles.status} role="status" aria-live="polite">
      {pending > 0 ? 'Сохраняем…' : ''}
    </div>
  )
}
