import { useSyncExternalStore } from 'react';
import { apiGet } from './api';
import { closedModules } from './features';
import type { SseBidAsk } from './types/market';

export type DepthSide = 'bid' | 'ask';
export type DepthLevel = 1 | 2 | 3 | 4 | 5;
export type LargeOrderTrigger = 'cross-above' | 'always-above';

export interface LargeOrderSettings {
    enabled: boolean;
    bidThreshold: number;
    askThreshold: number;
    bidLevels: DepthLevel[];
    askLevels: DepthLevel[];
    trigger: LargeOrderTrigger;
    cooldownSeconds: number;
    showOnChart: boolean;
    sound: boolean;
    popup: boolean;
    desktop: boolean;
}

export const DEFAULT_LARGE_ORDER_SETTINGS: LargeOrderSettings = {
    enabled: false,
    bidThreshold: 0,
    askThreshold: 0,
    bidLevels: [1, 2, 3, 4, 5],
    askLevels: [1, 2, 3, 4, 5],
    trigger: 'cross-above',
    cooldownSeconds: 3,
    showOnChart: true,
    sound: false,
    popup: true,
    desktop: false,
};

const SETTINGS_KEY = 'sj-pro-large-order-settings-v1';
const SETTINGS_BY_CODE_KEY = 'sj-pro-large-order-settings-by-code-v1';
let settings = loadSettings();
let settingsByCode = loadSettingsByCode();
const settingsListeners = new Set<() => void>();
let settingsVersion = 0;
const eventListeners = new Set<() => void>();
const alertListeners = new Set<(event: LargeOrderEvent) => void>();
const events: LargeOrderEvent[] = [];
let eventVersion = 0;
const previous = new Map<string, Map<string, number>>();
const lastAlert = new Map<string, number>();

export interface LargeOrderEvent {
    id: string;
    code: string;
    side: DepthSide;
    level: DepthLevel;
    price: number;
    quantity: number;
    threshold: number;
    date: string;
    time: string;
    eventTime: number;
}

export function subscribeLargeOrderAlerts(listener: (event: LargeOrderEvent) => void) {
    alertListeners.add(listener);
    return () => alertListeners.delete(listener);
}

export async function requestDesktopNotificationPermission() {
    if (typeof Notification === 'undefined') return 'unsupported' as const;
    if (Notification.permission === 'default') return Notification.requestPermission();
    return Notification.permission;
}

function loadSettings(): LargeOrderSettings {
    try {
        const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
        return {
            ...DEFAULT_LARGE_ORDER_SETTINGS,
            ...(closedModules.largeOrder ?? {}),
            ...(parsed ?? {}),
        };
    } catch {
        return {
            ...DEFAULT_LARGE_ORDER_SETTINGS,
            ...(closedModules.largeOrder ?? {}),
        };
    }
}

function loadSettingsByCode(): Record<string, LargeOrderSettings> {
    try {
        const parsed = JSON.parse(localStorage.getItem(SETTINGS_BY_CODE_KEY) ?? '{}');
        if (!parsed || typeof parsed !== 'object') return {};
        return Object.fromEntries(
            Object.entries(parsed).map(([code, value]) => [code, {
                ...settingsFromDefaults(),
                ...(value as Partial<LargeOrderSettings>),
            }]),
        );
    } catch {
        return {};
    }
}

function settingsFromDefaults(): LargeOrderSettings {
    return { ...DEFAULT_LARGE_ORDER_SETTINGS, ...(closedModules.largeOrder ?? {}) };
}

export function getLargeOrderSettings(code?: string) {
    return code ? (settingsByCode[code] ?? settings) : settings;
}
export function subscribeLargeOrderSettings(fn: () => void) {
    settingsListeners.add(fn);
    return () => settingsListeners.delete(fn);
}
export function saveLargeOrderSettings(next: LargeOrderSettings, code?: string) {
    if (code) {
        settingsByCode = { ...settingsByCode, [code]: { ...next } };
        try { localStorage.setItem(SETTINGS_BY_CODE_KEY, JSON.stringify(settingsByCode)); } catch { /* private storage unavailable */ }
    } else {
        settings = { ...next };
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private storage unavailable */ }
    }
    settingsVersion += 1;
    settingsListeners.forEach((listener) => listener());
}

