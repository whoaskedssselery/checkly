import { stubColumnWrites, stubTaskWrites } from '@app/test-api'
import { useTaskStore } from '@entities/task/model'
import { api } from '@shared/api'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  COLUMN_GAP,
  columnAtCard,
  columnHeight,
  columnRects,
  columnsOverlap,
  columnWidth,
  freeCardsInside,
  limitToFreeSpace,
  MIN_COLUMN_HEIGHT,
  MIN_COLUMN_WIDTH,
  nextColumnPosition,
  resizeRect,
  useColumnStore,
} from './model'

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

describe('resizing a column by hand', () => {
  beforeEach(() => {
    useColumnStore.setState({
      columns: [{ id: 'col-a', name: 'A', color: '#000000', position: { x: 0, y: 0 } }],
    })
    useTaskStore.setState({ tasks: [] })
    stubColumnWrites()
  })

  it('a stored height makes the column taller, and cards can only push it further', () => {
    const col = { id: 'a', position: { x: 0, y: 0 }, height: 800 }
    expect(columnHeight(col, [])).toBe(800)
    expect(
      columnHeight(col, [{ columnId: 'a', position: { x: 26, y: 1000 } }]),
    ).toBeGreaterThanOrEqual(1132)
  })

  it('a column can be made shorter than standard, down to the minimum', () => {
    expect(columnHeight({ id: 'a', position: { x: 0, y: 0 }, height: 300 }, [])).toBe(300)
    useColumnStore.getState().resizeColumn('col-a', { x: 0, y: 0, width: 300, height: 10 })
    expect(useColumnStore.getState().columns[0].height).toBe(240)
  })

  it('resizeColumn is local; commitColumnSize saves position and size once', async () => {
    useColumnStore.getState().resizeColumn('col-a', { x: -40, y: -30, width: 420, height: 700 })
    expect(api.columns.update).not.toHaveBeenCalled()
    await useColumnStore.getState().commitColumnSize('col-a')
    expect(api.columns.update).toHaveBeenCalledTimes(1)
    expect(api.columns.update).toHaveBeenCalledWith('col-a', {
      position: { x: -40, y: -30 },
      width: 420,
      height: 700,
    })
  })

  it('a card dropped just below a column still joins it, so dragging down can extend it', () => {
    const col = { id: 'a', position: { x: 0, y: 0 } }
    // centre y = 470 + 40 + 66... within the 90px allowance below the bottom edge
    expect(columnAtCard({ x: 26, y: 470 - 66 + 60 }, [col])).toBe('a')
    expect(columnAtCard({ x: 26, y: 470 + 200 }, [col])).toBeUndefined()
  })
})

describe('resizeRect: dragging an edge or corner', () => {
  const start = { x: 100, y: 100, width: 300, height: 470 }

  it('east / south grow the far edge and keep the origin', () => {
    expect(resizeRect('e', start, 60, 999)).toEqual({ ...start, width: 360 })
    expect(resizeRect('s', start, 999, 80)).toEqual({ ...start, height: 550 })
  })

  it('west / north move the origin so the opposite edge stays put', () => {
    const w = resizeRect('w', start, -50, 0)
    expect(w).toMatchObject({ x: 50, width: 350 })
    expect(w.x + w.width).toBe(start.x + start.width)
    const n = resizeRect('n', start, 0, -70)
    expect(n).toMatchObject({ y: 30, height: 540 })
    expect(n.y + n.height).toBe(start.y + start.height)
  })

  it('a corner resizes both directions at once', () => {
    expect(resizeRect('se', start, 20, 30)).toEqual({ ...start, width: 320, height: 500 })
    const nw = resizeRect('nw', start, -20, -30)
    expect(nw).toEqual({ x: 80, y: 70, width: 320, height: 500 })
  })

  it('never goes below the minimum, and the opposite edge still stays put', () => {
    const w = resizeRect('w', start, 500, 0) // dragged far past the right edge
    expect(w.width).toBe(MIN_COLUMN_WIDTH)
    expect(w.x + w.width).toBe(start.x + start.width)
    const n = resizeRect('n', start, 0, 900)
    expect(n.height).toBe(MIN_COLUMN_HEIGHT)
    expect(n.y + n.height).toBe(start.y + start.height)
  })
})

