import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@sahaya/contracts';
import { createApp } from './app.js';
import type { Config } from './config.js';
import type { DatabasePool } from './db.js';
import { sniffImage, stripJpegMetadata, stripPngMetadata } from './reporting/images.js';
import { issueAccessToken } from './security.js';
import { createTestPool, seedTestIdentity, seedTestZone } from './test-support/database.js';

const config: Config = {
  NODE_ENV: 'test',
  PORT: 3000,
  DATABASE_URL: 'postgres://test:test@localhost/test',
  TEST_DATABASE_URL: 'postgres://test:test@localhost/test',
  JWT_SECRET: 'test-secret-with-more-than-thirty-two-characters',
  JWT_ISSUER: 'sahaya-tests',
  JWT_AUDIENCE: 'sahaya-api-tests',
  LOG_LEVEL: 'silent',
  OPERATING_MODE: 'TEST',
  OUTBOX_BATCH_SIZE: 25,
};

/** A minimal JPEG whose APP1 (EXIF) segment carries a fake GPS tag. */
function jpegWithExif(marker = 'GPS:10.9,76.9'): Buffer {
  const app0 = Buffer.from([
    0xff,
    0xe0,
    0x00,
    0x10,
    ...Buffer.from('JFIF\0'),
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
  ]);
  const exifPayload = Buffer.from(`Exif\0\0${marker}`);
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1]),
    Buffer.from([(exifPayload.length + 2) >> 8, (exifPayload.length + 2) & 0xff]),
    exifPayload,
  ]);
  // Scan data differs per marker, so photos with different markers are different images.
  const sos = Buffer.concat([
    Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0]),
    Buffer.from(marker),
    Buffer.from([0xff, 0xd9]),
  ]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, app1, sos]);
}

