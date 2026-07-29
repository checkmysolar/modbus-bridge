import { describe, expect, it } from 'vitest';
import { decodeModelString } from '../core/autodetect.js';
import {
  encodePackedModelRegisters,
  encodePlainModelRegisters,
} from './modelRegisters.js';

describe('model register encoding', () => {
  it('round-trips packed ASCII model strings', () => {
    const model = 'H1-5.0-E1-G2';
    expect(decodeModelString(encodePackedModelRegisters(model))).toBe(model);
  });

  it('round-trips plain ASCII model strings', () => {
    const model = 'H3-8.0';
    expect(decodeModelString(encodePlainModelRegisters(model))).toBe(model);
  });
});
