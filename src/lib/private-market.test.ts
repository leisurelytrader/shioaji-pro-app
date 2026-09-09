import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    addHistoricalLargeOrderEvents,
    clearLargeOrderEvents,
    getLargeOrderEvents,
    getLargeOrderSettings,
    ingestBidAskForLargeOrders,
    saveLargeOrderSettings,
    subscribeLargeOrderAlerts,
} from './large-order';
import { kdjPrivate, keyLevelsPrivate, sma } from './indicators';
import type { Candle, SseBidAsk } from './types/market';

const bars: Candle[] = Array.from({ length: 12 }, (_, index) => ({
    time: 1770000000 + index * 60,
    open: 100 + index,
    high: 102 + index,
    low: 98 + index,
    close: 101 + index,
    volume: 1,
}));

beforeEach(() => {
    clearLargeOrderEvents();
    saveLargeOrderSettings({
        ...getLargeOrderSettings(), enabled: true, bidThreshold: 100, askThreshold: 200,
        cooldownSeconds: 0, bidLevels: [1], askLevels: [1], trigger: 'cross-above',
    });
});

describe('private indicator profiles', () => {
    it('calculates seven-SMA-compatible series', () => {
        expect(sma(bars, 5)).toHaveLength(8);
        expect(sma(bars, 5).at(-1)?.value).toBe(110);
    });
    it('returns K/D/J and divergence output collections', () => {
        const result = kdjPrivate(bars, 3, 3);
        expect(result.k.length).toBeGreaterThan(0);
        expect(result.d.length).toBe(result.k.length);
        expect(result.j.length).toBe(result.k.length);
    });
    it('creates time-based key level segments', () => {
        const midnight = Date.UTC(2026, 0, 1, 0, 0) / 1000;
        const result = keyLevelsPrivate(bars.map((bar, index) => ({ ...bar, time: midnight + index * 60 })), [{ hour: 0, minute: 0, source: 'open' }]);
        expect(result[0]).toHaveLength(bars.length);
        expect(result[0]![0]!.value).toBe(100);
    });
});

describe('large-order detector', () => {
    const quote = (code: string, time: string, bid: number, ask: number): SseBidAsk => ({
        code, date: '2026-09-07', time, bid_price: ['100'], bid_volume: [bid], ask_price: ['101'], ask_volume: [ask],
    });

    it('emits only when a level crosses above its configured threshold', () => {
        const listener = vi.fn();
        const off = subscribeLargeOrderAlerts(listener);
        ingestBidAskForLargeOrders(quote('CROSS', '09:00:00', 50, 150));
        ingestBidAskForLargeOrders(quote('CROSS', '09:00:01', 120, 220));
        ingestBidAskForLargeOrders(quote('CROSS', '09:00:02', 130, 230));
        expect(listener).toHaveBeenCalledTimes(2);
        expect(listener.mock.calls.map(([event]) => event.side)).toEqual(['bid', 'ask']);
        off();
    });

    it('re-arms after the quantity falls below threshold', () => {
        const listener = vi.fn();
        const off = subscribeLargeOrderAlerts(listener);
        ingestBidAskForLargeOrders(quote('REARM', '09:00:00', 1, 1));
        ingestBidAskForLargeOrders(quote('REARM', '09:00:01', 120, 1));
        ingestBidAskForLargeOrders(quote('REARM', '09:00:02', 1, 1));
        ingestBidAskForLargeOrders(quote('REARM', '09:00:03', 120, 1));
        expect(listener).toHaveBeenCalledTimes(2);
        off();
    });

    it('keeps live and historical events in one deduplicated marker store', () => {
        ingestBidAskForLargeOrders(quote('STORE', '09:00:00', 1, 1));
        ingestBidAskForLargeOrders(quote('STORE', '09:00:01', 120, 1));
        const live = getLargeOrderEvents()[0]!;
        const historical = { ...live, id: `${live.id}-historical`, sourceDepthId: 7 };
        addHistoricalLargeOrderEvents([historical]);
        addHistoricalLargeOrderEvents([historical]);
        expect(getLargeOrderEvents()).toHaveLength(2);
        expect(getLargeOrderEvents()[1]!.id).toBe(historical.id);
    });
});
