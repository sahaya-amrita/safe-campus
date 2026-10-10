import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadConfig } from '../config.js';
import { createPool } from '../db.js';

export async function migrate(databaseUrl?: string) {
  const config = loadConfig(databaseUrl ? { DATABASE_URL: databaseUrl } : {});
  const pool = createPool(config);
  const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations');
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations
       (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
    );
    const applied = new Set(
      (await pool.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map(
        (row) => row.version,
      ),
    );
    for (const filename of (await readdir(migrationsDir))
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      if (applied.has(filename)) continue;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(await readFile(resolve(migrationsDir, filename), 'utf8'));
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
          [filename],
        );
        await client.query('COMMIT');
        process.stdout.write(`Applied ${filename}\n`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

await migrate();
