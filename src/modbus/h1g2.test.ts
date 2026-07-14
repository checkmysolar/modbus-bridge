import { describe, expect, it } from 'vitest';
import {
  parseBatteryPowerKw,
  parseG2RunningState,
  parseGridCtPowerKw,
  parseH1G2RealtimeSnapshot,
  parseLoadsPowerRegister,
  RUNNING_STATE_OFF_GRID,
  RUNNING_STATE_ON_GRID,
} from './h1g2Registers.js';

describe('H1 G2 register parsing', () => {
  it('converts signed int16 load power raw watts to kW', () => {
    expect(parseLoadsPowerRegister(2880)).toBeCloseTo(2.88);
    expect(parseLoadsPowerRegister(65535)).toBeCloseTo(-0.001);
    expect(parseLoadsPowerRegister(32768)).toBeCloseTo(-32.768);
  });

  it('splits grid CT into feed-in and grid consumption', () => {
    expect(parseGridCtPowerKw(1500)).toEqual({ feedinPower: 1.5, gridConsumptionPower: 0 });
    expect(parseGridCtPowerKw(65536 - 2000)).toEqual({ feedinPower: 0, gridConsumptionPower: 2 });
  });

  it('splits battery power into charge and discharge', () => {
    expect(parseBatteryPowerKw(3000)).toEqual({ batChargePower: 0, batDischargePower: 3 });
    expect(parseBatteryPowerKw(65536 - 2500)).toEqual({ batChargePower: 2.5, batDischargePower: 0 });
  });

  it('maps G2 status registers to Fox runningState', () => {
    expect(parseG2RunningState(0x04, 0x00)).toBe(RUNNING_STATE_ON_GRID);
    expect(parseG2RunningState(0x00, 0x01)).toBe(RUNNING_STATE_OFF_GRID);
    expect(parseG2RunningState(0x01, 0x00)).toBe(167);
  });

  it('parses a full realtime snapshot from register block', () => {
    const block = new Array(21).fill(0);
    block[0] = 2300; // 230.0 V grid
    block[1] = 50; // 5.0 A
    block[3] = 5000; // 50.00 Hz
    block[4] = 2400; // eps volt
    block[5] = 100; // eps current 10A
    block[6] = 500; // eps power 0.5 kW
    block[8] = 1200; // feedin 1.2 kW
    block[9] = 100; // meter2 0.1 kW
    block[10] = 2880; // loads 2.88 kW
    block[12] = 450; // inv temp 45.0 C
    block[13] = 250; // ambient 25.0 C
    block[14] = 512; // bat volt 51.2 V
    block[15] = 65526; // bat current -1.0 A (signed -10 raw * 0.1)
    block[16] = 65536 - 1500; // charge 1.5 kW
    block[17] = 280; // bat temp 28.0 C
    block[18] = 85; // SoC 85%

    const snapshot = parseH1G2RealtimeSnapshot({
      block,
      residualEnergyRaw: 5000,
      pv1PowerRaw: 2000,
      pv2PowerRaw: 1500,
      stateStatus1: 0x04,
      stateStatus3: 0x00,
      sampledAt: '2026-07-09T12:00:00.000Z',
    });

    expect(snapshot.loadsPower).toBeCloseTo(2.88);
    expect(snapshot.pvPower).toBeCloseTo(3.5);
    expect(snapshot.pv1Power).toBeCloseTo(2);
    expect(snapshot.pv2Power).toBeCloseTo(1.5);
    expect(snapshot.pvStringCount).toBe(2);
    expect(snapshot.feedinPower).toBeCloseTo(1.2);
    expect(snapshot.gridConsumptionPower).toBe(0);
    expect(snapshot.batChargePower).toBeCloseTo(1.5);
    expect(snapshot.batDischargePower).toBe(0);
    expect(snapshot.SoC).toBe(85);
    expect(snapshot.ResidualEnergy).toBeCloseTo(50);
    expect(snapshot.gridVoltage).toBeCloseTo(230);
    expect(snapshot.runningState).toBe(RUNNING_STATE_ON_GRID);
    expect(snapshot.isOffGrid).toBe(false);
    expect(snapshot.sampledAt).toBe('2026-07-09T12:00:00.000Z');
  });

  it('includes workMode when workModeRaw is provided', () => {
    const block = new Array(21).fill(0);
    const snapshot = parseH1G2RealtimeSnapshot({
      block,
      residualEnergyRaw: 0,
      pv1PowerRaw: 0,
      pv2PowerRaw: 0,
      stateStatus1: 0x04,
      stateStatus3: 0x00,
      workModeRaw: 4,
      sampledAt: '2026-07-09T12:00:00.000Z',
    });

    expect(snapshot.workMode).toBe(5);
    expect(snapshot.workModeRegister).toBe(4);
  });

  it('shows force charge when remote control is active with negative active power', () => {
    const block = new Array(21).fill(0);
    const snapshot = parseH1G2RealtimeSnapshot({
      block,
      residualEnergyRaw: 0,
      pv1PowerRaw: 0,
      pv2PowerRaw: 0,
      stateStatus1: 0x04,
      stateStatus3: 0x00,
      workModeRaw: 0,
      remoteEnableRaw: 1,
      remoteActivePowerRaw: 65536 - 1500,
      sampledAt: '2026-07-09T12:00:00.000Z',
    });

    expect(snapshot.workMode).toBe(3);
    expect(snapshot.remoteEnable).toBe(1);
    expect(snapshot.remoteActivePowerW).toBe(-1500);
  });
});
