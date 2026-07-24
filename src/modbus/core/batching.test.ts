import { describe, expect, it } from 'vitest';
import {
  H1_G2_SPECIAL_REGISTERS,
  H1_SERIES_SPECIAL_REGISTERS,
  H3_LEGACY_SPECIAL_REGISTERS,
} from './specialRegisters.js';
import { planBatchedReads } from './batching.js';

describe('planBatchedReads', () => {
  it('coalesces contiguous holding registers into one plan', () => {
    const plans = planBatchedReads([31006, 31007, 31008, 31015], H1_G2_SPECIAL_REGISTERS);
    expect(plans).toEqual([
      { startAddress: 31006, length: 3, addresses: [31006, 31007, 31008] },
      { startAddress: 31015, length: 1, addresses: [31015] },
    ]);
  });

  it('splits runs longer than maxRead', () => {
    const addresses = Array.from({ length: 25 }, (_, index) => 31000 + index);
    const plans = planBatchedReads(addresses, H1_G2_SPECIAL_REGISTERS, 20);
    expect(plans).toHaveLength(2);
    expect(plans[0]?.length).toBe(20);
    expect(plans[1]?.length).toBe(5);
  });

  it('reads special individual ranges one register at a time', () => {
    const plans = planBatchedReads([40999, 41000, 41001], H1_G2_SPECIAL_REGISTERS);
    expect(plans).toEqual([
      { startAddress: 40999, length: 1, addresses: [40999] },
      { startAddress: 41000, length: 1, addresses: [41000] },
      { startAddress: 41001, length: 1, addresses: [41001] },
    ]);
  });

  it('skips invalid ranges from h3 legacy profile config', () => {
    const plans = planBatchedReads([41000, 41001, 41007, 41012], H3_LEGACY_SPECIAL_REGISTERS);
    expect(plans.map((plan) => plan.addresses)).toEqual([[41000], [41007]]);
  });

  it('batches H1 series LAN holding registers without treating them as invalid', () => {
    const plans = planBatchedReads([31002, 31005, 31006, 31024], H1_SERIES_SPECIAL_REGISTERS);
    expect(plans).toEqual([
      { startAddress: 31002, length: 1, addresses: [31002] },
      { startAddress: 31005, length: 2, addresses: [31005, 31006] },
      { startAddress: 31024, length: 1, addresses: [31024] },
    ]);
  });
});
