import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@sahaya/contracts';
import { createApp } from './app.js';
import type { Config } from './config.js';
import type { DatabasePool } from './db.js';
import { hashPassword, issueAccessToken } from './security.js';
import { createLogger } from './logger.js';
import { processOutboxBatch } from './outbox.js';
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

describe('safety-critical API behavior', () => {
  let pool: DatabasePool;
  let app: ReturnType<typeof createApp>;
  let studentId: string;
  let otherStudentId: string;
  let verifierId: string;
  let adminId: string;
  let zoneId: string;

  const token = (id: string, email: string, roles: Role[]) =>
    issueAccessToken(config, { id, email, roles });

  beforeEach(async () => {
    pool = await createTestPool();
    app = createApp(pool, config);
    studentId = await seedTestIdentity(pool, {
      email: 'student@test.invalid',
      displayName: 'Test Student',
      roles: ['STUDENT'],
    });
    otherStudentId = await seedTestIdentity(pool, {
      email: 'other@test.invalid',
      displayName: 'Other Student',
      roles: ['STUDENT'],
    });
    verifierId = await seedTestIdentity(pool, {
      email: 'verifier@test.invalid',
      displayName: 'Test Verifier',
      roles: ['INCIDENT_VERIFIER'],
    });
    adminId = await seedTestIdentity(pool, {
      email: 'admin@test.invalid',
      displayName: 'Test Admin',
      roles: ['ADMIN'],
    });
    ({ zoneId } = await seedTestZone(pool));
    await pool.query(
      `INSERT INTO zone_memberships (user_id, zone_id, source)
       VALUES ($1,$3,'DEMO'),($2,$3,'DEMO')`,
      [studentId, otherStudentId, zoneId],
    );
  });

  afterEach(async () => {
    if (pool) await pool.end();
  });

  async function createUrgentIncident() {
    return request(app)
      .post('/api/v1/incidents')
      .set('authorization', `Bearer ${await token(studentId, 'student@test.invalid', ['STUDENT'])}`)
      .set('idempotency-key', 'incident-key-0001')
      .send({
        type: 'SMOKE_TEST',
        description: 'Synthetic smoke report for automated testing',
        priority: 'CRITICAL',
        zoneId,
      });
  }

  it('creates urgent simulated dispatch independently while leaving verification REPORTED', async () => {
    const first = await createUrgentIncident();
    expect(first.status).toBe(201);
    expect(first.body.verificationStatus).toBe('REPORTED');
    expect(first.body.dispatch).toMatchObject({ status: 'CREATED', simulated: true });

    const replay = await createUrgentIncident();
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(first.body.id);
    const incidents = await pool.query<{ count: number }>(
      'SELECT count(*)::int count FROM incidents',
    );
    const dispatches = await pool.query<{ count: number }>(
      'SELECT count(*)::int count FROM dispatch_assignments',
    );
    expect(incidents.rows[0]!.count).toBe(1);
    expect(dispatches.rows[0]!.count).toBe(1);
  });

  it('does not let ten reports verify an incident and rejects student verification', async () => {
    const created = await createUrgentIncident();
    const studentToken = await token(studentId, 'student@test.invalid', ['STUDENT']);
    for (let index = 0; index < 10; index += 1) {
      const report = await request(app)
        .post(`/api/v1/incidents/${created.body.id}/reports`)
        .set('authorization', `Bearer ${studentToken}`)
        .set('idempotency-key', `eyewitness-report-${index}`)
        .send({ description: `Independent synthetic observation ${index}` });
      expect(report.status).toBe(201);
    }
    const found = await pool.query<{ verification_status: string }>(
      'SELECT verification_status FROM incidents WHERE id = $1',
      [created.body.id],
    );
    expect(found.rows[0]!.verification_status).toBe('REPORTED');

    const denied = await request(app)
      .post(`/api/v1/incidents/${created.body.id}/reviews`)
      .set('authorization', `Bearer ${studentToken}`)
      .send({
        status: 'VERIFIED',
        reason: 'Client supplied claim',
        evidenceIds: [],
        role: 'ADMIN',
      });
    expect(denied.status).toBe(403);

    const accepted = await request(app)
      .post(`/api/v1/incidents/${created.body.id}/reviews`)
      .set(
        'authorization',
        `Bearer ${await token(verifierId, 'verifier@test.invalid', ['INCIDENT_VERIFIER'])}`,
      )
      .set('idempotency-key', 'verify-incident-test')
      .send({
        status: 'VERIFIED',
        reason: 'Authorized synthetic review completed',
        evidenceIds: [],
      });
    expect(accepted.status).toBe(201);
    expect(accepted.body.toStatus).toBe('VERIFIED');
  });

  it('keeps HELP_REQUESTED distinct and counts students without a response as UNCONFIRMED', async () => {
    const created = await createUrgentIncident();
    const actionId = randomUUID();
    const checkin = await request(app)
      .post('/api/v1/checkins')
      .set('authorization', `Bearer ${await token(studentId, 'student@test.invalid', ['STUDENT'])}`)
      .set('idempotency-key', 'checkin-key-0001')
      .send({
        incidentId: created.body.id,
        status: 'HELP_REQUESTED',
        helpDetails: 'Synthetic assistance request',
        clientCreatedAt: new Date().toISOString(),
        clientActionId: actionId,
      });
    expect(checkin.status).toBe(201);
    expect(checkin.body).toMatchObject({
      status: 'HELP_REQUESTED',
      deliveryStatus: 'SERVER_RECEIVED',
      helpRequest: { status: 'OPEN' },
    });

    const summary = await request(app)
      .get(`/api/v1/incidents/${created.body.id}/checkins/summary`)
      .set('authorization', `Bearer ${await token(adminId, 'admin@test.invalid', ['ADMIN'])}`);
    expect(summary.status).toBe(200);
    expect(summary.body.counts).toEqual({ CONFIRMED_SAFE: 0, HELP_REQUESTED: 1, UNCONFIRMED: 1 });
  });

  it('limits responder help requests to the responder assigned zone', async () => {
    const created = await createUrgentIncident();
    const checkin = await request(app)
      .post('/api/v1/checkins')
      .set('authorization', `Bearer ${await token(studentId, 'student@test.invalid', ['STUDENT'])}`)
      .set('idempotency-key', 'zone-scoped-help-request')
      .send({
        incidentId: created.body.id,
        status: 'HELP_REQUESTED',
        helpDetails: 'Synthetic zone-scoping test',
        clientCreatedAt: new Date().toISOString(),
        clientActionId: randomUUID(),
      });
    expect(checkin.status).toBe(201);

    const responderUserId = await seedTestIdentity(pool, {
      email: 'zone.responder@test.invalid',
      displayName: 'Zone Responder',
      roles: ['RESPONDER'],
    });
    const floor = await pool.query<{ floor_id: string }>(
      'SELECT floor_id FROM zones WHERE id = $1',
      [zoneId],
    );
    const otherZone = await pool.query<{ id: string }>(
      `INSERT INTO zones (floor_id, name, zone_code, geometry_approved)
       VALUES ($1,'Other TEST Zone','TEST-Z-OTHER',false) RETURNING id`,
      [floor.rows[0]!.floor_id],
    );
    await pool.query(
      `INSERT INTO responders
        (user_id, approved_role, assigned_zone_id, availability, contact_channel,
         verified, verified_by, verified_at, mode)
       VALUES ($1,'TEST_SECURITY',$2,'AVAILABLE','IN_APP',true,$3,now(),'TEST')`,
      [responderUserId, otherZone.rows[0]!.id, adminId],
    );
    const responderToken = await token(responderUserId, 'zone.responder@test.invalid', [
      'RESPONDER',
    ]);

    const hidden = await request(app)
      .get('/api/v1/checkins/help-requests')
      .set('authorization', `Bearer ${responderToken}`);
    expect(hidden.status).toBe(200);
    expect(hidden.body.items).toHaveLength(0);

    await pool.query('UPDATE responders SET assigned_zone_id = $2 WHERE user_id = $1', [
      responderUserId,
      zoneId,
    ]);
    const visible = await request(app)
      .get('/api/v1/checkins/help-requests')
      .set('authorization', `Bearer ${responderToken}`);
    expect(visible.status).toBe(200);
    expect(visible.body.items).toHaveLength(1);
    expect(visible.body.items[0]).toMatchObject({
      incidentId: created.body.id,
      studentId,
      status: 'OPEN',
    });
  });

  it('prevents one student from reading another student private incident history', async () => {
    const created = await createUrgentIncident();
    const response = await request(app)
      .get(`/api/v1/incidents/${created.body.id}`)
      .set(
        'authorization',
        `Bearer ${await token(otherStudentId, 'other@test.invalid', ['STUDENT'])}`,
      );
    expect(response.status).toBe(403);
  });

  it('does not permit client-supplied roles to authorize an alert', async () => {
    const response = await request(app)
      .post('/api/v1/alerts')
      .set('authorization', `Bearer ${await token(studentId, 'student@test.invalid', ['STUDENT'])}`)
      .send({
        zoneIds: [zoneId],
        title: 'Synthetic warning',
        message: 'Synthetic test message',
        precautionary: true,
        mode: 'TEST',
        role: 'ADMIN',
      });
    expect(response.status).toBe(403);
  });

  it('returns the authenticated profile from server-owned identity and roles', async () => {
    const response = await request(app)
      .get('/api/v1/users/me')
      .set(
        'authorization',
        `Bearer ${await token(studentId, 'student@test.invalid', ['STUDENT'])}`,
      );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: studentId,
      email: 'student@test.invalid',
      roles: ['STUDENT'],
      mode: 'TEST',
    });
  });

  it('logs in a fictional account and uses its server-issued token', async () => {
    await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [
      studentId,
      await hashPassword('SyntheticPassword!2026'),
    ]);
    const login = await request(app).post('/api/v1/auth/demo-login').send({
      email: 'student@test.invalid',
      password: 'SyntheticPassword!2026',
    });
    expect(login.status).toBe(200);
    expect(login.body.user.roles).toEqual(['STUDENT']);

    const profile = await request(app)
      .get('/api/v1/users/me')
      .set('authorization', `Bearer ${login.body.accessToken}`);
    expect(profile.status).toBe(200);
    expect(profile.body.id).toBe(studentId);
  });

  it('returns only verified available responders using coarse assigned-zone data', async () => {
    const responderId = await seedTestIdentity(pool, {
      email: 'responder@test.invalid',
      displayName: 'Test Responder',
      roles: ['RESPONDER'],
    });
    await pool.query(
      `INSERT INTO responders
        (user_id, approved_role, qualifications, assigned_zone_id, availability,
         contact_channel, verified, verified_by, verified_at, mode)
       VALUES ($1,'TEST_SECURITY',ARRAY['TEST_FIRST_RESPONSE'],$2,'AVAILABLE',
               'IN_APP',true,$3,now(),'TEST')`,
      [responderId, zoneId, adminId],
    );
    const response = await request(app)
      .get(`/api/v1/responders/appropriate?zoneId=${zoneId}`)
      .set(
        'authorization',
        `Bearer ${await token(studentId, 'student@test.invalid', ['STUDENT'])}`,
      );
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      displayName: 'Test Responder',
      assignedZoneId: zoneId,
      availability: 'AVAILABLE',
      contactChannel: 'IN_APP',
    });
    expect(response.body.items[0]).not.toHaveProperty('liveLocation');
  });

  it('forbids non-students and rejects check-ins for unknown incidents', async () => {
    const payload = {
      incidentId: randomUUID(),
      status: 'CONFIRMED_SAFE',
      clientCreatedAt: new Date().toISOString(),
      clientActionId: randomUUID(),
    };
    const denied = await request(app)
      .post('/api/v1/checkins')
      .set('authorization', `Bearer ${await token(adminId, 'admin@test.invalid', ['ADMIN'])}`)
      .set('idempotency-key', 'non-student-checkin')
      .send(payload);
    expect(denied.status).toBe(403);

    const missing = await request(app)
      .post('/api/v1/checkins')
      .set('authorization', `Bearer ${await token(studentId, 'student@test.invalid', ['STUDENT'])}`)
      .set('idempotency-key', 'missing-incident-checkin')
      .send(payload);
    expect(missing.status).toBe(404);
  });

  it('assigns an unclaimed dispatch to the acknowledging responder and rejects other assignees', async () => {
    const firstResponderUserId = await seedTestIdentity(pool, {
      email: 'first.responder@test.invalid',
      displayName: 'First Responder',
      roles: ['RESPONDER'],
    });
    const secondResponderUserId = await seedTestIdentity(pool, {
      email: 'second.responder@test.invalid',
      displayName: 'Second Responder',
      roles: ['RESPONDER'],
    });
    const firstResponder = await pool.query<{ id: string }>(
      `INSERT INTO responders
        (user_id, approved_role, assigned_zone_id, availability, contact_channel,
         verified, verified_by, verified_at, mode)
       VALUES ($1,'TEST_SECURITY',$3,'AVAILABLE','IN_APP',true,$2,now(),'TEST') RETURNING id`,
      [firstResponderUserId, adminId, zoneId],
    );
    const secondResponder = await pool.query<{ id: string }>(
      `INSERT INTO responders
        (user_id, approved_role, assigned_zone_id, availability, contact_channel,
         verified, verified_by, verified_at, mode)
       VALUES ($1,'TEST_SECURITY',$3,'AVAILABLE','IN_APP',true,$2,now(),'TEST') RETURNING id`,
      [secondResponderUserId, adminId, zoneId],
    );

    const created = await createUrgentIncident();
    await processOutboxBatch(pool, config, createLogger(config), false);
    const dispatch = await pool.query<{ id: string }>(
      'SELECT id FROM dispatch_assignments WHERE incident_id = $1',
      [created.body.id],
    );
    const dispatchId = dispatch.rows[0]!.id;
    const accepted = await request(app)
      .post(`/api/v1/dispatches/${dispatchId}/acknowledge`)
      .set(
        'authorization',
        `Bearer ${await token(firstResponderUserId, 'first.responder@test.invalid', ['RESPONDER'])}`,
      )
      .set('idempotency-key', 'first-dispatch-ack');
    expect(accepted.status).toBe(200);
    const assignment = await pool.query<{ responder_id: string }>(
      'SELECT responder_id FROM dispatch_assignments WHERE id = $1',
      [dispatchId],
    );
    expect(assignment.rows[0]!.responder_id).toBe(firstResponder.rows[0]!.id);

    const secondCreated = await request(app)
      .post('/api/v1/incidents')
      .set('authorization', `Bearer ${await token(studentId, 'student@test.invalid', ['STUDENT'])}`)
      .set('idempotency-key', 'incident-key-assigned')
      .send({
        type: 'MEDICAL_TEST',
        description: 'Synthetic assigned dispatch test',
        priority: 'HIGH',
        zoneId,
      });
    await processOutboxBatch(pool, config, createLogger(config), false);
    const assigned = await pool.query<{ id: string }>(
      `UPDATE dispatch_assignments SET responder_id = $2
       WHERE incident_id = $1 RETURNING id`,
      [secondCreated.body.id, secondResponder.rows[0]!.id],
    );
    const rejected = await request(app)
      .post(`/api/v1/dispatches/${assigned.rows[0]!.id}/acknowledge`)
      .set(
        'authorization',
        `Bearer ${await token(firstResponderUserId, 'first.responder@test.invalid', ['RESPONDER'])}`,
      )
      .set('idempotency-key', 'wrong-dispatch-ack');
    expect(rejected.status).toBe(403);
  });

  it('persists and idempotently transitions a zone-scoped help-request lifecycle', async () => {
    const created = await createUrgentIncident();
    const checkin = await request(app)
      .post('/api/v1/checkins')
      .set('authorization', `Bearer ${await token(studentId, 'student@test.invalid', ['STUDENT'])}`)
      .set('idempotency-key', 'help-lifecycle-checkin')
      .send({
        incidentId: created.body.id,
        status: 'HELP_REQUESTED',
        helpDetails: 'Synthetic lifecycle request',
        clientCreatedAt: new Date().toISOString(),
        clientActionId: randomUUID(),
      });
    const helpRequestId = checkin.body.helpRequest.id as string;
    expect(checkin.body.helpRequest.status).toBe('OPEN');

    const responderUserId = await seedTestIdentity(pool, {
      email: 'lifecycle.responder@test.invalid',
      displayName: 'Lifecycle Responder',
      roles: ['RESPONDER'],
    });
    const responder = await pool.query<{ id: string }>(
      `INSERT INTO responders
        (user_id, approved_role, assigned_zone_id, availability, contact_channel,
         verified, verified_by, verified_at, mode)
       VALUES ($1,'TEST_SECURITY',$2,'AVAILABLE','IN_APP',true,$3,now(),'TEST') RETURNING id`,
      [responderUserId, zoneId, adminId],
    );
    const responderToken = await token(responderUserId, 'lifecycle.responder@test.invalid', [
      'RESPONDER',
    ]);

    const acknowledge = () =>
      request(app)
        .post(`/api/v1/help-requests/${helpRequestId}/acknowledge`)
        .set('authorization', `Bearer ${responderToken}`)
        .set('idempotency-key', 'help-acknowledge-key');
    const acknowledged = await acknowledge();
    const acknowledgeReplay = await acknowledge();
    expect(acknowledged.status).toBe(200);
    expect(acknowledged.body.status).toBe('ACKNOWLEDGED');
    expect(acknowledgeReplay.body).toEqual(acknowledged.body);

    const assigned = await request(app)
      .post(`/api/v1/help-requests/${helpRequestId}/assign`)
      .set('authorization', `Bearer ${responderToken}`)
      .set('idempotency-key', 'help-assign-key')
      .send({});
    expect(assigned.status).toBe(200);
    expect(assigned.body).toMatchObject({
      status: 'ASSIGNED',
      assignedResponderId: responder.rows[0]!.id,
    });

    const invalidRepeat = await request(app)
      .post(`/api/v1/help-requests/${helpRequestId}/assign`)
      .set('authorization', `Bearer ${responderToken}`)
      .set('idempotency-key', 'help-assign-new-key')
      .send({});
    expect(invalidRepeat.status).toBe(400);

    const resolved = await request(app)
      .post(`/api/v1/help-requests/${helpRequestId}/resolve`)
      .set('authorization', `Bearer ${responderToken}`)
      .set('idempotency-key', 'help-resolve-key');
    expect(resolved.status).toBe(200);
    expect(resolved.body.status).toBe('RESOLVED');

    const audits = await pool.query<{ action: string }>(
      `SELECT action FROM audit_events WHERE entity_id = $1 ORDER BY created_at`,
      [helpRequestId],
    );
    expect(audits.rows.map((row) => row.action)).toEqual([
      'HELP_REQUEST_OPENED',
      'HELP_REQUEST_ACKNOWLEDGED',
      'HELP_REQUEST_ASSIGNED',
      'HELP_REQUEST_RESOLVED',
    ]);
  });

  it('prevents unrelated users from manipulating a help request', async () => {
    const created = await createUrgentIncident();
    const checkin = await request(app)
      .post('/api/v1/checkins')
      .set('authorization', `Bearer ${await token(studentId, 'student@test.invalid', ['STUDENT'])}`)
      .set('idempotency-key', 'protected-help-checkin')
      .send({
        incidentId: created.body.id,
        status: 'HELP_REQUESTED',
        helpDetails: 'Synthetic protected request',
        clientCreatedAt: new Date().toISOString(),
        clientActionId: randomUUID(),
      });
    const id = checkin.body.helpRequest.id as string;
    const studentToken = await token(otherStudentId, 'other@test.invalid', ['STUDENT']);

    const unrelatedResponderUserId = await seedTestIdentity(pool, {
      email: 'unrelated.responder@test.invalid',
      displayName: 'Unrelated Responder',
      roles: ['RESPONDER'],
    });
    const floor = await pool.query<{ floor_id: string }>(
      'SELECT floor_id FROM zones WHERE id = $1',
      [zoneId],
    );
    const unrelatedZone = await pool.query<{ id: string }>(
      `INSERT INTO zones (floor_id, name, zone_code, geometry_approved)
       VALUES ($1,'Unrelated TEST Zone','TEST-Z-UNRELATED',false) RETURNING id`,
      [floor.rows[0]!.floor_id],
    );
    await pool.query(
      `INSERT INTO responders
        (user_id, approved_role, assigned_zone_id, availability, contact_channel,
         verified, verified_by, verified_at, mode)
       VALUES ($1,'TEST_SECURITY',$2,'AVAILABLE','IN_APP',true,$3,now(),'TEST')`,
      [unrelatedResponderUserId, unrelatedZone.rows[0]!.id, adminId],
    );
    const unrelatedResponderToken = await token(
      unrelatedResponderUserId,
      'unrelated.responder@test.invalid',
      ['RESPONDER'],
    );
    const wrongZone = await request(app)
      .post(`/api/v1/help-requests/${id}/acknowledge`)
      .set('authorization', `Bearer ${unrelatedResponderToken}`)
      .set('idempotency-key', 'wrong-zone-help-ack');
    expect(wrongZone.status).toBe(403);

    const cannotAcknowledge = await request(app)
      .post(`/api/v1/help-requests/${id}/acknowledge`)
      .set('authorization', `Bearer ${studentToken}`)
      .set('idempotency-key', 'student-help-ack');
    expect(cannotAcknowledge.status).toBe(403);

    const cannotCancel = await request(app)
      .post(`/api/v1/help-requests/${id}/cancel`)
      .set('authorization', `Bearer ${studentToken}`)
      .set('idempotency-key', 'other-student-cancel');
    expect(cannotCancel.status).toBe(403);

    const missing = await request(app)
      .post(`/api/v1/help-requests/${randomUUID()}/acknowledge`)
      .set('authorization', `Bearer ${unrelatedResponderToken}`)
      .set('idempotency-key', 'missing-help-ack');
    expect(missing.status).toBe(404);
  });

  it('requires reviewed instruction metadata before publishing synthetic content', async () => {
    const verifierToken = await token(verifierId, 'verifier@test.invalid', ['INCIDENT_VERIFIER']);
    const adminToken = await token(adminId, 'admin@test.invalid', ['ADMIN']);
    const studentToken = await token(studentId, 'student@test.invalid', ['STUDENT']);
    const payload = {
      version: 'test-v1',
      language: 'en',
      title: 'Synthetic reviewed instruction fixture',
      content: { fixture: 'Not official campus guidance' },
      contentHash: 'a'.repeat(64),
      sourceLabel: 'Automated TEST fixture',
    };
    const create = () =>
      request(app)
        .post('/api/v1/instruction-packs')
        .set('authorization', `Bearer ${verifierToken}`)
        .set('idempotency-key', 'instruction-create-key')
        .send(payload);
    const draft = await create();
    const draftReplay = await create();
    expect(draft.status).toBe(201);
    expect(draft.body.approvalState).toBe('DRAFT');
    expect(draftReplay.body.id).toBe(draft.body.id);

    const hidden = await request(app)
      .get(`/api/v1/instruction-packs/${draft.body.id}`)
      .set('authorization', `Bearer ${studentToken}`);
    expect(hidden.status).toBe(403);

    const prematurePublish = await request(app)
      .post(`/api/v1/instruction-packs/${draft.body.id}/publish`)
      .set('authorization', `Bearer ${adminToken}`)
      .set('idempotency-key', 'premature-publish');
    expect(prematurePublish.status).toBe(400);

    const reviewed = await request(app)
      .post(`/api/v1/instruction-packs/${draft.body.id}/review`)
      .set('authorization', `Bearer ${verifierToken}`)
      .set('idempotency-key', 'instruction-review-key')
      .send({ decision: 'APPROVE', notes: 'Synthetic test metadata reviewed' });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.approvalState).toBe('APPROVED');

    const cannotPublish = await request(app)
      .post(`/api/v1/instruction-packs/${draft.body.id}/publish`)
      .set('authorization', `Bearer ${studentToken}`)
      .set('idempotency-key', 'student-publish-key');
    expect(cannotPublish.status).toBe(403);

    const published = await request(app)
      .post(`/api/v1/instruction-packs/${draft.body.id}/publish`)
      .set('authorization', `Bearer ${adminToken}`)
      .set('idempotency-key', 'instruction-publish-key');
    expect(published.status).toBe(200);
    expect(published.body.approvalState).toBe('PUBLISHED');

    const available = await request(app)
      .get('/api/v1/instruction-packs?language=en')
      .set('authorization', `Bearer ${studentToken}`);
    expect(available.status).toBe(200);
    expect(available.body.items).toHaveLength(1);
    expect(available.body.items[0]).toMatchObject({
      id: draft.body.id,
      sourceLabel: 'Automated TEST fixture',
      approvalState: 'PUBLISHED',
    });
  });

  it('validates UUID paths and paginates incident lists with opaque cursors', async () => {
    const adminToken = await token(adminId, 'admin@test.invalid', ['ADMIN']);
    const invalid = await request(app)
      .get('/api/v1/incidents/not-a-uuid')
      .set('authorization', `Bearer ${adminToken}`);
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(invalid.body.error.requestId).toEqual(expect.any(String));

    const unknown = await request(app)
      .get(`/api/v1/incidents/${randomUUID()}`)
      .set('authorization', `Bearer ${adminToken}`);
    expect(unknown.status).toBe(404);

    for (let index = 0; index < 3; index += 1) {
      const created = await request(app)
        .post('/api/v1/incidents')
        .set(
          'authorization',
          `Bearer ${await token(studentId, 'student@test.invalid', ['STUDENT'])}`,
        )
        .set('idempotency-key', `pagination-incident-${index}`)
        .send({
          type: `PAGE_TEST_${index}`,
          description: `Synthetic pagination report ${index}`,
          priority: 'LOW',
          zoneId,
        });
      expect(created.status).toBe(201);
    }
    const first = await request(app)
      .get('/api/v1/incidents?limit=2')
      .set('authorization', `Bearer ${adminToken}`);
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const cursor = first.body.nextCursor as string;
    const second = await request(app)
      .get(`/api/v1/incidents?limit=2&cursor=${encodeURIComponent(cursor)}`)
      .set('authorization', `Bearer ${adminToken}`);
    expect(second.status).toBe(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
  });

  it('deduplicates repeated check-ins with the same idempotency key and client action', async () => {
    const created = await createUrgentIncident();
    const studentToken = await token(studentId, 'student@test.invalid', ['STUDENT']);
    const payload = {
      incidentId: created.body.id,
      status: 'CONFIRMED_SAFE',
      clientCreatedAt: new Date().toISOString(),
      clientActionId: randomUUID(),
    };
    const submit = () =>
      request(app)
        .post('/api/v1/checkins')
        .set('authorization', `Bearer ${studentToken}`)
        .set('idempotency-key', 'checkin-retry-key')
        .send(payload);
    const first = await submit();
    const retry = await submit();
    expect(first.status).toBe(201);
    expect(retry.body.id).toBe(first.body.id);
    const count = await pool.query<{ count: number }>(
      'SELECT count(*)::int count FROM student_checkins',
    );
    expect(count.rows[0]!.count).toBe(1);
  });

  it('processes zone alerts only through the simulated local adapter without claiming acknowledgment', async () => {
    const adminToken = await token(adminId, 'admin@test.invalid', ['ADMIN']);
    const draft = await request(app)
      .post('/api/v1/alerts')
      .set('authorization', `Bearer ${adminToken}`)
      .set('idempotency-key', 'synthetic-alert-draft')
      .send({
        zoneIds: [zoneId],
        title: 'Synthetic zone warning',
        message: 'This is a TEST-only warning.',
        precautionary: true,
        mode: 'TEST',
      });
    expect(draft.status).toBe(201);
    const authorized = await request(app)
      .post(`/api/v1/alerts/${draft.body.id}/authorize`)
      .set('authorization', `Bearer ${adminToken}`)
      .set('idempotency-key', 'synthetic-alert-authorize');
    expect(authorized.body).toMatchObject({ status: 'QUEUED', simulated: true, recipientCount: 2 });

    expect(await processOutboxBatch(pool, config, createLogger(config), false)).toBe(1);
    const deliveries = await pool.query<{ status: string }>(
      'SELECT status FROM alert_delivery_records WHERE alert_id = $1 ORDER BY recipient_id',
      [draft.body.id],
    );
    expect(deliveries.rows.map((row) => row.status)).toEqual([
      'SERVER_RECEIVED',
      'SERVER_RECEIVED',
    ]);
  });
  it('shows a student only their own help requests with server lifecycle state', async () => {
    const created = await createUrgentIncident();
    const studentToken = await token(studentId, 'student@test.invalid', ['STUDENT']);
    await request(app)
      .post('/api/v1/checkins')
      .set('authorization', `Bearer ${studentToken}`)
      .set('idempotency-key', 'mine-checkin')
      .send({
        incidentId: created.body.id,
        status: 'HELP_REQUESTED',
        helpDetails: 'Synthetic request for the mine endpoint',
        clientCreatedAt: new Date().toISOString(),
        clientActionId: randomUUID(),
      });
    const mine = await request(app)
      .get('/api/v1/help-requests/mine')
      .set('authorization', `Bearer ${studentToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0]).toMatchObject({
      incidentId: created.body.id,
      status: 'OPEN',
      responderAssigned: false,
    });
    expect(mine.body.items[0]).not.toHaveProperty('assignedResponderId');

    const other = await request(app)
      .get('/api/v1/help-requests/mine')
      .set(
        'authorization',
        `Bearer ${await token(otherStudentId, 'other@test.invalid', ['STUDENT'])}`,
      );
    expect(other.body.items).toEqual([]);

    const verifier = await request(app)
      .get('/api/v1/help-requests/mine')
      .set(
        'authorization',
        `Bearer ${await token(verifierId, 'verifier@test.invalid', ['INCIDENT_VERIFIER'])}`,
      );
    expect(verifier.status).toBe(403);
  });

  it('links inbox alerts to incident verification state and lists alerts only for staff', async () => {
    const created = await createUrgentIncident();
    const adminToken = await token(adminId, 'admin@test.invalid', ['ADMIN']);
    const draft = await request(app)
      .post('/api/v1/alerts')
      .set('authorization', `Bearer ${adminToken}`)
      .set('idempotency-key', 'linked-alert-draft')
      .send({
        incidentId: created.body.id,
        zoneIds: [zoneId],
        title: 'Synthetic linked warning',
        message: 'TEST-only linked warning.',
        precautionary: true,
        mode: 'TEST',
      });
    await request(app)
      .post(`/api/v1/alerts/${draft.body.id}/authorize`)
      .set('authorization', `Bearer ${adminToken}`)
      .set('idempotency-key', 'linked-alert-authorize');

    // Map placement: the alert's zone resolves to its building.
    const zoneBuilding = (
      await pool.query<{ building_id: string }>(
        'SELECT f.building_id FROM zones z JOIN floors f ON f.id = z.floor_id WHERE z.id = $1',
        [zoneId],
      )
    ).rows[0]!.building_id;
    const studentToken = await token(studentId, 'student@test.invalid', ['STUDENT']);
    const inbox = await request(app)
      .get('/api/v1/alerts/inbox')
      .set('authorization', `Bearer ${studentToken}`);
    expect(inbox.body.items[0]).toMatchObject({
      id: draft.body.id,
      incidentId: created.body.id,
      incidentVerificationStatus: 'REPORTED',
      alertStatus: 'QUEUED',
      acknowledgedAt: null,
      areaBuildingIds: [zoneBuilding],
    });
    expect(inbox.body.items[0]).toHaveProperty('incidentBuildingId');

    const staffList = await request(app)
      .get('/api/v1/alerts')
      .set('authorization', `Bearer ${adminToken}`);
    expect(staffList.body.items[0]).toMatchObject({
      id: draft.body.id,
      status: 'QUEUED',
      recipientCount: 2,
      acknowledgedCount: 0,
      areaBuildingIds: [zoneBuilding],
    });
    const studentList = await request(app)
      .get('/api/v1/alerts')
      .set('authorization', `Bearer ${studentToken}`);
    expect(studentList.status).toBe(403);
  });

  it('lists buildings with their approval state for authenticated users only', async () => {
    const studentToken = await token(studentId, 'student@test.invalid', ['STUDENT']);
    const listed = await request(app)
      .get('/api/v1/maps/buildings')
      .set('authorization', `Bearer ${studentToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.items.length).toBeGreaterThan(0);
    expect(listed.body.items[0]).toHaveProperty('geometryApproved');
    const anonymous = await request(app).get('/api/v1/maps/buildings');
    expect(anonymous.status).toBe(401);
  });
  it('returns only the caller own training results', async () => {
    const studentToken = await token(studentId, 'student@test.invalid', ['STUDENT']);
    const saved = await request(app)
      .post('/api/v1/training/results')
      .set('authorization', `Bearer ${studentToken}`)
      .set('idempotency-key', 'training-mine-key')
      .send({ scenarioRef: 'digital-drill', scenarioVersion: '1', score: 75, answers: { a: 1 } });
    expect(saved.status).toBe(201);
    const mine = await request(app)
      .get('/api/v1/training/results/mine')
      .set('authorization', `Bearer ${studentToken}`);
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0]).toMatchObject({ scenarioRef: 'digital-drill', score: 75 });
    const other = await request(app)
      .get('/api/v1/training/results/mine')
      .set(
        'authorization',
        `Bearer ${await token(otherStudentId, 'other@test.invalid', ['STUDENT'])}`,
      );
    expect(other.body.items).toEqual([]);
  });
});
