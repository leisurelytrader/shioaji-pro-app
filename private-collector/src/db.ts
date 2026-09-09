import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import type { ContractSubscription } from './config.js';
import { eventTime, parseNumber, tradingDate, type BidAskEvent, type TickEvent } from './market.js';

export interface StoredTick { event: TickEvent; contract: ContractSubscription; receivedAt: Date }
export interface StoredDepth { event: BidAskEvent; contract: ContractSubscription; receivedAt: Date }
export interface HistoryQuery { symbol: string; from: string; to: string; sides: string[]; levels: number[]; minQuantity: number }

function numberOrNull(value: unknown) {
    return value === null || value === undefined ? null : Number(value);
}

export class MarketDb {
    readonly db: DatabaseSync;

    constructor(databasePath: string) {
        const path = databasePath.startsWith('sqlite://')
            ? databasePath.slice('sqlite://'.length)
            : databasePath;
        const resolved = resolve(path || './data/shioaji-market.sqlite');
        mkdirSync(dirname(resolved), { recursive: true });
        this.db = new DatabaseSync(resolved);
        this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
    }

    migrate(sql: string) {
        this.db.exec(sql);
    }

    close() {
        this.db.close();
    }

    ping() {
        this.db.prepare('SELECT 1 AS ok').get();
    }

    async insertTicks(rows: StoredTick[]) {
        if (!rows.length) return;
        const stmt = this.db.prepare(`INSERT OR IGNORE INTO market_ticks
            (code, security_type, exchange, trading_date, event_time, source_date, source_time,
             price, open_price, high_price, low_price, avg_price, volume, total_volume,
             tick_type, price_change, pct_change, raw, received_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        this.db.exec('BEGIN');
        try {
            for (const row of rows) {
                const e = row.event;
                const t = eventTime(e.date, e.time);
                stmt.run(
                    e.code, row.contract.security_type, row.contract.exchange,
                    tradingDate(e.date, e.time), t.getTime(), e.date, e.time,
                    parseNumber(e.close), parseNumber(e.open), parseNumber(e.high),
                    parseNumber(e.low), parseNumber(e.avg_price), e.volume ?? 0,
                    e.total_volume ?? null, e.tick_type ?? null, parseNumber(e.price_chg),
                    parseNumber(e.pct_chg), JSON.stringify(e), row.receivedAt.getTime(),
                );
            }
            this.db.exec('COMMIT');
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }

    async insertDepth(rows: StoredDepth[]) {
        if (!rows.length) return;
        const stmt = this.db.prepare(`INSERT OR IGNORE INTO market_depth_snapshots
            (code, security_type, exchange, trading_date, event_time, source_date, source_time,
             bid_prices, bid_volumes, ask_prices, ask_volumes, raw, raw_hash, received_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        this.db.exec('BEGIN');
        try {
            for (const row of rows) {
                const e = row.event;
                const t = eventTime(e.date, e.time);
                const raw = JSON.stringify(e);
                const rawHash = createHash('sha256').update(raw).digest('hex');
                stmt.run(
                    e.code, row.contract.security_type, row.contract.exchange,
                    tradingDate(e.date, e.time), t.getTime(), e.date, e.time,
                    JSON.stringify((e.bid_price ?? []).map(Number)),
                    JSON.stringify(e.bid_volume ?? []), JSON.stringify((e.ask_price ?? []).map(Number)),
                    JSON.stringify(e.ask_volume ?? []), raw, rawHash, row.receivedAt.getTime(),
                );
            }
            this.db.exec('COMMIT');
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }

    async searchLargeOrders(query: HistoryQuery) {
        const sides = query.sides.filter((side) => side === 'bid' || side === 'ask');
        const levels = query.levels.filter((level) => level >= 1 && level <= 5);
        if (!sides.length || !levels.length) return { items: [], total: 0 };
        const sidePlaceholders = sides.map(() => '?').join(',');
        const levelPlaceholders = levels.map(() => '?').join(',');
        const rows = this.db.prepare(`
            WITH expanded_base AS (
                SELECT d.id, d.code, d.source_date, d.source_time, d.event_time,
                       'bid' AS side, CAST(bp.key AS INTEGER) + 1 AS level,
                       CAST(bp.value AS REAL) AS price, CAST(bv.value AS INTEGER) AS quantity
                FROM market_depth_snapshots d
                JOIN json_each(d.bid_prices) bp ON 1=1
                JOIN json_each(d.bid_volumes) bv ON bv.key = bp.key
                WHERE d.code = ? AND d.event_time >= ? AND d.event_time <= ?
                UNION ALL
                SELECT d.id, d.code, d.source_date, d.source_time, d.event_time,
                       'ask' AS side, CAST(ap.key AS INTEGER) + 1 AS level,
                       CAST(ap.value AS REAL) AS price, CAST(av.value AS INTEGER) AS quantity
                FROM market_depth_snapshots d
                JOIN json_each(d.ask_prices) ap ON 1=1
                JOIN json_each(d.ask_volumes) av ON av.key = ap.key
                WHERE d.code = ? AND d.event_time >= ? AND d.event_time <= ?
            ), expanded AS (
                SELECT *, LAG(quantity) OVER (
                    PARTITION BY code, side, level ORDER BY event_time, id
                ) AS previous_quantity
                FROM expanded_base
            )
            SELECT printf('%d-%s-%d', id, side, level) AS id,
                   CAST(id AS TEXT) AS sourceDepthId, code, side, level, price, quantity,
                   ? AS threshold, source_date AS date, source_time AS time,
                   event_time AS eventTime
            FROM expanded
            WHERE side IN (${sidePlaceholders})
              AND level IN (${levelPlaceholders})
              AND quantity >= ?
              AND COALESCE(previous_quantity, 0) < ?
            ORDER BY event_time, id`)
            .all(query.symbol, new Date(query.from).getTime(), new Date(query.to).getTime(),
                query.symbol, new Date(query.from).getTime(), new Date(query.to).getTime(),
                query.minQuantity, ...sides, ...levels, query.minQuantity, query.minQuantity) as Record<string, unknown>[];
        const items = rows.map((row) => ({
            ...row,
            id: String(row.id), sourceDepthId: String(row.sourceDepthId),
            price: numberOrNull(row.price), quantity: Number(row.quantity), level: Number(row.level),
            threshold: query.minQuantity, eventTime: String(row.eventTime),
        }));
        return { items, total: items.length };
    }
}
