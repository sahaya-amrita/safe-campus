import { loadConfig } from '../config.js';
import { createPool } from '../db.js';
import { createLogger } from '../logger.js';
import { processOutboxBatch } from '../outbox.js';

const config = loadConfig();
const pool = createPool(config);
const logger = createLogger(config);
try {
  const count = await processOutboxBatch(pool, config, logger);
  process.stdout.write(`Processed ${count} simulated outbox event(s).\n`);
} finally {
  await pool.end();
}
