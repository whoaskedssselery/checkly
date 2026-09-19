import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('renders its children and responds to clicks', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Сохранить</Button>)

    const button = screen.getByRole('button', { name: 'Сохранить' })
    await userEvent.click(button)

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} disabled>
        Отмена
      </Button>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))

    expect(onClick).not.toHaveBeenCalled()
  })
})
