import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import { HourlyAggregator } from '../aggregation/hourlyAggregator.js';
import {
  buildReportResponse,
  buildReportStatusResponse,
  parseReportDate,
  parseReportDimension,
  parseReportYear,
} from '../http/reportHandlers.js';
import { RealtimeStore } from '../storage/sqlite.js';

const tempDirs: string[] = [];

function seedStore(): { store: RealtimeStore; aggregator: HourlyAggregator } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-report-test-'));
  tempDirs.push(dir);
  const store = new RealtimeStore(dir);
  const aggregator = new HourlyAggregator(store, 'Europe/London');

  const telemetry: ModbusRealtimeTelemetry = {
    loadsPower: 1.2,
    pvPower: 2.4,
    pv1Power: 2.4,
    pv2Power: 0,
    pvStringCount: 1,
    pvStringPowers: { pv1Power: 2.4 },
    feedinPower: 0.3,
    gridConsumptionPower: 0.1,
    batChargePower: 0.2,
    batDischargePower: 0.05,
    SoC: 88,
    ResidualEnergy: 9,
    batVoltage: 51,
    batCurrent: 1,
    batTemperature: 21,
    gridVoltage: 240,
    gridCurrent: 3,
    gridFrequency: 50,
    meterPower2: 0,
    ambientTemperature: 17,
    deviceTemperature: 32,
    epsPower: 0,
    epsPowerR: 0,
    epsVoltR: 0,
    epsCurrentR: 0,
    sampledAt: '2026-04-10T11:00:00.000Z',
  };

  store.upsert(telemetry, telemetry.sampledAt);
  store.ensureOpenHour('2026-04-10', 12, {});
  store.addHourMetrics('2026-04-10', 12, {
    pv_kwh: 1.5,
    loads_kwh: 0.8,
    feedin_kwh: 0.2,
    grid_consumption_kwh: 0.1,
    bat_charge_kwh: 0.15,
    bat_discharge_kwh: 0.05,
  });
  store.addSocSample('2026-04-10', 12, 88);
  store.incrementHourSampleCount('2026-04-10', 12);
  store.markHourFinalized('2026-04-10', 12);
  store.upsertDailyRollup('2026-04-10');
  aggregator.recordSample(
    telemetry,
    { sampledAt: telemetry.sampledAt, blockStart: 32000, blockLength: 24, blockRaw: null, totals: [] },
    telemetry.sampledAt
  );

  return { store, aggregator };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('report handlers', () => {
  it('parses report query params', () => {
    expect(parseReportDimension('day')).toBe('day');
    expect(parseReportDimension('invalid')).toBeNull();
    expect(parseReportDate('2026-04-10')).toBe('2026-04-10');
    expect(parseReportDate('bad')).toBeUndefined();
    expect(parseReportYear('2026')).toBe(2026);
  });

  it('returns empty day report when bridge has no samples for that date', () => {
    const { aggregator } = seedStore();
    const report = buildReportResponse(aggregator, 'Europe/London', 'day', { date: '2026-01-01' });

    expect(report.historicalData).toEqual([]);
    expect(report.totals?.generation).toBe(0);
  });

  it('builds Fox-shaped day report with only finalized sampled hours', () => {
    const { aggregator } = seedStore();
    const report = buildReportResponse(aggregator, 'Europe/London', 'day', { date: '2026-04-10' });

    expect(report.historicalData).toHaveLength(1);
    expect(report.historicalData[0]?.time).toBe('12:00');
    expect(report.historicalData[0]?.pvPower).toBeGreaterThan(0);
    expect(report.todayTotals?.generation).toBeGreaterThan(0);
  });

  it('omits missing pre-bridge hours instead of zero-padding the day chart', () => {
    const { store, aggregator } = seedStore();
    store.ensureOpenHour('2026-04-10', 15, {});
    store.addHourMetrics('2026-04-10', 15, {
      pv_kwh: 0.8,
      loads_kwh: 0.4,
      feedin_kwh: 0.1,
      grid_consumption_kwh: 0,
      bat_charge_kwh: 0,
      bat_discharge_kwh: 0.2,
    });
    store.addSocSample('2026-04-10', 15, 70);
    store.incrementHourSampleCount('2026-04-10', 15);
    store.markHourFinalized('2026-04-10', 15);

    const report = buildReportResponse(aggregator, 'Europe/London', 'day', { date: '2026-04-10' });

    expect(report.historicalData.map((row) => row.time)).toEqual(['12:00', '15:00']);
    expect(report.historicalData.some((row) => row.time === '00:00')).toBe(false);
  });

  it('excludes the current in-progress hour until it is finalized', () => {
    const { store } = seedStore();
    store.ensureOpenHour('2026-04-10', 16, {});
    store.addHourMetrics('2026-04-10', 16, {
      pv_kwh: 0.2,
      loads_kwh: 0.1,
      feedin_kwh: 0,
      grid_consumption_kwh: 0,
      bat_charge_kwh: 0,
      bat_discharge_kwh: 0,
    });
    store.addSocSample('2026-04-10', 16, 68);
    store.incrementHourSampleCount('2026-04-10', 16);

    const aggregator = new HourlyAggregator(store, 'Europe/London');
    const report = buildReportResponse(aggregator, 'Europe/London', 'day', { date: '2026-04-10' });

    expect(report.historicalData.map((row) => row.time)).toEqual(['12:00']);
  });

  it('builds week report with only sampled days', () => {
    const { aggregator } = seedStore();
    const report = buildReportResponse(aggregator, 'Europe/London', 'week', { date: '2026-04-10' });

    expect(report.historicalData).toHaveLength(1);
    expect(report.historicalData.some((row) => row.time === 'Apr 10')).toBe(true);
  });

  it('builds month and year reports', () => {
    const { aggregator } = seedStore();
    const month = buildReportResponse(aggregator, 'Europe/London', 'month', { date: '2026-04-10' });
    const year = buildReportResponse(aggregator, 'Europe/London', 'year', { year: 2026 });

    expect(month.historicalData).toHaveLength(1);
    expect(year.historicalData[0]?.time).toBe('Apr 2026');
    expect(year.historicalData).toHaveLength(1);
  });

  it('builds report status from aggregator state', () => {
    const { aggregator } = seedStore();
    const status = buildReportStatusResponse(aggregator, 'Europe/London');

    expect(status.timezone).toBe('Europe/London');
    expect(status.latestDate).toBe('2026-04-10');
    expect(status.lastPollAt).toBeTruthy();
  });
});
