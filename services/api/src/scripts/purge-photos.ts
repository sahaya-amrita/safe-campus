/** Deletes uploaded photos never attached to a report (also runs hourly in the API server). */
import { loadConfig } from '../config.js';
import { createPool } from '../db.js';
import { purgeUnattachedPhotos } from '../routes/adminOps.js';

const pool = createPool(loadConfig());
try {
  const count = await purgeUnattachedPhotos(pool);
  process.stdout.write(`Purged ${count} unattached photo(s)\n`);
} finally {
  await pool.end();
}
