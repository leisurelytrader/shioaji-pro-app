import { loadConfig, loadDotEnv } from './config.js';
import { MarketCollector } from './collector.js';
import { MarketDb } from './db.js';
import { createServer } from './server.js';
import { SQLITE_SCHEMA } from './schema.js';

async function main() {
    loadDotEnv();
    const config = loadConfig();
    const db = new MarketDb(config.databaseUrl);
    db.migrate(SQLITE_SCHEMA);
    const collector = new MarketCollector(config, db);
    const httpServer = createServer(config, db);
    await collector.start();
    console.log(`[collector] collecting ${config.contracts.map((c) => c.code).join(', ')}`);

    let stopping = false;
    async function shutdown(signal: string) {
        if (stopping) return;
        stopping = true;
        console.log(`[collector] ${signal}, flushing and stopping`);
        httpServer.close();
        await collector.stop();
        process.exit(0);
    }
    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

process.on('uncaughtException', (error) => {
    console.error('[collector] uncaught exception:', error);
    // Exit non-zero so the Tauri supervisor can report and restart it.
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    console.error('[collector] unhandled rejection:', reason);
    process.exit(1);
});

void main().catch((error) => {
    console.error('[collector] fatal startup error', error);
    process.exitCode = 1;
});
