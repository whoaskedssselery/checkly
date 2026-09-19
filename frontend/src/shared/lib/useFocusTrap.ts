import { type RefObject, useEffect } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Keeps keyboard focus inside an open overlay and hands it back on close.
 *
 * A dialog that declares `aria-modal` but leaves focus outside itself is
 * lying to assistive technology: the task modal used to open with focus
 * still on the menu item that triggered it, and Tab walked straight into
 * the board behind the scrim.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    if (!active) return
    const root = ref.current
    if (!root) return

    const previous = document.activeElement as HTMLElement | null
    const list = () =>
      [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)

    // Land on the first field the overlay is asking about, not on its close
    // button — the close button comes first in the markup, and opening a form
    // with the cursor on "cancel" is a small insult to anyone using a keyboard.
    const items = list()
    const firstField = items.find((el) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName))
    ;(firstField ?? items[0])?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = list()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement

      if (e.shiftKey && (current === first || !root.contains(current))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && current === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previous?.focus?.()
    }
  }, [ref, active])
}
