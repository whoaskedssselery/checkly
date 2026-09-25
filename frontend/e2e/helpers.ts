import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
} from '@playwright/test'

export const API = process.env.E2E_API_URL ?? 'http://localhost:3001'

let counter = 0
export const uniqueEmail = (tag: string) =>
  `${tag}.${Date.now()}.${counter++}.${Math.random().toString(36).slice(2, 6)}@e2e.test`

/** Open the app and register a brand-new account through the real form. */
export async function signUp(page: Page, name: string, email = uniqueEmail('user')) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Регистрация' }).click()
  await page.getByLabel('Имя').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Пароль').fill('secret12')
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click()
  await expect(page.getByRole('button', { name: /^Доска CHK-/ })).toBeVisible()
  return email
}

export async function signInAs(page: Page, email: string, password = 'secret12') {
  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Пароль').fill(password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('button', { name: /^Доска CHK-/ })).toBeVisible()
}

/** A second person: a separate browser context has its own storage, so its own login. */
export async function newUser(browser: Browser, name: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  const email = await signUp(page, name)
  return { context, page, email }
}

export const boardCode = async (page: Page): Promise<string> => {
  const label = await page.getByRole('button', { name: /^Доска CHK-/ }).getAttribute('aria-label')
  const match = label?.match(/CHK-[A-Z0-9]{4}/)
  if (!match) throw new Error(`no board code in "${label}"`)
  return match[0]
}

export async function addTask(page: Page, title: string, column?: string) {
  await page.getByRole('button', { name: 'Добавить', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Добавить задачу' }).click()
  await page.getByLabel('Название').fill(title)
  if (column !== undefined) await page.getByLabel('Колонка').selectOption({ label: column })
  await page.getByRole('button', { name: 'Создать', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(card(page, title)).toBeVisible()
}

export const card = (page: Page, title: string): Locator =>
  page.locator('.react-flow__node-task', { hasText: title })

export const zone = (page: Page, name: string): Locator =>
  page.locator('.react-flow__node-zone', { hasText: name })

/** Unwrap a lookup that the test has already proven exists. */
export function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected the value to exist')
  return value
}

/** Bounding box of an element that must be on screen. */
export async function box(locator: Locator) {
  const b = await locator.boundingBox()
  if (!b) throw new Error('element is not on screen')
  return b
}

/** Centre of an element on screen. */
export async function centre(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element is not on screen')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box }
}

/** A real mouse drag — down, a stepped move, up — the way a person does it. */
export async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 18 })
  await page.mouse.up()
}

/** What the SERVER holds for the signed-in user's open board (proof that a change was saved). */
export async function serverBoard(page: Page, request: APIRequestContext) {
  const token = await page.evaluate(() => localStorage.getItem('checkly:token'))
  const headers = { Authorization: `Bearer ${token}` }
  const boards = await (await request.get(`${API}/boards`, { headers })).json()
  const code = await boardCode(page)
  const summary = boards.find((b: { code: string }) => b.code === code)
  const board = await (await request.get(`${API}/boards/${summary.id}`, { headers })).json()
  return board as {
    id: string
    columns: {
      id: string
      name: string
      position: { x: number; y: number }
      width?: number
      height?: number
    }[]
    tasks: {
      id: string
      title: string
      columnId: string | null
      position: { x: number; y: number }
    }[]
  }
}

export async function closeAll(...contexts: BrowserContext[]) {
  for (const c of contexts) await c.close()
}
