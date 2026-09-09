import {
    DEFAULT_LARGE_ORDER_SETTINGS,
    type DepthLevel,
    type LargeOrderSettings,
    type LargeOrderTrigger,
} from './large-order';
import type { LargeOrderWorkbenchState } from './large-order-workbench-state';

export const LARGE_ORDER_CONFIG_SCHEMA = 1 as const;

export interface LargeOrderConfigFile {
    schemaVersion: typeof LARGE_ORDER_CONFIG_SCHEMA;
    exportedAt: string;
    settings: LargeOrderSettings;
    workbench: LargeOrderWorkbenchState;
}

function isLevelList(value: unknown): value is DepthLevel[] {
    return Array.isArray(value) && value.every((item) => item === 1 || item === 2 || item === 3 || item === 4 || item === 5);
}

function isSettings(value: unknown): value is LargeOrderSettings {
    if (!value || typeof value !== 'object') return false;
    const item = value as Record<string, unknown>;
    return typeof item.enabled === 'boolean'
        && typeof item.bidThreshold === 'number' && Number.isFinite(item.bidThreshold)
        && typeof item.askThreshold === 'number' && Number.isFinite(item.askThreshold)
        && isLevelList(item.bidLevels) && isLevelList(item.askLevels)
        && (item.trigger === 'cross-above' || item.trigger === 'always-above')
        && typeof item.cooldownSeconds === 'number' && Number.isFinite(item.cooldownSeconds)
        && typeof item.showOnChart === 'boolean'
        && typeof item.sound === 'boolean'
        && typeof item.popup === 'boolean'
        && typeof item.desktop === 'boolean';
}

function isWorkbench(value: unknown): value is LargeOrderWorkbenchState {
    if (!value || typeof value !== 'object') return false;
    const item = value as Record<string, unknown>;
    return (item.tab === 'monitor' || item.tab === 'history')
        && typeof item.from === 'string'
        && typeof item.to === 'string'
        && typeof item.queryThreshold === 'string';
}

export function createLargeOrderConfigFile(
    settings: LargeOrderSettings,
    workbench: LargeOrderWorkbenchState,
): LargeOrderConfigFile {
    return {
        schemaVersion: LARGE_ORDER_CONFIG_SCHEMA,
        exportedAt: new Date().toISOString(),
        settings: { ...settings, bidLevels: [...settings.bidLevels], askLevels: [...settings.askLevels] },
        workbench: { ...workbench },
    };
}

export function serializeLargeOrderConfig(file: LargeOrderConfigFile): string {
    return JSON.stringify(file, null, 2);
}

export function parseLargeOrderConfig(raw: string): LargeOrderConfigFile {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('設定檔格式錯誤');
    const item = parsed as Record<string, unknown>;
    if (item.schemaVersion !== LARGE_ORDER_CONFIG_SCHEMA) throw new Error('不支援的設定檔版本');
    if (typeof item.exportedAt !== 'string' || !isSettings(item.settings) || !isWorkbench(item.workbench)) {
        throw new Error('設定檔缺少有效的大單監控或工作台設定');
    }
    return {
        schemaVersion: LARGE_ORDER_CONFIG_SCHEMA,
        exportedAt: item.exportedAt,
        settings: item.settings,
        workbench: item.workbench,
    };
}

export function normalizeImportedSettings(settings: LargeOrderSettings): LargeOrderSettings {
    return {
        ...DEFAULT_LARGE_ORDER_SETTINGS,
        ...settings,
        bidThreshold: Math.max(0, settings.bidThreshold),
        askThreshold: Math.max(0, settings.askThreshold),
        cooldownSeconds: Math.max(0, settings.cooldownSeconds),
        bidLevels: [...settings.bidLevels],
        askLevels: [...settings.askLevels],
    };
}

export function isLargeOrderTrigger(value: unknown): value is LargeOrderTrigger {
    return value === 'cross-above' || value === 'always-above';
}