function pngWithText(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', Buffer.alloc(13, 1)),
    chunk('tEXt', Buffer.from('Comment\0taken at 10.9,76.9')),
    chunk('IDAT', Buffer.from([1, 2, 3])),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let pool: DatabasePool;
let app: ReturnType<typeof createApp>;
let zoneId: string;
let floorId: string;
let buildingId: string;
let ids: Record<'student' | 'other' | 'responderNear' | 'responderFar' | 'admin', string>;
let tokens: Record<keyof typeof ids, string>;

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const now = () => new Date().toISOString();
const gps = () => ({
  method: 'GPS' as const,
  latitude: 10.9027,
  longitude: 76.9006,
  accuracyM: 18,
  capturedAt: now(),
});

async function makeResponder(userId: string, zone: string | null, availability = 'AVAILABLE') {
  const row = await pool.query<{ id: string }>(
    `INSERT INTO responders (user_id, approved_role, assigned_zone_id, availability, contact_channel,
       verified, mode)
     VALUES ($1, 'SYNTHETIC_RESPONDER', $2, $3, 'IN_APP', true, 'TEST') RETURNING id`,
    [userId, zone, availability],
  );
  return row.rows[0]!.id;
}

beforeEach(async () => {
  pool = await createTestPool();
  app = createApp(pool, config);
  ({ zoneId, floorId, buildingId } = await seedTestZone(pool));
  const otherZone = await pool.query<{ id: string }>(
    `INSERT INTO zones (floor_id, name, zone_code, geometry_approved)
     VALUES ($1, 'TEST Zone B', 'TEST-ZB', false) RETURNING id`,
    [floorId],
  );
  const make = async (key: keyof typeof ids, roles: Role[]) => {
    const id = await seedTestIdentity(pool, {
      email: `${key}@test.invalid`,
      displayName: key,
      roles,
    });
    return id;
  };
  ids = {
    student: await make('student', ['STUDENT']),
    other: await make('other', ['STUDENT']),
    responderNear: await make('responderNear', ['RESPONDER']),
    responderFar: await make('responderFar', ['RESPONDER']),
    admin: await make('admin', ['ADMIN']),
  };
  await makeResponder(ids.responderNear, zoneId);
  await makeResponder(ids.responderFar, otherZone.rows[0]!.id);
  tokens = Object.fromEntries(
    await Promise.all(
      (Object.keys(ids) as (keyof typeof ids)[]).map(async (key) => [
        key,
        await issueAccessToken(config, {
          id: ids[key],
          email: `${key}@test.invalid`,
          roles: [],
        }),
      ]),
    ),
  ) as typeof tokens;
});

afterEach(async () => {
  if (pool) await pool.end();
});

describe('SOS outside a drill or incident', () => {
  it('records an unverified SOS, an open help request and matched responders, nothing more', async () => {
    const body = {
      clientActionId: randomUUID(),
      clientCreatedAt: now(),
      details: 'Twisted ankle near the stairs',
      category: 'MEDICAL',
      location: gps(),
      buildingId,
      floorId,
    };
    const sent = await request(app)
      .post('/api/v1/sos')
      .set(bearer(tokens.student))
      .set('idempotency-key', 'sos-key-0001')
      .send(body);
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({
      status: 'HELP_REQUESTED',
      deliveryStatus: 'SERVER_RECEIVED',
      helpRequest: { status: 'OPEN' },
    });

    // Same key, same body: the same receipt, nothing duplicated.
    const replay = await request(app)
      .post('/api/v1/sos')
      .set(bearer(tokens.student))
      .set('idempotency-key', 'sos-key-0001')
      .send(body);
    expect(replay.body.helpRequest.id).toBe(sent.body.helpRequest.id);
    expect((await pool.query('SELECT 1 FROM help_requests')).rows).toHaveLength(1);

    const incident = await pool.query<{
      verification_status: string;
      report_kind: string;
      category: string;
      latitude: number;
      accuracy_m: number;
    }>('SELECT * FROM incidents WHERE id = $1', [sent.body.incidentId]);
    expect(incident.rows[0]).toMatchObject({
      verification_status: 'REPORTED',
      report_kind: 'SOS',
      category: 'MEDICAL',
      latitude: 10.9027,
      accuracy_m: 18,
    });
    // Never published as an alert.
    expect((await pool.query('SELECT 1 FROM emergency_alerts')).rows).toHaveLength(0);

    // Both available responders are notified (simulated); the same-zone one first.
    const notes = await pool.query('SELECT * FROM help_request_notifications');
    expect(notes.rows).toHaveLength(2);
    const outbox = await pool.query<{ payload: { sameZone: boolean; simulated: boolean } }>(
      `SELECT payload FROM outbox_events WHERE event_type = 'HELP_REQUEST_NOTIFY_RESPONDER'`,
    );
    expect(outbox.rows.map((r) => r.payload.simulated)).toEqual([true, true]);
    expect(outbox.rows[0]!.payload.sameZone).toBe(true);

    const mine = await request(app).get('/api/v1/help-requests/mine').set(bearer(tokens.student));
    expect(mine.body.items[0]).toMatchObject({
      status: 'OPEN',
      source: 'SOS',
      responderAssigned: false,
      location: { method: 'GPS', latitude: 10.9027, accuracyM: 18 },
    });

    const queue = await request(app).get('/api/v1/help-requests').set(bearer(tokens.admin));
    expect(queue.body.items[0]).toMatchObject({
      source: 'SOS',
      category: 'MEDICAL',
      floorId,
      respondersNotified: 2,
      location: { method: 'GPS' },
    });
  });

  it('works with no details and no location, and refuses staff and bad locations', async () => {
    const quick = await request(app)
      .post('/api/v1/sos')
      .set(bearer(tokens.student))
      .set('idempotency-key', 'sos-key-0002')
      .send({ clientActionId: randomUUID(), clientCreatedAt: now() });
    expect(quick.status).toBe(201);
    const details = await pool.query<{ details: string }>('SELECT details FROM help_requests');
    expect(details.rows[0]!.details).toBe('No details given (quick help request).');

    const badGps = await request(app)
      .post('/api/v1/sos')
      .set(bearer(tokens.student))
      .set('idempotency-key', 'sos-key-0003')
      .send({
        clientActionId: randomUUID(),
        clientCreatedAt: now(),
        location: { method: 'GPS', latitude: 10.9 },
      });
    expect(badGps.status).toBe(400);

    const noFloor = await request(app)
      .post('/api/v1/sos')
      .set(bearer(tokens.student))
      .set('idempotency-key', 'sos-key-0004')
      .send({ clientActionId: randomUUID(), clientCreatedAt: now(), buildingId });
    expect(noFloor.status).toBe(400);

    const staff = await request(app)
      .post('/api/v1/sos')
      .set(bearer(tokens.responderNear))
      .set('idempotency-key', 'sos-key-0005')
      .send({ clientActionId: randomUUID(), clientCreatedAt: now() });
    expect(staff.status).toBe(403);
  });
});

describe('check-ins with structured location', () => {
  it('accepts a quick help request without text and stores where the student said they were', async () => {
    const drill = await pool.query<{ id: string }>(
      `INSERT INTO drills (name, building_id, scenario_ref, scenario_version, mode, status, created_by)
       VALUES ('Synthetic drill', $1, 'S-1', 'v1', 'TEST', 'ACTIVE', $2) RETURNING id`,
      [buildingId, ids.admin],
    );
    const response = await request(app)
      .post('/api/v1/checkins')
      .set(bearer(tokens.student))
      .set('idempotency-key', 'checkin-key-01')
      .send({
        status: 'HELP_REQUESTED',
        drillId: drill.rows[0]!.id,
        clientActionId: randomUUID(),
        clientCreatedAt: now(),
        location: { method: 'MANUAL', landmark: 'Main library, ground floor' },
      });
    expect(response.status).toBe(201);
    const help = await pool.query<{ details: string; landmark: string; location_method: string }>(
      'SELECT details, landmark, location_method FROM help_requests',
    );
    expect(help.rows[0]).toEqual({
      details: 'No details given (quick help request).',
      landmark: 'Main library, ground floor',
      location_method: 'MANUAL',
    });
  });
});

describe('photo attachments', () => {
  async function upload(token: string, bytes: Buffer, type = 'image/jpeg') {
    return request(app)
      .post('/api/v1/attachments')
      .set(bearer(token))
      .set('content-type', type)
      .send(bytes);
  }

  async function sos(token = tokens.student) {
    const sent = await request(app)
      .post('/api/v1/sos')
      .set(bearer(token))
      .set('idempotency-key', `sos-${randomUUID()}`)
      .send({ clientActionId: randomUUID(), clientCreatedAt: now(), location: gps() });
    return sent.body as { helpRequest: { id: string } };
  }

  it('strips metadata, checks the real type and deduplicates', async () => {
    const original = jpegWithExif('GPS:10.9,76.9');
    const stored = await upload(tokens.student, original);
    expect(stored.status).toBe(201);
    expect(stored.body).toMatchObject({ mediaType: 'image/jpeg', status: 'STORED' });
    expect(stored.body.sizeBytes).toBeLessThan(original.length);

    const blob = await pool.query<{ data_base64: string }>(
      'SELECT data_base64 FROM attachment_blobs',
    );
    const bytes = Buffer.from(blob.rows[0]!.data_base64, 'base64');
    expect(bytes.includes(Buffer.from('Exif'))).toBe(false);
    expect(bytes.includes(Buffer.from('JFIF'))).toBe(true);
    expect(stored.body.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));

    const again = await upload(tokens.student, original);
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(stored.body.id);

    const fake = await upload(tokens.student, Buffer.from('not really a photo'), 'image/jpeg');
    expect(fake.status).toBe(415);
    const tooBig = await upload(
      tokens.student,
      Buffer.concat([jpegWithExif(), Buffer.alloc(5_000_100, 1)]),
    );
    expect([413, 415]).toContain(tooBig.status);
  });

  it('links photos to the owner’s help request and controls who may view them', async () => {
    const { helpRequest } = await sos();
    const photo = (await upload(tokens.student, jpegWithExif('one'))).body as { id: string };

    // Another student can neither attach nor view it.
    const foreign = await request(app)
      .post(`/api/v1/help-requests/${helpRequest.id}/attachments`)
      .set(bearer(tokens.other))
      .send({ attachmentIds: [photo.id] });
    expect(foreign.status).toBe(403);
    expect(
      (await request(app).get(`/api/v1/attachments/${photo.id}/content`).set(bearer(tokens.other)))
        .status,
    ).toBe(404);
    // Staff cannot see a photo before it is attached to anything.
    expect(
      (await request(app).get(`/api/v1/attachments/${photo.id}/content`).set(bearer(tokens.admin)))
        .status,
    ).toBe(404);

    const linked = await request(app)
      .post(`/api/v1/help-requests/${helpRequest.id}/attachments`)
      .set(bearer(tokens.student))
      .send({ attachmentIds: [photo.id] });
    expect(linked.status).toBe(200);
    expect(linked.body.attachments).toHaveLength(1);

    const owner = await request(app)
      .get(`/api/v1/attachments/${photo.id}/content`)
      .set(bearer(tokens.student));
    expect(owner.status).toBe(200);
    expect(owner.headers['content-type']).toBe('image/jpeg');
    expect(owner.headers['cache-control']).toBe('private, no-store');

    // The notified responders may view it; each staff view is audited.
    for (const token of [tokens.responderNear, tokens.responderFar, tokens.admin])
      expect(
        (await request(app).get(`/api/v1/attachments/${photo.id}/content`).set(bearer(token)))
          .status,
      ).toBe(200);
    const views = await pool.query(`SELECT 1 FROM audit_events WHERE action = 'ATTACHMENT_VIEWED'`);
    expect(views.rows).toHaveLength(3);

    const queue = await request(app).get('/api/v1/help-requests').set(bearer(tokens.admin));
    expect(queue.body.items[0].attachments).toEqual([
      expect.objectContaining({ id: photo.id, status: 'ATTACHED' }),
    ]);
  });

  it('keeps a responder who was not matched away from the photos', async () => {
    // Only the far responder is available, so only they are matched.
    await pool.query(`UPDATE responders SET availability = 'OFF_DUTY' WHERE user_id = $1`, [
      ids.responderNear,
    ]);
    await pool.query(`UPDATE responders SET availability = 'OFF_DUTY' WHERE user_id = $1`, [
      ids.responderFar,
    ]);
    const { helpRequest } = await sos();
    const photo = (await upload(tokens.student, jpegWithExif('two'))).body as { id: string };
    await request(app)
      .post(`/api/v1/help-requests/${helpRequest.id}/attachments`)
      .set(bearer(tokens.student))
      .send({ attachmentIds: [photo.id] });
    const far = await request(app)
      .get(`/api/v1/attachments/${photo.id}/content`)
      .set(bearer(tokens.responderFar));
    expect(far.status).toBe(403);
  });

  it('allows at most three photos per report', async () => {
    const { helpRequest } = await sos();
    const photos: string[] = [];
    for (const tag of ['a', 'b', 'c', 'd'])
      photos.push(((await upload(tokens.student, jpegWithExif(tag))).body as { id: string }).id);
    const tooMany = await request(app)
      .post(`/api/v1/help-requests/${helpRequest.id}/attachments`)
      .set(bearer(tokens.student))
      .send({ attachmentIds: photos });
    expect(tooMany.status).toBe(400);
    const three = await request(app)
      .post(`/api/v1/help-requests/${helpRequest.id}/attachments`)
      .set(bearer(tokens.student))
      .send({ attachmentIds: photos.slice(0, 3) });
    expect(three.status).toBe(200);
    const fourth = await request(app)
      .post(`/api/v1/help-requests/${helpRequest.id}/attachments`)
      .set(bearer(tokens.student))
      .send({ attachmentIds: [photos[3]] });
    expect(fourth.status).toBe(400);
    expect(fourth.body.error.code).toBe('TOO_MANY_ATTACHMENTS');
  });
});

