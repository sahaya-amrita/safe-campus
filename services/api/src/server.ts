import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { createLogger } from './logger.js';

const config = loadConfig();
const logger = createLogger(config);
const pool = createPool(config);
const app = createApp(pool, config);
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, mode: config.OPERATING_MODE }, 'API server started');
});

function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down API server');
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
