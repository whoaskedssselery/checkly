import { expect, test } from '@playwright/test'
import { addTask, boardCode, card, closeAll, newUser, serverBoard } from './helpers'

/** Two people, two browsers, one board: what one does the other sees. */
test.describe('working together', () => {
  test('joining by code, presence, and live task updates', async ({ browser, request }) => {
    const owner = await newUser(browser, 'Аня')
    const guest = await newUser(browser, 'Борис')
    try {
      const code = await boardCode(owner.page)

      await guest.page.getByRole('button', { name: /^Доска CHK-/ }).click()
      await guest.page.getByRole('tab', { name: 'Присоединиться' }).click()
      await guest.page.getByLabel('Код доски').fill(code.toLowerCase())
      await guest.page.getByRole('button', { name: 'Присоединиться', exact: true }).click()
      await expect(
        guest.page.getByRole('button', { name: new RegExp(`^Доска ${code}`) }),
      ).toBeVisible()

      // presence: each sees the other on the board
      await expect(owner.page.getByTitle('Борис')).toBeVisible()
      await expect(guest.page.getByTitle('Аня')).toBeVisible()

      // a task created by the owner shows up for the guest without a reload
      await addTask(owner.page, 'Общая задача')
      await expect(card(guest.page, 'Общая задача')).toBeVisible()
      expect((await serverBoard(owner.page, request)).tasks.map((t) => t.title)).toContain(
        'Общая задача',
      )

      // and its deletion disappears for the guest as well
      await card(owner.page, 'Общая задача').click()
      await owner.page.getByRole('button', { name: 'Удалить', exact: true }).click()
      await expect(card(guest.page, 'Общая задача')).toHaveCount(0)
    } finally {
      await closeAll(owner.context, guest.context)
    }
  })

  test('an unknown board code is refused', async ({ browser }) => {
    const user = await newUser(browser, 'Вера')
    try {
      await user.page.getByRole('button', { name: /^Доска CHK-/ }).click()
      await user.page.getByRole('tab', { name: 'Присоединиться' }).click()
      await user.page.getByLabel('Код доски').fill('CHK-ZZZZ')
      await user.page.getByRole('button', { name: 'Присоединиться', exact: true }).click()
      await expect(user.page.getByRole('alert')).toBeVisible()
    } finally {
      await closeAll(user.context)
    }
  })
})
