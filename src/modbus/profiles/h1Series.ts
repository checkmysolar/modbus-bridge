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
import { isOffGridRunningState, parseH1RunningState } from './runningState.js';
import {
  H1_G2_ENERGY_COUNTERS_START,
  H1_G2_TODAY_TOTAL_DEFINITIONS,
  readH1G2TodayTotals,
} from './h1g2.js';
import type { TodayTotalsSnapshot } from './todayTotals.js';
import { readTodayTotalsFromDefinitions } from './todayTotals.js';
import type { ProfileContext } from './types.js';

const HOLDING_BLOCK_START = 31006;
const HOLDING_BLOCK_LENGTH = 21;

const INPUT_ADDRESSES = {
  invbatvolt: 11006,
  pv1Power: 11002,
  pv2Power: 11005,
  gridVoltage: 11009,
  gridCurrent: 11010,
  gridFrequency: 11014,
  epsVolt: 11015,
  epsCurrent: 11016,
  epsPower: 11017,
  gridCt: 11021,
  meterPower2: 11022,
  loadPower: 11023,
  deviceTemperature: 11024,
  ambientTemperature: 11025,
  batVoltage: 11034,
  batCurrent: 11035,
  residualEnergy: 11037,
  soc: 11036,
  batTemperature: 11038,
  inverterState: 11056,
  workMode: 41000,
} as const;

const HOLDING_SCATTERED = {
  pv1Power: 31002,
  pv2Power: 31005,
  soc: 31024,
  residualEnergy: 11037,
  inverterState: 31027,
  workMode: 41000,
  remoteEnable: 44000,
  remoteActivePower: 44002,
  remoteTimeout: 44004,
} as const;

async function readH1SeriesLan(
  reader: ModbusReader,
  context: ProfileContext,
  sampledAt: string
): Promise<ModbusRealtimeTelemetry> {
  const [block, pv1, pv2, socReg, residualInput, stateReg, workMode, remoteEnable, remoteActivePower, remoteTimeout] =
    await Promise.all([
      reader.readHolding(HOLDING_BLOCK_START, HOLDING_BLOCK_LENGTH),
      reader.readHoldingWord(HOLDING_SCATTERED.pv1Power),
      reader.readHoldingWord(HOLDING_SCATTERED.pv2Power),
      reader.readHoldingWord(HOLDING_SCATTERED.soc),
      reader.readInputWordOptional(INPUT_ADDRESSES.residualEnergy),
      reader.readHoldingWordOptional(HOLDING_SCATTERED.inverterState),
      reader.readHoldingWordOptional(HOLDING_SCATTERED.workMode),
      reader.readHoldingWordOptional(HOLDING_SCATTERED.remoteEnable),
      reader.readHoldingWordOptional(HOLDING_SCATTERED.remoteActivePower),
      reader.readInputWordOptional(HOLDING_SCATTERED.remoteTimeout),
    ]);

  const gridCt = parseGridCtPowerKw(block[8]!);
  const batteryPower = parseBatteryPowerKw(block[16]!);
  const epsPower = parseEpsPowerKw(block[6]!);
  const pv1Power = Math.max(0, scaleSignedPowerKw(pv1));
  const pv2Power = Math.max(0, scaleSignedPowerKw(pv2));
  const runningState = stateReg !== undefined ? parseH1RunningState(stateReg) : undefined;
  const workModeResolved = resolveH1G2WorkMode({
    workModeRegister: workMode,
    remoteEnable,
    remoteActivePowerRaw: remoteActivePower,
    remoteTimeoutCountdown: remoteTimeout,
  });

  return {
    loadsPower: scaleSignedPowerKw(block[10]!),
    pvPower: pv1Power + pv2Power,
    pv1Power,
    pv2Power,
    pvStringCount: 2,
    pvStringPowers: { pv1Power, pv2Power },
    feedinPower: gridCt.feedinPower,
    gridConsumptionPower: gridCt.gridConsumptionPower,
    batChargePower: batteryPower.batChargePower,
    batDischargePower: batteryPower.batDischargePower,
    SoC: socReg,
    ResidualEnergy: residualInput !== undefined ? scaleUnsigned(residualInput, 0.01) : 0,
    batVoltage: scaleUnsigned(block[14]!, 0.1),
    batCurrent: scaleSigned(block[15]!, 0.1),
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
    ...(workMode !== undefined ? { workModeRegister: workMode } : {}),
    ...(remoteEnable !== undefined ? { remoteEnable } : {}),
    ...(remoteActivePower !== undefined ? { remoteActivePowerW: toSignedInt16(remoteActivePower) } : {}),
    ...(remoteTimeout !== undefined ? { remoteTimeoutCountdown: remoteTimeout } : {}),
    ...(workModeResolved !== undefined ? { workMode: workModeResolved } : {}),
    sampledAt,
  };
}

