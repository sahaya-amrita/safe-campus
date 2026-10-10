import { describe, expect, it } from 'vitest';
import { normaliseApiBaseUrl } from './apiConfig';

describe('normaliseApiBaseUrl', () => {
  it('handles full URLs, bare hosts and the dev default', () => {
    expect(normaliseApiBaseUrl('https://api.example.test/', false)).toBe(
      'https://api.example.test',
    );
    expect(normaliseApiBaseUrl('safe-campus-api.onrender.com', false)).toBe(
      'https://safe-campus-api.onrender.com',
    );
    expect(normaliseApiBaseUrl('', true)).toBe('http://localhost:3000');
    expect(normaliseApiBaseUrl('', false)).toBe('');
  });
});
