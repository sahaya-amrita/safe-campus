import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
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
import { authRouter } from './routes/auth.js';
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

export function createApp(pool: DatabasePool, config: Config) {
  const app = express();
  const logger = createLogger(config);
  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(pinoHttp({ logger }));
  app.use(helmet());
  app.use(cors({ origin: /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/ }));
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
  app.use('/api/v1/auth', authRouter(pool, config));
  app.use('/api/v1', authenticate(config));
  app.use('/api/v1/users', usersRouter(pool));
  app.use('/api/v1/incidents', incidentsRouter(pool, config));
  app.use(
    '/api/v1/incidents/:incidentId/checkins',
    validateUuidParam('incidentId'),
    incidentCheckinsRouter(pool),
  );
  app.use('/api/v1/checkins', checkinsRouter(pool));
  app.use('/api/v1/help-requests', helpRequestsRouter(pool));
  app.use('/api/v1/instruction-packs', instructionPacksRouter(pool, config));
  app.use('/api/v1/responders', respondersRouter(pool));
  app.use('/api/v1/dispatches', dispatchesRouter(pool));
  app.use('/api/v1/alerts', alertsRouter(pool));
  app.use('/api/v1/trusted-contacts', trustedContactsRouter(pool, config));
  app.use('/api/v1/drills', drillsRouter(pool));
  app.use('/api/v1/training', trainingRouter(pool));
  app.use('/api/v1/maps', mapsRouter(pool));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
