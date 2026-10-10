import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { createLogger } from './logger.js';
import { processOutboxBatch } from './outbox.js';

const config = loadConfig();
const logger = createLogger(config);
const pool = createPool(config);
const app = createApp(pool, config);
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, mode: config.OPERATING_MODE }, 'API server started');
});

// Processes simulated dispatch and zone-alert events with the local adapter only.
// It never contacts an external notification or emergency service.
const outboxPollMs = config.OUTBOX_POLL_MS ?? 5000;
let outboxRunning = false;
const outboxTimer =
  outboxPollMs > 0
    ? setInterval(() => {
        if (outboxRunning) return;
        outboxRunning = true;
        processOutboxBatch(pool, config, logger)
          .catch((error: unknown) => logger.error({ err: error }, 'simulated outbox batch failed'))
          .finally(() => {
            outboxRunning = false;
          });
      }, outboxPollMs)
    : undefined;
outboxTimer?.unref();

function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down API server');
  if (outboxTimer) clearInterval(outboxTimer);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
