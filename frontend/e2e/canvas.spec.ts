import { expect, test } from '@playwright/test'
import { addTask, box, card, centre, drag, must, serverBoard, signUp, zone } from './helpers'

/**
 * The canvas is the product: cards and columns are dragged with a real mouse
 * and every result is checked against what the SERVER stored, not just what
 * the screen shows.
 */
test.describe('dragging cards', () => {
  test('a card dropped into another column joins it, and that is saved', async ({
    page,
    request,
  }) => {
    await signUp(page, 'Аня')
    await addTask(page, 'Переносимая')

    const from = await centre(card(page, 'Переносимая'))
    const target = await centre(zone(page, 'In progress'))
    await drag(page, from, { x: target.x, y: target.y })

    await expect
      .poll(async () => {
        const b = await serverBoard(page, request)
        const t = b.tasks.find((x) => x.title === 'Переносимая')
        return t?.columnId === b.columns.find((c) => c.name === 'In progress')?.id
      })
      .toBe(true)

    await page.reload()
    const b = await serverBoard(page, request)
    const box = await card(page, 'Переносимая').boundingBox()
    const inProgress = await zone(page, 'In progress').boundingBox()
    expect(b.tasks[0].position.x).toBeGreaterThanOrEqual(
      b.columns.find((c) => c.name === 'In progress')?.position.x ?? 0,
    )
    expect(box && inProgress && box.x >= inProgress.x - 1).toBe(true)
  })

  test('a card dropped outside every column belongs to no column and stays where it was put', async ({
    page,
    request,
  }) => {
    await signUp(page, 'Аня')
    await addTask(page, 'Свободная')

    const from = await centre(card(page, 'Свободная'))
    const backlog = await box(zone(page, 'Backlog'))
    // straight up, well above the columns
    await drag(page, from, { x: from.x, y: Math.max(60, backlog.y - 90) })

    await expect.poll(async () => (await serverBoard(page, request)).tasks[0]?.columnId).toBeNull()
  })

  test('a free card does not travel with a column; a card inside one does', async ({
    page,
    request,
  }) => {
    await signUp(page, 'Аня')
    await addTask(page, 'В колонке')
    await addTask(page, 'Вне колонки')

    // put the second card outside every column
    const free = await centre(card(page, 'Вне колонки'))
    const backlog = await box(zone(page, 'Backlog'))
    await drag(page, free, { x: free.x, y: Math.max(60, backlog.y - 90) })
    await expect
      .poll(
        async () =>
          (await serverBoard(page, request)).tasks.find((t) => t.title === 'Вне колонки')?.columnId,
      )
      .toBeNull()

    const before = await serverBoard(page, request)
    const col = must(before.columns.find((c) => c.name === 'Backlog'))
    const inside = must(before.tasks.find((t) => t.title === 'В колонке'))
    const outside = must(before.tasks.find((t) => t.title === 'Вне колонки'))

    // drag the Backlog column by an empty spot near its bottom
    const zoneBox = await box(zone(page, 'Backlog'))
    await drag(
      page,
      { x: zoneBox.x + zoneBox.width / 2, y: zoneBox.y + zoneBox.height - 40 },
      { x: zoneBox.x + zoneBox.width / 2 + 60, y: zoneBox.y + zoneBox.height - 40 + 40 },
    )

    await expect
      .poll(
        async () =>
          (await serverBoard(page, request)).columns.find((c) => c.name === 'Backlog')?.position.x,
      )
      .not.toBe(col.position.x)

    const after = await serverBoard(page, request)
    const movedCol = must(after.columns.find((c) => c.name === 'Backlog'))
    const dx = movedCol.position.x - col.position.x
    const dy = movedCol.position.y - col.position.y
    const insideAfter = must(after.tasks.find((t) => t.id === inside.id))
    const outsideAfter = must(after.tasks.find((t) => t.id === outside.id))

    expect(insideAfter.position.x).toBeCloseTo(inside.position.x + dx, 0)
    expect(insideAfter.position.y).toBeCloseTo(inside.position.y + dy, 0)
    expect(outsideAfter.position).toEqual(outside.position)
    expect(outsideAfter.columnId).toBeNull()
  })

  test('dropping a column over a free card takes the card in', async ({ page, request }) => {
    await signUp(page, 'Аня')
    await addTask(page, 'Ловись')

    // detach the card and park it right above the Done column
    const c0 = await centre(card(page, 'Ловись'))
    const done = await box(zone(page, 'Done'))
    await drag(page, c0, { x: done.x + done.width / 2, y: Math.max(60, done.y - 90) })
    await expect.poll(async () => (await serverBoard(page, request)).tasks[0]?.columnId).toBeNull()

    // lift the Done column straight up so it covers the card
    const cardBox = await box(card(page, 'Ловись'))
    const grab = { x: done.x + done.width / 2, y: done.y + done.height - 40 }
    await drag(page, grab, { x: grab.x, y: cardBox.y + cardBox.height / 2 + done.height - 60 })

    await expect
      .poll(async () => {
        const b = await serverBoard(page, request)
        return b.tasks[0]?.columnId === b.columns.find((c) => c.name === 'Done')?.id
      })
      .toBe(true)
  })
})

