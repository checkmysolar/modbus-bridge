import { describe, expect, it } from 'vitest';
import { parseGridCtPowerKwFromCombined } from '../core/scaling.js';

describe('KH grid CT sign inversion', () => {
  it('treats positive raw export as grid consumption when scale is negative', () => {
    const result = parseGridCtPowerKwFromCombined(1500, -0.001);
    expect(result.feedinPower).toBe(0);
    expect(result.gridConsumptionPower).toBeCloseTo(1.5);
  });

  it('treats negative raw export as feed-in when scale is negative', () => {
    const result = parseGridCtPowerKwFromCombined(-2000, -0.001);
    expect(result.feedinPower).toBeCloseTo(2);
    expect(result.gridConsumptionPower).toBe(0);
  });
});
