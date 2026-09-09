export const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS market_ticks (
 id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, security_type TEXT NOT NULL,
 exchange TEXT, trading_date TEXT NOT NULL, event_time INTEGER NOT NULL, source_date TEXT NOT NULL,
 source_time TEXT NOT NULL, price REAL, open_price REAL, high_price REAL, low_price REAL,
 avg_price REAL, volume INTEGER NOT NULL DEFAULT 0, total_volume INTEGER, tick_type INTEGER,
 price_change REAL, pct_change REAL, raw TEXT NOT NULL, received_at INTEGER NOT NULL,
 UNIQUE (code, source_date, source_time, volume, price)
);
CREATE INDEX IF NOT EXISTS market_ticks_code_time_idx ON market_ticks (code, event_time);
CREATE INDEX IF NOT EXISTS market_ticks_trading_date_idx ON market_ticks (trading_date, code);
CREATE TABLE IF NOT EXISTS market_depth_snapshots (
 id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, security_type TEXT NOT NULL,
 exchange TEXT, trading_date TEXT NOT NULL, event_time INTEGER NOT NULL, source_date TEXT NOT NULL,
 source_time TEXT NOT NULL, bid_prices TEXT NOT NULL DEFAULT '[]', bid_volumes TEXT NOT NULL DEFAULT '[]',
 ask_prices TEXT NOT NULL DEFAULT '[]', ask_volumes TEXT NOT NULL DEFAULT '[]', raw TEXT NOT NULL,
 raw_hash TEXT NOT NULL, received_at INTEGER NOT NULL,
 UNIQUE (code, source_date, source_time, raw_hash)
);
CREATE INDEX IF NOT EXISTS market_depth_code_time_idx ON market_depth_snapshots (code, event_time);
CREATE INDEX IF NOT EXISTS market_depth_trading_date_idx ON market_depth_snapshots (trading_date, code);
CREATE TABLE IF NOT EXISTS collector_offsets (
 stream_name TEXT PRIMARY KEY, last_event_time INTEGER, last_received_at INTEGER NOT NULL
);
`;
