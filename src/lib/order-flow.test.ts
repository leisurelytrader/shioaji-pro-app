import { describe, expect, it } from 'vitest';
import {
    alignTicksToDepth,
    analyzeDepthTransitions,
    buildFootprint,
    buildVolumeDelta,
    detectAbsorption,
    detectIcebergs,
    normalizeDepth,
    normalizeTick,
} from './order-flow';

const tick = (time: string, price: number, volume: number, tick_type: number) => normalizeTick({ code: 'TXFR1', date: '2026-09-10', time, close: price, volume, tick_type })!;
const depth = (time: string, bid: number, bidVolume: number, ask = bid + 1, askVolume = 10) => normalizeDepth({ code: 'TXFR1', date: '2026-09-10', time, bid_price: [bid], bid_volume: [bidVolume], ask_price: [ask], ask_volume: [askVolume] });

describe('order flow normalization and alignment', () => {
    it('normalizes Shioaji tick types', () => {
        expect(tick('09:00:00.000', 100, 3, 1).aggressor).toBe('buy');
        expect(tick('09:00:01.000', 100, 3, 2).aggressor).toBe('sell');
        expect(tick('09:00:02.000', 100, 3, 0).aggressor).toBe('unknown');
    });

    it('aligns each tick to the latest depth within tolerance', () => {
        const t = tick('09:00:01.000', 100, 3, 1);
        const d = depth('09:00:00.500', 99, 10);
        expect(alignTicksToDepth([t], [d], 1000)[0]!.depth?.levels[0]?.quantity).toBe(10);
        expect(alignTicksToDepth([t], [d], 200)[0]!.depth).toBeNull();
    });
});

describe('Volume Delta and Footprint', () => {
    it('aggregates buy, sell, unknown and cumulative delta', () => {
        const bars = buildVolumeDelta([
            tick('09:00:00.000', 100, 5, 1),
            tick('09:00:10.000', 100, 2, 2),
            tick('09:00:20.000', 101, 1, 0),
        ], 60_000);
        expect(bars[0]).toMatchObject({ buyVolume: 5, sellVolume: 2, unknownVolume: 1, totalVolume: 8, delta: 3, cumulativeDelta: 3 });
    });

    it('builds price cells and buy imbalance', () => {
        const footprint = buildFootprint([
            tick('09:00:00.000', 100, 9, 1),
            tick('09:00:01.000', 100, 1, 2),
        ], 60_000, 1, 3);
        expect(footprint[0]!.cells[0]).toMatchObject({ price: 100, buyVolume: 9, sellVolume: 1, imbalance: 'buy' });
    });
});

describe('depth transitions and signals', () => {
    it('matches a depth reduction to trades before calling it executed', () => {
        const ticks = [tick('09:00:00.500', 99, 8, 2)];
        const depths = [depth('09:00:00.000', 99, 20), depth('09:00:01.000', 99, 12)];
        const events = analyzeDepthTransitions(ticks, depths, { tickSize: 1 });
        expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'executed', side: 'bid', quantity: 8 })]));
    });

    it('detects repeated refills as a suspected iceberg', () => {
        const events = [
            { code: 'TXFR1', time: 1, price: 99, side: 'bid' as const, kind: 'refilled' as const, quantity: 20, matchedTradeVolume: 10, confidence: 0.8 },
            { code: 'TXFR1', time: 2, price: 99, side: 'bid' as const, kind: 'executed' as const, quantity: 60, matchedTradeVolume: 60, confidence: 1 },
            { code: 'TXFR1', time: 3, price: 99, side: 'bid' as const, kind: 'refilled' as const, quantity: 20, matchedTradeVolume: 10, confidence: 0.8 },
            { code: 'TXFR1', time: 4, price: 99, side: 'bid' as const, kind: 'refilled' as const, quantity: 20, matchedTradeVolume: 10, confidence: 0.8 },
        ];
        expect(detectIcebergs(events, { minIcebergRefills: 3, minIcebergExecutedVolume: 50 })[0]).toMatchObject({ side: 'bid', price: 99, refillCount: 3, executedVolume: 60 });
    });

    it('detects sell aggression absorbed at a stable price', () => {
        const signals = detectAbsorption([
            tick('09:00:00.000', 100, 60, 2),
            tick('09:00:01.000', 100, 60, 2),
        ], { tickSize: 1, minAbsorptionVolume: 100, maxAbsorptionRangeTicks: 1 });
        expect(signals[0]).toMatchObject({ side: 'buy', price: 100, aggressiveVolume: 120 });
    });
});
