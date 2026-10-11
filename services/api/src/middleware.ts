import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { roleSchema, uuidSchema, type Role } from '@sahaya/contracts';
import type { Config } from './config.js';
import type { DatabasePool } from './db.js';
import { ApiError, forbidden, unauthorized } from './errors.js';
import { verifyAccessToken } from './security.js';

export const requestContext: RequestHandler = (request, response, next) => {
  request.requestId = request.header('x-request-id') ?? randomUUID();
  response.setHeader('x-request-id', request.requestId);
  next();
};

export const validateBody =
  (schema: ZodType): RequestHandler =>
  (request, _response, next) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      next(
        new ApiError(400, 'VALIDATION_ERROR', 'Request body is invalid', parsed.error.flatten()),
      );
      return;
    }
    request.body = parsed.data;
    next();
  };

/**
 * Verifies the bearer token, then loads the account from the database: a
 * disabled account, or a token issued before the account's sessions were
 * revoked, is rejected, and roles always come from the database (a role
 * removed by an ADMIN stops working on the next request).
 */
export const authenticate =
  (config: Config, pool: DatabasePool): RequestHandler =>
  async (request, _response, next) => {
    const value = request.header('authorization');
    if (!value?.startsWith('Bearer ')) {
      next(unauthorized());
      return;
    }
    let token;
    try {
      token = await verifyAccessToken(config, value.slice(7));
    } catch {
      next(unauthorized('The access token is invalid or expired'));
      return;
    }
    try {
      const account = await pool.query<{
        status: string;
        sessions_valid_after: Date | null;
      }>('SELECT status, sessions_valid_after FROM users WHERE id = $1', [token.id]);
      const row = account.rows[0];
      if (!row || row.status !== 'ACTIVE') {
        next(unauthorized('This account cannot sign in'));
        return;
      }
      if (
        row.sessions_valid_after &&
        token.issuedAtMs < new Date(row.sessions_valid_after).getTime()
      ) {
        next(unauthorized('This session was signed out. Sign in again.'));
        return;
      }
      const roles = await pool.query<{ role: string }>(
        'SELECT role FROM user_roles WHERE user_id = $1 ORDER BY role',
        [token.id],
      );
      request.auth = {
        id: token.id,
        email: token.email,
        roles: roleSchema.array().parse(roles.rows.map((r) => r.role)),
      };
      next();
    } catch (error) {
      next(error);
    }
  };

export const requireRoles =
  (...roles: Role[]): RequestHandler =>
  (request, _response, next) => {
    if (!request.auth) {
      next(unauthorized());
      return;
    }
    if (!roles.some((role) => request.auth?.roles.includes(role))) {
      next(forbidden());
      return;
    }
    next();
  };

export const validateUuidParam =
  (name: string): RequestHandler =>
  (request, _response, next) => {
    const parsed = uuidSchema.safeParse(request.params[name]);
    if (!parsed.success) {
      next(
        new ApiError(400, 'VALIDATION_ERROR', `Path parameter ${name} must be a valid UUID`, {
          field: name,
        }),
      );
      return;
    }
    request.params[name] = parsed.data;
    next();
  };

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new ApiError(404, 'ROUTE_NOT_FOUND', `No route for ${request.method} ${request.path}`));
};

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const normalized =
    error instanceof ApiError
      ? error
      : new ApiError(500, 'INTERNAL_ERROR', 'An unexpected server error occurred');
  request.log?.error({ err: error, requestId: request.requestId }, 'request failed');
  response.status(normalized.status).json({
    error: {
      code: normalized.code,
      message: normalized.message,
      requestId: request.requestId,
      ...(normalized.details === undefined ? {} : { details: normalized.details }),
    },
  });
};
