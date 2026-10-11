import { createHash } from 'node:crypto';
import type pg from 'pg';
import { DEMO_ROUTE_EDGES, DEMO_ROUTE_NODES, DEMO_ROUTE_SOURCE } from './demoRouteGraph.js';

/**
 * Fictional DEMO content for the hosted prototype, shared by `db:seed` and
 * `dev:memory`, so every screen has something to show.
 *
 * Every item says it is DEMO data. The safety text is general advice written
 * for this prototype: it is not reviewed by campus safety staff, and the
 * practice points and route network are not official assembly points or
 * evacuation routes. Seeding is idempotent and never replaces non-DEMO data.
 */

export const DEMO_SOURCE_LABEL =
  'DEMO content written for this prototype. Not reviewed by campus safety staff.';

interface Section {
  heading: string;
  body: string;
}

/** Title keywords match the Prepare screen's topics. */
export const DEMO_PACKS: { version: string; title: string; sections: Section[] }[] = [
  {
    version: 'demo-fire-1',
    title: 'DEMO: Fire and smoke',
    sections: [
      {
        heading: 'If you see fire or smoke',
        body: 'Raise the alarm: shout "Fire!" and use the nearest fire alarm call point. Call 112 when you are safe.',
      },
      {
        heading: 'Getting out',
        body: 'Leave by the nearest safe exit and close doors behind you. Do not use lifts. Stay low if there is smoke. Do not go back for belongings.',
      },
      {
        heading: 'Afterwards',
        body: 'Go to the place staff direct you to and stay there. Tell staff if someone may still be inside. Re-enter only when staff say it is safe.',
      },
    ],
  },
  {
    version: 'demo-medical-1',
    title: 'DEMO: Medical help and first aid',
    sections: [
      {
        heading: 'Someone is hurt or unwell',
        body: 'Check that it is safe for you to approach. If the person is not breathing normally, is unconscious or bleeding heavily, call 112 straight away.',
      },
      {
        heading: 'While you wait',
        body: 'Stay with them and keep them warm. Press firmly on heavy bleeding with a clean cloth. Do not give food or drink. Send someone to meet the ambulance.',
      },
      {
        heading: 'Use the app',
        body: 'Press I Need Help so a responder in the app can see the request. It does not replace calling 112.',
      },
    ],
  },
  {
    version: 'demo-earthquake-1',
    title: 'DEMO: Earthquake',
    sections: [
      {
        heading: 'During shaking',
        body: 'Drop, cover and hold on: get under a sturdy table, protect your head and neck, and hold on until the shaking stops. Stay away from windows and shelves.',
      },
      {
        heading: 'Outdoors',
        body: 'Move away from buildings, trees, poles and wires, then drop and protect your head.',
      },
      {
        heading: 'After shaking stops',
        body: "Leave carefully when it is safe, without lifts. Expect aftershocks. Follow staff to open ground and check in with I'm Safe or I Need Help.",
      },
    ],
  },
  {
    version: 'demo-flood-1',
    title: 'DEMO: Flood and storms',
    sections: [
      {
        heading: 'Before heavy rain or a storm',
        body: 'Charge your phone, keep a torch handy, and follow official weather warnings.',
      },
      {
        heading: 'During a storm',
        body: 'Stay indoors and away from windows. Avoid trees, walls and power lines. If you are caught outside in lightning, avoid open ground and tall objects.',
      },
      {
        heading: 'Flood water',
        body: 'Never walk or drive through moving water: 15 cm can knock you over. Move to higher floors if water rises and wait for help.',
      },
    ],
  },
  {
    version: 'demo-security-1',
    title: 'DEMO: Personal security',
    sections: [
      {
        heading: 'If you feel unsafe',
        body: 'Move towards people and lit areas. Trust your instincts. If you are in danger, call 112.',
      },
      {
        heading: 'If there is a threat on campus',
        body: 'Get away if you safely can. If you cannot, hide: lock or block the door, switch off lights and silence your phone. Call 112 when it is safe to do so.',
      },
      {
        heading: 'Reporting',
        body: 'Use Report incident for things that are not urgent. A report is unverified until a trained reviewer checks it.',
      },
    ],
  },
  {
    version: 'demo-basics-1',
    title: 'DEMO: Preparedness basics',
    sections: [
      {
        heading: 'Know before it happens',
        body: 'Learn the exits of the buildings you use most. Save the campus security number from official channels. Tell a friend where you are when you work late.',
      },
      {
        heading: 'Your phone',
        body: 'Keep it charged. Open this app once while online so guides are saved for offline use.',
      },
      {
        heading: 'Practise',
        body: 'Take part in drills and try the practice drill in Prepare. Practising makes the real thing easier.',
      },
    ],
  },
];

