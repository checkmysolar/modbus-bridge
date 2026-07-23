import { describe, expect, it } from 'vitest';
import { combineRegisters } from '../core/scaling.js';
import {
  WORK_MODE_FEED_IN,
  WORK_MODE_PEAK_SHAVING,
  WORK_MODE_SELF_USE,
  resolveH3ModernWorkMode,
} from '@checkmysolar/modbus-telemetry/workMode';

describe('H3 modern helpers', () => {
  it('combines 32-bit registers low address first', () => {
    expect(combineRegisters([0x0578, 0x0000], true)).toBe(0x0578);
    expect(combineRegisters([0xffff, 0xffff], true)).toBe(-1);
  });

  it('maps H3 modern work mode register codes', () => {
    expect(resolveH3ModernWorkMode({ workModeRegister: 1 })).toBe(WORK_MODE_SELF_USE);
    expect(resolveH3ModernWorkMode({ workModeRegister: 2 })).toBe(WORK_MODE_FEED_IN);
    expect(resolveH3ModernWorkMode({ workModeRegister: 4 })).toBe(WORK_MODE_PEAK_SHAVING);
  });
});
