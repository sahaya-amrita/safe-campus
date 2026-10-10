/** Assistant routes, mounted by createApp. Interpret requires authentication; health is public and secret-free. */
import { ASSISTANT_LIMITS, assistantInterpretRequestSchema, roleSchema } from '@sahaya/contracts';
import { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import { ApiError, unauthorized } from '../errors.js';
import { requireRoles } from '../middleware.js';
import type { AssistantLimits } from './rateLimit.js';
import type { AssistantService } from './service.js';

export interface AssistantHealth {
  status: 'ready' | 'degraded' | 'disabled';
  provider: 'groq' | 'mock' | 'disabled';
  model: string | null;
  modelCheck: 'ok' | 'not_listed' | 'unchecked' | 'error';
}

export function assistantHealthRouter(getHealth: () => AssistantHealth): Router {
  const router = Router();
  router.get('/health', (_request, response) => {
    response.set('Cache-Control', 'no-store').json(getHealth());
  });
  return router;
}

/** The global JSON parser accepts 256kb; this route is held to a much smaller size. */
const limitBodySize: RequestHandler = (request, _response, next) => {
  const declared = Number(request.header('content-length') ?? 0);
  const actual = Buffer.byteLength(JSON.stringify(request.body ?? {}));
  if (declared > ASSISTANT_LIMITS.bodyMaxBytes || actual > ASSISTANT_LIMITS.bodyMaxBytes) {
    next(
      new ApiError(
        413,
        'PAYLOAD_TOO_LARGE',
        `Assistant requests are limited to ${ASSISTANT_LIMITS.bodyMaxBytes} bytes`,
      ),
    );
    return;
  }
  next();
};

export function assistantRouter(service: AssistantService, limits: AssistantLimits): Router {
  const router = Router();
  router.post(
    '/interpret',
    requireRoles(...roleSchema.options),
    limitBodySize,
    (request, response, next) => {
      const retryAfter = limits.user(request.auth!.id);
      if (retryAfter > 0) {
        response.setHeader('Retry-After', String(retryAfter));
        next(new ApiError(429, 'RATE_LIMITED', 'Too many assistant requests. Try again shortly.'));
        return;
      }
      next();
    },
    async (request, response, next) => {
      const parsed = assistantInterpretRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        // Field paths only; never echo the question back.
        const fields = parsed.error.issues.map((i) => i.path.join('.') || '(body)');
        next(new ApiError(400, 'VALIDATION_ERROR', 'Assistant request is invalid', { fields }));
        return;
      }
      if (!request.auth) {
        next(unauthorized());
        return;
      }
      try {
        response.set('Cache-Control', 'no-store');
        response.json(
          await service.interpret(parsed.data, {
            userId: request.auth.id,
            roles: request.auth.roles,
          }),
        );
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}

/**
 * Turns body-parser failures on assistant routes into clean 400/413 errors
 * (the global handler would otherwise report them as 500). Scoped to
 * /api/v1/assistant only.
 */
export const parseErrorHandler: ErrorRequestHandler = (error, _request, _response, next) => {
  const type = (error as { type?: string }).type;
  if (type === 'entity.parse.failed') {
    next(new ApiError(400, 'MALFORMED_JSON', 'Request body must be valid JSON'));
    return;
  }
  if (type === 'entity.too.large') {
    next(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large'));
    return;
  }
  next(error);
};
