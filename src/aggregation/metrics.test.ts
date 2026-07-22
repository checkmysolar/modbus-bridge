import { describe, expect, it } from 'vitest';
import {
  counterDelta,
  emptyKwhMetrics,
  interpolatePower,
  readPowerValues,
  reconcileHourMetrics,
  trapezoidalEnergyKwh,
} from './metrics.js';
import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';

const baseTelemetry = (overrides: Partial<ModbusRealtimeTelemetry> = {}): ModbusRealtimeTelemetry => ({
  loadsPower: 1,
  pvPower: 2,
  pv1Power: 1,
  pv2Power: 1,
  pvStringCount: 2,
  pvStringPowers: { pv1Power: 1, pv2Power: 1 },
  feedinPower: 0.5,
  gridConsumptionPower: 0.25,
  batChargePower: 0.1,
  batDischargePower: 0.05,
  SoC: 80,
  ResidualEnergy: 10,
  batVoltage: 50,
  batCurrent: 1,
  batTemperature: 20,
  gridVoltage: 240,
  gridCurrent: 4,
  gridFrequency: 50,
  meterPower2: 0,
  ambientTemperature: 18,
  deviceTemperature: 30,
  epsPower: 0,
  epsPowerR: 0,
  epsVoltR: 0,
  epsCurrentR: 0,
  sampledAt: '2026-07-15T12:00:00.000Z',
  ...overrides,
});

describe('metrics integration', () => {
  it('integrates constant power over one hour', () => {
    const telemetry = baseTelemetry({ pvPower: 3, loadsPower: 1.5 });
    const start = readPowerValues(telemetry);
    const end = readPowerValues(telemetry);
    const deltas = trapezoidalEnergyKwh(start, end, 1);
    expect(deltas.pv_kwh).toBeCloseTo(3);
    expect(deltas.loads_kwh).toBeCloseTo(1.5);
  });

  it('integrates linear ramp over half an hour', () => {
    const start = readPowerValues(baseTelemetry({ pvPower: 0 }));
    const end = readPowerValues(baseTelemetry({ pvPower: 4 }));
    const deltas = trapezoidalEnergyKwh(start, end, 0.5);
    expect(deltas.pv_kwh).toBeCloseTo(1);
  });

  it('interpolates power midway between samples', () => {
    const start = readPowerValues(baseTelemetry({ pvPower: 0 }));
    const end = readPowerValues(baseTelemetry({ pvPower: 10 }));
    const mid = interpolatePower(start, end, 0.5);
    expect(mid.pvPower).toBeCloseTo(5);
  });

  it('reconciles integrated hour when drift exceeds 2%', () => {
    const integrated = {
      ...emptyKwhMetrics(),
      pv_kwh: 1.1,
      loads_kwh: 0.5,
    };
    const reconciled = reconcileHourMetrics(integrated, { solarGeneration: 0 }, { solarGeneration: 1 });
    expect(reconciled.pv_kwh).toBeCloseTo(1);
    expect(reconciled.loads_kwh).toBeCloseTo(0.5);
  });

  it('handles midnight counter rollover', () => {
    expect(counterDelta(50, 2)).toBe(2);
  });
});
