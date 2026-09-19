import { useUserStore } from '@entities/user/model'
import { zodResolver } from '@hookform/resolvers/zod'
import { useUiStore } from '@shared/lib/useUiStore'
import { Button } from '@shared/ui/Button'
import { Input } from '@shared/ui/Field'
import { SpliceTape } from '@shared/ui/SpliceTape'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import styles from './LoginPage.module.scss'

const schema = z.object({
  name: z.string().optional(),
  email: z.string().min(1, 'Укажите email').email('Некорректный email'),
  password: z.string().min(6, 'Минимум 6 символов'),
})

type FormValues = z.infer<typeof schema>

const takes = [
  { id: 'login', label: 'Вход' },
  { id: 'register', label: 'Регистрация' },
] as const

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const login = useUserStore((s) => s.login)
  const setScreen = useUiStore((s) => s.setScreen)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = (values: FormValues) => {
    login(values.email, values.name)
    setScreen('board')
  }

  return (
    <main className={styles.room}>
      <motion.div
        className={styles.sheet}
        // Starts from a visible default: an entrance that fades up from zero
        // leaves a blank screen for anyone whose frames are throttled.
        initial={{ y: 14, scale: 0.988 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      >
        <SpliceTape className={styles.tapeTop} length={116} thickness={22} angle={-1.4} />

        <div className={styles.head}>
          <span className={styles.word}>Checkly</span>
        </div>

        {/* The screen still needs exactly one heading for anyone navigating
            by headings — the visible greeting copy is gone, so the tab
            labels below carry the visible naming and this carries it for a
            screen reader, the same split the board page already uses. */}
        <h1 className={styles.srOnly}>{mode === 'login' ? 'Вход' : 'Регистрация'}</h1>

        <div className={styles.pad}>
          <div className={styles.takes}>
            {takes.map((take) => (
              <button
                key={take.id}
                type="button"
                aria-pressed={mode === take.id}
                className={styles.take}
                onClick={() => setMode(take.id)}
              >
                {take.label}
                {mode === take.id && (
                  <motion.span
                    layoutId="take-mark"
                    className={styles.takeMark}
                    transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                  />
                )}
              </button>
            ))}
          </div>

          <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
            {mode === 'register' && (
              <Input
                label="Имя"
                autoComplete="name"
                placeholder="Как вас подписывать"
                {...register('name')}
              />
            )}
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@team.dev"
              error={errors.email?.message}
              {...register('email')}
            />
            <Input
              label="Пароль"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              hint={mode === 'register' ? 'Минимум 6 символов' : undefined}
              error={errors.password?.message}
              {...register('password')}
            />
            <Button type="submit" className={styles.submit} loading={isSubmitting}>
              {mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
            </Button>
          </form>
        </div>
      </motion.div>
    </main>
  )
}
