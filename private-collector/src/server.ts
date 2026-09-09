import express from 'express';
import type { CollectorConfig } from './config.js';
import { MarketDb } from './db.js';

export function createServer(config: CollectorConfig, db: MarketDb) {
    const app = express();
    app.disable('x-powered-by');
    app.use((req, res, next) => {
        const origin = req.headers.origin;
        if (origin && config.corsOrigins.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
        }
        if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            return res.sendStatus(204);
        }
        next();
    });
    app.get('/health', (_req, res) => {
        try { db.ping(); res.json({ ok: true, service: 'shioaji-private-collector', database: 'sqlite' }); }
        catch (error) { res.status(503).json({ ok: false, error: String(error) }); }
    });
    app.get('/api/private/depth-alerts', async (req, res) => {
        const symbol = String(req.query.symbol ?? '');
        const from = String(req.query.from ?? ''); const to = String(req.query.to ?? '');
        const minQuantity = Number(req.query.min_quantity ?? 0);
        if (!symbol || !from || !to || !Number.isFinite(minQuantity) || minQuantity < 0) return res.status(400).json({ message: 'symbol, from, to, min_quantity are required' });
        try {
            const result = await db.searchLargeOrders({ symbol, from, to, minQuantity, sides: String(req.query.sides ?? 'bid,ask').split(','), levels: String(req.query.levels ?? '1,2,3,4,5').split(',').map(Number) });
            res.json(result);
        } catch (error) { console.error(error); res.status(500).json({ message: 'history query failed' }); }
    });
    const server = app.listen(config.port, config.host, () => console.log(`[collector] API listening on http://${config.host}:${config.port}`));
    return server;
}
