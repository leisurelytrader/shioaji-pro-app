import { expect, test } from '@playwright/test';

test('KD divergence label and arrow sizes can be changed and committed', async ({ page }) => {
    await page.goto('/e2e/kdj-settings-harness.html');
    await page.getByRole('button', { name: '樣式' }).click();
    await expect(page.getByText('背離標籤')).toBeVisible();

    const selects = page.locator('select');
    await expect(selects).toHaveCount(3);
    await selects.nth(1).selectOption('3');
    await selects.nth(2).selectOption('4');
    await page.getByRole('button', { name: '確定' }).click();

    await expect(page.getByTestId('committed')).toHaveText('3-4');
    await page.screenshot({ path: 'test-results/kdj-settings.png', fullPage: true });
});