describe('a wider column', () => {
  it('counts a card in its extra width as inside', () => {
    const col = { id: 'a', position: { x: 0, y: 0 }, width: 700 }
    const card = { x: 450, y: 86 } // centre x = 575, beyond the standard 300
    expect(columnAtCard(card, [{ id: 'a', position: { x: 0, y: 0 } }])).toBeUndefined()
    expect(columnAtCard(card, [col])).toBe('a')
  })

  it('columnWidth falls back to the standard width', () => {
    expect(columnWidth({})).toBe(300)
    expect(columnWidth({ width: 640 })).toBe(640)
  })
})

describe('columns never overlap', () => {
  const left = { x: 0, y: 0, width: 300, height: 470 }
  const right = { x: 340, y: 0, width: 300, height: 470 }

  it('columnsOverlap treats touching and near-touching (inside the gap) as overlap', () => {
    expect(columnsOverlap(left, right)).toBe(false) // 40px apart
    expect(columnsOverlap(left, { ...right, x: 305 })).toBe(true) // inside the gap
    expect(columnsOverlap(left, { ...right, x: 100 })).toBe(true)
    expect(columnsOverlap(left, { ...right, y: 600 })).toBe(false) // different rows
  })

  it('a move that does not hit anything is left alone', () => {
    const to = { ...left, x: -50, y: 30 }
    expect(limitToFreeSpace(left, to, [right])).toEqual(to)
  })

  it('a column dragged into its neighbour stops just short of it', () => {
    const wanted = { ...left, x: 200 } // would overlap right (starts at 340)
    const got = limitToFreeSpace(left, wanted, [right])
    expect(got.x).toBeGreaterThan(0)
    expect(got.x + got.width).toBeLessThanOrEqual(right.x - COLUMN_GAP + 0.01)
    expect(columnsOverlap(got, right)).toBe(false)
  })

  it('widening a column stops at the neighbour', () => {
    const wanted = { ...left, width: 900 }
    const got = limitToFreeSpace(left, wanted, [right])
    expect(got.x + got.width).toBeLessThanOrEqual(right.x - COLUMN_GAP + 0.01)
    expect(got.width).toBeGreaterThan(300)
  })

  it('a column that already overlaps (old data) is not frozen', () => {
    const overlapping = { ...left, x: 250 }
    const wanted = { ...overlapping, x: 260 }
    expect(limitToFreeSpace(overlapping, wanted, [right])).toEqual(wanted)
  })

  it('a new column goes to the right of the rightmost one, on the top row, clear of all', () => {
    const cols = [{ position: { x: 20, y: 0 } }, { position: { x: 340, y: 40 }, width: 500 }]
    expect(nextColumnPosition(cols)).toEqual({ x: 860, y: 0 })
    expect(nextColumnPosition([])).toEqual({ x: 20, y: 0 })
  })

  it('addColumn puts the new column clear of existing ones', () => {
    useColumnStore.setState({
      columns: [
        { id: 'a', name: 'A', color: '#000000', position: { x: 20, y: 0 }, width: 700 },
        { id: 'b', name: 'B', color: '#000000', position: { x: 740, y: 0 } },
      ],
    })
    useTaskStore.setState({ tasks: [] })
    stubColumnWrites()
    useColumnStore.getState().addColumn('C')
    const cols = useColumnStore.getState().columns
    const rects = columnRects(cols, [])
    const added = rects[2]
    expect(rects.slice(0, 2).some((r) => columnsOverlap(added, r))).toBe(false)
  })
})
