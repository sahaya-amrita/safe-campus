import { describe, expect, it } from 'vitest';
import type { MessageDeliveryStatus } from '../contracts/studentContract';
import { trackFor } from './DeliveryTrack';

describe('trackFor', () => {
  it.each<[MessageDeliveryStatus, string[]]>([
    ['LOCAL_ONLY', ['done', 'paused', 'todo', 'untracked']],
    ['QUEUED', ['done', 'paused', 'todo', 'untracked']],
    ['SENDING', ['done', 'current', 'todo', 'untracked']],
    ['SERVER_RECEIVED', ['done', 'done', 'done', 'untracked']],
    ['ACKNOWLEDGED', ['done', 'done', 'done', 'done']],
    ['FAILED', ['done', 'failed', 'todo', 'untracked']],
  ])('%s → %j', (status, expected) => {
    expect(trackFor(status)).toEqual(expected);
  });

  it('only marks the responder step reached for a server-reported ACKNOWLEDGED', () => {
    for (const status of ['LOCAL_ONLY', 'QUEUED', 'SENDING', 'SERVER_RECEIVED', 'FAILED'] as const) {
      expect(trackFor(status)[3]).toBe('untracked');
    }
  });

  it('only reaches "Received by server" once the server has confirmed it', () => {
    for (const status of ['LOCAL_ONLY', 'QUEUED', 'SENDING', 'FAILED'] as const) {
      expect(trackFor(status)[2]).toBe('todo');
    }
  });
});
