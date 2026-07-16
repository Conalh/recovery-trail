import { expect, test } from '@playwright/test'

const METRIC_LABELS = ['HRV', 'RHR', 'RESP', 'SLEEP', 'SRI', 'LOAD']

test('sample data produces an interactive six-signal briefing without third-party requests', async ({
  page,
}) => {
  const externalRequests = new Set<string>()

  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin !== 'http://127.0.0.1:4177') externalRequests.add(url.origin)
  })

  await page.goto('/recovery-trail/')
  await expect(
    page.getByRole('heading', { name: /last two weeks of recovery/i }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Try with sample data' }).click()

  await expect(page.getByRole('heading', { name: 'Briefing' })).toBeVisible()
  await expect(page.getByText('DELOAD', { exact: true })).toBeVisible()

  for (const label of METRIC_LABELS) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible()
  }

  const twentyEightDays = page.getByRole('tab', { name: '28d' })
  await twentyEightDays.click()
  await expect(twentyEightDays).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('button', { name: 'RESP', exact: true }).click()
  await expect(page.getByText('metric expanded', { exact: true })).toBeVisible()

  await page.locator('button[aria-label*=" HRV "]').first().click()
  await expect(page.getByRole('button', { name: 'Close inspector' })).toBeVisible()

  expect([...externalRequests]).toEqual([])
})

test('@screenshots refreshes the README media from the current sample briefing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.goto('/recovery-trail/')
  await page.getByRole('button', { name: 'Try with sample data' }).click()
  await expect(page.getByRole('heading', { name: 'Briefing' })).toBeVisible()
  await page.waitForTimeout(1_200)

  const briefing = page.getByTestId('briefing')
  const heatmap = page.getByTestId('briefing-heatmap')
  const briefingBox = await briefing.boundingBox()
  const heatmapBox = await heatmap.boundingBox()
  if (!briefingBox || !heatmapBox) throw new Error('Briefing overview was not measurable')
  await page.screenshot({
    path: 'docs/media/recovery-trail-hero.png',
    clip: {
      x: briefingBox.x,
      y: briefingBox.y,
      width: briefingBox.width,
      height: heatmapBox.y + heatmapBox.height - briefingBox.y,
    },
  })

  const pageContainer = page.locator('main > div')
  await pageContainer.evaluate((element) => {
    element.style.maxWidth = '900px'
  })
  await page.setViewportSize({ width: 1200, height: 630 })
  await page.screenshot({ path: 'public/og-image.png' })
  await pageContainer.evaluate((element) => {
    element.style.removeProperty('max-width')
  })
  await page.setViewportSize({ width: 1440, height: 1100 })

  await page.getByRole('tab', { name: '28d' }).click()
  await page.getByRole('button', { name: 'HRV', exact: true }).click()
  await expect(page.getByText('metric expanded', { exact: true })).toBeVisible()
  await heatmap.screenshot({ path: 'docs/media/recovery-trail-metric-expanded.png' })

  const rules = page.getByTestId('briefing-rules')
  await rules.scrollIntoViewIfNeeded()
  await rules.screenshot({ path: 'docs/media/recovery-trail-rules.png' })
})
