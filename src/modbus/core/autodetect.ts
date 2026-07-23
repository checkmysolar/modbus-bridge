import type { ModbusReader } from './reader.js';
import { readManagerVersion, resolveFirmwareVariant } from './version.js';
import type { ConnectionType, DetectedInverter, ProfileId } from '../profiles/types.js';

const MODEL_START_ADDRESS = 30000;
const MODEL_LENGTH = 16;

interface ModelPattern {
  modelId: string;
  pattern: RegExp;
  profileId: ProfileId;
  connectionType?: ConnectionType;
}

/** Ordered patterns from foxess_modbus inverter_profiles.py (_INVERTER_PROFILES_LIST). */
export const MODEL_PATTERNS: readonly ModelPattern[] = [
  { modelId: 'H1_G2', pattern: /^H1-([\d.]+)-E\d?-G2/, profileId: 'h1g2' },
  { modelId: 'H1', pattern: /^H1-([\d.]+)(?!.*-G2)/, profileId: 'h1Series' },
  { modelId: 'AC1_G2', pattern: /^AC1-([\d.]+)-E-G2/, profileId: 'h1g2' },
  { modelId: 'P1', pattern: /^P1-([\d.]+)-E/, profileId: 'h1g2' },
  { modelId: 'AC1', pattern: /^AC1-([\d.]+)/, profileId: 'h1Series' },
  { modelId: 'AIO-H1', pattern: /^AIO-H1-([\d.]+)/, profileId: 'h1Series' },
  { modelId: 'AIO-AC1', pattern: /^AIO-AC1-([\d.]+)/, profileId: 'h1Series' },
  { modelId: 'KH', pattern: /^KH([\d.]+)/, profileId: 'kh' },
  { modelId: 'H3_SMART', pattern: /^H3-([\d.]+)-(?:Smart|M)/, profileId: 'h3Modern' },
  { modelId: 'P3_SMART', pattern: /^P3-([\d.]+)-SH\d*$/, profileId: 'h3Modern' },
  { modelId: 'H3', pattern: /^H3-([\d.]+)/, profileId: 'h3Legacy' },
  { modelId: 'AC3', pattern: /^AC3-([\d.]+)/, profileId: 'h3Legacy' },
  { modelId: 'AIO-H3', pattern: /^AIO-H3-([\d.]+)/, profileId: 'h3Legacy' },
  { modelId: 'KUARA-H3', pattern: /^Kuara ([\d.]+)-3-H$/, profileId: 'h3Legacy' },
  { modelId: 'SK-HWR-SMART', pattern: /^SK-HWR-([\d.]+) SMART/, profileId: 'h3Modern' },
  { modelId: 'SK-HWR', pattern: /^SK-HWR-([\d.]+)/, profileId: 'h3Legacy' },
  { modelId: 'STAR-H3', pattern: /^STAR-H3-([\d.]+)/, profileId: 'h3Legacy' },
  { modelId: 'SOLAVITA-SP', pattern: /^SP R(\d+)KH3/, profileId: 'h3Legacy' },
  { modelId: 'ATRONIX_AX', pattern: /^AX ([\d.]+)kW-3ph/, profileId: 'h3Legacy' },
  { modelId: 'H3_PRO', pattern: /^[HP]3-Pro-([\d.]+)/, profileId: 'h3Modern' },
  { modelId: 'ENPAL_IX', pattern: /^I-X([\d.]+)/, profileId: 'h3Modern' },
  { modelId: '1KOMMA5', pattern: /^1K5-HI-(\d+)-V1/, profileId: 'h3Modern' },
  { modelId: 'EVO', pattern: /^EVO \d+-([\d.]+)-H$/, profileId: 'h3Modern' },
] as const;

export function decodeModelString(registerValues: number[]): string {
  if (registerValues.length === 0) {
    return '';
  }

  let modelChars: number[];
  if ((registerValues[0]! & 0xff00) !== 0) {
    modelChars = [];
    for (const register of registerValues) {
      modelChars.push((register >> 8) & 0xff);
      modelChars.push(register & 0xff);
    }
  } else {
    modelChars = registerValues;
  }

  let fullModel = '';
  for (const char of modelChars) {
    if (char >= 0x20 && char < 0x7f) {
      fullModel += String.fromCharCode(char);
    } else {
      break;
    }
  }
  return fullModel.trim();
}

export function matchModelPattern(modelName: string): ModelPattern | null {
  for (const entry of MODEL_PATTERNS) {
    if (entry.pattern.test(modelName)) {
      return entry;
    }
  }
  return null;
}

export async function readModelString(reader: ModbusReader): Promise<string> {
  const registerValues = await reader.readHolding(MODEL_START_ADDRESS, MODEL_LENGTH);
  return decodeModelString(registerValues);
}

export interface AutodetectOptions {
  connectionType?: ConnectionType;
  forcedProfileId?: ProfileId;
  forcedModelName?: string;
}

export async function autodetectInverter(
  reader: ModbusReader,
  options: AutodetectOptions = {}
): Promise<DetectedInverter> {
  if (options.forcedProfileId) {
    const managerVersion = await readManagerVersion(reader, options.forcedProfileId);
    const firmwareVariant = resolveFirmwareVariant(options.forcedProfileId, managerVersion);
    return {
      modelId: options.forcedProfileId,
      modelName: options.forcedModelName ?? options.forcedProfileId,
      profileId: options.forcedProfileId,
      connectionType: options.connectionType ?? 'aux',
      firmwareVariant,
      managerVersion: managerVersion?.raw,
    };
  }

  const modelName = options.forcedModelName ?? (await readModelString(reader));
  const match = matchModelPattern(modelName);
  if (!match) {
    throw new Error(`Unsupported inverter model '${modelName}'`);
  }

  const managerVersion = await readManagerVersion(reader, match.profileId);
  const firmwareVariant = resolveFirmwareVariant(match.profileId, managerVersion);

  return {
    modelId: match.modelId,
    modelName,
    profileId: match.profileId,
    connectionType: options.connectionType ?? match.connectionType ?? 'aux',
    firmwareVariant,
    managerVersion: managerVersion?.raw,
  };
}
