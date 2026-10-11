import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { createLogger } from './logger.js';
import { processOutboxBatch } from './outbox.js';
import { purgeUnattachedPhotos } from './routes/adminOps.js';

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

// Uploaded photos never attached to a report are deleted after the configured hours.
const purgeTimer = setInterval(() => {
  purgeUnattachedPhotos(pool, logger).catch((error: unknown) =>
    logger.error({ err: error }, 'photo purge failed'),
  );
}, 3_600_000);
purgeTimer.unref();

function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down API server');
  if (outboxTimer) clearInterval(outboxTimer);
  clearInterval(purgeTimer);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
