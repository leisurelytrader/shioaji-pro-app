import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e/tests',
    fullyParallel: true,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: 'http://127.0.0.1:5173',
        trace: 'on-first-retry',
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        headless: true,
        launchOptions: { executablePath: '/usr/bin/chromium' },
    },
    webServer: {
        command: 'pnpm dev --host 127.0.0.1',
        url: 'http://127.0.0.1:5173/e2e/large-order-harness.html',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
    },
});
