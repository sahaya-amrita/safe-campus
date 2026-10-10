import pino from 'pino';
import type { Config } from './config.js';

export function createLogger(config: Config) {
  return pino({
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'password',
        '*.password',
        '*.contactValue',
        '*.evidence.objectKey',
        '*.question',
        '*.history',
      ],
      censor: '[REDACTED]',
    },
  });
}
