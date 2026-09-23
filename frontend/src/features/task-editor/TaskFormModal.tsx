import { useColumnStore } from '@entities/column/model'
import {
  freeSpotPosition,
  nextTaskPosition,
  type Task,
  type TaskPriority,
  useTaskStore,
} from '@entities/task/model'
import { zodResolver } from '@hookform/resolvers/zod'
import { useFocusTrap } from '@shared/lib/useFocusTrap'
import { Button } from '@shared/ui/Button'
import { Input, Select, Textarea } from '@shared/ui/Field'
import { SpliceTape } from '@shared/ui/SpliceTape'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import styles from './TaskFormModal.module.scss'

const schema = z.object({
  title: z.string().trim().min(1, 'Укажите название').max(255, 'Не длиннее 255 символов'),
  description: z.string().optional(),
  // empty = "no column": a free-floating card
  columnId: z.string(),
  priority: z.enum(['low', 'medium', 'high']),
  dueDate: z.string().optional(),
  tags: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface TaskFormModalProps {
  task?: Task
  defaultColumnId?: string
  onClose: () => void
}

export function TaskFormModal({ task, defaultColumnId, onClose }: TaskFormModalProps) {
  const columns = useColumnStore((s) => s.columns)
  const tasks = useTaskStore((s) => s.tasks)
  const createTask = useTaskStore((s) => s.createTask)
  const updateTask = useTaskStore((s) => s.updateTask)
  const deleteTask = useTaskStore((s) => s.deleteTask)
  const sheetRef = useRef<HTMLDivElement>(null)

  useFocusTrap(sheetRef)

  // Every overlay needs a way out that is not the mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      columnId: task ? (task.columnId ?? '') : (defaultColumnId ?? columns[0]?.id ?? ''),
      priority: task?.priority ?? 'medium',
      dueDate: task?.dueDate ?? '',
      tags: task?.tags.join(', ') ?? '',
    },
  })

  const onSubmit = (values: FormValues) => {
    const tags = values.tags
      ? values.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : []
    const payload = {
      title: values.title,
      description: values.description || undefined,
      columnId: values.columnId || null,
      priority: values.priority as TaskPriority,
      dueDate: values.dueDate || undefined,
      tags,
    }

    if (task) {
      // Moving a card to another column in the form must move it on the board
      // too: park it under the last card of the new column.
      const newColumn = columns.find((c) => c.id === values.columnId)
      const others = tasks.filter((t) => t.id !== task.id)
      if ((values.columnId || null) !== task.columnId && newColumn) {
        updateTask(task.id, { ...payload, position: nextTaskPosition(newColumn, others) })
      } else if (!values.columnId && task.columnId !== null) {
        // Taken out of its column: it has to actually leave it, not just lose
        // the label while still sitting inside the column's area.
        updateTask(task.id, { ...payload, position: freeSpotPosition(columns, others) })
      } else {
        updateTask(task.id, payload)
      }
    } else {
      const targetColumn = columns.find((c) => c.id === values.columnId)
      // With no column the card starts just above the columns, clear of them.
      createTask(payload, targetColumn ? nextTaskPosition(targetColumn, tasks) : { x: 20, y: -170 })
    }
    onClose()
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
        aria-label={task ? 'Редактировать задачу' : 'Новая задача'}
        initial={{ opacity: 0, y: 14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.99 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <SpliceTape className={styles.tapeTl} length={104} thickness={21} angle={-5} />
        <SpliceTape className={styles.tapeBr} length={84} thickness={19} angle={-4} />

        <div className={styles.head}>
          <h2 className={styles.title}>{task ? 'Редактировать задачу' : 'Новая задача'}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
            <X size={15} strokeWidth={2.1} />
          </button>
        </div>

        <form id="task-form" className={styles.body} onSubmit={handleSubmit(onSubmit)} noValidate>
          <Input
            label="Название"
            placeholder="Что нужно сделать"
            error={errors.title?.message}
            {...register('title')}
          />

          <Textarea
            label="Описание"
            optional="не обязательно"
            rows={3}
            placeholder="Детали, ссылки, договорённости"
            {...register('description')}
          />

          <div className={styles.row}>
            <Select label="Колонка" error={errors.columnId?.message} {...register('columnId')}>
              <option value="">Без колонки</option>
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select label="Приоритет" {...register('priority')}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </div>

          <div className={styles.row}>
            <Input label="Дедлайн" type="date" optional="не обязательно" {...register('dueDate')} />
            <Input
              label="Теги (через запятую)"
              placeholder="frontend, design"
              {...register('tags')}
            />
          </div>
        </form>

        <div className={styles.foot}>
          {task && (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => {
                deleteTask(task.id)
                onClose()
              }}
            >
              Удалить
            </Button>
          )}
          <div className={styles.footRight}>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" form="task-form" size="sm" loading={isSubmitting}>
              {task ? 'Сохранить' : 'Создать'}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
