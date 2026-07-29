import type { ConnectionType, FirmwareVariant, ProfileId } from '../profiles/types.js';
import {
  applyModelRegisters,
  decimalVersionRegister,
  hexVersionRegister,
} from './modelRegisters.js';

export interface AutodetectCase {
  fixtureId: string;
  modelName: string;
  modelEncoding: 'packed' | 'plain';
  expectedModelId: string;
  connectionType: ConnectionType;
  expectedFirmwareVariant: FirmwareVariant;
}

export const AUTODETECT_CASES: readonly AutodetectCase[] = [
  {
    fixtureId: 'h1g2-h1g2_144',
    modelName: 'H1-5.0-E1-G2',
    modelEncoding: 'packed',
    expectedModelId: 'H1_G2',
    connectionType: 'aux',
    expectedFirmwareVariant: 'h1g2_144',
  },
  {
    fixtureId: 'h1g2-h1g2Pre144',
    modelName: 'H1-5.0-E1-G2',
    modelEncoding: 'packed',
    expectedModelId: 'H1_G2',
    connectionType: 'aux',
    expectedFirmwareVariant: 'h1g2Pre144',
  },
  {
    fixtureId: 'h1Series-aux',
    modelName: 'H1-5.0-E',
    modelEncoding: 'packed',
    expectedModelId: 'H1',
    connectionType: 'aux',
    expectedFirmwareVariant: 'default',
  },
  {
    fixtureId: 'h1Series-lan',
    modelName: 'H1-5.0-E',
    modelEncoding: 'packed',
    expectedModelId: 'H1',
    connectionType: 'lan',
    expectedFirmwareVariant: 'default',
  },
  {
    fixtureId: 'kh-kh_133',
    modelName: 'KH10.5',
    modelEncoding: 'packed',
    expectedModelId: 'KH',
    connectionType: 'aux',
    expectedFirmwareVariant: 'kh_133',
  },
  {
    fixtureId: 'kh-khPre133',
    modelName: 'KH10.5',
    modelEncoding: 'packed',
    expectedModelId: 'KH',
    connectionType: 'aux',
    expectedFirmwareVariant: 'khPre133',
  },
  {
    fixtureId: 'h3Legacy-default',
    modelName: 'H3-8.0',
    modelEncoding: 'plain',
    expectedModelId: 'H3',
    connectionType: 'aux',
    expectedFirmwareVariant: 'h3_180',
  },
  {
    fixtureId: 'h3Modern-default',
    modelName: 'H3-10.0-Smart',
    modelEncoding: 'packed',
    expectedModelId: 'H3_SMART',
    connectionType: 'aux',
    expectedFirmwareVariant: 'default',
  },
];

export function seedFirmwareVersionRegisters(
  holding: Record<number, number>,
  input: Record<number, number>,
  profileId: ProfileId,
  connectionType: ConnectionType,
  firmwareVariant: FirmwareVariant
): void {
  switch (profileId) {
    case 'h1g2':
      holding[36001] = hexVersionRegister(1, 0x01);
      holding[36002] = hexVersionRegister(1, 0x01);
      holding[36003] =
        firmwareVariant === 'h1g2_144' ? hexVersionRegister(1, 0x2c) : hexVersionRegister(1, 0x2b);
      break;
    case 'kh':
      if (firmwareVariant === 'kh_133') {
        holding[36001] = hexVersionRegister(1, 0x01);
        holding[36002] = hexVersionRegister(1, 0x01);
        holding[36003] = hexVersionRegister(1, 33);
      } else {
        holding[30016] = hexVersionRegister(1, 0x01);
        holding[30017] = hexVersionRegister(1, 0x01);
        holding[30018] = hexVersionRegister(1, 32);
      }
      break;
    case 'h3Modern':
      holding[36001] = hexVersionRegister(1, 0x01);
      holding[36002] = hexVersionRegister(1, 0x01);
      holding[36003] = hexVersionRegister(1, 0x10);
      break;
    case 'h3Legacy':
      holding[30016] = decimalVersionRegister(1, 44);
      holding[30017] = decimalVersionRegister(1, 44);
      holding[30018] = hexVersionRegister(1, 0x50);
      break;
    case 'h1Series':
      if (connectionType === 'lan') {
        holding[30016] = decimalVersionRegister(1, 44);
        holding[30017] = decimalVersionRegister(1, 44);
        holding[30018] = decimalVersionRegister(1, 44);
      } else {
        input[10016] = decimalVersionRegister(1, 44);
        input[10017] = decimalVersionRegister(1, 44);
        input[10018] = decimalVersionRegister(1, 44);
      }
      break;
    default:
      break;
  }
}

export function buildAutodetectRegisterMaps(
  caseEntry: AutodetectCase,
  profileId: ProfileId,
  firmwareVariant: FirmwareVariant,
  fixtureHolding: Record<number, number>,
  fixtureInput: Record<number, number>
): { holding: Record<number, number>; input: Record<number, number> } {
  const holding = { ...fixtureHolding };
  const input = { ...fixtureInput };

  applyModelRegisters(holding, caseEntry.modelName, caseEntry.modelEncoding);
  seedFirmwareVersionRegisters(
    holding,
    input,
    profileId,
    caseEntry.connectionType,
    firmwareVariant
  );

  return { holding, input };
}
