import { expect, test } from '@playwright/test';

const historicalItem = {
    id: 'history-1', code: 'E2E1', side: 'ask', level: 1, price: 101,
    quantity: 320, threshold: 199, date: '2026-09-08', time: '09:10:00', eventTime: 1788829800000,
};

test.beforeEach(async ({ page }) => {
    await page.route('**/api/private/depth-alerts**', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [historicalItem], total: 1 }) });
    });
    await page.goto('/e2e/large-order-harness.html');
});

test('five-level crossing propagates to the K-line marker stream', async ({ page }) => {
    await page.getByRole('button', { name: '模擬即時跨越' }).click();
    await expect(page.getByTestId('status')).toHaveText('已模擬委買跨越 199 口');
    await expect(page.getByTestId('chart-marker')).toHaveText('委買 250口 09:00:01');
    await expect(page.getByTestId('marker-count')).toHaveText('1');
});

test('historical query adds markers to the same K-line event stream', async ({ page }) => {
    await page.getByRole('button', { name: '載入歷史大單' }).click();
    await expect(page.getByTestId('status')).toHaveText('已載入 1 筆歷史大單');
    await expect(page.getByTestId('chart-marker')).toHaveText('委賣 320口 09:10:00');
});

test('clearing the selected symbol removes its K-line markers', async ({ page }) => {
    await page.getByRole('button', { name: '載入歷史大單' }).click();
    await expect(page.getByTestId('marker-count')).toHaveText('1');
    await page.getByRole('button', { name: '清除標記' }).click();
    await expect(page.getByTestId('marker-count')).toHaveText('0');
});