/** Open grounds on the DEMO map, used as practice points only. */
export const DEMO_SAFE_POINTS = [
  { name: 'DEMO practice point: Amrita Playground', lat: 10.902912, lng: 76.902777 },
  { name: 'DEMO practice point: AB1 Lawn', lat: 10.899923, lng: 76.903174 },
  { name: 'DEMO practice point: Library Garden', lat: 10.903861, lng: 76.899172 },
  { name: 'DEMO practice point: Agastya/Gautama playground', lat: 10.901239, lng: 76.894232 },
] as const;

export const DEMO_ALERT_TITLE = 'DEMO drill: practise checking in';

export interface DemoContentIds {
  adminId: string;
  verifierId: string;
  /** Zone whose members receive the DEMO drill alert. */
  zoneId: string;
}

export async function seedDemoContent(client: pg.PoolClient, ids: DemoContentIds): Promise<void> {
  // Published DEMO guides (Prepare screen, Tom's approved links).
  for (const pack of DEMO_PACKS) {
    const content = JSON.stringify({ sections: pack.sections });
    const existing = await client.query('SELECT 1 FROM instruction_packs WHERE version = $1', [
      pack.version,
    ]);
    if (existing.rows.length > 0) continue;
    await client.query(
      `INSERT INTO instruction_packs
         (version, language, title, content, content_hash, source_label, approval_state,
          created_by, reviewed_by, approved_at, published_by, published_at, mode)
       VALUES ($1, 'en', $2, $3::jsonb, $4, $5, 'PUBLISHED', $6, $7, now(), $6, now(), 'DEMO')`,
      [
        pack.version,
        pack.title,
        content,
        createHash('sha256').update(content).digest('hex'),
        DEMO_SOURCE_LABEL,
        ids.adminId,
        ids.verifierId,
      ],
    );
  }

  // Practice points and network, only if no route data has been approved yet.
  const approved = await client.query(
    `SELECT 1 FROM route_graphs WHERE status = 'APPROVED' LIMIT 1`,
  );
  if (approved.rows.length === 0) {
    const graph = {
      nodes: DEMO_ROUTE_NODES.map(([id, lat, lng]) => ({ id, lat, lng })),
      edges: DEMO_ROUTE_EDGES.map(([from, to]) => ({ from, to })),
    };
    await client.query(
      `INSERT INTO route_graphs (version, source, status, graph, node_count, edge_count, mode,
                                 uploaded_by, approved_by, approved_at)
       VALUES ('demo-osm-1', $1, 'APPROVED', $2::jsonb, $3, $4, 'DEMO', $5, $6, now())`,
      [
        DEMO_ROUTE_SOURCE,
        JSON.stringify(graph),
        graph.nodes.length,
        graph.edges.length,
        ids.verifierId,
        ids.adminId,
      ],
    );
  }
  for (const point of DEMO_SAFE_POINTS) {
    const existing = await client.query('SELECT 1 FROM safe_points WHERE name = $1', [point.name]);
    if (existing.rows.length > 0) continue;
    await client.query(
      `INSERT INTO safe_points (name, kind, latitude, longitude, notes, status, mode,
                                proposed_by, reviewed_by, reviewed_at)
       VALUES ($1, 'ASSEMBLY_POINT', $2, $3, $4, 'APPROVED', 'DEMO', $5, $6, now())`,
      [
        point.name,
        point.lat,
        point.lng,
        'DEMO practice point on an open ground. Not an official assembly point.',
        ids.verifierId,
        ids.adminId,
      ],
    );
  }

  // One simulated drill alert for everyone in the DEMO zone.
  const alert = await client.query<{ id: string }>(
    'SELECT id FROM emergency_alerts WHERE title = $1',
    [DEMO_ALERT_TITLE],
  );
  let alertId = alert.rows[0]?.id;
  if (!alertId) {
    alertId = (
      await client.query<{ id: string }>(
        `INSERT INTO emergency_alerts (title, message, precautionary, status, mode, created_by,
                                       authorized_by, authorized_at)
         VALUES ($1, $2, true, 'QUEUED', 'DEMO', $3, $3, now()) RETURNING id`,
        [
          DEMO_ALERT_TITLE,
          "This is a practice alert for the DEMO familiarisation drill. Nothing is happening. Open Home and tap I'm Safe to practise checking in.",
          ids.adminId,
        ],
      )
    ).rows[0]!.id;
    await client.query('INSERT INTO alert_zones (alert_id, zone_id) VALUES ($1, $2)', [
      alertId,
      ids.zoneId,
    ]);
  }
  const members = await client.query<{ user_id: string }>(
    'SELECT user_id FROM zone_memberships WHERE zone_id = $1',
    [ids.zoneId],
  );
  for (const member of members.rows) {
    const delivered = await client.query(
      'SELECT 1 FROM alert_delivery_records WHERE alert_id = $1 AND recipient_id = $2',
      [alertId, member.user_id],
    );
    if (delivered.rows.length > 0) continue;
    await client.query(
      `INSERT INTO alert_delivery_records (alert_id, recipient_id, status, server_received_at)
       VALUES ($1, $2, 'SERVER_RECEIVED', now())`,
      [alertId, member.user_id],
    );
  }
}
