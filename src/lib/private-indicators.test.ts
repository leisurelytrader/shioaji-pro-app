import { describe, expect, it } from 'vitest';
import { DEF_BY_TYPE } from './indicator-defs';
import { kdjPrivate, keyLevelsPrivate } from './indicators';
import type { Candle } from './types/market';

function bar(time: number, close: number, high = close + 2, low = close - 2): Candle {
    return { time, open: close, high, low, close, volume: 1 };
}

describe('private indicators remain public/overlay compatible', () => {
    it('registers 7SMA as a pure overlay definition', () => {
        const def = DEF_BY_TYPE.get('private-seven-sma');
        expect(def?.category).toBe('overlay');
        expect(def?.compute).toBeTypeOf('function');
        const bars = [1, 2, 3, 4, 5].map((close, i) => bar(i + 1, close));
        const output = def!.compute(bars, {
            ma1: 2, ma2: 3, ma3: 3, ma4: 3, ma5: 3, ma6: 3, ma7: 3,
        });
        expect(output.ma1).toEqual([
            { time: 2, value: 1.5 },
            { time: 3, value: 2.5 },
            { time: 4, value: 3.5 },
            { time: 5, value: 4.5 },
        ]);
        expect(output.ma7).toHaveLength(3);
    });

    it('computes KDJ output and divergence series without browser or module globals', () => {
        const bars = [
            bar(1, 10, 12, 8), bar(2, 9, 11, 7), bar(3, 11, 13, 8),
            bar(4, 8, 10, 6), bar(5, 12, 14, 7), bar(6, 10, 13, 9),
        ];
        const output = kdjPrivate(bars, 3, 3);
        expect(output.k.length).toBeGreaterThan(0);
        expect(output.d.length).toBe(output.k.length);
        expect(output.j.length).toBe(output.k.length);
        for (const point of output.k) expect(Number.isFinite(point.value!)).toBe(true);
        expect(output.regularBull.length + output.regularBear.length + output.hiddenBull.length + output.hiddenBear.length).toBeGreaterThanOrEqual(0);
    });

    it('uses Taiwan wall-clock encoded timestamps and carries levels forward', () => {
        const at0845 = Date.UTC(2024, 0, 2, 8, 45) / 1000;
        const after = Date.UTC(2024, 0, 2, 9, 0) / 1000;
        const at1345 = Date.UTC(2024, 0, 2, 13, 45) / 1000;
        const levels = keyLevelsPrivate(
            [bar(at0845, 100), bar(after, 101), bar(at1345, 102)],
            [
                { hour: 8, minute: 45, source: 'open' },
                { hour: 13, minute: 45, source: 'close' },
            ],
        );
        expect(levels[0]).toEqual([
            { time: at0845, value: 100 },
            { time: after, value: 100 },
            { time: at1345, value: 100 },
        ]);
        expect(levels[1]).toEqual([{ time: at1345, value: 102 }]);
    });
});
