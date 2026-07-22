import { describe, expect, it } from 'vitest';
import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import {
  countTelemetryMetrics,
  formatStoredTelemetryLog,
  formatTelemetryFull,
  formatTelemetryPreview,
} from './telemetryLog.js';

const sampleTelemetry: ModbusRealtimeTelemetry = {
  loadsPower: 1.234,
  pvPower: 2.5,
  pv1Power: 1.5,
  pv2Power: 1,
  pvStringCount: 2,
  pvStringPowers: { pv1Power: 1.5, pv2Power: 1 },
  feedinPower: 0.5,
  gridConsumptionPower: 0,
  batChargePower: 0.25,
  batDischargePower: 0,
  SoC: 87,
  ResidualEnergy: 10.5,
  batVoltage: 51.2,
  batCurrent: 1.1,
  batTemperature: 22.5,
  gridVoltage: 240.1,
  gridCurrent: 4.2,
  gridFrequency: 50.01,
  meterPower2: 0,
  ambientTemperature: 18.3,
  deviceTemperature: 35.4,
  epsPower: 0,
  epsPowerR: 0,
  epsVoltR: 0,
  epsCurrentR: 0,
  workMode: 2,
  sampledAt: '2026-07-14T12:00:00.000Z',
};

describe('telemetryLog', () => {
  it('counts defined scalar metrics and ignores metadata or duplicate pv strings', () => {
    expect(countTelemetryMetrics(sampleTelemetry)).toBe(24);
  });

  it('formats a short preview of key values', () => {
    expect(formatTelemetryPreview(sampleTelemetry)).toBe(
      'loads=1.234 kW, pv=2.500 kW, soc=87%, feedin=0.500 kW'
    );
  });

  it('formats the stored telemetry console line', () => {
    expect(formatStoredTelemetryLog(sampleTelemetry)).toBe(
      'Stored telemetry: 24 metrics — loads=1.234 kW, pv=2.500 kW, soc=87%, feedin=0.500 kW'
    );
  });

  it('formats every realtime telemetry field for probe output', () => {
    const lines = formatTelemetryFull(sampleTelemetry);
    expect(lines).toContain('loadsPower=1.234 kW');
    expect(lines).toContain('pvPower=2.500 kW');
    expect(lines).toContain('pv1Power=1.500 kW');
    expect(lines).toContain('pv2Power=1.000 kW');
    expect(lines).toContain('pvStringCount=2');
    expect(lines).toContain('pvStringPowers.pv1Power=1.500 kW');
    expect(lines).toContain('pvStringPowers.pv2Power=1.000 kW');
    expect(lines).toContain('batVoltage=51.2 V');
    expect(lines).toContain('gridFrequency=50.01 Hz');
    expect(lines).toContain('workMode=Backup (code 2)');
    expect(lines).toContain('workModeRegister=unavailable');
    expect(lines).toContain('sampledAt=2026-07-14T12:00:00.000Z');
    expect(lines.length).toBe(34);
  });
});
