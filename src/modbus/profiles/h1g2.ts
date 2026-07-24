import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import { resolveH1G2WorkMode, toSignedInt16 } from '@checkmysolar/modbus-telemetry/workMode';
import type { ModbusReader } from '../core/reader.js';
import {
  parseBatteryPowerKw,
  parseEpsPowerKw,
  parseGridCtPowerKw,
  scaleSigned,
  scaleSignedPowerKw,
  scaleUnsigned,
} from '../core/scaling.js';
import { isOffGridRunningState, parseG2RunningState } from './runningState.js';
import { parseH1G2TodayTotalsFromBlock } from '../h1g2TodayTotals.js';
import {
  type TodayTotalDefinition,
  type TodayTotalsSnapshot,
} from './todayTotals.js';
import type { ProfileContext } from './types.js';

export const H1_G2_BLOCK_START = 31006;
export const H1_G2_BLOCK_LENGTH = 21;
export const H1_G2_RESIDUAL_ENERGY_REGISTER = 37632;
export const H1_G2_PV1_POWER_REGISTER = 39280;
export const H1_G2_PV2_POWER_REGISTER = 39282;
export const H1_G2_STATE_STATUS1_REGISTER = 39063;
export const H1_G2_STATE_STATUS3_REGISTER = 39065;
export const H1_G2_WORK_MODE_REGISTER = 41000;
export const H1_G2_REMOTE_ENABLE_REGISTER = 44000;
export const H1_G2_REMOTE_ACTIVE_POWER_REGISTER = 44002;
export const H1_G2_REMOTE_TIMEOUT_COUNTDOWN_REGISTER = 44004;
export const H1_G2_LOAD_POWER_REGISTER = 31016;

/** BMS block for manager firmware 1.44+ (foxess H1_G2_144). */
export const H1_G2_BMS_BLOCK_START = 37609;
export const H1_G2_BMS_BLOCK_LENGTH = 16;
export const H1_G2_BMS_VOLTAGE_OFFSET = 0;
export const H1_G2_BMS_CURRENT_OFFSET = 1;
export const H1_G2_BMS_CELL_TEMP_HIGH_OFFSET = 8;
export const H1_G2_BMS_CELL_TEMP_LOW_OFFSET = 9;
export const H1_G2_BMS_CELL_MV_HIGH_OFFSET = 10;
export const H1_G2_BMS_CELL_MV_LOW_OFFSET = 11;
export const H1_G2_BMS_SOH_OFFSET = 15;
export const H1_G2_ALARM_BLOCK_START = 39067;
export const H1_G2_ALARM_BLOCK_LENGTH = 3;

export const H1_G2_ENERGY_COUNTERS_START = 32000;
export const H1_G2_ENERGY_COUNTERS_LENGTH = 24;
export const H1_G2_TODAY_TOTALS_SCALE = 0.1;

export const H1_G2_TODAY_TOTAL_DEFINITIONS: readonly TodayTotalDefinition[] = [
  { key: 'solarGeneration', label: 'Solar generation', registers: [32002], scale: H1_G2_TODAY_TOTALS_SCALE },
  { key: 'batteryCharge', label: 'Battery charge', registers: [32005], scale: H1_G2_TODAY_TOTALS_SCALE },
  { key: 'batteryDischarge', label: 'Battery discharge', registers: [32008], scale: H1_G2_TODAY_TOTALS_SCALE },
  { key: 'feedIn', label: 'Feed-in (export)', registers: [32011], scale: H1_G2_TODAY_TOTALS_SCALE },
  { key: 'gridConsumption', label: 'Grid consumption (import)', registers: [32014], scale: H1_G2_TODAY_TOTALS_SCALE },
  { key: 'totalYield', label: 'Total yield', registers: [32017], scale: H1_G2_TODAY_TOTALS_SCALE, signed: true },
  { key: 'inputEnergy', label: 'Input energy', registers: [32020], scale: H1_G2_TODAY_TOTALS_SCALE, signed: true },
  { key: 'loadEnergy', label: 'Load energy', registers: [32023], scale: H1_G2_TODAY_TOTALS_SCALE, signed: true },
] as const;

