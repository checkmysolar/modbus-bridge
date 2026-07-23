import { describe, expect, it } from 'vitest';
import {
  compareVersion,
  parseDecimalVersion,
  parseHexVersion,
  resolveFirmwareVariant,
  resolveFirmwareVersionRegisterMap,
} from './version.js';

describe('firmware version registers', () => {
  it('maps newer profiles to 36xxx hex holding registers', () => {
    expect(resolveFirmwareVersionRegisterMap('h1g2', 'aux', 'h1g2_144').manager).toEqual({
      kind: 'holding',
      address: 36003,
      encoding: 'hex',
    });
    expect(resolveFirmwareVersionRegisterMap('h3Modern', 'aux', 'default').master.address).toBe(
      36001
    );
  });

  it('maps KH pre-1.33 to 300xx hex holding registers', () => {
    const map = resolveFirmwareVersionRegisterMap('kh', 'aux', 'khPre133');
    expect(map.master).toEqual({ kind: 'holding', address: 30016, encoding: 'hex' });
    expect(map.slave.address).toBe(30017);
    expect(map.manager.address).toBe(30018);
  });

  it('maps H3 legacy master/slave to decimal and manager to hex', () => {
    const map = resolveFirmwareVersionRegisterMap('h3Legacy', 'aux', 'h3Pre180');
    expect(map.master.encoding).toBe('decimal');
    expect(map.manager.encoding).toBe('hex');
  });

  it('maps H1 series AUX to input registers', () => {
    const map = resolveFirmwareVersionRegisterMap('h1Series', 'aux', 'default');
    expect(map.master).toEqual({ kind: 'input', address: 10016, encoding: 'decimal' });
    expect(map.manager.address).toBe(10018);
  });

  it('parses decimal and hex versions', () => {
    expect(parseDecimalVersion(144)).toEqual({ major: 1, minor: 44, raw: '1.44' });
    expect(parseHexVersion(0x12c)).toEqual({ major: 1, minor: 44, raw: '1.2C' });
  });

  it('resolves firmware variants from manager version', () => {
    const version = parseDecimalVersion(144);
    expect(resolveFirmwareVariant('h1g2', version)).toBe('h1g2_144');
    expect(resolveFirmwareVariant('h1g2', parseDecimalVersion(143))).toBe('h1g2Pre144');
    expect(resolveFirmwareVariant('kh', parseDecimalVersion(133))).toBe('kh_133');
  });

  it('compares versions numerically', () => {
    expect(compareVersion(parseDecimalVersion(132), { major: 1, minor: 33 })).toBeLessThan(0);
    expect(compareVersion(parseDecimalVersion(133), { major: 1, minor: 33 })).toBe(0);
  });
});
