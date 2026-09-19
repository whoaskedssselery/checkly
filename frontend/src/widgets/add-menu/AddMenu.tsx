import { useColumnStore } from '@entities/column/model'
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react'
import { Button } from '@shared/ui/Button'
import { AnimatePresence, motion } from 'framer-motion'
import { Film, SquareDashed } from 'lucide-react'
import { useState } from 'react'
import styles from './AddMenu.module.scss'

interface AddMenuProps {
  onAddTask: () => void
}

export function AddMenu({ onAddTask }: AddMenuProps) {
  const [open, setOpen] = useState(false)
  const addColumn = useColumnStore((s) => s.addColumn)

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-start',
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })

  const click = useClick(context)
  const dismiss = useDismiss(context)
  const role = useRole(context, { role: 'menu' })
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role])

  return (
    <>
      <Button
        variant="primary"
        size="sm"
        className={styles.trigger}
        ref={refs.setReference}
        {...getReferenceProps()}
      >
        Добавить
      </Button>
      <AnimatePresence>
        {open && (
          <div ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()}>
            <motion.div
              className={styles.menu}
              initial={{ opacity: 0, y: -5, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -5, scale: 0.985 }}
              transition={{ duration: 0.13, ease: [0.16, 1, 0.3, 1] }}
            >
              <button
                type="button"
                className={styles.item}
                role="menuitem"
                onClick={() => {
                  onAddTask()
                  setOpen(false)
                }}
              >
                <Film size={14} strokeWidth={1.9} />
                Добавить задачу
              </button>
              <button
                type="button"
                className={styles.item}
                role="menuitem"
                onClick={() => {
                  addColumn()
                  setOpen(false)
                }}
              >
                <SquareDashed size={14} strokeWidth={1.9} />
                Добавить колонку
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
