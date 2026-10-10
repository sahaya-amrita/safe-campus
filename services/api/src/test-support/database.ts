import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataType, newDb } from 'pg-mem';
import type { DatabasePool } from '../db.js';

export async function createTestPool(): Promise<DatabasePool> {
  const database = newDb({ autoCreateForeignKeyIndices: true });
  database.registerExtension('pgcrypto', (schema) => {
    schema.registerFunction({
      name: 'gen_random_uuid',
      returns: DataType.uuid,
      impure: true,
      implementation: randomUUID,
    });
  });
  const migrationsDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations');
  for (const filename of (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const migration = (await readFile(resolve(migrationsDirectory, filename), 'utf8'))
      .replace('REVOKE UPDATE, DELETE ON audit_events FROM PUBLIC;', '')
      .replaceAll(/CHECK \([^)]*~ '\^\[A-Fa-f0-9\]\{64\}\$'\)/g, '')
      .replace(/CREATE INDEX outbox_pending_idx[^;]+;/s, '')
      .replace(/CREATE INDEX instruction_packs_public_idx[^;]+;/s, '');
    database.public.none(migration);
  }
  const adapter = database.adapters.createPg();
  return new adapter.Pool() as unknown as DatabasePool;
}

export async function seedTestIdentity(
  pool: DatabasePool,
  input: { email: string; displayName: string; roles: string[] },
) {
  const user = await pool.query<{ id: string }>(
    `INSERT INTO users (email, display_name, password_hash, mode)
     VALUES ($1,$2,'test-hash','TEST') RETURNING id`,
    [input.email, input.displayName],
  );
  const id = user.rows[0]!.id;
  for (const role of input.roles) {
    await pool.query('INSERT INTO user_roles (user_id, role) VALUES ($1,$2)', [id, role]);
  }
  return id;
}

export async function seedTestZone(pool: DatabasePool) {
  const building = await pool.query<{ id: string }>(
    `INSERT INTO buildings (name, mode, geometry_approved)
     VALUES ('TEST Building','TEST',false) RETURNING id`,
  );
  const floor = await pool.query<{ id: string }>(
    `INSERT INTO floors (building_id, name, level_number)
     VALUES ($1,'TEST Floor',0) RETURNING id`,
    [building.rows[0]!.id],
  );
  const zone = await pool.query<{ id: string }>(
    `INSERT INTO zones (floor_id, name, zone_code, geometry_approved)
     VALUES ($1,'TEST Zone','TEST-Z',false) RETURNING id`,
    [floor.rows[0]!.id],
  );
  return { buildingId: building.rows[0]!.id, floorId: floor.rows[0]!.id, zoneId: zone.rows[0]!.id };
}
