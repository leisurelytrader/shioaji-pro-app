import { readFileSync, rmSync } from 'node:fs';
import { MarketDb } from '../dist/db.js';

const path = './data/sqlite-smoke.sqlite';
rmSync(path, { force: true });
const db = new MarketDb(path);
db.migrate(readFileSync(new URL('../sql/001_market_history.sql', import.meta.url), 'utf8'));
const contract = { security_type: 'FUT', exchange: 'TAIFEX', code: 'TXFR1', target_code: null, intraday_odd: false };
await db.insertDepth([{ contract, receivedAt: new Date(), event: {
  code: 'TXFR1', date: '2026-09-09', time: '09:00:00.000',
  bid_price: ['20000', '19999'], bid_volume: [250, 3],
  ask_price: ['20001', '20002'], ask_volume: [4, 300],
} }]);
const result = await db.searchLargeOrders({
  symbol: 'TXFR1', from: '2026-09-09T00:00:00+08:00', to: '2026-09-09T23:59:59+08:00',
  sides: ['bid', 'ask'], levels: [1, 2, 3, 4, 5], minQuantity: 199,
});
if (result.total !== 2) throw new Error(`expected 2 alerts, got ${result.total}`);
console.log(JSON.stringify(result));
db.close();
rmSync(path, { force: true });
