import { useTaskStore } from '@entities/task/model'
import { beforeEach, describe, expect, it } from 'vitest'
import { useColumnStore } from './model'

describe('useColumnStore', () => {
  beforeEach(() => {
    // Reset both stores to a known baseline before every test — they're
    // independent Zustand stores but removeColumn reaches into the task
    // store, so isolation matters for both.
    useColumnStore.setState({
      columns: [
        { id: 'col-a', name: 'A', color: 'red', position: { x: 0, y: 0 } },
        { id: 'col-b', name: 'B', color: 'blue', position: { x: 300, y: 0 } },
      ],
    })
    useTaskStore.setState({ tasks: [] })
  })

  it('addColumn appends a new column with a cascading position', () => {
    const before = useColumnStore.getState().columns.length
    useColumnStore.getState().addColumn('Review')
    const columns = useColumnStore.getState().columns
    expect(columns.length).toBe(before + 1)
    expect(columns.at(-1)?.name).toBe('Review')
  })

  it('addColumn falls back to a generated name when none is given', () => {
    useColumnStore.getState().addColumn()
    const last = useColumnStore.getState().columns.at(-1)
    expect(last?.name).toMatch(/^Колонка \d+$/)
  })

  it("removeColumn reassigns that column's tasks to the first remaining column", () => {
    useTaskStore.setState({
      tasks: [
        {
          id: 't1',
          boardId: 'b1',
          columnId: 'col-b',
          title: 'Orphaned',
          priority: 'medium',
          tags: [],
          position: { x: 0, y: 0 },
          createdAt: '',
          updatedAt: '',
        },
      ],
    })

    useColumnStore.getState().removeColumn('col-b')

    expect(useColumnStore.getState().columns.map((c) => c.id)).toEqual(['col-a'])
    expect(useTaskStore.getState().tasks[0].columnId).toBe('col-a')
  })

  it('removeColumn refuses to delete the last remaining column', () => {
    useColumnStore.setState({
      columns: [{ id: 'col-only', name: 'Only', color: 'red', position: { x: 0, y: 0 } }],
    })

    useColumnStore.getState().removeColumn('col-only')

    expect(useColumnStore.getState().columns).toHaveLength(1)
  })

  it('moveColumnPosition updates only the targeted column', () => {
    useColumnStore.getState().moveColumnPosition('col-a', { x: 999, y: 999 })
    const columns = useColumnStore.getState().columns
    expect(columns.find((c) => c.id === 'col-a')?.position).toEqual({ x: 999, y: 999 })
    expect(columns.find((c) => c.id === 'col-b')?.position).toEqual({ x: 300, y: 0 })
  })
})
