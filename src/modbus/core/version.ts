import type { ModbusReader } from './reader.js';
import type { FirmwareVariant, ProfileId } from '../profiles/types.js';

export interface ManagerVersion {
  major: number;
  minor: number;
  raw: string;
}

export function parseDecimalManagerVersion(raw: number): ManagerVersion {
  const major = Math.floor(raw / 100);
  const minor = raw % 100;
  return { major, minor, raw: `${major}.${minor.toString().padStart(2, '0')}` };
}

export function parseHexManagerVersion(raw: number): ManagerVersion {
  const major = raw >> 8;
  const minor = raw & 0xff;
  return { major, minor, raw: `${major.toString(16).toUpperCase()}.${minor.toString(16).toUpperCase().padStart(2, '0')}` };
}

export function compareVersion(a: ManagerVersion, b: { major: number; minor: number }): number {
  if (a.major !== b.major) {
    return a.major - b.major;
  }
  return a.minor - b.minor;
}

export async function readManagerVersion(
  reader: ModbusReader,
  profileId: ProfileId
): Promise<ManagerVersion | null> {
  try {
    if (profileId === 'h1g2' || profileId === 'kh' || profileId === 'h3Modern') {
      const raw = await reader.readHoldingWord(36003);
      return parseHexManagerVersion(raw);
    }
    const raw = await reader.readHoldingWord(30018);
    return parseDecimalManagerVersion(raw);
  } catch {
    return null;
  }
}

export function resolveFirmwareVariant(profileId: ProfileId, version: ManagerVersion | null): FirmwareVariant {
  if (!version) {
    return 'default';
  }

  switch (profileId) {
    case 'h1g2':
      return compareVersion(version, { major: 1, minor: 44 }) < 0 ? 'h1g2Pre144' : 'h1g2_144';
    case 'kh':
      return compareVersion(version, { major: 1, minor: 33 }) < 0 ? 'khPre133' : 'kh_133';
    case 'h3Legacy':
      return compareVersion(version, { major: 1, minor: 80 }) < 0 ? 'h3Pre180' : 'h3_180';
    default:
      return 'default';
  }
}
