import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { uuidSchema, type Role } from '@sahaya/contracts';
import type { Config } from './config.js';
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

export const authenticate =
  (config: Config): RequestHandler =>
  async (request, _response, next) => {
    const value = request.header('authorization');
    if (!value?.startsWith('Bearer ')) {
      next(unauthorized());
      return;
    }
    try {
      request.auth = await verifyAccessToken(config, value.slice(7));
      next();
    } catch {
      next(unauthorized('The access token is invalid or expired'));
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
