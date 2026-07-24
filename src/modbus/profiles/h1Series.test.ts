import { describe, expect, it, vi } from 'vitest';
import { mapH1G2TodayTotalsSnapshotToFoxShape } from '../h1g2TodayTotals.js';
import { readH1SeriesTodayTotals } from './h1Series.js';
import type { ModbusReader } from '../core/reader.js';
import type { ProfileContext } from './types.js';

const AUX_CONTEXT: ProfileContext = { connectionType: 'aux', firmwareVariant: 'default' };
const LAN_CONTEXT: ProfileContext = { connectionType: 'lan', firmwareVariant: 'default' };

function mockReader(overrides: Partial<ModbusReader> = {}): ModbusReader {
  return {
    readScatteredWords: vi.fn(),
    readHolding: vi.fn(),
    ...overrides,
  } as unknown as ModbusReader;
}

describe('readH1SeriesTodayTotals', () => {
  it('reads G1 AUX today totals from input registers via batched scattered reads', async () => {
    const inputValues: Record<number, number> = {
      11071: 150,
      11074: 40,
      11077: 30,
      11080: 20,
      11083: 10,
      11086: 5,
      11089: 3,
      11092: 80,
    };
    const readScatteredWords = vi.fn(async (kind: string, addresses: readonly number[]) => {
      expect(kind).toBe('input');
      const result = new Map<number, number>();
      for (const address of addresses) {
        result.set(address, inputValues[address]!);
      }
      return result;
    });
    const readHolding = vi.fn();
    const reader = mockReader({ readScatteredWords, readHolding });

    const snapshot = await readH1SeriesTodayTotals(reader, AUX_CONTEXT, '2026-07-15T12:00:00.000Z');

    expect(readScatteredWords).toHaveBeenCalledOnce();
    expect(readHolding).not.toHaveBeenCalled();

    const byKey = Object.fromEntries(snapshot.totals.map((total) => [total.key, total.kwh]));
    expect(byKey.solarGeneration).toBeCloseTo(15);
    expect(byKey.batteryCharge).toBeCloseTo(4);
    expect(byKey.batteryDischarge).toBeCloseTo(3);
    expect(byKey.feedIn).toBeCloseTo(2);
    expect(byKey.gridConsumption).toBeCloseTo(1);
    expect(byKey.loadEnergy).toBeCloseTo(8);
    expect(mapH1G2TodayTotalsSnapshotToFoxShape(snapshot)).toEqual({
      generation: 15,
      feedin: 2,
      gridConsumption: 1,
      chargeEnergyToTal: 4,
      dischargeEnergyToTal: 3,
      loadConsumption: 8,
    });
  });

  it('reads LAN today totals from holding block at 32000', async () => {
    const block = new Array(24).fill(0);
    block[2] = 150;
    block[5] = 40;
    block[8] = 30;
    block[11] = 20;
    block[14] = 10;
    block[23] = 80;

    const readHolding = vi.fn(async () => block);
    const readScatteredWords = vi.fn();
    const reader = mockReader({ readHolding, readScatteredWords });

    const snapshot = await readH1SeriesTodayTotals(reader, LAN_CONTEXT, '2026-07-15T12:00:00.000Z');

    expect(readHolding).toHaveBeenCalledWith(32000, 24);
    expect(readScatteredWords).not.toHaveBeenCalled();
    expect(snapshot.totals.find((total) => total.key === 'solarGeneration')?.kwh).toBeCloseTo(15);
  });
});