test.describe('resizing columns', () => {
  test('the keyboard resizes: arrows on a focused edge, saved and kept after a reload', async ({
    page,
    request,
  }) => {
    await signUp(page, 'Аня')
    const handle = zone(page, 'Backlog').getByRole('separator', {
      name: 'Изменить высоту колонки снизу',
    })
    const start = Number(await handle.getAttribute('aria-valuenow'))

    await handle.focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(handle).toHaveAttribute('aria-valuenow', String(start + 72))

    await expect
      .poll(
        async () =>
          (await serverBoard(page, request)).columns.find((c) => c.name === 'Backlog')?.height,
      )
      .toBe(start + 72)

    await page.reload()
    await expect(
      zone(page, 'Backlog').getByRole('separator', { name: 'Изменить высоту колонки снизу' }),
    ).toHaveAttribute('aria-valuenow', String(start + 72))
  })

  test('dragging the bottom edge with the mouse makes the column taller, and that is saved', async ({
    page,
    request,
  }) => {
    await signUp(page, 'Аня')
    const handle = zone(page, 'In progress').getByRole('separator', {
      name: 'Изменить высоту колонки снизу',
    })
    const before = Number(await handle.getAttribute('aria-valuenow'))
    const from = await centre(handle)

    await drag(page, from, { x: from.x, y: from.y + 90 })

    await expect
      .poll(async () => Number(await handle.getAttribute('aria-valuenow')))
      .toBeGreaterThan(before + 40)
    await expect
      .poll(
        async () =>
          ((await serverBoard(page, request)).columns.find((c) => c.name === 'In progress')
            ?.height ?? 0) >
          before + 40,
      )
      .toBe(true)
  })

  test('dragging the right edge widens the column; dragging the left edge keeps the right edge in place', async ({
    page,
    request,
  }) => {
    await signUp(page, 'Аня')
    // Done is the right-most column, so it has room to grow both ways without meeting a neighbour on the right
    const right = zone(page, 'Done').getByRole('separator', {
      name: 'Изменить ширину колонки справа',
    })
    const r0 = await centre(right)
    await drag(page, r0, { x: r0.x + 80, y: r0.y })
    await expect
      .poll(
        async () =>
          ((await serverBoard(page, request)).columns.find((c) => c.name === 'Done')?.width ?? 0) >
          340,
      )
      .toBe(true)

    const b1 = await serverBoard(page, request)
    const done1 = must(b1.columns.find((c) => c.name === 'Done'))
    const rightEdge = done1.position.x + (done1.width ?? 300)

    // the left edge of Done sits next to In progress: pull it LEFT only a little, into the gap between them
    const left = zone(page, 'Done').getByRole('separator', {
      name: 'Изменить ширину колонки слева',
    })
    const l0 = await centre(left)
    await drag(page, l0, { x: l0.x - 12, y: l0.y })

    await expect
      .poll(
        async () =>
          (await serverBoard(page, request)).columns.find((c) => c.name === 'Done')?.width,
      )
      .not.toBe(done1.width)
    const done2 = must((await serverBoard(page, request)).columns.find((c) => c.name === 'Done'))
    expect(done2.position.x + (done2.width ?? 300)).toBeCloseTo(rightEdge, 0)
  })

  test('a column stops at its neighbour instead of driving over it', async ({ page, request }) => {
    await signUp(page, 'Аня')
    const handle = zone(page, 'Backlog').getByRole('separator', {
      name: 'Изменить ширину колонки справа',
    })
    const from = await centre(handle)

    // pull the Backlog edge far to the right, deep into In progress
    await drag(page, from, { x: from.x + 700, y: from.y })

    await expect
      .poll(
        async () =>
          ((await serverBoard(page, request)).columns.find((c) => c.name === 'Backlog')?.width ??
            0) > 300,
      )
      .toBe(true)
    const b = await serverBoard(page, request)
    const backlog = must(b.columns.find((c) => c.name === 'Backlog'))
    const next = must(b.columns.find((c) => c.name === 'In progress'))
    expect(backlog.position.x + (backlog.width ?? 300)).toBeLessThanOrEqual(next.position.x)
  })

  test('cards that make a column too small for them stretch it', async ({ page }) => {
    await signUp(page, 'Аня')
    const handle = zone(page, 'Backlog').getByRole('separator', {
      name: 'Изменить высоту колонки снизу',
    })
    const before = Number(await handle.getAttribute('aria-valuenow'))
    for (const t of ['Раз', 'Два', 'Три', 'Четыре', 'Пять']) await addTask(page, t)
    await expect
      .poll(async () => Number(await handle.getAttribute('aria-valuenow')))
      .toBeGreaterThan(before)
  })
})
