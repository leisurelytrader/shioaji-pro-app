import type { CollectorConfig, ContractSubscription } from './config.js';
import { MarketDb, type StoredDepth, type StoredTick } from './db.js';
import { isDepth, isTick, type BidAskEvent, type TickEvent } from './market.js';
import { readSse } from './sse.js';

const STREAM_EVENTS = ['tick_stk', 'tick_fop', 'bidask_stk', 'bidask_fop'];

function matchesConfiguredContract(eventCode: string, contract: ContractSubscription) {
    if (eventCode === contract.code) return true;
    // Shioaji continuous futures (for example TXFR1) are subscribed by
    // alias, but SSE emits the resolved month code (for example TXFI6).
    // Keep the check narrow: only R1/R2 aliases may match the same prefix.
    return /R[12]$/.test(contract.code)
        && eventCode.startsWith(contract.code.slice(0, -2));
}

export class MarketCollector {
    private readonly ticks: StoredTick[] = []; private readonly depths: StoredDepth[] = [];
    private flushTimer?: NodeJS.Timeout; private stopped = false; private controller?: AbortController;
    private retryMs: number;
    constructor(private readonly config: CollectorConfig, private readonly db: MarketDb) { this.retryMs = config.reconnectMinMs; }
    async start() {
        try {
            await this.subscribeAll();
        } catch (error) {
            console.error(`[collector] initial Shioaji subscription failed; will retry: ${error instanceof Error ? error.message : String(error)}`);
        }
        this.flushTimer = setInterval(() => void this.flush(), this.config.flushIntervalMs);
        void this.runSseLoop();
    }
    async stop() {
        this.stopped = true; this.controller?.abort(); if (this.flushTimer) clearInterval(this.flushTimer); await this.flush(); await this.db.close();
    }
    private async subscribeAll() {
        for (const contract of this.config.contracts) {
            for (const quote_type of ['Tick', 'BidAsk']) {
                const response = await fetch(`${this.config.shioajiBaseUrl}/api/v1/stream/subscribe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...contract, quote_type }) });
                if (!response.ok) throw new Error(`subscribe ${contract.code}/${quote_type}: ${response.status} ${await response.text()}`);
                const body = await response.json() as { success?: boolean; message?: string };
                if (body.success === false) throw new Error(body.message ?? 'Shioaji subscription failed');
            }
        }
    }
    private async runSseLoop() {
        while (!this.stopped) {
            this.controller = new AbortController();
            try {
                for (const event of STREAM_EVENTS) {
                    // Attach event names through one stream; filtering happens in onMessage.
                    void event;
                }
                await readSse(`${this.config.shioajiBaseUrl}/api/v1/stream/data?region=TW`, this.controller.signal, (message) => this.onMessage(message.event, message.data));
                if (!this.stopped) throw new Error('SSE stream ended');
            } catch (error) {
                if (this.stopped) break;
                console.error(`[collector] stream disconnected: ${error instanceof Error ? error.message : String(error)}`);
                await new Promise((resolve) => setTimeout(resolve, this.retryMs));
                this.retryMs = Math.min(this.retryMs * 2, this.config.reconnectMaxMs);
                try { await this.subscribeAll(); } catch (subscribeError) { console.error(`[collector] resubscribe failed: ${String(subscribeError)}`); }
            } finally { this.controller = undefined; }
        }
    }
    private onMessage(name: string, raw: string) {
        if (!isTick(name) && !isDepth(name)) return;
        let event: TickEvent | BidAskEvent;
        try { event = JSON.parse(raw) as TickEvent | BidAskEvent; } catch { console.error('[collector] invalid JSON event'); return; }
        const contract = this.config.contracts.find((item) => matchesConfiguredContract(event.code, item));
        if (!contract) return;
        const receivedAt = new Date();
        const normalizedEvent = { ...event, code: contract.code };
        if (isTick(name)) this.ticks.push({ event: normalizedEvent as TickEvent, contract, receivedAt });
        else this.depths.push({ event: normalizedEvent as BidAskEvent, contract, receivedAt });
        if (this.ticks.length + this.depths.length >= this.config.batchSize) void this.flush();
    }
    private async flush() {
        if (!this.ticks.length && !this.depths.length) return;
        const ticks = this.ticks.splice(0); const depths = this.depths.splice(0);
        try { await this.db.insertTicks(ticks); await this.db.insertDepth(depths); this.retryMs = this.config.reconnectMinMs; }
        catch (error) { this.ticks.unshift(...ticks); this.depths.unshift(...depths); console.error(`[collector] database flush failed: ${error instanceof Error ? error.stack : String(error)}`); }
    }
}
