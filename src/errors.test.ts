import { describe, expect, it } from 'vitest';
import { formatError } from './errors.js';

describe('formatError', () => {
  it('formats native Error instances', () => {
    expect(formatError(new Error('Telemetry push failed'))).toBe('Telemetry push failed');
  });

  it('formats modbus-serial style errors with message and errno', () => {
    expect(
      formatError({
        name: 'TransactionTimedOutError',
        message: 'Timed out',
        errno: 'ETIMEDOUT',
      })
    ).toBe('Timed out (ETIMEDOUT)');
  });

  it('formats plain objects without a message', () => {
    expect(formatError({ code: 'ECONNRESET' })).toBe('{"code":"ECONNRESET"}');
  });

  it('formats primitives', () => {
    expect(formatError('connection lost')).toBe('connection lost');
  });
});
