import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    clearLargeOrderWorkbenchState,
    loadLargeOrderWorkbenchState,
    saveLargeOrderWorkbenchState,
} from './large-order-workbench-state';

function storage() {
    const values = new Map<string, string>();
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
    };
}

beforeEach(() => {
    vi.stubGlobal('localStorage', storage());
});

describe('large-order workbench persistence', () => {
    it('restores tab, time range, and threshold after reload', () => {
        const state = {
            tab: 'history' as const,
            from: '2026-09-08T09:00',
            to: '2026-09-08T13:30',
            queryThreshold: '399',
        };
        saveLargeOrderWorkbenchState(state);
        expect(loadLargeOrderWorkbenchState()).toEqual(state);
    });

    it('falls back safely for malformed or invalid state', () => {
        localStorage.setItem('sj-pro-large-order-workbench-v1', '{bad json');
        expect(loadLargeOrderWorkbenchState()).toEqual({ tab: 'monitor', from: '', to: '', queryThreshold: '' });
        localStorage.setItem('sj-pro-large-order-workbench-v1', JSON.stringify({ tab: 'invalid', from: 1 }));
        expect(loadLargeOrderWorkbenchState()).toEqual({ tab: 'monitor', from: '', to: '', queryThreshold: '' });
    });

    it('can clear the saved UI state independently of monitoring settings', () => {
        saveLargeOrderWorkbenchState({ tab: 'history', from: '', to: '', queryThreshold: '199' });
        clearLargeOrderWorkbenchState();
        expect(loadLargeOrderWorkbenchState()).toEqual({ tab: 'monitor', from: '', to: '', queryThreshold: '' });
    });
});
