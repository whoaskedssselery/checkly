import { BOARD_CODE } from '@shared/config/board'
import { useEffect, useRef, useState } from 'react'
import styles from './BoardCode.module.scss'

/**
 * Copies the board code so it can be sent to whoever should join.
 *
 * Copying is the whole feature for now, and it is a real one — there is no
 * invite endpoint to call, and a button that opened an empty "invite" dialog
 * would promise a server that does not exist yet.
 */
export function BoardCode() {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(BOARD_CODE)
    } catch {
      // Clipboard access can be refused; the code is on screen either way.
      return
    }
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1800)
  }

  return (
    <button
      type="button"
      className={`${styles.code} ${copied ? styles.copied : ''}`}
      onClick={copy}
      aria-label={`Код доски ${BOARD_CODE}. Скопировать, чтобы пригласить участника`}
    >
      <svg className={styles.icon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
        {copied ? (
          <path
            d="M3 8.6 6.2 12 13 4.6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <rect
              x="5.4"
              y="5.4"
              width="8.2"
              height="8.2"
              rx="1.6"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M10.6 5.4V3.9A1.5 1.5 0 0 0 9.1 2.4H3.9a1.5 1.5 0 0 0-1.5 1.5v5.2a1.5 1.5 0 0 0 1.5 1.5h1.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
      <span className={styles.value} data-numeric>
        {BOARD_CODE}
      </span>
      {copied && <span className={styles.hint}>скопировано</span>}
    </button>
  )
}
