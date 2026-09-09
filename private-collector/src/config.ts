import { readFileSync } from 'node:fs';

function env(name: string, fallback?: string) {
    const value = process.env[name] ?? fallback;
    if (value === undefined) throw new Error(`Missing environment variable: ${name}`);
    return value;
}

export interface ContractSubscription {
    security_type: string;
    exchange: string;
    code: string;
    target_code: string | null;
    intraday_odd: boolean;
}

export interface CollectorConfig {
    shioajiBaseUrl: string;
    databaseUrl: string;
    host: string;
    port: number;
    corsOrigins: string[];
    contracts: ContractSubscription[];
    batchSize: number;
    flushIntervalMs: number;
    reconnectMinMs: number;
    reconnectMaxMs: number;
}

export function loadConfig(): CollectorConfig {
    const defaultContracts: ContractSubscription[] = (process.env.COLLECTOR_SYMBOLS ?? 'TXFR1')
        .split(',').map((code) => ({ security_type: 'FUT', exchange: 'TAIFEX', code: code.trim(), target_code: null, intraday_odd: false }));
    let contracts = defaultContracts;
    if (process.env.COLLECTOR_CONTRACTS_JSON) {
        contracts = JSON.parse(process.env.COLLECTOR_CONTRACTS_JSON) as ContractSubscription[];
    }
    return {
        shioajiBaseUrl: env('SHIOAJI_BASE_URL', 'http://127.0.0.1:8000').replace(/\/$/, ''),
        databaseUrl: env('DATABASE_URL', './data/shioaji-market.sqlite'),
        host: env('COLLECTOR_HOST', '127.0.0.1'),
        port: Number(env('COLLECTOR_PORT', '8787')),
        corsOrigins: env('COLLECTOR_CORS_ORIGIN', 'http://localhost:5173,http://127.0.0.1:5173,tauri://localhost').split(',').map((origin) => origin.trim()).filter(Boolean),
        contracts,
        batchSize: Number(env('BATCH_SIZE', '500')),
        flushIntervalMs: Number(env('FLUSH_INTERVAL_MS', '1000')),
        reconnectMinMs: Number(env('RECONNECT_MIN_MS', '1000')),
        reconnectMaxMs: Number(env('RECONNECT_MAX_MS', '15000')),
    };
}

export function loadDotEnv(path = '.env') {
    try {
        for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const index = trimmed.indexOf('=');
            if (index < 1) continue;
            const key = trimmed.slice(0, index);
            const value = trimmed.slice(index + 1).replace(/^['"]|['"]$/g, '');
            if (!(key in process.env)) process.env[key] = value;
        }
    } catch { /* .env is optional; production should inject env securely. */ }
}
