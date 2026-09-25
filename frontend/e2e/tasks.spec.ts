import { expect, test } from '@playwright/test'
import { addTask, card, serverBoard, signUp } from './helpers'

test.describe('tasks', () => {
  test('a created task appears at once, is saved on the server, and survives a reload', async ({
    page,
    request,
  }) => {
    await signUp(page, 'Аня')
    await addTask(page, 'Написать отчёт')

    const saved = (await serverBoard(page, request)).tasks.find((t) => t.title === 'Написать отчёт')
    expect(saved).toBeDefined()

    await page.reload()
    await expect(card(page, 'Написать отчёт')).toBeVisible()
  })

  test('a new card goes into the chosen column', async ({ page, request }) => {
    await signUp(page, 'Аня')
    await addTask(page, 'Уже в работе', 'In progress')

    const board = await serverBoard(page, request)
    const inProgress = board.columns.find((c) => c.name === 'In progress')
    expect(board.tasks.find((t) => t.title === 'Уже в работе')?.columnId).toBe(inProgress?.id)
  })

  test('new cards in the same column do not land on top of each other', async ({ page }) => {
    await signUp(page, 'Аня')
    await addTask(page, 'Первая')
    await addTask(page, 'Вторая')
    await addTask(page, 'Третья')

    const boxes = await Promise.all(
      ['Первая', 'Вторая', 'Третья'].map((t) => card(page, t).boundingBox()),
    )
    for (let i = 0; i < boxes.length - 1; i++) {
      const upper = boxes[i]
      const lower = boxes[i + 1]
      if (!upper || !lower) throw new Error('card not on screen')
      expect(lower.y).toBeGreaterThanOrEqual(upper.y + upper.height - 1)
    }
  })

  test('editing a card saves the change', async ({ page, request }) => {
    await signUp(page, 'Аня')
    await addTask(page, 'Старое название')

    await card(page, 'Старое название').click()
    await page.getByLabel('Название').fill('Новое название')
    await page.getByLabel('Приоритет').selectOption('high')
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(card(page, 'Новое название')).toBeVisible()

    const saved = (await serverBoard(page, request)).tasks.find((t) => t.title === 'Новое название')
    expect(saved).toBeDefined()
    await page.reload()
    await expect(card(page, 'Новое название')).toContainText(/high/i)
  })

  test('deleting a card removes it here and on the server', async ({ page, request }) => {
    await signUp(page, 'Аня')
    await addTask(page, 'Лишняя')

    await card(page, 'Лишняя').click()
    await page.getByRole('button', { name: 'Удалить', exact: true }).click()
    await expect(card(page, 'Лишняя')).toHaveCount(0)

    await expect.poll(async () => (await serverBoard(page, request)).tasks.length).toBe(0)
  })

  test('a title made of spaces is refused on the form', async ({ page }) => {
    await signUp(page, 'Аня')
    await page.getByRole('button', { name: 'Добавить', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Добавить задачу' }).click()
    await page.getByLabel('Название').fill('     ')
    await page.getByRole('button', { name: 'Создать', exact: true }).click()
    await expect(page.getByText('Укажите название')).toBeVisible()
  })

  test('Escape closes the dialog without saving', async ({ page }) => {
    await signUp(page, 'Аня')
    await page.getByRole('button', { name: 'Добавить', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Добавить задачу' }).click()
    await expect(page.getByRole('dialog', { name: 'Новая задача' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('choosing "Без колонки" in the form takes the card out of its column', async ({
    page,
    request,
  }) => {
    await signUp(page, 'Аня')
    await addTask(page, 'Уйду из колонки')

    await card(page, 'Уйду из колонки').click()
    await page.getByLabel('Колонка').selectOption({ label: 'Без колонки' })
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click()

    await expect
      .poll(
        async () =>
          (await serverBoard(page, request)).tasks.find((t) => t.title === 'Уйду из колонки')
            ?.columnId,
      )
      .toBeNull()
    // and it really moved out of the columns' area, above them
    const board = await serverBoard(page, request)
    const t = board.tasks[0]
    expect(t.position.y).toBeLessThan(Math.min(...board.columns.map((c) => c.position.y)))
  })

  test('changing the column in the form moves the card there', async ({ page, request }) => {
    await signUp(page, 'Аня')
    await addTask(page, 'Переезд')

    await card(page, 'Переезд').click()
    await page.getByLabel('Колонка').selectOption({ label: 'Done' })
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click()

    await expect
      .poll(async () => {
        const b = await serverBoard(page, request)
        const done = b.columns.find((c) => c.name === 'Done')
        const t = b.tasks.find((x) => x.title === 'Переезд')
        return t?.columnId === done?.id && (t?.position.x ?? 0) >= (done?.position.x ?? 1e9)
      })
      .toBe(true)
  })
})
