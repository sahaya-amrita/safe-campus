import { loadConfig } from '../config.js';
import { createPool, withTransaction } from '../db.js';
import { hashPassword } from '../security.js';

const users = [
  ['student.demo@example.invalid', 'Demo Student', 'DemoStudent!2026', ['STUDENT']],
  ['verifier.demo@example.invalid', 'Demo Verifier', 'DemoVerifier!2026', ['INCIDENT_VERIFIER']],
  ['responder.demo@example.invalid', 'Demo Responder', 'DemoResponder!2026', ['RESPONDER']],
  [
    'admin.demo@example.invalid',
    'Demo Administrator',
    'DemoAdmin!2026',
    ['ADMIN', 'DRILL_MANAGER'],
  ],
] as const;

const config = loadConfig();
const pool = createPool(config);
try {
  await withTransaction(pool, async (client) => {
    const building = await client.query<{ id: string }>(
      `INSERT INTO buildings (name, mode, geometry_version, geometry_approved, metadata)
       VALUES ('DEMO Building Alpha', 'DEMO', 'demo-v1', false, '{"synthetic":true}')
       ON CONFLICT (name, mode) DO UPDATE SET metadata = EXCLUDED.metadata RETURNING id`,
    );
    const buildingId = building.rows[0]!.id;
    const floor = await client.query<{ id: string }>(
      `INSERT INTO floors (building_id, name, level_number) VALUES ($1, 'DEMO Ground Floor', 0)
       ON CONFLICT (building_id, level_number) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [buildingId],
    );
    const zone = await client.query<{ id: string }>(
      `INSERT INTO zones (floor_id, name, zone_code, geometry_approved)
       VALUES ($1, 'DEMO Zone A', 'DEMO-A', false)
       ON CONFLICT (floor_id, zone_code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [floor.rows[0]!.id],
    );
    const zoneId = zone.rows[0]!.id;

    const ids = new Map<string, string>();
    for (const [email, displayName, password, roles] of users) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO users (email, display_name, password_hash, mode)
         VALUES ($1, $2, $3, 'DEMO')
         ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id`,
        [email, displayName, await hashPassword(password)],
      );
      const userId = result.rows[0]!.id;
      ids.set(email, userId);
      for (const role of roles) {
        await client.query(
          'INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, role],
        );
      }
    }
    await client.query(
      `INSERT INTO zone_memberships (user_id, zone_id, source) VALUES ($1, $2, 'DEMO')
       ON CONFLICT DO NOTHING`,
      [ids.get('student.demo@example.invalid'), zoneId],
    );
    await client.query(
      `INSERT INTO responders
       (user_id, approved_role, qualifications, assigned_zone_id, availability, contact_channel,
        verified, verified_by, verified_at, mode)
       VALUES ($1, 'DEMO_SECURITY', ARRAY['DEMO_FIRST_RESPONSE'], $2, 'AVAILABLE', 'IN_APP',
               true, $3, now(), 'DEMO')
       ON CONFLICT (user_id) DO UPDATE SET assigned_zone_id = EXCLUDED.assigned_zone_id,
         availability = 'AVAILABLE', verified = true`,
      [ids.get('responder.demo@example.invalid'), zoneId, ids.get('admin.demo@example.invalid')],
    );
  });
  process.stdout.write('Seeded fictional DEMO data only.\n');
} finally {
  await pool.end();
}
