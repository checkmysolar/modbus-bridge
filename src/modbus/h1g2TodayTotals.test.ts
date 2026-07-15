import { describe, expect, it } from 'vitest';
import {
  decodeTodayTotalRaw,
  H1_G2_ENERGY_COUNTERS_START,
  parseH1G2TodayTotalsFromBlock,
} from './h1g2TodayTotals.js';

describe('H1 G2 today totals parsing', () => {
  it('scales unsigned today totals by 0.1 kWh', () => {
    expect(decodeTodayTotalRaw(123)).toBeCloseTo(12.3);
  });

  it('scales signed today totals by 0.1 kWh', () => {
    expect(decodeTodayTotalRaw(65535, true)).toBeCloseTo(-0.1);
  });

  it('maps register offsets into named today totals', () => {
    const block = new Array(24).fill(0);
    block[2] = 150; // 32002 solar
    block[5] = 40; // 32005 battery charge
    block[8] = 30; // 32008 battery discharge
    block[11] = 20; // 32011 feed-in
    block[14] = 10; // 32014 grid import
    block[17] = 5; // 32017 yield
    block[20] = 3; // 32020 input
    block[23] = 80; // 32023 load

    const snapshot = parseH1G2TodayTotalsFromBlock(block, H1_G2_ENERGY_COUNTERS_START, '2026-07-15T12:00:00.000Z');
    const byKey = Object.fromEntries(snapshot.totals.map((total) => [total.key, total.kwh]));

    expect(byKey.solarGeneration).toBeCloseTo(15);
    expect(byKey.batteryCharge).toBeCloseTo(4);
    expect(byKey.batteryDischarge).toBeCloseTo(3);
    expect(byKey.feedIn).toBeCloseTo(2);
    expect(byKey.gridConsumption).toBeCloseTo(1);
    expect(byKey.totalYield).toBeCloseTo(0.5);
    expect(byKey.inputEnergy).toBeCloseTo(0.3);
    expect(byKey.loadEnergy).toBeCloseTo(8);
    expect(snapshot.sampledAt).toBe('2026-07-15T12:00:00.000Z');
  });
});
