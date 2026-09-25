import { expect, test } from '@playwright/test'
import { signInAs, signUp, uniqueEmail } from './helpers'

test.describe('sign-in and accounts', () => {
  test('a new account lands on its own board with the three starter columns', async ({ page }) => {
    await signUp(page, 'Аня')

    for (const name of ['Backlog', 'In progress', 'Done']) {
      await expect(page.locator('.react-flow__node-zone', { hasText: name })).toBeVisible()
    }
    await expect(page.getByRole('button', { name: 'Профиль' })).toContainText('Аня')
  })

  test('the session survives a reload', async ({ page }) => {
    await signUp(page, 'Аня')
    await page.reload()
    await expect(page.getByRole('button', { name: /^Доска CHK-/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Вход' })).toHaveCount(0)
  })

  test('logging out returns to the login screen and a reload stays there', async ({ page }) => {
    await signUp(page, 'Аня')
    await page.getByRole('button', { name: 'Профиль' }).click()
    await page.getByRole('button', { name: 'Выйти' }).click()
    await expect(page.getByRole('heading', { name: 'Вход' })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Вход' })).toBeVisible()
  })

  test('signing in again brings the same board back', async ({ page }) => {
    const email = await signUp(page, 'Аня')
    const before = await page
      .getByRole('button', { name: /^Доска CHK-/ })
      .getAttribute('aria-label')
    await page.getByRole('button', { name: 'Профиль' }).click()
    await page.getByRole('button', { name: 'Выйти' }).click()

    await signInAs(page, email)
    await expect(page.getByRole('button', { name: /^Доска CHK-/ })).toHaveAttribute(
      'aria-label',
      before ?? '',
    )
  })

  test('a wrong password is refused with one generic message', async ({ page }) => {
    const email = await signUp(page, 'Аня')
    await page.getByRole('button', { name: 'Профиль' }).click()
    await page.getByRole('button', { name: 'Выйти' }).click()

    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Пароль').fill('wrong-password')
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page.getByRole('alert')).toHaveText('Неверный email или пароль')

    // an unknown email gets exactly the same words
    await page.getByLabel('Email').fill(uniqueEmail('ghost'))
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page.getByRole('alert')).toHaveText('Неверный email или пароль')
  })

  test('registering an email that is taken (any letter case) says so', async ({ page }) => {
    const email = await signUp(page, 'Аня')
    await page.getByRole('button', { name: 'Профиль' }).click()
    await page.getByRole('button', { name: 'Выйти' }).click()

    await page.getByRole('button', { name: 'Регистрация' }).click()
    await page.getByLabel('Email').fill(email.toUpperCase())
    await page.getByLabel('Пароль').fill('secret12')
    await page.getByRole('button', { name: 'Зарегистрироваться' }).click()
    await expect(page.getByRole('alert')).toHaveText('Этот email уже зарегистрирован')
  })

  test('the form validates before it talks to the server', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Email').fill('not-an-email')
    await page.getByLabel('Пароль').fill('123')
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page.getByText('Некорректный email')).toBeVisible()
    await expect(page.getByText('Минимум 6 символов')).toBeVisible()
  })

  test('the demo account from the seed can sign in', async ({ page }) => {
    await signInAs(page, 'demo@checkly.dev', 'demo1234')
    await expect(page.getByRole('button', { name: 'Профиль' })).toContainText('Демо')
  })

  test('an expired session sends the user back to the login screen', async ({ page }) => {
    await signUp(page, 'Аня')
    // the access token AND the refresh token stop working
    await page.evaluate(() => {
      localStorage.setItem('checkly:token', 'expired.or.forged')
      localStorage.setItem('checkly:refresh', 'expired.or.forged')
    })
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Вход' })).toBeVisible()
  })
})