export interface H1G2RegisterInputs {
  block: number[];
  residualEnergyRaw: number;
  pv1PowerRaw: number;
  pv2PowerRaw: number;
  stateStatus1: number;
  stateStatus3: number;
  workModeRaw?: number;
  remoteEnableRaw?: number;
  remoteActivePowerRaw?: number;
  remoteTimeoutCountdownRaw?: number;
  /** Holding 37609–37624 when manager firmware is 1.44+. */
  bmsBlock?: number[];
  /** Holding 39067–39069 alarm bitmaps when manager firmware is 1.44+. */
  alarmBlock?: number[];
  sampledAt: string;
}

function buildPvStringPowers(pv1Power: number, pv2Power: number): {
  pvStringCount: number;
  pvStringPowers: Record<string, number>;
} {
  return {
    pvStringCount: 2,
    pvStringPowers: { pv1Power, pv2Power },
  };
}

export function parseH1G2RealtimeSnapshot(input: H1G2RegisterInputs): ModbusRealtimeTelemetry {
  const block = input.block;
  if (block.length < H1_G2_BLOCK_LENGTH) {
    throw new Error(`Expected ${H1_G2_BLOCK_LENGTH} registers in block starting at ${H1_G2_BLOCK_START}`);
  }

  const gridCt = parseGridCtPowerKw(block[8]!);
  const batteryPower = parseBatteryPowerKw(block[16]!);
  const epsPower = parseEpsPowerKw(block[6]!);
  const pv1Power = Math.max(0, scaleSignedPowerKw(input.pv1PowerRaw));
  const pv2Power = Math.max(0, scaleSignedPowerKw(input.pv2PowerRaw));
  const { pvStringCount, pvStringPowers } = buildPvStringPowers(pv1Power, pv2Power);
  const runningState = parseG2RunningState(input.stateStatus1, input.stateStatus3);
  const batVoltageRaw = input.bmsBlock
    ? input.bmsBlock[H1_G2_BMS_VOLTAGE_OFFSET]!
    : block[14]!;
  const batCurrentRaw = input.bmsBlock
    ? input.bmsBlock[H1_G2_BMS_CURRENT_OFFSET]!
    : block[15]!;

  return {
    loadsPower: scaleSignedPowerKw(block[10]!),
    pvPower: pv1Power + pv2Power,
    pv1Power,
    pv2Power,
    pvStringCount,
    pvStringPowers,
    feedinPower: gridCt.feedinPower,
    gridConsumptionPower: gridCt.gridConsumptionPower,
    batChargePower: batteryPower.batChargePower,
    batDischargePower: batteryPower.batDischargePower,
    SoC: block[18]!,
    ResidualEnergy: scaleUnsigned(input.residualEnergyRaw, 0.01),
    batVoltage: scaleUnsigned(batVoltageRaw, 0.1),
    batCurrent: scaleSigned(batCurrentRaw, 0.1),
    batTemperature: scaleSigned(block[17]!, 0.1),
    gridVoltage: scaleUnsigned(block[0]!, 0.1),
    gridCurrent: scaleUnsigned(block[1]!, 0.1),
    gridFrequency: scaleUnsigned(block[3]!, 0.01),
    meterPower2: scaleSignedPowerKw(block[9]!),
    ambientTemperature: scaleSigned(block[13]!, 0.1),
    deviceTemperature: scaleSigned(block[12]!, 0.1),
    runningState,
    isOffGrid: isOffGridRunningState(runningState),
    epsPower,
    epsPowerR: epsPower,
    epsVoltR: scaleUnsigned(block[4]!, 0.1),
    epsCurrentR: scaleUnsigned(block[5]!, 0.1),
    ...(input.bmsBlock
      ? {
          batSoh: input.bmsBlock[H1_G2_BMS_SOH_OFFSET]!,
          bmsCellTempHigh: scaleSigned(input.bmsBlock[H1_G2_BMS_CELL_TEMP_HIGH_OFFSET]!, 0.1),
          bmsCellTempLow: scaleSigned(input.bmsBlock[H1_G2_BMS_CELL_TEMP_LOW_OFFSET]!, 0.1),
          bmsCellMvHigh: input.bmsBlock[H1_G2_BMS_CELL_MV_HIGH_OFFSET]!,
          bmsCellMvLow: input.bmsBlock[H1_G2_BMS_CELL_MV_LOW_OFFSET]!,
        }
      : {}),
    ...(input.alarmBlock
      ? {
          alarmRegister1: input.alarmBlock[0],
          alarmRegister2: input.alarmBlock[1],
          alarmRegister3: input.alarmBlock[2],
        }
      : {}),
    ...(() => {
      const workMode = resolveH1G2WorkMode({
        workModeRegister: input.workModeRaw,
        remoteEnable: input.remoteEnableRaw,
        remoteActivePowerRaw: input.remoteActivePowerRaw,
        remoteTimeoutCountdown: input.remoteTimeoutCountdownRaw,
      });
      return {
        ...(input.workModeRaw !== undefined ? { workModeRegister: input.workModeRaw } : {}),
        ...(input.remoteEnableRaw !== undefined ? { remoteEnable: input.remoteEnableRaw } : {}),
        ...(input.remoteActivePowerRaw !== undefined
          ? { remoteActivePowerW: toSignedInt16(input.remoteActivePowerRaw) }
          : {}),
        ...(input.remoteTimeoutCountdownRaw !== undefined
          ? { remoteTimeoutCountdown: input.remoteTimeoutCountdownRaw }
          : {}),
        ...(workMode !== undefined ? { workMode } : {}),
      };
    })(),
    sampledAt: input.sampledAt,
  };
}

