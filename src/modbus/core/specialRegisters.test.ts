import { describe, expect, it } from 'vitest';
import { H1_SERIES_SPECIAL_REGISTERS, overlapsInvalidRange } from './specialRegisters.js';

describe('overlapsInvalidRange', () => {
  it('does not treat H1 LAN holding blocks as overlapping the AUX/LAN gap', () => {
    expect(overlapsInvalidRange(H1_SERIES_SPECIAL_REGISTERS, 31006, 31026)).toBe(false);
    expect(overlapsInvalidRange(H1_SERIES_SPECIAL_REGISTERS, 32000, 32023)).toBe(false);
    expect(overlapsInvalidRange(H1_SERIES_SPECIAL_REGISTERS, 41000, 41000)).toBe(false);
  });

  it('still flags reads inside the AUX/LAN gap', () => {
    expect(overlapsInvalidRange(H1_SERIES_SPECIAL_REGISTERS, 11096, 11099)).toBe(true);
    expect(overlapsInvalidRange(H1_SERIES_SPECIAL_REGISTERS, 20000, 20000)).toBe(true);
    expect(overlapsInvalidRange(H1_SERIES_SPECIAL_REGISTERS, 31001, 31001)).toBe(true);
  });
});