/** Reset the global defaults and remove every symbol-specific override. */
export function clearAllLargeOrderSettings() {
    settings = { ...settingsFromDefaults() };
    settingsByCode = {};
    try {
        localStorage.removeItem(SETTINGS_KEY);
        localStorage.removeItem(SETTINGS_BY_CODE_KEY);
    } catch { /* private storage unavailable */ }
    previous.clear();
    lastAlert.clear();
    settingsVersion += 1;
    settingsListeners.forEach((listener) => listener());
}
function getLargeOrderSettingsVersion() { return settingsVersion; }
export function useLargeOrderSettings(code?: string) {
    useSyncExternalStore(subscribeLargeOrderSettings, getLargeOrderSettingsVersion);
    return getLargeOrderSettings(code);
}
export function subscribeLargeOrderEvents(fn: () => void) {
    eventListeners.add(fn);
    return () => eventListeners.delete(fn);
}
export function getLargeOrderEvents() { return events; }
function getLargeOrderEventVersion() { return eventVersion; }
export function clearLargeOrderEvents(code?: string) {
    if (code) {
        for (let i = events.length - 1; i >= 0; i -= 1) {
            if (events[i]!.code === code) events.splice(i, 1);
        }
    } else {
        events.splice(0, events.length);
    }
    eventVersion += 1;
    eventListeners.forEach((listener) => listener());
}
export function addHistoricalLargeOrderEvents(items: HistoricalLargeOrderResult[]) {
    for (const item of items) {
        if (!events.some((event) => event.id === item.id)) events.push(item);
    }
    while (events.length > 2000) events.shift();
    eventVersion += 1;
    eventListeners.forEach((listener) => listener());
}
export function useLargeOrderEvents() {
    useSyncExternalStore(subscribeLargeOrderEvents, getLargeOrderEventVersion);
    return events;
}

function eventTimestamp(date: string, time: string) {
    const value = Date.parse(`${date}T${time}+08:00`);
    return Number.isFinite(value) ? value : Date.now();
}

export function ingestBidAskForLargeOrders(bidask: SseBidAsk) {
    const currentSettings = getLargeOrderSettings(bidask.code);
    if (!currentSettings.enabled) return;
    const stateKey = bidask.code;
    const old = previous.get(stateKey) ?? new Map<string, number>();
    const next = new Map<string, number>();
    const now = eventTimestamp(bidask.date, bidask.time);
    const check = (side: DepthSide, levels: DepthLevel[], threshold: number, volumes: number[], prices: string[]) => {
        // Zero means "not configured", never "alert on any quantity".
        if (threshold <= 0) return;
        for (const level of levels) {
            const index = level - 1;
            const quantity = Number(volumes[index] ?? 0);
            const key = `${side}:${level}`;
            next.set(key, quantity);
            const prior = old.get(key) ?? 0;
            const crossed = quantity >= threshold && prior < threshold;
            const allowed = now - (lastAlert.get(`${stateKey}:${key}`) ?? 0) >= currentSettings.cooldownSeconds * 1000;
            if (quantity >= threshold && (currentSettings.trigger === 'always-above' || crossed) && allowed) {
                const event: LargeOrderEvent = {
                    id: `${stateKey}-${side}-${level}-${now}-${quantity}`,
                    code: stateKey,
                    side,
                    level,
                    price: Number(prices[index] ?? 0),
                    quantity,
                    threshold,
                    date: bidask.date,
                    time: bidask.time,
                    eventTime: now,
                };
                events.push(event);
                while (events.length > 2000) events.shift();
                lastAlert.set(`${stateKey}:${key}`, now);
                eventVersion += 1;
                eventListeners.forEach((listener) => listener());
                alertListeners.forEach((listener) => listener(event));
            }
        }
    };
    check('bid', currentSettings.bidLevels, currentSettings.bidThreshold, bidask.bid_volume, bidask.bid_price);
    check('ask', currentSettings.askLevels, currentSettings.askThreshold, bidask.ask_volume, bidask.ask_price);
    previous.set(stateKey, next);
}

export interface HistoricalLargeOrderQuery {
    symbol: string;
    from: string;
    to: string;
    sides: DepthSide[];
    levels: DepthLevel[];
    minQuantity: number;
}

export interface HistoricalLargeOrderResult extends LargeOrderEvent {
    sourceDepthId?: number;
}

export async function searchHistoricalLargeOrders(query: HistoricalLargeOrderQuery) {
    const params = new URLSearchParams({
        symbol: query.symbol,
        from: query.from,
        to: query.to,
        sides: query.sides.join(','),
        levels: query.levels.join(','),
        min_quantity: String(query.minQuantity),
    });
    const privateBase = (import.meta.env.VITE_PRIVATE_HISTORY_BASE as string | undefined)?.replace(/\/$/, '');
    const path = `/api/private/depth-alerts?${params.toString()}`;
    return apiGet<{ items: HistoricalLargeOrderResult[]; total: number }>(
        privateBase ? `${privateBase}${path}` : path,
    );
}
