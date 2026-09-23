import { useBoardStore } from '@entities/board/model'
import { useColumnStore } from '@entities/column/model'
import { api } from '@shared/api'
import { DEMO_EMAIL, DEMO_PASSWORD, resetMockDb } from '@shared/api/mock'
import { setToken } from '@shared/api/session'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BoardModal } from './BoardModal'

describe('BoardModal', () => {
  beforeEach(async () => {
    localStorage.clear()
    resetMockDb()
    const { token } = await api.auth.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
    setToken(token)
    useBoardStore.setState({ board: { id: 'board-1', code: 'CHK-B1D4', name: 'Доска команды' } })
  })

  it('shows the current board and its code', () => {
    render(<BoardModal onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Доски' })).toBeInTheDocument()
    expect(screen.getByText('Доска команды')).toBeInTheDocument()
    expect(screen.getByText('CHK-B1D4')).toBeInTheDocument()
  })

  it('rejects a code in the wrong format without calling the server', async () => {
    const join = vi.spyOn(api.boards, 'join')
    render(<BoardModal onClose={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Код доски'), 'hello')
    await userEvent.click(screen.getByRole('button', { name: 'Присоединиться', hidden: false }))

    expect(await screen.findByText('Код выглядит так: CHK-AB12')).toBeInTheDocument()
    expect(join).not.toHaveBeenCalled()
  })

  it('says so when no board has that code', async () => {
    const onClose = vi.fn()
    render(<BoardModal onClose={onClose} />)

    await userEvent.type(screen.getByLabelText('Код доски'), 'CHK-ZZZZ')
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Присоединиться' }).at(-1) as HTMLElement,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Доски с таким кодом нет')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('joins by code (any letter case), switches the board and closes', async () => {
    const created = await api.boards.create({ name: 'Чужая' })
    const onClose = vi.fn()
    render(<BoardModal onClose={onClose} />)

    await userEvent.type(screen.getByLabelText('Код доски'), created.code.toLowerCase())
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Присоединиться' }).at(-1) as HTMLElement,
    )

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(useBoardStore.getState().board).toMatchObject({ id: created.id, name: 'Чужая' })
    expect(useColumnStore.getState().columns).toHaveLength(3)
  })

  it('creates a board from the second tab and opens it', async () => {
    const onClose = vi.fn()
    render(<BoardModal onClose={onClose} />)

    await userEvent.click(screen.getByRole('tab', { name: 'Создать доску' }))
    await userEvent.type(screen.getByLabelText('Название доски'), 'Курсовой проект')
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Создать доску' }).at(-1) as HTMLElement,
    )

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    const board = useBoardStore.getState().board
    expect(board?.name).toBe('Курсовой проект')
    expect(board?.code).toMatch(/^CHK-[A-Z0-9]{4}$/)
    expect(sessionStorage.getItem('checkly:board')).toBe(board?.id)
  })

  it('will not create a board with a blank name', async () => {
    const create = vi.spyOn(api.boards, 'create')
    render(<BoardModal onClose={vi.fn()} />)

    await userEvent.click(screen.getByRole('tab', { name: 'Создать доску' }))
    await userEvent.type(screen.getByLabelText('Название доски'), '   ')
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Создать доску' }).at(-1) as HTMLElement,
    )

    expect(await screen.findByText('Укажите название')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(<BoardModal onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })
})
