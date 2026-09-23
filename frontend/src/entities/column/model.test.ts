import { stubColumnWrites, stubTaskWrites } from '@app/test-api'
import { useTaskStore } from '@entities/task/model'
import { beforeEach, describe, expect, it } from 'vitest'
import { columnAtCard, columnHeight, freeCardsInside, useColumnStore } from './model'

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
    stubColumnWrites()
    stubTaskWrites()
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

describe('columnAtCard', () => {
  const cols = [
    { id: 'a', position: { x: 0, y: 0 } },
    { id: 'b', position: { x: 340, y: 0 } },
  ]

  it('finds the column a card is dropped in', () => {
    expect(columnAtCard({ x: 26, y: 86 }, cols)).toBe('a')
    expect(columnAtCard({ x: 366, y: 86 }, cols)).toBe('b')
  })

  it('a card dropped in the gap or outside every column belongs to none', () => {
    expect(columnAtCard({ x: 1000, y: 86 }, cols)).toBeUndefined()
    expect(columnAtCard({ x: 26, y: -400 }, cols)).toBeUndefined()
    expect(columnAtCard({ x: 26, y: 900 }, cols)).toBeUndefined()
  })

  it('uses the card centre: a card hanging mostly out does not count as inside', () => {
    // top-left corner is inside column a (x 0..300), but the centre (x+125) is past its edge
    expect(columnAtCard({ x: 290, y: 86 }, [cols[0]])).toBeUndefined()
    // ...and the same card is inside when most of it is over the column
    expect(columnAtCard({ x: 100, y: 86 }, [cols[0]])).toBe('a')
  })
})

describe('freeCardsInside', () => {
  const col = { id: 'a', position: { x: 0, y: 0 } }

  it('takes in free cards the column now covers, and only those', () => {
    const tasks = [
      { id: 'inside-free', columnId: null, position: { x: 30, y: 90 } },
      { id: 'outside-free', columnId: null, position: { x: 900, y: 90 } },
      { id: 'inside-other', columnId: 'b', position: { x: 30, y: 90 } },
    ]
    expect(freeCardsInside(col, tasks).map((t) => t.id)).toEqual(['inside-free'])
  })

  it('leaves cards that already belong to a column (even this one) untouched', () => {
    const tasks = [{ id: 'mine', columnId: 'a', position: { x: 30, y: 90 } }]
    expect(freeCardsInside(col, tasks)).toEqual([])
  })
})

describe('columns grow with their cards', () => {
  const col = { id: 'a', position: { x: 0, y: 0 } }

  it('keeps the standard height when the cards fit', () => {
    expect(columnHeight(col, [{ columnId: 'a', position: { x: 26, y: 86 } }])).toBe(470)
    expect(columnHeight(col, [])).toBe(470)
  })

  it('grows to hold a card that would hang below the standard height, with room to spare', () => {
    const h = columnHeight(col, [{ columnId: 'a', position: { x: 26, y: 700 } }])
    expect(h).toBeGreaterThanOrEqual(700 + 132)
  })

  it('shrinks back once the low card is gone, and ignores other columns and free cards', () => {
    const tasks = [
      { columnId: 'b', position: { x: 0, y: 2000 } },
      { columnId: null, position: { x: 0, y: 3000 } },
    ]
    expect(columnHeight(col, tasks)).toBe(470)
  })

  it('accounts for a column that sits lower on the canvas', () => {
    const low = { id: 'c', position: { x: 0, y: 500 } }
    expect(columnHeight(low, [{ columnId: 'c', position: { x: 26, y: 586 } }])).toBe(470)
  })

  it('a grown column counts cards in its extra area as inside (columnAtCard with heights)', () => {
    const card = { x: 26, y: 560 } // centre y = 626, beyond 470
    expect(columnAtCard(card, [col])).toBeUndefined()
    expect(columnAtCard(card, [col], { a: 800 })).toBe('a')
  })
})
