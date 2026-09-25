import { expect, test } from '@playwright/test'
import { signUp } from './helpers'

test.describe('narrow screens', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('a phone can sign up and reach the profile without sideways page scroll', async ({
    page,
  }) => {
    await signUp(page, 'Аня')
    await expect(page.getByRole('button', { name: 'Профиль' })).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
