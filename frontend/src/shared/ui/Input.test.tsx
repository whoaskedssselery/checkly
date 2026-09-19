import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Input } from './Input'

describe('Input', () => {
  it('associates the visible label with the field', async () => {
    render(<Input label="Email" />)
    const input = screen.getByLabelText('Email')
    await userEvent.type(input, 'a@b.com')
    expect(input).toHaveValue('a@b.com')
  })

  it('shows an error message wired up for screen readers', () => {
    render(<Input label="Email" error="Некорректный email" />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Некорректный email')
  })

  it('renders without an error by default', () => {
    render(<Input label="Email" />)
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
