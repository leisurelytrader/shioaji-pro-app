// src/lib/order-flow.ts
// Tick + 5-level depth normalization, alignment, Volume Delta, Footprint,
// suspected iceberg and absorption analysis.
// Pure functions: safe to use from history backtests and live stream adapters.

export type AggressorSide = 'buy' | 'sell' | 'unknown';
export type DepthSide = 'bid' | 'ask';

export interface RawTick {
    code: string;
    date: string;
    time: string;
    price?: number | string | null;
    close?: number | string | null;
    volume?: number | string | null;
    tick_type?: number | string | null;
    eventTime?: number;
    receivedAt?: number;
}

export interface RawDepth {
    code: string;
    date: string;
    time: string;
    bid_price?: Array<number | string | null>;
    bid_volume?: Array<number | string | null>;
    ask_price?: Array<number | string | null>;
    ask_volume?: Array<number | string | null>;
    eventTime?: number;
    receivedAt?: number;
}

export interface NormalizedTick {
    code: string;
    eventTime: number;
    receivedAt: number;
    price: number;
    volume: number;
    aggressor: AggressorSide;
    rawTickType: number;
}

export interface DepthLevel {
    side: DepthSide;
    level: number;
    price: number;
    quantity: number;
}

export interface NormalizedDepth {
    code: string;
    eventTime: number;
    receivedAt: number;
    levels: DepthLevel[];
}

export interface AlignedTick {
    tick: NormalizedTick;
    depth: NormalizedDepth | null;
    depthAgeMs: number | null;
}

export interface OrderFlowBar {
    code: string;
    startTime: number;
    endTime: number;
    buyVolume: number;
    sellVolume: number;
    unknownVolume: number;
    totalVolume: number;
    delta: number;
    cumulativeDelta: number;
}

export interface FootprintCell {
    price: number;
    buyVolume: number;
    sellVolume: number;
    unknownVolume: number;
    totalVolume: number;
    delta: number;
    imbalance: 'buy' | 'sell' | 'none';
}

export interface FootprintBar extends OrderFlowBar {
    cells: FootprintCell[];
    maxCellVolume: number;
}

export interface OrderFlowEvent {
    code: string;
    time: number;
    price: number;
    side: DepthSide;
    kind: 'appeared' | 'executed' | 'cancelled' | 'refilled';
    quantity: number;
    matchedTradeVolume: number;
    confidence: number;
}

export interface IcebergSignal {
    code: string;
    side: DepthSide;
    price: number;
    firstTime: number;
    lastTime: number;
    refillCount: number;
    executedVolume: number;
    visiblePeak: number;
    confidence: number;
}

export interface AbsorptionSignal {
    code: string;
    side: 'buy' | 'sell';
    price: number;
    time: number;
    aggressiveVolume: number;
    tradeCount: number;
    priceRangeTicks: number;
    confidence: number;
}

export interface OrderFlowParams {
    depthToleranceMs: number;
    tickSize: number;
    barMs: number;
    imbalanceRatio: number;
    minIcebergExecutedVolume: number;
    minIcebergRefills: number;
    minAbsorptionVolume: number;
    maxAbsorptionRangeTicks: number;
    minConfidence: number;
}

export const DEFAULT_ORDER_FLOW_PARAMS: OrderFlowParams = {
    depthToleranceMs: 1500,
    tickSize: 1,
    barMs: 60_000,
    imbalanceRatio: 3,
    minIcebergExecutedVolume: 100,
    minIcebergRefills: 3,
    minAbsorptionVolume: 100,
    maxAbsorptionRangeTicks: 2,
    minConfidence: 0.6,
};

