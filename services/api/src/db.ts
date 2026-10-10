import pg from 'pg';
import type { Config } from './config.js';

const { Pool } = pg;

export function createPool(config: Config) {
  return new Pool({
    connectionString:
      config.NODE_ENV === 'test' && config.TEST_DATABASE_URL
        ? config.TEST_DATABASE_URL
        : config.DATABASE_URL,
    max: config.NODE_ENV === 'test' ? 5 : 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export type DatabasePool = ReturnType<typeof createPool>;

export async function withTransaction<T>(
  pool: DatabasePool,
  run: (client: pg.PoolClient) => Promise<T>,
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
