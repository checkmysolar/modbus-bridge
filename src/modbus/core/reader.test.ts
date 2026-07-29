import { beforeEach, describe, expect, it, vi } from 'vitest';

const writeRegister = vi.fn();
const connectTCP = vi.fn().mockResolvedValue(undefined);

vi.mock('modbus-serial', () => ({
  default: class {
    connectTCP = connectTCP;
    setID = vi.fn();
    setTimeout = vi.fn();
    close = vi.fn((callback: () => void) => callback());
    readHoldingRegisters = vi.fn();
    readInputRegisters = vi.fn();
    writeRegister = writeRegister;
  },
}));

import { ModbusReader } from './reader.js';

describe('ModbusReader writeHoldingRegister', () => {
  beforeEach(() => {
    writeRegister.mockReset();
    writeRegister.mockResolvedValue({ address: 0, value: 0 });
    connectTCP.mockClear();
  });

  it('retries failed writes before succeeding', async () => {
    writeRegister
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ address: 41000, value: 1 });

    const reader = new ModbusReader({ host: '127.0.0.1', port: 502, unitId: 247, timeoutMs: 1000 });
    await reader.connect();
    await reader.writeHoldingRegister(41000, 1);

    expect(writeRegister).toHaveBeenCalledTimes(3);
    expect(writeRegister).toHaveBeenLastCalledWith(41000, 1);
  });

  it('serializes concurrent writes through the shared lock', async () => {
    const order: string[] = [];
    writeRegister.mockImplementation(async (address: number) => {
      order.push(`start-${address}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push(`end-${address}`);
      return { address, value: 0 };
    });

    const reader = new ModbusReader({ host: '127.0.0.1', port: 502, unitId: 247, timeoutMs: 1000 });
    await reader.connect();

    await Promise.all([
      reader.writeHoldingRegister(44000, 0),
      reader.writeHoldingRegister(44001, 3600),
    ]);

    expect(order).toEqual(['start-44000', 'end-44000', 'start-44001', 'end-44001']);
  });
});
