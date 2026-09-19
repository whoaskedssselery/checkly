import { type ButtonHTMLAttributes, forwardRef } from 'react'
import styles from './Button.module.scss'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'bench' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, className, children, ...rest }, ref) => (
    <button
      ref={ref}
      className={[
        styles.btn,
        styles[variant],
        size === 'sm' ? styles.sm : '',
        loading ? styles.loading : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-busy={loading || undefined}
      disabled={rest.disabled || loading}
      {...rest}
    >
      <span className={styles.label}>{children}</span>
      {loading && (
        <span className={styles.spinner} aria-hidden="true">
          ····
        </span>
      )}
    </button>
  ),
)
Button.displayName = 'Button'
