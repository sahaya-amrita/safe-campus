import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { loadAllowedOrigins } from './assistant/config.js';
import { createAssistant, type AssistantOptions } from './assistant/index.js';
import type { Config } from './config.js';
import type { DatabasePool } from './db.js';
import { createLogger } from './logger.js';
import {
  authenticate,
  errorHandler,
  notFoundHandler,
  requestContext,
  validateUuidParam,
} from './middleware.js';
import { createEmailSender, DevMailbox, type EmailSender } from './auth/email.js';
import { adminRouter } from './routes/admin.js';
import { attachmentsRouter } from './routes/attachments.js';
import { sosRouter } from './routes/sos.js';
import { adminRespondersRouter, responderSelfRouter, rollCallRouter } from './routes/operations.js';
import { authRouter, devMailboxRouter } from './routes/auth.js';
import { alertsRouter } from './routes/alerts.js';
import { checkinsRouter, incidentCheckinsRouter } from './routes/checkins.js';
import { drillsRouter, trainingRouter } from './routes/drills.js';
import { incidentsRouter } from './routes/incidents.js';
import { helpRequestsRouter } from './routes/help-requests.js';
import { instructionPacksRouter } from './routes/instruction-packs.js';
import { mapsRouter } from './routes/maps.js';
import { dispatchesRouter, respondersRouter } from './routes/responders.js';
import { trustedContactsRouter } from './routes/trusted-contacts.js';
import { usersRouter } from './routes/users.js';

export function createApp(
  pool: DatabasePool,
  config: Config,
  options: {
    assistant?: AssistantOptions;
    /** Overrides the configured sign-in email sender (null = none). Used by tests. */
    emailSender?: EmailSender | null;
  } = {},
) {
  const app = express();
  const logger = createLogger(config);
  const emailSender =
    options.emailSender !== undefined ? options.emailSender : createEmailSender(config, logger);
  app.disable('x-powered-by');
  if (config.TRUST_PROXY) app.set('trust proxy', config.TRUST_PROXY);
  app.use(requestContext);
  app.use(pinoHttp({ logger }));
  app.use(helmet());
  // Local origins outside production, plus exact deployed origins from CORS_ALLOWED_ORIGINS.
  const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  const allowedOrigins = loadAllowedOrigins();
  app.use(
    cors({
      origin: (origin, callback) =>
        callback(
          null,
          !origin ||
            allowedOrigins.includes(origin) ||
            (config.NODE_ENV !== 'production' && localOrigin.test(origin)),
        ),
    }),
  );
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/v1/health', async (_request, response) => {
    const started = performance.now();
    await pool.query('SELECT 1');
    response.json({
      status: 'ok',
      service: 'amrita-sahaya-api',
      mode: config.OPERATING_MODE,
      database: 'connected',
      latencyMs: Math.round(performance.now() - started),
      timestamp: new Date().toISOString(),
    });
  });
  app.use('/api/v1/auth', authRouter(pool, config, emailSender, logger));
  if (config.NODE_ENV !== 'production' && emailSender instanceof DevMailbox)
    app.use('/api/v1/dev', devMailboxRouter(emailSender));
  // Tom assistant (src/assistant): public health first, interpret after authenticate.
  const assistant = createAssistant(pool, config, logger, options.assistant);
  app.use('/api/v1/assistant', assistant.parseErrorHandler);
  app.use('/api/v1/assistant', assistant.healthRouter);
  app.use('/api/v1', authenticate(config, pool));
  app.use('/api/v1/assistant', assistant.router);
  app.use('/api/v1/users', usersRouter(pool));
  app.use('/api/v1/admin/responders', adminRespondersRouter(pool, config));
  app.use('/api/v1/admin', adminRouter(pool));
  app.use('/api/v1/incidents', incidentsRouter(pool, config));
  app.use(
    '/api/v1/incidents/:incidentId/checkins',
    validateUuidParam('incidentId'),
    incidentCheckinsRouter(pool),
  );
  app.use('/api/v1/checkins', checkinsRouter(pool));
  app.use('/api/v1/help-requests', helpRequestsRouter(pool));
  app.use('/api/v1/sos', sosRouter(pool, config));
  app.use('/api/v1/attachments', attachmentsRouter(pool));
  app.use('/api/v1/instruction-packs', instructionPacksRouter(pool, config));
  app.use('/api/v1/responders/me', responderSelfRouter(pool));
  app.use('/api/v1/responders', respondersRouter(pool));
  app.use('/api/v1/roll-call', rollCallRouter(pool));
  app.use('/api/v1/dispatches', dispatchesRouter(pool));
  app.use('/api/v1/alerts', alertsRouter(pool));
  app.use('/api/v1/trusted-contacts', trustedContactsRouter(pool, config));
  app.use('/api/v1/drills', drillsRouter(pool));
  app.use('/api/v1/training', trainingRouter(pool));
  app.use('/api/v1/maps', mapsRouter(pool, config));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