export function parseLoadsPowerRegister(raw: number): number {
  return scaleSignedPowerKw(raw);
}

export async function readH1G2Realtime(
  reader: ModbusReader,
  context: ProfileContext,
  sampledAt: string
): Promise<ModbusRealtimeTelemetry> {
  const isPre144 = context.firmwareVariant === 'h1g2Pre144';

  const block = await reader.readHolding(H1_G2_BLOCK_START, H1_G2_BLOCK_LENGTH);
  const scattered = await reader.readScatteredWords(
    'holding',
    [H1_G2_RESIDUAL_ENERGY_REGISTER, H1_G2_PV1_POWER_REGISTER, H1_G2_PV2_POWER_REGISTER],
    false
  );
  const state = await reader.readHolding(H1_G2_STATE_STATUS1_REGISTER, 3);
  const optionalHolding = await reader.readScatteredWords(
    'holding',
    [
      H1_G2_WORK_MODE_REGISTER,
      H1_G2_REMOTE_ENABLE_REGISTER,
      H1_G2_REMOTE_ACTIVE_POWER_REGISTER,
    ],
    true
  );
  const optionalInput = await reader.readScatteredWords(
    'input',
    [H1_G2_REMOTE_TIMEOUT_COUNTDOWN_REGISTER],
    true
  );

  let bmsBlock: number[] | undefined;
  let alarmBlock: number[] | undefined;
  if (!isPre144) {
    bmsBlock = await reader.readHolding(H1_G2_BMS_BLOCK_START, H1_G2_BMS_BLOCK_LENGTH);
    alarmBlock = await reader.readHolding(H1_G2_ALARM_BLOCK_START, H1_G2_ALARM_BLOCK_LENGTH);
  }

  return parseH1G2RealtimeSnapshot({
    block,
    residualEnergyRaw: scattered.get(H1_G2_RESIDUAL_ENERGY_REGISTER)!,
    pv1PowerRaw: scattered.get(H1_G2_PV1_POWER_REGISTER)!,
    pv2PowerRaw: scattered.get(H1_G2_PV2_POWER_REGISTER)!,
    stateStatus1: state[0]!,
    stateStatus3: state[2]!,
    workModeRaw: optionalHolding.get(H1_G2_WORK_MODE_REGISTER),
    remoteEnableRaw: optionalHolding.get(H1_G2_REMOTE_ENABLE_REGISTER),
    remoteActivePowerRaw: optionalHolding.get(H1_G2_REMOTE_ACTIVE_POWER_REGISTER),
    remoteTimeoutCountdownRaw: optionalInput.get(H1_G2_REMOTE_TIMEOUT_COUNTDOWN_REGISTER),
    bmsBlock,
    alarmBlock,
    sampledAt,
  });
}

export async function readH1G2TodayTotals(
  reader: ModbusReader,
  _context: ProfileContext,
  sampledAt: string
): Promise<TodayTotalsSnapshot> {
  try {
    const block = await reader.readHolding(H1_G2_ENERGY_COUNTERS_START, H1_G2_ENERGY_COUNTERS_LENGTH);
    return parseH1G2TodayTotalsFromBlock(block, H1_G2_ENERGY_COUNTERS_START, sampledAt);
  } catch (error) {
    return {
      sampledAt,
      blockStart: H1_G2_ENERGY_COUNTERS_START,
      blockLength: 0,
      blockRaw: null,
      totals: [],
      readError: error instanceof Error ? error.message : String(error),
    };
  }
}
