import { describe, expect, it } from 'vitest';
import { ModbusReader } from './reader.js';

describe('ModbusReader blacklisting', () => {
  it('returns undefined for blacklisted optional reads without connecting', async () => {
    const reader = new ModbusReader({ host: '127.0.0.1', port: 502, unitId: 247, timeoutMs: 1000 });
    (reader as unknown as { blacklistAddress(kind: 'holding', address: number): void }).blacklistAddress(
      'holding',
      41000
    );

    await expect(reader.readHoldingWordOptional(41000)).resolves.toBeUndefined();
    expect(reader.isBlacklisted('holding', 41000)).toBe(true);
  });
});
