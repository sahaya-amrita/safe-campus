import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const utcTimestampSchema = z.string().datetime({ offset: true });
