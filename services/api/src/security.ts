import { promisify } from 'node:util';
import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Role } from '@sahaya/contracts';
import type { Config } from './config.js';
import type { AuthenticatedUser } from './types.js';

const scrypt = promisify(nodeScrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, saltHex, hashHex] = encoded.split(':');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = (await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function secret(config: Config) {
  return new TextEncoder().encode(config.JWT_SECRET);
}

export async function issueAccessToken(config: Config, user: AuthenticatedUser): Promise<string> {
  return new SignJWT({ email: user.email, roles: user.roles })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer(config.JWT_ISSUER)
    .setAudience(config.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(secret(config));
}

export async function verifyAccessToken(config: Config, token: string): Promise<AuthenticatedUser> {
  const { payload } = await jwtVerify(token, secret(config), {
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
  });
  if (!payload.sub || typeof payload.email !== 'string' || !Array.isArray(payload.roles)) {
    throw new Error('Malformed access token');
  }
  return { id: payload.sub, email: payload.email, roles: payload.roles as Role[] };
}
