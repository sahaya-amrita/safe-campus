import { ApiError } from './errors.js';

export type PageCursor = { createdAt: string; id: string };

export function encodeCursor(cursor: PageCursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(value: string | undefined): PageCursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as PageCursor;
    if (
      !parsed ||
      typeof parsed.createdAt !== 'string' ||
      Number.isNaN(Date.parse(parsed.createdAt)) ||
      typeof parsed.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.id)
    ) {
      throw new Error('invalid cursor');
    }
    return parsed;
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Cursor is invalid');
  }
}

export function paginatedResponse<T extends { id: string; createdAt: Date | string }>(
  rows: T[],
  limit: number,
) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeCursor({
            createdAt:
              last.createdAt instanceof Date ? last.createdAt.toISOString() : last.createdAt,
            id: last.id,
          })
        : null,
  };
}
