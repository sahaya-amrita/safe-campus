// End-to-end acceptance run against a live, seeded DEMO API.
//
//   API_URL=http://127.0.0.1:3000 node scripts/e2e-acceptance.mjs
//
// Uses only the fictional accounts from `pnpm db:seed`. Every write is DEMO
// data; nothing here contacts real people or emergency services. Run it
// against a dedicated test database: it adds incidents, alerts and requests.
import { randomUUID } from 'node:crypto';

const API = (process.env.API_URL ?? 'http://127.0.0.1:3000')
  .replace(/\/+$/, '')
  .replace(/\/api\/v1$/, '');
const ACCOUNTS = {
  student: ['student.demo@example.invalid', 'DemoStudent!2026'],
  responder: ['responder.demo@example.invalid', 'DemoResponder!2026'],
  verifier: ['verifier.demo@example.invalid', 'DemoVerifier!2026'],
  admin: ['admin.demo@example.invalid', 'DemoAdmin!2026'],
};

let step = 0;
const results = [];
async function check(name, fn) {
  step += 1;
  try {
    const detail = await fn();
    results.push({ step, name, ok: true });
    console.log(`PASS ${String(step).padStart(2)} ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (error) {
    results.push({ step, name, ok: false });
    console.log(
      `FAIL ${String(step).padStart(2)} ${name} — ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

async function call(token, method, path, body, expected = [200, 201]) {
  const response = await fetch(`${API}/api/v1${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(method !== 'GET' ? { 'Idempotency-Key': randomUUID() } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!expected.includes(response.status)) {
    throw new Error(
      `${method} ${path} → ${response.status} ${json?.error?.code ?? ''} ${json?.error?.message ?? ''}`,
    );
  }
  return json;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const tokens = {};
let incident;
let zoneId;
let buildingId;
let helpRequestId;

try {
  await check('Students and staff authenticate (DEMO login)', async () => {
    for (const [role, [email, password]] of Object.entries(ACCOUNTS)) {
      const login = await call(null, 'POST', '/auth/demo-login', { email, password });
      tokens[role] = login.accessToken;
    }
    const me = await call(tokens.student, 'GET', '/users/me');
    assert(
      me.roles.includes('STUDENT') && me.mode === 'DEMO',
      'student profile is not a DEMO student',
    );
    return `student mode ${me.mode}`;
  });

  await check('Student submits a simulated incident with a building and zone', async () => {
    const buildings = await call(tokens.student, 'GET', '/maps/buildings');
    const building = buildings.items.find((b) => b.metadata?.synthetic);
    assert(building, 'seeded DEMO building missing');
    buildingId = building.id;
    const map = await call(tokens.student, 'GET', `/maps/${building.id}/approved`);
    assert(
      map.operationalRoutingAllowed === false && map.warning,
      'demo geometry must not allow routing',
    );
    const floor = map.floors[0];
    zoneId = floor.zones[0].id;
    incident = await call(tokens.student, 'POST', '/incidents', {
      type: 'SMOKE_OR_FIRE',
      description: 'E2E DEMO: synthetic smoke report for acceptance testing',
      priority: 'CRITICAL',
      buildingId: building.id,
      floorId: floor.id,
      zoneId,
      evidence: [],
    });
    assert(incident.verificationStatus === 'REPORTED', 'new report must be REPORTED');
    assert(
      incident.dispatch?.simulated === true,
      'critical report should create a simulated dispatch',
    );
    return `incident ${incident.id.slice(0, 8)} REPORTED, dispatch simulated`;
  });

  await check('Responder sees the incident in the queue', async () => {
    const list = await call(tokens.responder, 'GET', '/incidents?limit=100');
    assert(
      list.items.some((i) => i.id === incident.id),
      'incident not visible to responder',
    );
  });

  await check('Student cannot verify; authorised verifier verifies', async () => {
    await call(
      tokens.student,
      'POST',
      `/incidents/${incident.id}/reviews`,
      { status: 'VERIFIED', reason: 'student attempt' },
      [403],
    );
    const review = await call(tokens.verifier, 'POST', `/incidents/${incident.id}/reviews`, {
      status: 'VERIFIED',
      reason: 'E2E DEMO verification by fictional verifier',
    });
    assert(review.toStatus === 'VERIFIED', 'verification failed');
  });

  await check('Simulated dispatch is listed and accepted by the responder', async () => {
    // The API's in-process simulated outbox moves CREATED → NOTIFIED (OUTBOX_POLL_MS).
    let dispatch;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const dispatches = await call(tokens.responder, 'GET', '/dispatches?limit=100');
      dispatch = dispatches.items.find((d) => d.incidentId === incident.id);
      if (dispatch?.status === 'NOTIFIED') break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert(dispatch, 'dispatch not visible to responder');
    assert(
      dispatch.status === 'NOTIFIED',
      `dispatch still ${dispatch.status}: is the simulated outbox running?`,
    );
    const accepted = await call(tokens.responder, 'POST', `/dispatches/${dispatch.id}/acknowledge`);
    assert(accepted.status === 'ACCEPTED', 'dispatch not accepted');
    return `dispatch ${dispatch.status} → ACCEPTED (simulated)`;
  });

  await check('Admin alerts the zone; the student inbox links the verified incident', async () => {
    const draft = await call(tokens.admin, 'POST', '/alerts', {
      incidentId: incident.id,
      zoneIds: [zoneId],
      title: 'E2E DEMO: smoke reported in DEMO Zone A',
      message: 'Simulated alert for acceptance testing. Follow official instructions.',
      precautionary: true,
      mode: 'DEMO',
    });
    const authorized = await call(tokens.admin, 'POST', `/alerts/${draft.id}/authorize`);
    assert(
      authorized.simulated === true && authorized.recipientCount >= 1,
      'alert not queued for the student',
    );
    const inbox = await call(tokens.student, 'GET', '/alerts/inbox');
    const item = inbox.items.find((a) => a.id === draft.id);
    assert(
      item?.incidentId === incident.id && item.incidentVerificationStatus === 'VERIFIED',
      'inbox missing link/verification',
    );
    await call(tokens.student, 'POST', `/alerts/${draft.id}/acknowledge`);
  });

  await check('Student submits HELP_REQUESTED for the incident', async () => {
    const checkin = await call(tokens.student, 'POST', '/checkins', {
      incidentId: incident.id,
      status: 'HELP_REQUESTED',
      helpDetails: 'E2E DEMO: synthetic help request',
      clientCreatedAt: new Date().toISOString(),
      clientActionId: randomUUID(),
    });
    assert(
      checkin.deliveryStatus === 'SERVER_RECEIVED' && checkin.helpRequest?.status === 'OPEN',
      'help request not opened',
    );
    helpRequestId = checkin.helpRequest.id;
  });

  for (const action of ['acknowledge', 'assign', 'resolve']) {
    await check(`Responder ${action}s the persistent help request`, async () => {
      const result = await call(
        tokens.responder,
        'POST',
        `/help-requests/${helpRequestId}/${action}`,
        action === 'assign' ? {} : undefined,
      );
      return result.status;
    });
  }

  await check('Student sees the updated server status; roll-call counts it', async () => {
    const mine = await call(tokens.student, 'GET', '/help-requests/mine');
    const request = mine.items.find((h) => h.id === helpRequestId);
    assert(
      request?.status === 'RESOLVED' && request.responderAssigned === true,
      'student does not see RESOLVED',
    );
    const summary = await call(
      tokens.responder,
      'GET',
      `/incidents/${incident.id}/checkins/summary`,
    );
    assert(summary.counts.HELP_REQUESTED >= 1, 'roll-call missing the help request');
    return `RESOLVED · roll-call ${JSON.stringify(summary.counts)}`;
  });

  await check('Digital twin can place the incident on an illustrative footprint', async () => {
    const buildings = await call(tokens.responder, 'GET', '/maps/buildings');
    const building = buildings.items.find((b) => b.id === buildingId);
    assert(
      building?.metadata?.mapFeatureId && building.geometryApproved === false,
      'no illustrative map placement',
    );
    return `${building.metadata.mapFeatureId} (${building.metadata.mapPlacement})`;
  });

  await check('Verifier approves and admin publishes the DEMO instruction pack', async () => {
    const queue = await call(tokens.verifier, 'GET', '/instruction-packs/review-queue');
    const pack = queue.items.find((p) => p.version === 'demo-1' && p.language === 'en');
    assert(pack, 'seeded DEMO pack missing');
    if (pack.approvalState === 'DRAFT') {
      await call(tokens.verifier, 'POST', `/instruction-packs/${pack.id}/review`, {
        decision: 'APPROVE',
        notes: 'E2E DEMO review',
      });
    }
    if (pack.approvalState !== 'PUBLISHED')
      await call(tokens.admin, 'POST', `/instruction-packs/${pack.id}/publish`);
    const published = await call(tokens.student, 'GET', '/instruction-packs?language=en');
    assert(
      published.items.some((p) => p.id === pack.id),
      'student cannot see the published pack',
    );
    return 'PUBLISHED and visible to students';
  });

  await check('Tom answers a preparedness question from permitted content', async () => {
    const health = await call(null, 'GET', '/assistant/health');
    const answer = await call(tokens.student, 'POST', '/assistant/interpret', {
      question: 'Where can I read the preparedness basics instructions?',
      context: { screen: 'student.home', locale: 'en' },
      history: [],
    });
    assert(typeof answer.answer === 'string' && answer.answer.length > 0, 'no answer');
    const refs = (answer.references ?? [])
      .map((r) => `${r.kind}:${r.reviewState ?? r.state ?? ''}`)
      .join(',');
    return `provider ${health.provider} · ${answer.type} · origin ${answer.origin?.source} · refs [${refs}]`;
  });
} catch {
  // Reported above.
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed against ${API}`);
process.exit(failed ? 1 : 0);
