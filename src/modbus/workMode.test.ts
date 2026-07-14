import { describe, expect, it } from 'vitest';
import {
  WORK_MODE_FORCE_CHARGE,
  WORK_MODE_FORCE_DISCHARGE,
  WORK_MODE_PEAK_SHAVING,
  WORK_MODE_SELF_USE,
  resolveH1G2WorkMode,
  workModeCodeToLabel,
} from '@checkmysolar/modbus-telemetry/workMode';

describe('resolveH1G2WorkMode', () => {
  it('maps work mode register values to unified codes', () => {
    expect(resolveH1G2WorkMode({ workModeRegister: 0 })).toBe(WORK_MODE_SELF_USE);
    expect(resolveH1G2WorkMode({ workModeRegister: 1 })).toBe(1);
    expect(resolveH1G2WorkMode({ workModeRegister: 2 })).toBe(2);
    expect(resolveH1G2WorkMode({ workModeRegister: 4 })).toBe(WORK_MODE_PEAK_SHAVING);
  });

  it('prefers remote control force charge when enabled with negative active power', () => {
    expect(
      resolveH1G2WorkMode({
        workModeRegister: 0,
        remoteEnable: 1,
        remoteActivePowerRaw: 65536 - 3000,
      })
    ).toBe(WORK_MODE_FORCE_CHARGE);
  });

  it('prefers remote control force discharge when enabled with positive active power', () => {
    expect(
      resolveH1G2WorkMode({
        workModeRegister: 0,
        remoteEnable: 1,
        remoteActivePowerRaw: 2500,
      })
    ).toBe(WORK_MODE_FORCE_DISCHARGE);
  });

  it('falls back to work mode register when remote control is enabled but active power is zero', () => {
    expect(
      resolveH1G2WorkMode({
        workModeRegister: 4,
        remoteEnable: 1,
        remoteActivePowerRaw: 0,
      })
    ).toBe(WORK_MODE_PEAK_SHAVING);
  });

  it('labels peak shaving distinctly from force discharge', () => {
    expect(workModeCodeToLabel(WORK_MODE_PEAK_SHAVING)).toBe('Peak Shaving');
    expect(workModeCodeToLabel(WORK_MODE_FORCE_DISCHARGE)).toBe('Force Discharge');
  });
});
