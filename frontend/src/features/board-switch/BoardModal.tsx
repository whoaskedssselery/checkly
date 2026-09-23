import { currentBoardCode, useBoardStore } from '@entities/board/model'
import { openBoard } from '@features/board-sync/boardSync'
import { zodResolver } from '@hookform/resolvers/zod'
import { ApiError, api, describeApiError } from '@shared/api'
import { useFocusTrap } from '@shared/lib/useFocusTrap'
import { Button } from '@shared/ui/Button'
import { Input } from '@shared/ui/Field'
import { SpliceTape } from '@shared/ui/SpliceTape'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import styles from './BoardModal.module.scss'

const joinSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Введите код доски')
    .regex(/^CHK-[A-Z0-9]{4}$/i, 'Код выглядит так: CHK-AB12'),
})

const createSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название').max(150, 'Не длиннее 150 символов'),
})

type Mode = 'join' | 'create'

const tabs: { id: Mode; label: string }[] = [
  { id: 'join', label: 'Присоединиться' },
  { id: 'create', label: 'Создать доску' },
]

interface BoardModalProps {
  onClose: () => void
}

export function BoardModal({ onClose }: BoardModalProps) {
  const [mode, setMode] = useState<Mode>('join')
  const [copied, setCopied] = useState(false)
  const board = useBoardStore((s) => s.board)
  const sheetRef = useRef<HTMLDivElement>(null)

  useFocusTrap(sheetRef)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const code = board?.code ?? currentBoardCode()

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard access can be refused; the code is on screen either way.
    }
  }

  return (
    <motion.div
      className={styles.backdrop}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      onClick={onClose}
    >
      <motion.div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label="Доски"
        initial={{ opacity: 0, y: 14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.99 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <SpliceTape className={styles.tape} length={96} thickness={20} angle={-4} />

        <div className={styles.head}>
          <h2 className={styles.title}>Доски</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
            <X size={15} strokeWidth={2.1} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.current}>
            <div>
              <div className={styles.currentLabel}>сейчас открыта</div>
              <div className={styles.currentName}>{board?.name ?? 'Доска команды'}</div>
            </div>
            <button type="button" className={styles.codeBtn} onClick={copy}>
              <span data-numeric>{code}</span>
              <span className={styles.codeHint}>{copied ? 'скопировано' : 'копировать'}</span>
            </button>
          </div>

          <div className={styles.tabs} role="tablist" aria-label="Действие с доской">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={mode === tab.id}
                className={styles.tab}
                onClick={() => setMode(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {mode === 'join' ? <JoinForm onDone={onClose} /> : <CreateForm onDone={onClose} />}
        </div>
      </motion.div>
    </motion.div>
  )
}

function useFormError() {
  const [error, setError] = useState<string | null>(null)
  return { error, setError }
}

function JoinForm({ onDone }: { onDone: () => void }) {
  const { error, setError } = useFormError()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof joinSchema>>({ resolver: zodResolver(joinSchema) })

  const onSubmit = async ({ code }: z.infer<typeof joinSchema>) => {
    setError(null)
    try {
      openBoard(await api.boards.join({ code: code.toUpperCase() }))
      onDone()
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'NOT_FOUND'
          ? 'Доски с таким кодом нет — проверьте код'
          : describeApiError(err),
      )
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <Input
        label="Код доски"
        placeholder="CHK-AB12"
        autoComplete="off"
        autoCapitalize="characters"
        hint="Его показывает тот, кто уже на доске"
        error={errors.code?.message}
        {...register('code')}
      />
      {error && (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      )}
      <Button type="submit" loading={isSubmitting}>
        Присоединиться
      </Button>
    </form>
  )
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const { error, setError } = useFormError()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof createSchema>>({ resolver: zodResolver(createSchema) })

  const onSubmit = async ({ name }: z.infer<typeof createSchema>) => {
    setError(null)
    try {
      openBoard(await api.boards.create({ name }))
      onDone()
    } catch (err) {
      setError(describeApiError(err))
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <Input
        label="Название доски"
        placeholder="Например, Курсовой проект"
        autoComplete="off"
        hint="Появятся колонки Backlog, In progress и Done"
        error={errors.name?.message}
        {...register('name')}
      />
      {error && (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      )}
      <Button type="submit" loading={isSubmitting}>
        Создать доску
      </Button>
    </form>
  )
}
