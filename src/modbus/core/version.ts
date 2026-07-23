import type { ModbusReader } from './reader.js';
import type { RegisterKind } from './reader.js';
import type { ConnectionType, FirmwareVariant, ProfileId } from '../profiles/types.js';

export interface ParsedFirmwareVersion {
  major: number;
  minor: number;
  raw: string;
}

export interface FirmwareVersions {
  managerVersion?: string;
  masterVersion?: string;
  slaveVersion?: string;
}

type VersionEncoding = 'decimal' | 'hex';

interface VersionFieldSpec {
  kind: RegisterKind;
  address: number;
  encoding: VersionEncoding;
}

interface FirmwareVersionRegisterMap {
  master: VersionFieldSpec;
  slave: VersionFieldSpec;
  manager: VersionFieldSpec;
}

/** @deprecated Use ParsedFirmwareVersion */
export type ManagerVersion = ParsedFirmwareVersion;

export function parseDecimalVersion(raw: number): ParsedFirmwareVersion {
  const major = Math.floor(raw / 100);
  const minor = raw % 100;
  return { major, minor, raw: `${major}.${minor.toString().padStart(2, '0')}` };
}

export function parseHexVersion(raw: number): ParsedFirmwareVersion {
  const major = raw >> 8;
  const minor = raw & 0xff;
  return {
    major,
    minor,
    raw: `${major.toString(16).toUpperCase()}.${minor.toString(16).toUpperCase().padStart(2, '0')}`,
  };
}

/** @deprecated Use parseDecimalVersion */
export const parseDecimalManagerVersion = parseDecimalVersion;

/** @deprecated Use parseHexVersion */
export const parseHexManagerVersion = parseHexVersion;

export function compareVersion(
  a: ParsedFirmwareVersion,
  b: { major: number; minor: number }
): number {
  if (a.major !== b.major) {
    return a.major - b.major;
  }
  return a.minor - b.minor;
}

function holding(address: number, encoding: VersionEncoding): VersionFieldSpec {
  return { kind: 'holding', address, encoding };
}

function input(address: number, encoding: VersionEncoding): VersionFieldSpec {
  return { kind: 'input', address, encoding };
}

const HEX_36XXX_MAP: FirmwareVersionRegisterMap = {
  master: holding(36001, 'hex'),
  slave: holding(36002, 'hex'),
  manager: holding(36003, 'hex'),
};

const KH_PRE133_MAP: FirmwareVersionRegisterMap = {
  master: holding(30016, 'hex'),
  slave: holding(30017, 'hex'),
  manager: holding(30018, 'hex'),
};

const H3_LEGACY_MAP: FirmwareVersionRegisterMap = {
  master: holding(30016, 'decimal'),
  slave: holding(30017, 'decimal'),
  manager: holding(30018, 'hex'),
};

const H1_SERIES_LAN_MAP: FirmwareVersionRegisterMap = {
  master: holding(30016, 'decimal'),
  slave: holding(30017, 'decimal'),
  manager: holding(30018, 'decimal'),
};

const H1_SERIES_AUX_MAP: FirmwareVersionRegisterMap = {
  master: input(10016, 'decimal'),
  slave: input(10017, 'decimal'),
  manager: input(10018, 'decimal'),
};

export function resolveFirmwareVersionRegisterMap(
  profileId: ProfileId,
  connectionType: ConnectionType,
  firmwareVariant: FirmwareVariant
): FirmwareVersionRegisterMap {
  switch (profileId) {
    case 'h1g2':
    case 'h3Modern':
      return HEX_36XXX_MAP;
    case 'kh':
      return firmwareVariant === 'khPre133' ? KH_PRE133_MAP : HEX_36XXX_MAP;
    case 'h3Legacy':
      return H3_LEGACY_MAP;
    case 'h1Series':
      return connectionType === 'lan' ? H1_SERIES_LAN_MAP : H1_SERIES_AUX_MAP;
    default:
      return H1_SERIES_LAN_MAP;
  }
}

async function readVersionField(
  reader: ModbusReader,
  spec: VersionFieldSpec
): Promise<ParsedFirmwareVersion | null> {
  try {
    const raw =
      spec.kind === 'holding'
        ? await reader.readHoldingWord(spec.address)
        : await reader.readInputWord(spec.address);
    return spec.encoding === 'hex' ? parseHexVersion(raw) : parseDecimalVersion(raw);
  } catch {
    return null;
  }
}

async function readManagerForDetection(
  reader: ModbusReader,
  profileId: ProfileId,
  connectionType: ConnectionType
): Promise<{ manager: ParsedFirmwareVersion | null; firmwareVariant: FirmwareVariant }> {
  switch (profileId) {
    case 'h1g2': {
      const manager = await readVersionField(reader, HEX_36XXX_MAP.manager);
      return {
        manager,
        firmwareVariant: resolveFirmwareVariant(profileId, manager),
      };
    }
    case 'kh': {
      const modernManager = await readVersionField(reader, HEX_36XXX_MAP.manager);
      if (modernManager && compareVersion(modernManager, { major: 1, minor: 33 }) >= 0) {
        return { manager: modernManager, firmwareVariant: 'kh_133' };
      }
      const legacyManager = await readVersionField(reader, KH_PRE133_MAP.manager);
      return {
        manager: legacyManager ?? modernManager,
        firmwareVariant: 'khPre133',
      };
    }
    case 'h3Modern': {
      const manager = await readVersionField(reader, HEX_36XXX_MAP.manager);
      return { manager, firmwareVariant: 'default' };
    }
    case 'h3Legacy': {
      const manager = await readVersionField(reader, H3_LEGACY_MAP.manager);
      return {
        manager,
        firmwareVariant: resolveFirmwareVariant(profileId, manager),
      };
    }
    case 'h1Series': {
      const map =
        connectionType === 'lan' ? H1_SERIES_LAN_MAP : H1_SERIES_AUX_MAP;
      let manager = await readVersionField(reader, map.manager);
      if (!manager && connectionType === 'aux') {
        manager = await readVersionField(reader, H1_SERIES_LAN_MAP.manager);
      }
      return { manager, firmwareVariant: 'default' };
    }
    default:
      return { manager: null, firmwareVariant: 'default' };
  }
}

export function resolveFirmwareVariant(
  profileId: ProfileId,
  version: ParsedFirmwareVersion | null
): FirmwareVariant {
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

function toFirmwareVersions(
  master: ParsedFirmwareVersion | null,
  slave: ParsedFirmwareVersion | null,
  manager: ParsedFirmwareVersion | null
): FirmwareVersions {
  return {
    ...(master ? { masterVersion: master.raw } : {}),
    ...(slave ? { slaveVersion: slave.raw } : {}),
    ...(manager ? { managerVersion: manager.raw } : {}),
  };
}

export async function readFirmwareVersions(
  reader: ModbusReader,
  profileId: ProfileId,
  connectionType: ConnectionType
): Promise<{ versions: FirmwareVersions; firmwareVariant: FirmwareVariant }> {
  const detection = await readManagerForDetection(reader, profileId, connectionType);
  const registerMap = resolveFirmwareVersionRegisterMap(
    profileId,
    connectionType,
    detection.firmwareVariant
  );

  const [master, slave, manager] = await Promise.all([
    readVersionField(reader, registerMap.master),
    readVersionField(reader, registerMap.slave),
    detection.manager ?? readVersionField(reader, registerMap.manager),
  ]);

  return {
    versions: toFirmwareVersions(master, slave, manager),
    firmwareVariant: detection.firmwareVariant,
  };
}