describe('report contract v2', () => {
  it('stores category, kind, location and photos; a concern never starts a dispatch', async () => {
    const photo = (
      await request(app)
        .post('/api/v1/attachments')
        .set(bearer(tokens.student))
        .set('content-type', 'image/png')
        .send(pngWithText())
    ).body as { id: string };
    const created = await request(app)
      .post('/api/v1/incidents')
      .set(bearer(tokens.student))
      .set('idempotency-key', 'report-key-01')
      .send({
        type: 'Loose cable',
        description: 'Exposed wire near the lab door',
        priority: 'HIGH',
        category: 'HAZARD',
        kind: 'CONCERN',
        buildingId,
        floorId,
        location: { method: 'MANUAL', landmark: 'Lab 2 door' },
        attachmentIds: [photo.id],
      });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      kind: 'CONCERN',
      dispatch: null,
      attachmentIds: [photo.id],
    });

    const detail = await request(app)
      .get(`/api/v1/incidents/${created.body.id}`)
      .set(bearer(tokens.admin));
    expect(detail.body).toMatchObject({
      category: 'HAZARD',
      report_kind: 'CONCERN',
      landmark: 'Lab 2 door',
      verification_status: 'REPORTED',
    });
    expect(detail.body.attachments).toEqual([expect.objectContaining({ id: photo.id })]);

    const stored = await pool.query<{ data_base64: string }>(
      'SELECT data_base64 FROM attachment_blobs',
    );
    expect(Buffer.from(stored.rows[0]!.data_base64, 'base64').includes(Buffer.from('76.9'))).toBe(
      false,
    );
  });

  it('requires a floor when a building is named', async () => {
    const response = await request(app)
      .post('/api/v1/incidents')
      .set(bearer(tokens.student))
      .set('idempotency-key', 'report-key-02')
      .send({ type: 'Smoke', description: 'Smell of smoke', priority: 'HIGH', buildingId });
    expect(response.status).toBe(400);
  });
});

describe('image sanitizer', () => {
  it('recognises types by their bytes and rejects malformed files', () => {
    expect(sniffImage(jpegWithExif())).toBe('image/jpeg');
    expect(sniffImage(pngWithText())).toBe('image/png');
    expect(sniffImage(Buffer.from('GIF89a'))).toBeNull();
    expect(stripJpegMetadata(Buffer.from([0xff, 0xd8, 0x00, 0x01]))).toBeNull();
    const png = stripPngMetadata(pngWithText())!;
    expect(Buffer.from(png).includes(Buffer.from('tEXt'))).toBe(false);
    expect(Buffer.from(png).includes(Buffer.from('IEND'))).toBe(true);
  });
});
