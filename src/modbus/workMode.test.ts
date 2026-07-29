import { describe, expect, it } from 'vitest';
import {
  WORK_MODE_FEED_IN,
  WORK_MODE_FORCE_CHARGE,
  WORK_MODE_FORCE_DISCHARGE,
  WORK_MODE_PEAK_SHAVING,
  WORK_MODE_SELF_USE,
  getWorkModeWriteStrategy,
  isForceWorkMode,
  resolveH1G2WorkMode,
  resolveH3ModernWorkMode,
  toUnsignedInt16,
  workModeCodeToH1G2RegisterValue,
  workModeCodeToH3ModernRegisterValue,
  workModeCodeToLabel,
} from '@checkmysolar/modbus-telemetry/workMode';

describe('resolveH1G2WorkMode', () => {
  it('maps work mode register values to unified codes', () => {
    expect(resolveH1G2WorkMode({ workModeRegister: 0 })).toBe(WORK_MODE_SELF_USE);
    expect(resolveH1G2WorkMode({ workModeRegister: 1 })).toBe(1);
    expect(resolveH1G2WorkMode({ workModeRegister: 2 })).toBe(2);
    expect(resolveH1G2WorkMode({ workModeRegister: 4 })).toBe(WORK_MODE_PEAK_SHAVING);
  });

  it('prefers remote control force charge when remote enable is on', () => {
    expect(
      resolveH1G2WorkMode({
        workModeRegister: 2,
        remoteEnable: 1,
        remoteActivePowerRaw: 65536 - 3000,
        remoteTimeoutCountdown: 12,
      })
    ).toBe(WORK_MODE_FORCE_CHARGE);
  });

  it('prefers remote control force charge even when the watchdog countdown is zero', () => {
    expect(
      resolveH1G2WorkMode({
        workModeRegister: 2,
        remoteEnable: 1,
        remoteActivePowerRaw: 65536 - 500,
        remoteTimeoutCountdown: 0,
      })
    ).toBe(WORK_MODE_FORCE_CHARGE);
  });

  it('prefers remote control force discharge when remote enable is on', () => {
    expect(
      resolveH1G2WorkMode({
        workModeRegister: 0,
        remoteEnable: 1,
        remoteActivePowerRaw: 2500,
        remoteTimeoutCountdown: 8,
      })
    ).toBe(WORK_MODE_FORCE_DISCHARGE);
  });

  it('uses the configured work mode when remote control is disabled', () => {
    expect(
      resolveH1G2WorkMode({
        workModeRegister: WORK_MODE_FEED_IN,
        remoteEnable: 0,
        remoteActivePowerRaw: 65536 - 2500,
        remoteTimeoutCountdown: 0,
      })
    ).toBe(WORK_MODE_FEED_IN);
  });

  it('falls back to work mode register when remote control is enabled but active power is zero', () => {
    expect(
      resolveH1G2WorkMode({
        workModeRegister: 4,
        remoteEnable: 1,
        remoteActivePowerRaw: 0,
        remoteTimeoutCountdown: 10,
      })
    ).toBe(WORK_MODE_PEAK_SHAVING);
  });

  it('labels peak shaving distinctly from force discharge', () => {
    expect(workModeCodeToLabel(WORK_MODE_PEAK_SHAVING)).toBe('Peak Shaving');
    expect(workModeCodeToLabel(WORK_MODE_FORCE_DISCHARGE)).toBe('Force Discharge');
  });

  it('maps H3 modern work mode register values', () => {
    expect(resolveH3ModernWorkMode({ workModeRegister: 1 })).toBe(WORK_MODE_SELF_USE);
    expect(resolveH3ModernWorkMode({ workModeRegister: 2 })).toBe(WORK_MODE_FEED_IN);
    expect(resolveH3ModernWorkMode({ workModeRegister: 4 })).toBe(WORK_MODE_PEAK_SHAVING);
  });

  it('prefers H3 modern remote control force charge when the watchdog countdown is active', () => {
    expect(
      resolveH3ModernWorkMode({
        workModeRegister: 1,
        remoteEnable: 1,
        remoteActivePowerRaw: 65536 - 3000,
        remoteTimeoutCountdown: 12,
      })
    ).toBe(WORK_MODE_FORCE_CHARGE);
  });

  it('prefers H3 modern remote control force discharge when the watchdog countdown is active', () => {
    expect(
      resolveH3ModernWorkMode({
        workModeRegister: 1,
        remoteEnable: 1,
        remoteActivePowerRaw: 2500,
        remoteTimeoutCountdown: 8,
      })
    ).toBe(WORK_MODE_FORCE_DISCHARGE);
  });

  it('uses the configured H3 modern work mode when remote active power is stale after timeout', () => {
    expect(
      resolveH3ModernWorkMode({
        workModeRegister: 2,
        remoteEnable: 1,
        remoteActivePowerRaw: 65536 - 2500,
        remoteTimeoutCountdown: 0,
      })
    ).toBe(WORK_MODE_FEED_IN);
  });
});

describe('work mode write encoding', () => {
  it('maps unified codes to H1 register values', () => {
    expect(workModeCodeToH1G2RegisterValue(WORK_MODE_SELF_USE)).toBe(0);
    expect(workModeCodeToH1G2RegisterValue(WORK_MODE_FEED_IN)).toBe(1);
    expect(workModeCodeToH1G2RegisterValue(WORK_MODE_PEAK_SHAVING)).toBe(4);
    expect(workModeCodeToH1G2RegisterValue(WORK_MODE_FORCE_CHARGE)).toBeUndefined();
  });

  it('maps unified codes to H3 modern register values', () => {
    expect(workModeCodeToH3ModernRegisterValue(WORK_MODE_SELF_USE)).toBe(1);
    expect(workModeCodeToH3ModernRegisterValue(WORK_MODE_FEED_IN)).toBe(2);
    expect(workModeCodeToH3ModernRegisterValue(WORK_MODE_PEAK_SHAVING)).toBe(4);
  });

  it('identifies force work modes', () => {
    expect(isForceWorkMode(WORK_MODE_FORCE_CHARGE)).toBe(true);
    expect(isForceWorkMode(WORK_MODE_SELF_USE)).toBe(false);
  });

  it('selects write strategy by profile and connection type', () => {
    expect(getWorkModeWriteStrategy('h1g2', 'lan')).toBe('h1g2');
    expect(getWorkModeWriteStrategy('kh', 'lan')).toBe('h1g2');
    expect(getWorkModeWriteStrategy('h3Modern', 'aux')).toBe('h3Modern');
    expect(getWorkModeWriteStrategy('h1Series', 'lan')).toBe('h1g2');
    expect(getWorkModeWriteStrategy('h1Series', 'aux')).toBe('unsupported');
  });

  it('encodes negative watts for remote control writes', () => {
    expect(toUnsignedInt16(-5000)).toBe(60536);
    expect(toUnsignedInt16(5000)).toBe(5000);
  });
});
