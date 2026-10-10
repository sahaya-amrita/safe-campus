import type pg from 'pg';
import { createHash } from 'node:crypto';
import { conflict } from './errors.js';
import { badRequest } from './errors.js';

export function requireIdempotencyKey(value: string | undefined) {
  if (!value || value.length < 8 || value.length > 200) {
    throw badRequest('A valid Idempotency-Key header is required');
  }
  return value;
}

export function requestHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function getIdempotentResponse(
  client: pg.PoolClient,
  ownerId: string,
  scope: string,
  key: string,
  hash: string,
) {
  const result = await client.query<{
    request_hash: string;
    response_status: number;
    response_body: unknown;
  }>(
    `SELECT request_hash, response_status, response_body
       FROM idempotency_keys WHERE owner_id = $1 AND scope = $2 AND key = $3`,
    [ownerId, scope, key],
  );
  const existing = result.rows[0];
  if (!existing) return undefined;
  if (existing.request_hash !== hash)
    throw conflict('Idempotency key was already used for another request');
  return { status: existing.response_status, body: existing.response_body };
}

export async function saveIdempotentResponse(
  client: pg.PoolClient,
  ownerId: string,
  scope: string,
  key: string,
  hash: string,
  status: number,
  body: unknown,
) {
  await client.query(
    `INSERT INTO idempotency_keys
       (owner_id, scope, key, request_hash, response_status, response_body)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [ownerId, scope, key, hash, status, JSON.stringify(body)],
  );
}
