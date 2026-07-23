import { describe, expect, it } from 'vitest';
import {
  WORK_MODE_FEED_IN,
  WORK_MODE_FORCE_CHARGE,
  WORK_MODE_FORCE_DISCHARGE,
  WORK_MODE_PEAK_SHAVING,
  WORK_MODE_SELF_USE,
  resolveH1G2WorkMode,
  resolveH3ModernWorkMode,
  workModeCodeToLabel,
} from '@checkmysolar/modbus-telemetry/workMode';

describe('resolveH1G2WorkMode', () => {
  it('maps work mode register values to unified codes', () => {
    expect(resolveH1G2WorkMode({ workModeRegister: 0 })).toBe(WORK_MODE_SELF_USE);
    expect(resolveH1G2WorkMode({ workModeRegister: 1 })).toBe(1);
    expect(resolveH1G2WorkMode({ workModeRegister: 2 })).toBe(2);
    expect(resolveH1G2WorkMode({ workModeRegister: 4 })).toBe(WORK_MODE_PEAK_SHAVING);
  });

  it('prefers remote control force charge when the watchdog countdown is active', () => {
    expect(
      resolveH1G2WorkMode({
        workModeRegister: 0,
        remoteEnable: 1,
        remoteActivePowerRaw: 65536 - 3000,
        remoteTimeoutCountdown: 12,
      })
    ).toBe(WORK_MODE_FORCE_CHARGE);
  });

  it('prefers remote control force discharge when the watchdog countdown is active', () => {
    expect(
      resolveH1G2WorkMode({
        workModeRegister: 0,
        remoteEnable: 1,
        remoteActivePowerRaw: 2500,
        remoteTimeoutCountdown: 8,
      })
    ).toBe(WORK_MODE_FORCE_DISCHARGE);
  });

  it('uses the configured work mode when remote active power is stale after timeout', () => {
    expect(
      resolveH1G2WorkMode({
        workModeRegister: WORK_MODE_FEED_IN,
        remoteEnable: 1,
        remoteActivePowerRaw: 65536 - 2500,
        remoteTimeoutCountdown: 0,
      })
    ).toBe(WORK_MODE_FEED_IN);
  });

  it('uses the configured work mode when the timeout countdown is unavailable', () => {
    expect(
      resolveH1G2WorkMode({
        workModeRegister: 1,
        remoteEnable: 1,
        remoteActivePowerRaw: 65536 - 2500,
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
});
