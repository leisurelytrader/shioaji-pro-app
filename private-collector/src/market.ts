export interface TickEvent {
    code: string; date: string; time: string; open?: string; high?: string; low?: string;
    close?: string; avg_price?: string; volume?: number; total_volume?: number;
    tick_type?: number; price_chg?: string; pct_chg?: string; [key: string]: unknown;
}
export interface BidAskEvent {
    code: string; date: string; time: string; bid_price?: string[]; bid_volume?: number[];
    ask_price?: string[]; ask_volume?: number[]; [key: string]: unknown;
}
export type StreamEvent = TickEvent | BidAskEvent;

export function isTick(eventName: string): eventName is 'tick_stk' | 'tick_fop' {
    return eventName === 'tick_stk' || eventName === 'tick_fop';
}
export function isDepth(eventName: string): eventName is 'bidask_stk' | 'bidask_fop' {
    return eventName === 'bidask_stk' || eventName === 'bidask_fop';
}

export function parseNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

export function eventTime(date: string, time: string): Date {
    const normalized = time.length > 12 ? time.slice(0, 12) : time;
    const parsed = new Date(`${date}T${normalized}+08:00`);
    if (Number.isNaN(parsed.valueOf())) throw new Error(`Invalid Shioaji timestamp: ${date} ${time}`);
    return parsed;
}

/** Futures night session 00:00–04:59 belongs to the prior Taiwan trading date. */
export function tradingDate(date: string, time: string): string {
    const hour = Number(time.slice(0, 2));
    if (hour >= 0 && hour < 5) {
        const value = new Date(`${date}T00:00:00+08:00`);
        value.setUTCDate(value.getUTCDate() - 1);
        return value.toISOString().slice(0, 10);
    }
    return date;
}
