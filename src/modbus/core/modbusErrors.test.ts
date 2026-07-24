import { describe, expect, it } from 'vitest';
import { isIllegalDataAddressError } from './modbusErrors.js';

describe('isIllegalDataAddressError', () => {
  it('detects modbus exception 2 messages', () => {
    expect(isIllegalDataAddressError(new Error('Modbus exception 2: Illegal data address'))).toBe(true);
  });

  it('detects plain illegal data address text', () => {
    expect(isIllegalDataAddressError('Timed out reading illegal data address')).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isIllegalDataAddressError(new Error('Timed out (ETIMEDOUT)'))).toBe(false);
  });
});
