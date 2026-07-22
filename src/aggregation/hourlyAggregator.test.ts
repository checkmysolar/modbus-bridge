import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import { HourlyAggregator } from './hourlyAggregator.js';
import { parseH1G2TodayTotalsFromBlock, H1_G2_ENERGY_COUNTERS_START } from '../modbus/h1g2TodayTotals.js';
import { RealtimeStore } from '../storage/sqlite.js';

const tempDirs: string[] = [];

function createStore(): RealtimeStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-test-'));
  tempDirs.push(dir);
  return new RealtimeStore(dir);
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const sampleTelemetry = (
  sampledAt: string,
  pvPower: number
): ModbusRealtimeTelemetry => ({
  loadsPower: 1,
  pvPower,
  pv1Power: pvPower,
  pv2Power: 0,
  pvStringCount: 1,
  pvStringPowers: { pv1Power: pvPower },
  feedinPower: 0,
  gridConsumptionPower: 0,
  batChargePower: 0,
  batDischargePower: 0,
  SoC: 75,
  ResidualEnergy: 8,
  batVoltage: 50,
  batCurrent: 0.5,
  batTemperature: 20,
  gridVoltage: 240,
  gridCurrent: 2,
  gridFrequency: 50,
  meterPower2: 0,
  ambientTemperature: 18,
  deviceTemperature: 28,
  epsPower: 0,
  epsPowerR: 0,
  epsVoltR: 0,
  epsCurrentR: 0,
  sampledAt,
});

const sampleCounters = (solarKwh: number, sampledAt: string) => {
  const block = new Array(24).fill(0);
  block[2] = Math.round(solarKwh * 10);
  return parseH1G2TodayTotalsFromBlock(block, H1_G2_ENERGY_COUNTERS_START, sampledAt);
};

describe('HourlyAggregator', () => {
  it('accumulates energy across consecutive samples within an hour', () => {
    const store = createStore();
    const aggregator = new HourlyAggregator(store, 'Europe/London');

    aggregator.recordSample(
      sampleTelemetry('2026-07-15T11:00:00.000Z', 2),
      sampleCounters(0, '2026-07-15T11:00:00.000Z'),
      '2026-07-15T11:00:00.000Z'
    );
    aggregator.recordSample(
      sampleTelemetry('2026-07-15T11:10:00.000Z', 2),
      sampleCounters(0.33, '2026-07-15T11:10:00.000Z'),
      '2026-07-15T11:10:00.000Z'
    );

    const rows = aggregator.getHoursForDay('2026-07-15');
    const noon = rows.find((row) => row.hour === 12);
    expect(noon?.pvKwh).toBeGreaterThan(0);
    expect(noon?.sampleCount).toBe(2);
  });

  it('splits integration when a sample crosses an hour boundary', () => {
    const store = createStore();
    const aggregator = new HourlyAggregator(store, 'Europe/London');

    aggregator.recordSample(
      sampleTelemetry('2026-07-15T10:59:50.000Z', 3.6),
      sampleCounters(0, '2026-07-15T10:59:50.000Z'),
      '2026-07-15T10:59:50.000Z'
    );
    aggregator.recordSample(
      sampleTelemetry('2026-07-15T11:00:10.000Z', 3.6),
      sampleCounters(0.04, '2026-07-15T11:00:10.000Z'),
      '2026-07-15T11:00:10.000Z'
    );

    const rows = aggregator.getHoursForDay('2026-07-15');
    const hour11 = rows.find((row) => row.hour === 11);
    const hour12 = rows.find((row) => row.hour === 12);
    expect(hour11?.pvKwh ?? 0).toBeGreaterThan(0);
    expect(hour12?.pvKwh ?? 0).toBeGreaterThan(0);
  });
});
