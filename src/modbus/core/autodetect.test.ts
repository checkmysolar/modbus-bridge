import { describe, expect, it } from 'vitest';
import { decodeModelString, matchModelPattern, MODEL_PATTERNS } from './autodetect.js';

describe('autodetect model patterns', () => {
  it('decodes packed ASCII model strings', () => {
    const registers = [0x4831, 0x2d35, 0x2e30, 0x2d45, 0x312d, 0x4732];
    expect(decodeModelString(registers)).toBe('H1-5.0-E1-G2');
  });

  it('decodes plain ASCII model strings', () => {
    const registers = [0x0048, 0x0033, 0x002d, 0x0038, 0x002e, 0x0030];
    expect(decodeModelString(registers)).toBe('H3-8.0');
  });

  const cases: Array<{ model: string; profileId: string; modelId: string }> = [
    { model: 'H1-5.0-E1-G2', profileId: 'h1g2', modelId: 'H1_G2' },
    { model: 'H1-5.0-E', profileId: 'h1Series', modelId: 'H1' },
    { model: 'AC1-5.0-E-G2', profileId: 'h1g2', modelId: 'AC1_G2' },
    { model: 'P1-5.0-E', profileId: 'h1g2', modelId: 'P1' },
    { model: 'AC1-5.0', profileId: 'h1Series', modelId: 'AC1' },
    { model: 'AIO-H1-5.0', profileId: 'h1Series', modelId: 'AIO-H1' },
    { model: 'KH10.5', profileId: 'kh', modelId: 'KH' },
    { model: 'H3-10.0-Smart', profileId: 'h3Modern', modelId: 'H3_SMART' },
    { model: 'H3-10.0-M', profileId: 'h3Modern', modelId: 'H3_SMART' },
    { model: 'P3-8.0-SH', profileId: 'h3Modern', modelId: 'P3_SMART' },
    { model: 'H3-8.0-E', profileId: 'h3Legacy', modelId: 'H3' },
    { model: 'AC3-10.0', profileId: 'h3Legacy', modelId: 'AC3' },
    { model: 'Kuara 8.0-3-H', profileId: 'h3Legacy', modelId: 'KUARA-H3' },
    { model: 'SK-HWR-8 SMART', profileId: 'h3Modern', modelId: 'SK-HWR-SMART' },
    { model: 'SK-HWR-8', profileId: 'h3Legacy', modelId: 'SK-HWR' },
    { model: 'STAR-H3-12.0', profileId: 'h3Legacy', modelId: 'STAR-H3' },
    { model: 'SP R8KH3', profileId: 'h3Legacy', modelId: 'SOLAVITA-SP' },
    { model: 'AX 12.0kW-3ph', profileId: 'h3Legacy', modelId: 'ATRONIX_AX' },
    { model: 'H3-Pro-15.0', profileId: 'h3Modern', modelId: 'H3_PRO' },
    { model: 'P3-Pro-15.0', profileId: 'h3Modern', modelId: 'H3_PRO' },
    { model: 'I-X10', profileId: 'h3Modern', modelId: 'ENPAL_IX' },
    { model: '1K5-HI-10-V1', profileId: 'h3Modern', modelId: '1KOMMA5' },
    { model: 'EVO 10-5.0-H', profileId: 'h3Modern', modelId: 'EVO' },
  ];

  it.each(cases)('matches $model → $profileId', ({ model, profileId, modelId }) => {
    const match = matchModelPattern(model);
    expect(match).not.toBeNull();
    expect(match?.profileId).toBe(profileId);
    expect(match?.modelId).toBe(modelId);
  });

  it('keeps G2 patterns before G1', () => {
    const g2Index = MODEL_PATTERNS.findIndex((entry) => entry.modelId === 'H1_G2');
    const g1Index = MODEL_PATTERNS.findIndex((entry) => entry.modelId === 'H1');
    expect(g2Index).toBeLessThan(g1Index);
  });

  it('returns null for unknown models', () => {
    expect(matchModelPattern('UNKNOWN-1.0')).toBeNull();
  });
});
