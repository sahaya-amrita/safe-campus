import { createHash } from 'node:crypto';
import { authSettings, loadConfig } from '../config.js';
import { createPool, withTransaction } from '../db.js';
import { seedDemoContent } from '../demo/demoContent.js';
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

// The fictional building is drawn on one mapped campus footprint purely for
// illustration. It is not a surveyed location and never implies routing.
const demoBuildingMetadata = {
  synthetic: true,
  mapFeatureId: 'way/380702789',
  mapPlacement: 'ILLUSTRATIVE',
};

// [name, OSM footprint, zone code]. Names say DEMO; placement is illustrative.
const extraDemoBuildings = [
  ['DEMO Building Beta (on Academic Block 1 footprint)', 'way/380925364', 'DEMO-B'],
  ['DEMO Building Gamma (on Central Library footprint)', 'way/380702790', 'DEMO-C'],
  ['DEMO Hostel Delta (on Gargi Bhavanam footprint)', 'way/380702791', 'DEMO-D'],
  ['DEMO Building Epsilon (on Main Canteen footprint)', 'way/546394562', 'DEMO-E'],
] as const;

// Synthetic preparedness copy for exercising the review workflow. It is created
// as a DRAFT: a demo verifier/admin must review and publish it in the app.
const demoPackContent = {
  sections: [
    {
      heading: 'About this DEMO pack',
      body: 'Synthetic content for testing Amrita Sahaya. It is not institutional safety guidance and contains no evacuation routes or assembly points.',
    },
    {
      heading: 'Before an emergency',
      body: 'Save official campus security numbers from your institution, keep your phone charged, and know how to open this app offline.',
    },
    {
      heading: 'During an emergency',
      body: 'Follow alarms, trained staff and official instructions first. Call 112 if life is at risk. Use "I am safe" or "Need help" only for a real or drill event shown in the app.',
    },
  ],
};

const config = loadConfig();
const pool = createPool(config);
try {
  await withTransaction(pool, async (client) => {
    const building = await client.query<{ id: string }>(
      `INSERT INTO buildings (name, mode, geometry_version, geometry_approved, metadata)
       VALUES ('DEMO Building Alpha', 'DEMO', 'demo-v1', false, $1::jsonb)
       ON CONFLICT (name, mode) DO UPDATE SET metadata = EXCLUDED.metadata RETURNING id`,
      [JSON.stringify(demoBuildingMetadata)],
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

    // More fictional buildings, each drawn on a mapped footprint so simulated
    // incidents and alerts can appear in different places on the DEMO map.
    for (const [name, mapFeatureId, code] of extraDemoBuildings) {
      const extra = await client.query<{ id: string }>(
        `INSERT INTO buildings (name, mode, geometry_version, geometry_approved, metadata)
         VALUES ($1, 'DEMO', 'demo-v1', false, $2::jsonb)
         ON CONFLICT (name, mode) DO UPDATE SET metadata = EXCLUDED.metadata RETURNING id`,
        [name, JSON.stringify({ ...demoBuildingMetadata, mapFeatureId })],
      );
      const extraFloor = await client.query<{ id: string }>(
        `INSERT INTO floors (building_id, name, level_number) VALUES ($1, 'DEMO Ground Floor', 0)
         ON CONFLICT (building_id, level_number) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [extra.rows[0]!.id],
      );
      await client.query(
        `INSERT INTO zones (floor_id, name, zone_code, geometry_approved)
         VALUES ($1, 'DEMO Zone', $2, false)
         ON CONFLICT (floor_id, zone_code) DO NOTHING`,
        [extraFloor.rows[0]!.id, code],
      );
    }

    const ids = new Map<string, string>();
    // The published DEMO passwords are stored only where DEMO password login
    // is allowed (local development, or a hosted prototype that opted in with
    // OPERATING_MODE=DEMO). Anywhere else they are cleared, since nobody may
    // use them.
    const production = !authSettings(config).demoLoginEnabled && config.NODE_ENV === 'production';
    for (const [email, displayName, password, roles] of users) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO users (email, display_name, password_hash, mode)
         VALUES ($1, $2, $3, 'DEMO')
         ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name,
           password_hash = CASE WHEN $4 THEN NULL ELSE users.password_hash END
         RETURNING id`,
        [email, displayName, production ? null : await hashPassword(password), production],
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
    await client.query(
      `INSERT INTO drills (name, building_id, scenario_ref, scenario_version, mode, status,
                           assumptions, created_by)
       SELECT 'DEMO familiarisation drill', $1, 'demo-familiarisation', '1', 'SIMULATION',
              'ACTIVE', '{"synthetic":true}'::jsonb, $2
       WHERE NOT EXISTS (SELECT 1 FROM drills WHERE name = 'DEMO familiarisation drill')`,
      [buildingId, ids.get('admin.demo@example.invalid')],
    );
    const packJson = JSON.stringify(demoPackContent);
    await client.query(
      `INSERT INTO instruction_packs
         (version, language, title, content, content_hash, source_label, created_by, mode)
       VALUES ('demo-1', 'en', 'DEMO preparedness basics (synthetic)', $1::jsonb, $2,
               'DEMO synthetic content — not institutional guidance', $3, 'DEMO')
       ON CONFLICT (version, language) DO NOTHING`,
      [
        packJson,
        createHash('sha256').update(packJson).digest('hex'),
        ids.get('admin.demo@example.invalid'),
      ],
    );

    // Published DEMO guides, practice points and route network, and a drill alert.
    await seedDemoContent(client, {
      adminId: ids.get('admin.demo@example.invalid')!,
      verifierId: ids.get('verifier.demo@example.invalid')!,
      zoneId,
    });
  });
  process.stdout.write('Seeded fictional DEMO data only.\n');
} finally {
  await pool.end();
}