async function readH1SeriesAux(
  reader: ModbusReader,
  sampledAt: string
): Promise<ModbusRealtimeTelemetry> {
  const [
    pv1,
    pv2,
    gridVoltage,
    gridCurrent,
    gridFrequency,
    epsVolt,
    epsCurrent,
    epsPowerRaw,
    gridCtRaw,
    meterPower2Raw,
    loadPower,
    deviceTemperature,
    ambientTemperature,
    batVoltage,
    batCurrent,
    soc,
    residualEnergy,
    batTemperature,
    inverterState,
    workMode,
  ] = await Promise.all([
    reader.readInputWord(INPUT_ADDRESSES.pv1Power),
    reader.readInputWord(INPUT_ADDRESSES.pv2Power),
    reader.readInputWord(INPUT_ADDRESSES.gridVoltage),
    reader.readInputWord(INPUT_ADDRESSES.gridCurrent),
    reader.readInputWord(INPUT_ADDRESSES.gridFrequency),
    reader.readInputWord(INPUT_ADDRESSES.epsVolt),
    reader.readInputWord(INPUT_ADDRESSES.epsCurrent),
    reader.readInputWord(INPUT_ADDRESSES.epsPower),
    reader.readInputWord(INPUT_ADDRESSES.gridCt),
    reader.readInputWord(INPUT_ADDRESSES.meterPower2),
    reader.readInputWord(INPUT_ADDRESSES.loadPower),
    reader.readInputWord(INPUT_ADDRESSES.deviceTemperature),
    reader.readInputWord(INPUT_ADDRESSES.ambientTemperature),
    reader.readInputWord(INPUT_ADDRESSES.batVoltage),
    reader.readInputWord(INPUT_ADDRESSES.batCurrent),
    reader.readInputWord(INPUT_ADDRESSES.soc),
    reader.readInputWord(INPUT_ADDRESSES.residualEnergy),
    reader.readInputWord(INPUT_ADDRESSES.batTemperature),
    reader.readInputWord(INPUT_ADDRESSES.inverterState),
    reader.readInputWordOptional(INPUT_ADDRESSES.workMode),
  ]);

  const gridCt = parseGridCtPowerKw(gridCtRaw);
  const pv1Power = Math.max(0, scaleSignedPowerKw(pv1));
  const pv2Power = Math.max(0, scaleSignedPowerKw(pv2));
  const runningState = parseH1RunningState(inverterState);
  const workModeResolved = resolveH1G2WorkMode({ workModeRegister: workMode });

  return {
    loadsPower: scaleSignedPowerKw(loadPower),
    pvPower: pv1Power + pv2Power,
    pv1Power,
    pv2Power,
    pvStringCount: 2,
    pvStringPowers: { pv1Power, pv2Power },
    feedinPower: gridCt.feedinPower,
    gridConsumptionPower: gridCt.gridConsumptionPower,
    batChargePower: 0,
    batDischargePower: 0,
    SoC: soc,
    ResidualEnergy: scaleUnsigned(residualEnergy, 0.01),
    batVoltage: scaleUnsigned(batVoltage, 0.1),
    batCurrent: scaleSigned(batCurrent, 0.1),
    batTemperature: scaleSigned(batTemperature, 0.1),
    gridVoltage: scaleUnsigned(gridVoltage, 0.1),
    gridCurrent: scaleUnsigned(gridCurrent, 0.1),
    gridFrequency: scaleUnsigned(gridFrequency, 0.01),
    meterPower2: scaleSignedPowerKw(meterPower2Raw),
    ambientTemperature: scaleSigned(ambientTemperature, 0.1),
    deviceTemperature: scaleSigned(deviceTemperature, 0.1),
    runningState,
    isOffGrid: isOffGridRunningState(runningState),
    epsPower: parseEpsPowerKw(epsPowerRaw),
    epsPowerR: parseEpsPowerKw(epsPowerRaw),
    epsVoltR: scaleUnsigned(epsVolt, 0.1),
    epsCurrentR: scaleUnsigned(epsCurrent, 0.1),
    ...(workMode !== undefined ? { workModeRegister: workMode, workMode: workModeResolved } : {}),
    sampledAt,
  };
}

export async function readH1SeriesRealtime(
  reader: ModbusReader,
  context: ProfileContext,
  sampledAt: string
): Promise<ModbusRealtimeTelemetry> {
  if (context.connectionType === 'lan') {
    return readH1SeriesLan(reader, context, sampledAt);
  }
  return readH1SeriesAux(reader, sampledAt);
}

export async function readH1SeriesTodayTotals(
  reader: ModbusReader,
  context: ProfileContext,
  sampledAt: string
): Promise<TodayTotalsSnapshot> {
  if (context.connectionType === 'lan') {
    return readH1G2TodayTotals(reader, context, sampledAt);
  }

  return readTodayTotalsFromDefinitions(
    async (registers) => {
      const values: number[] = [];
      for (const register of registers) {
        values.push(await reader.readHoldingWord(register));
      }
      return values;
    },
    H1_G2_TODAY_TOTAL_DEFINITIONS,
    H1_G2_ENERGY_COUNTERS_START,
    sampledAt
  );
}
