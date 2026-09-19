import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from 'react'
import styles from './Field.module.scss'

interface FieldChrome {
  label: string
  error?: string
  hint?: string
  optional?: string
}

function slug(label: string) {
  return label
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/(^-|-$)/g, '')
}

function Shell({
  label,
  error,
  hint,
  optional,
  id,
  children,
}: FieldChrome & { id: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {optional && <span className={styles.optional}>{optional}</span>}
      </label>
      {children}
      {error ? (
        <span id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </span>
      ) : (
        hint && (
          <span id={`${id}-hint`} className={styles.hint}>
            {hint}
          </span>
        )
      )}
    </div>
  )
}

function describedBy(id: string, error?: string, hint?: string) {
  if (error) return `${id}-error`
  if (hint) return `${id}-hint`
  return undefined
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & FieldChrome

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, optional, id, type, className, ...rest }, ref) => {
    const inputId = id ?? slug(label)
    // Dates, times and numbers are measured values — they get the mono
    // face so a column of them lines up instead of drifting.
    const measured = type === 'date' || type === 'time' || type === 'number'
    return (
      <Shell label={label} error={error} hint={hint} optional={optional} id={inputId}>
        <input
          id={inputId}
          ref={ref}
          type={type}
          className={[
            styles.control,
            styles.input,
            measured ? styles.numeric : '',
            error ? styles.hasError : '',
            className ?? '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-invalid={!!error}
          aria-describedby={describedBy(inputId, error, hint)}
          {...rest}
        />
      </Shell>
    )
  },
)
Input.displayName = 'Input'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldChrome

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, optional, id, className, ...rest }, ref) => {
    const generated = useId()
    const fieldId = id ?? `${slug(label)}-${generated}`
    return (
      <Shell label={label} error={error} hint={hint} optional={optional} id={fieldId}>
        <textarea
          id={fieldId}
          ref={ref}
          className={[
            styles.control,
            styles.textarea,
            error ? styles.hasError : '',
            className ?? '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-invalid={!!error}
          aria-describedby={describedBy(fieldId, error, hint)}
          {...rest}
        />
      </Shell>
    )
  },
)
Textarea.displayName = 'Textarea'

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & FieldChrome

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, optional, id, className, children, ...rest }, ref) => {
    const fieldId = id ?? slug(label)
    return (
      <Shell label={label} error={error} hint={hint} optional={optional} id={fieldId}>
        <select
          id={fieldId}
          ref={ref}
          className={[styles.control, styles.select, error ? styles.hasError : '', className ?? '']
            .filter(Boolean)
            .join(' ')}
          aria-invalid={!!error}
          aria-describedby={describedBy(fieldId, error, hint)}
          {...rest}
        >
          {children}
        </select>
      </Shell>
    )
  },
)
Select.displayName = 'Select'