function finite(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function taipeiTime(date: string, time: string): number {
    const normalized = String(time).slice(0, 12);
    const parsed = new Date(`${date}T${normalized}+08:00`).getTime();
    if (!Number.isFinite(parsed)) throw new Error(`Invalid market timestamp: ${date} ${time}`);
    return parsed;
}

function eventTimestamp(date: string, time: string, eventTime?: number): number {
    return Number.isFinite(eventTime) ? Number(eventTime) : taipeiTime(date, time);
}

export function aggressorFromTickType(value: unknown): AggressorSide {
    const type = Number(value);
    if (type === 1) return 'buy';
    if (type === 2) return 'sell';
    return 'unknown';
}

export function normalizeTick(raw: RawTick): NormalizedTick | null {
    const price = finite(raw.price ?? raw.close);
    const volume = finite(raw.volume);
    if (price === null || volume === null || volume < 0) return null;
    return {
        code: raw.code,
        eventTime: eventTimestamp(raw.date, raw.time, raw.eventTime),
        receivedAt: Number.isFinite(raw.receivedAt) ? Number(raw.receivedAt) : eventTimestamp(raw.date, raw.time, raw.eventTime),
        price,
        volume,
        aggressor: aggressorFromTickType(raw.tick_type),
        rawTickType: Number(raw.tick_type) || 0,
    };
}

export function normalizeDepth(raw: RawDepth): NormalizedDepth {
    const levels: DepthLevel[] = [];
    const add = (side: DepthSide, prices: RawDepth['bid_price'], quantities: RawDepth['bid_volume']) => {
        for (let i = 0; i < 5; i++) {
            const price = finite(prices?.[i]);
            const quantity = finite(quantities?.[i]);
            if (price !== null && quantity !== null && quantity >= 0) {
                levels.push({ side, level: i + 1, price, quantity });
            }
        }
    };
    add('bid', raw.bid_price, raw.bid_volume);
    add('ask', raw.ask_price, raw.ask_volume);
    return {
        code: raw.code,
        eventTime: eventTimestamp(raw.date, raw.time, raw.eventTime),
        receivedAt: Number.isFinite(raw.receivedAt) ? Number(raw.receivedAt) : eventTimestamp(raw.date, raw.time, raw.eventTime),
        levels,
    };
}

export function alignTicksToDepth(
    ticks: NormalizedTick[],
    depths: NormalizedDepth[],
    toleranceMs = DEFAULT_ORDER_FLOW_PARAMS.depthToleranceMs,
): AlignedTick[] {
    const sortedTicks = [...ticks].sort((a, b) => a.eventTime - b.eventTime || a.receivedAt - b.receivedAt);
    const sortedDepths = [...depths].sort((a, b) => a.eventTime - b.eventTime || a.receivedAt - b.receivedAt);
    const result: AlignedTick[] = [];
    let depthIndex = 0;
    let latest: NormalizedDepth | null = null;
    for (const tick of sortedTicks) {
        while (depthIndex < sortedDepths.length && sortedDepths[depthIndex]!.eventTime <= tick.eventTime) {
            latest = sortedDepths[depthIndex++]!;
        }
        const age = latest ? tick.eventTime - latest.eventTime : null;
        result.push({ tick, depth: age !== null && age >= 0 && age <= toleranceMs ? latest : null, depthAgeMs: age !== null && age >= 0 && age <= toleranceMs ? age : null });
    }
    return result;
}

function bucketStart(time: number, barMs: number): number {
    return Math.floor(time / barMs) * barMs;
}

export function buildVolumeDelta(
    ticks: NormalizedTick[],
    barMs = DEFAULT_ORDER_FLOW_PARAMS.barMs,
): OrderFlowBar[] {
    const sorted = [...ticks].sort((a, b) => a.eventTime - b.eventTime);
    const bars: OrderFlowBar[] = [];
    let current: OrderFlowBar | null = null;
    let cumulative = 0;
    for (const tick of sorted) {
        const start = bucketStart(tick.eventTime, barMs);
        if (!current || current.startTime !== start || current.code !== tick.code) {
            if (current) bars.push(current);
            current = { code: tick.code, startTime: start, endTime: start + barMs, buyVolume: 0, sellVolume: 0, unknownVolume: 0, totalVolume: 0, delta: 0, cumulativeDelta: cumulative };
        }
        if (tick.aggressor === 'buy') current.buyVolume += tick.volume;
        else if (tick.aggressor === 'sell') current.sellVolume += tick.volume;
        else current.unknownVolume += tick.volume;
        current.totalVolume += tick.volume;
        current.delta = current.buyVolume - current.sellVolume;
        cumulative += tick.aggressor === 'buy' ? tick.volume : tick.aggressor === 'sell' ? -tick.volume : 0;
        current.cumulativeDelta = cumulative;
    }
    if (current) bars.push(current);
    return bars;
}

export function buildFootprint(
    ticks: NormalizedTick[],
    barMs = DEFAULT_ORDER_FLOW_PARAMS.barMs,
    tickSize = DEFAULT_ORDER_FLOW_PARAMS.tickSize,
    imbalanceRatio = DEFAULT_ORDER_FLOW_PARAMS.imbalanceRatio,
): FootprintBar[] {
    const sorted = [...ticks].sort((a, b) => a.eventTime - b.eventTime);
    const bars = new Map<string, FootprintBar>();
    const cellMaps = new Map<string, Map<number, FootprintCell>>();
    for (const tick of sorted) {
        if (!(tickSize > 0)) continue;
        const start = bucketStart(tick.eventTime, barMs);
        const key = `${tick.code}:${start}`;
        let bar = bars.get(key);
        if (!bar) {
            bar = { code: tick.code, startTime: start, endTime: start + barMs, buyVolume: 0, sellVolume: 0, unknownVolume: 0, totalVolume: 0, delta: 0, cumulativeDelta: 0, cells: [], maxCellVolume: 0 };
            bars.set(key, bar);
            cellMaps.set(key, new Map());
        }
        if (tick.aggressor === 'buy') bar.buyVolume += tick.volume;
        else if (tick.aggressor === 'sell') bar.sellVolume += tick.volume;
        else bar.unknownVolume += tick.volume;
        bar.totalVolume += tick.volume;
        bar.delta = bar.buyVolume - bar.sellVolume;
        const price = Math.round(tick.price / tickSize) * tickSize;
        const cells = cellMaps.get(key)!;
        const cell = cells.get(price) ?? { price, buyVolume: 0, sellVolume: 0, unknownVolume: 0, totalVolume: 0, delta: 0, imbalance: 'none' as const };
        if (tick.aggressor === 'buy') cell.buyVolume += tick.volume;
        else if (tick.aggressor === 'sell') cell.sellVolume += tick.volume;
        else cell.unknownVolume += tick.volume;
        cell.totalVolume += tick.volume;
        cell.delta = cell.buyVolume - cell.sellVolume;
        if (cell.sellVolume > 0 && cell.buyVolume / cell.sellVolume >= imbalanceRatio) cell.imbalance = 'buy';
        else if (cell.buyVolume > 0 && cell.sellVolume / cell.buyVolume >= imbalanceRatio) cell.imbalance = 'sell';
        cells.set(price, cell);
        bar.maxCellVolume = Math.max(bar.maxCellVolume, cell.totalVolume);
    }
    let cumulative = 0;
    return [...bars.values()].sort((a, b) => a.startTime - b.startTime).map((bar) => {
        cumulative += bar.delta;
        bar.cumulativeDelta = cumulative;
        bar.cells = [...cellMaps.get(`${bar.code}:${bar.startTime}`)!.values()].sort((a, b) => b.price - a.price);
        return bar;
    });
}

function levelMap(depth: NormalizedDepth): Map<string, number> {
    return new Map(depth.levels.map((level) => [`${level.side}:${level.price}`, level.quantity]));
}

function tradesBetween(ticks: NormalizedTick[], from: number, to: number, side: DepthSide, price: number, tickSize: number): number {
    return ticks.filter((tick) => tick.eventTime > from && tick.eventTime <= to && Math.abs(tick.price - price) <= tickSize / 2 && ((side === 'bid' && tick.aggressor === 'sell') || (side === 'ask' && tick.aggressor === 'buy'))).reduce((sum, tick) => sum + tick.volume, 0);
}

export function analyzeDepthTransitions(
    ticks: NormalizedTick[],
    depths: NormalizedDepth[],
    params: Partial<OrderFlowParams> = {},
): OrderFlowEvent[] {
    const p = { ...DEFAULT_ORDER_FLOW_PARAMS, ...params };
    const sortedDepths = [...depths].sort((a, b) => a.eventTime - b.eventTime || a.receivedAt - b.receivedAt);
    const sortedTicks = [...ticks].sort((a, b) => a.eventTime - b.eventTime);
    const events: OrderFlowEvent[] = [];
    let previous: NormalizedDepth | null = null;
    for (const depth of sortedDepths) {
        if (previous && depth.code === previous.code) {
            const before = levelMap(previous);
            const after = levelMap(depth);
            for (const [key, nextQuantity] of after) {
                const [side, priceText] = key.split(':') as [DepthSide, string];
                const price = Number(priceText);
                const previousQuantity = before.get(key) ?? 0;
                const tradeVolume = tradesBetween(sortedTicks, previous.eventTime, depth.eventTime, side, price, p.tickSize);
                if (nextQuantity > previousQuantity) events.push({ code: depth.code, time: depth.eventTime, price, side, kind: 'refilled', quantity: nextQuantity - previousQuantity, matchedTradeVolume: tradeVolume, confidence: tradeVolume > 0 ? 0.8 : 0.5 });
                else if (nextQuantity < previousQuantity) {
                    const decrease = previousQuantity - nextQuantity;
                    const executed = Math.min(decrease, tradeVolume);
                    if (executed > 0) events.push({ code: depth.code, time: depth.eventTime, price, side, kind: 'executed', quantity: executed, matchedTradeVolume: tradeVolume, confidence: Math.min(1, executed / decrease) });
                    if (decrease - executed > 0) events.push({ code: depth.code, time: depth.eventTime, price, side, kind: 'cancelled', quantity: decrease - executed, matchedTradeVolume: tradeVolume, confidence: executed > 0 ? 0.4 : 0.75 });
                }
            }
            for (const [key, previousQuantity] of before) {
                if (!after.has(key) && previousQuantity > 0) {
                    const [side, priceText] = key.split(':') as [DepthSide, string];
                    const price = Number(priceText);
                    const tradeVolume = tradesBetween(sortedTicks, previous.eventTime, depth.eventTime, side, price, p.tickSize);
                    events.push({ code: depth.code, time: depth.eventTime, price, side, kind: tradeVolume > 0 ? 'executed' : 'cancelled', quantity: tradeVolume > 0 ? Math.min(previousQuantity, tradeVolume) : previousQuantity, matchedTradeVolume: tradeVolume, confidence: tradeVolume > 0 ? 0.7 : 0.65 });
                }
            }
        }
        previous = depth;
    }
    return events;
}

export function detectIcebergs(events: OrderFlowEvent[], params: Partial<OrderFlowParams> = {}): IcebergSignal[] {
    const p = { ...DEFAULT_ORDER_FLOW_PARAMS, ...params };
    const groups = new Map<string, { firstTime: number; lastTime: number; refillCount: number; executedVolume: number; visiblePeak: number }>();
    for (const event of events) {
        const key = `${event.code}:${event.side}:${event.price}`;
        const group = groups.get(key) ?? { firstTime: event.time, lastTime: event.time, refillCount: 0, executedVolume: 0, visiblePeak: 0 };
        group.firstTime = Math.min(group.firstTime, event.time);
        group.lastTime = Math.max(group.lastTime, event.time);
        if (event.kind === 'refilled') { group.refillCount++; group.visiblePeak = Math.max(group.visiblePeak, event.quantity); }
        if (event.kind === 'executed') group.executedVolume += event.quantity;
        groups.set(key, group);
    }
    return [...groups.entries()].flatMap(([key, group]) => {
        const [code, side, priceText] = key.split(':') as [string, DepthSide, string];
        const score = (group.refillCount >= p.minIcebergRefills ? 0.4 : 0) + (group.executedVolume >= p.minIcebergExecutedVolume ? 0.4 : 0) + (group.visiblePeak > 0 ? 0.2 : 0);
        return score >= p.minConfidence ? [{ code, side, price: Number(priceText), ...group, confidence: score }] : [];
    });
}

export function detectAbsorption(
    ticks: NormalizedTick[],
    params: Partial<OrderFlowParams> = {},
): AbsorptionSignal[] {
    const p = { ...DEFAULT_ORDER_FLOW_PARAMS, ...params };
    const byPrice = new Map<string, NormalizedTick[]>();
    for (const tick of ticks) {
        const price = Math.round(tick.price / p.tickSize) * p.tickSize;
        const key = `${tick.code}:${price}`;
        byPrice.set(key, [...(byPrice.get(key) ?? []), tick]);
    }
    return [...byPrice.entries()].flatMap(([key, priceTicks]) => {
        if (!priceTicks.length) return [];
        const buy = priceTicks.filter((t) => t.aggressor === 'buy');
        const sell = priceTicks.filter((t) => t.aggressor === 'sell');
        const buyVolume = buy.reduce((s, t) => s + t.volume, 0);
        const sellVolume = sell.reduce((s, t) => s + t.volume, 0);
        const rangeTicks = (Math.max(...priceTicks.map((t) => t.price)) - Math.min(...priceTicks.map((t) => t.price))) / p.tickSize;
        const result: AbsorptionSignal[] = [];
        if (sellVolume >= p.minAbsorptionVolume && rangeTicks <= p.maxAbsorptionRangeTicks) result.push({ code: priceTicks[0]!.code, side: 'buy', price: Number(key.split(':')[1]), time: priceTicks[priceTicks.length - 1]!.eventTime, aggressiveVolume: sellVolume, tradeCount: sell.length, priceRangeTicks: rangeTicks, confidence: Math.min(1, 0.6 + sellVolume / (p.minAbsorptionVolume * 10)) });
        if (buyVolume >= p.minAbsorptionVolume && rangeTicks <= p.maxAbsorptionRangeTicks) result.push({ code: priceTicks[0]!.code, side: 'sell', price: Number(key.split(':')[1]), time: priceTicks[priceTicks.length - 1]!.eventTime, aggressiveVolume: buyVolume, tradeCount: buy.length, priceRangeTicks: rangeTicks, confidence: Math.min(1, 0.6 + buyVolume / (p.minAbsorptionVolume * 10)) });
        return result.filter((signal) => signal.confidence >= p.minConfidence);
    });
}

export function analyzeOrderFlow(
    rawTicks: RawTick[],
    rawDepths: RawDepth[],
    params: Partial<OrderFlowParams> = {},
) {
    const ticks = rawTicks.map(normalizeTick).filter((x): x is NormalizedTick => x !== null);
    const depths = rawDepths.map(normalizeDepth);
    const aligned = alignTicksToDepth(ticks, depths, params.depthToleranceMs ?? DEFAULT_ORDER_FLOW_PARAMS.depthToleranceMs);
    const volumeDelta = buildVolumeDelta(ticks, params.barMs ?? DEFAULT_ORDER_FLOW_PARAMS.barMs);
    const footprint = buildFootprint(ticks, params.barMs ?? DEFAULT_ORDER_FLOW_PARAMS.barMs, params.tickSize ?? DEFAULT_ORDER_FLOW_PARAMS.tickSize, params.imbalanceRatio ?? DEFAULT_ORDER_FLOW_PARAMS.imbalanceRatio);
    const events = analyzeDepthTransitions(ticks, depths, params);
    return { ticks, depths, aligned, volumeDelta, footprint, events, icebergs: detectIcebergs(events, params), absorption: detectAbsorption(ticks, params) };
}
