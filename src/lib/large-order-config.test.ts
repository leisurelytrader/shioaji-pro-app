import { describe, expect, it } from 'vitest';
import { DEFAULT_LARGE_ORDER_SETTINGS } from './large-order';
import {
    createLargeOrderConfigFile,
    normalizeImportedSettings,
    parseLargeOrderConfig,
    serializeLargeOrderConfig,
} from './large-order-config';

describe('large-order JSON config', () => {
    const workbench = { tab: 'history' as const, from: '2026-09-08T09:00', to: '2026-09-08T13:30', queryThreshold: '399' };

    it('round-trips monitoring and workbench settings', () => {
        const source = createLargeOrderConfigFile({ ...DEFAULT_LARGE_ORDER_SETTINGS, bidThreshold: 399 }, workbench);
        const parsed = parseLargeOrderConfig(serializeLargeOrderConfig(source));
        expect(parsed.settings.bidThreshold).toBe(399);
        expect(parsed.workbench).toEqual(workbench);
        expect(parsed.schemaVersion).toBe(1);
    });

    it('rejects unsupported versions and malformed settings', () => {
        expect(() => parseLargeOrderConfig(JSON.stringify({ schemaVersion: 2 }))).toThrow('不支援的設定檔版本');
        expect(() => parseLargeOrderConfig(JSON.stringify({ schemaVersion: 1, exportedAt: 'now', settings: {}, workbench: {} }))).toThrow('設定檔缺少有效');
        expect(() => parseLargeOrderConfig('{bad json')).toThrow();
    });

    it('normalizes unsafe numeric values when applying an imported file', () => {
        const normalized = normalizeImportedSettings({
            ...DEFAULT_LARGE_ORDER_SETTINGS,
            bidThreshold: -1,
            askThreshold: -5,
            cooldownSeconds: -3,
        });
        expect(normalized.bidThreshold).toBe(0);
        expect(normalized.askThreshold).toBe(0);
        expect(normalized.cooldownSeconds).toBe(0);
    });
});
