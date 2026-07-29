import {
  getWorkModeWriteStrategy,
  isForceWorkMode,
  toUnsignedInt16,
  WORK_MODE_FORCE_CHARGE,
  workModeCodeToH1G2RegisterValue,
  workModeCodeToH3ModernRegisterValue,
} from '@checkmysolar/modbus-telemetry/workMode';
import type { ModbusReader } from './core/reader.js';
import {
  H1_G2_REMOTE_ACTIVE_POWER_REGISTER,
  H1_G2_REMOTE_ENABLE_REGISTER,
  H1_G2_WORK_MODE_REGISTER,
} from './profiles/h1g2.js';
import type { DetectedInverter } from './profiles/types.js';

export const DEFAULT_FORCE_POWER_W = 5000;
export const DEFAULT_REMOTE_TIMEOUT_S = 3600;

const H3_WORK_MODE_REGISTER = 49203;
const H3_REMOTE_ENABLE_REGISTER = 46001;
const H3_REMOTE_TIMEOUT_REGISTER = 46002;
const H3_REMOTE_ACTIVE_POWER_REGISTER = 46004;
const H1_REMOTE_TIMEOUT_REGISTER = 44001;

export type WorkModeWriteErrorCode = 'UNSUPPORTED' | 'INVALID_CODE';

export class WorkModeWriteError extends Error {
  constructor(
    message: string,
    public readonly code: WorkModeWriteErrorCode
  ) {
    super(message);
    this.name = 'WorkModeWriteError';
  }
}

export interface WriteWorkModeOptions {
  forcePowerW?: number;
  remoteTimeoutS?: number;
}

function assertValidWorkModeCode(code: number): void {
  if (!Number.isInteger(code) || code < 0 || code > 5) {
    throw new WorkModeWriteError(`Invalid work mode code: ${code}`, 'INVALID_CODE');
  }
}

async function writeStandardH1WorkMode(reader: ModbusReader, code: number): Promise<void> {
  const registerValue = workModeCodeToH1G2RegisterValue(code);
  if (registerValue === undefined) {
    throw new WorkModeWriteError(`Work mode ${code} cannot be written via register 41000`, 'INVALID_CODE');
  }

  await reader.writeHoldingRegister(H1_G2_REMOTE_ENABLE_REGISTER, 0);
  await reader.writeHoldingRegister(H1_G2_WORK_MODE_REGISTER, registerValue);
}

async function writeStandardH3ModernWorkMode(reader: ModbusReader, code: number): Promise<void> {
  const registerValue = workModeCodeToH3ModernRegisterValue(code);
  if (registerValue === undefined) {
    throw new WorkModeWriteError(`Work mode ${code} cannot be written via register 49203`, 'INVALID_CODE');
  }

  await reader.writeHoldingRegister(H3_REMOTE_ENABLE_REGISTER, 0);
  await reader.writeHoldingRegister(H3_WORK_MODE_REGISTER, registerValue);
}

async function writeForceH1WorkMode(
  reader: ModbusReader,
  code: number,
  forcePowerW: number,
  remoteTimeoutS: number
): Promise<void> {
  const signedPower = code === WORK_MODE_FORCE_CHARGE ? -forcePowerW : forcePowerW;
  const encodedPower = toUnsignedInt16(signedPower);

  await reader.writeHoldingRegister(H1_G2_REMOTE_ENABLE_REGISTER, 0);
  await reader.writeHoldingRegister(H1_G2_REMOTE_ENABLE_REGISTER, 1);
  await reader.writeHoldingRegister(H1_REMOTE_TIMEOUT_REGISTER, remoteTimeoutS);
  await reader.writeHoldingRegister(H1_G2_REMOTE_ACTIVE_POWER_REGISTER, encodedPower);
}

async function writeForceH3ModernWorkMode(
  reader: ModbusReader,
  code: number,
  forcePowerW: number,
  remoteTimeoutS: number
): Promise<void> {
  const signedPower = code === WORK_MODE_FORCE_CHARGE ? -forcePowerW : forcePowerW;
  const encodedPower = toUnsignedInt16(signedPower);

  await reader.writeHoldingRegister(H3_REMOTE_ENABLE_REGISTER, 0);
  await reader.writeHoldingRegister(H3_REMOTE_ENABLE_REGISTER, 1);
  await reader.writeHoldingRegister(H3_REMOTE_TIMEOUT_REGISTER, remoteTimeoutS);
  await reader.writeHoldingRegister(H3_REMOTE_ACTIVE_POWER_REGISTER, encodedPower);
}

export async function writeWorkMode(
  reader: ModbusReader,
  detected: DetectedInverter,
  code: number,
  options: WriteWorkModeOptions = {}
): Promise<{ workMode: number }> {
  assertValidWorkModeCode(code);

  const strategy = getWorkModeWriteStrategy(detected.profileId, detected.connectionType);
  if (strategy === 'unsupported') {
    throw new WorkModeWriteError(
      `Work mode writes are not supported for profile ${detected.profileId} (${detected.connectionType})`,
      'UNSUPPORTED'
    );
  }

  const forcePowerW = options.forcePowerW ?? DEFAULT_FORCE_POWER_W;
  const remoteTimeoutS = options.remoteTimeoutS ?? DEFAULT_REMOTE_TIMEOUT_S;

  if (isForceWorkMode(code)) {
    if (strategy === 'h3Modern') {
      await writeForceH3ModernWorkMode(reader, code, forcePowerW, remoteTimeoutS);
    } else {
      await writeForceH1WorkMode(reader, code, forcePowerW, remoteTimeoutS);
    }
  } else if (strategy === 'h3Modern') {
    await writeStandardH3ModernWorkMode(reader, code);
  } else {
    await writeStandardH1WorkMode(reader, code);
  }

  return { workMode: code };
}
