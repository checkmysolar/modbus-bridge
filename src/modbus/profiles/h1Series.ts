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
  H1_G2_TODAY_TOTALS_SCALE,
  readH1G2TodayTotals,
} from './h1g2.js';
import {
  buildTodayTotalsSnapshot,
  type TodayTotalDefinition,
  type TodayTotalsSnapshot,
} from './todayTotals.js';
import type { ProfileContext } from './types.js';

/** G1 AUX today-total input registers (foxess_modbus entity_descriptions, Inv.H1_G1). */
export const H1_SERIES_AUX_ENERGY_COUNTERS_START = 11071;

export const H1_SERIES_AUX_TODAY_TOTAL_DEFINITIONS: readonly TodayTotalDefinition[] = [
  { key: 'solarGeneration', label: 'Solar generation', registers: [11071], scale: H1_G2_TODAY_TOTALS_SCALE },
  { key: 'batteryCharge', label: 'Battery charge', registers: [11074], scale: H1_G2_TODAY_TOTALS_SCALE },
  { key: 'batteryDischarge', label: 'Battery discharge', registers: [11077], scale: H1_G2_TODAY_TOTALS_SCALE },
  { key: 'feedIn', label: 'Feed-in (export)', registers: [11080], scale: H1_G2_TODAY_TOTALS_SCALE },
  { key: 'gridConsumption', label: 'Grid consumption (import)', registers: [11083], scale: H1_G2_TODAY_TOTALS_SCALE },
  { key: 'totalYield', label: 'Total yield', registers: [11086], scale: H1_G2_TODAY_TOTALS_SCALE, signed: true },
  { key: 'inputEnergy', label: 'Input energy', registers: [11089], scale: H1_G2_TODAY_TOTALS_SCALE, signed: true },
  { key: 'loadEnergy', label: 'Load energy', registers: [11092], scale: H1_G2_TODAY_TOTALS_SCALE, signed: true },
] as const;

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
  const block = await reader.readHolding(HOLDING_BLOCK_START, HOLDING_BLOCK_LENGTH);
  const holding = await reader.readScatteredWords(
    'holding',
    [HOLDING_SCATTERED.pv1Power, HOLDING_SCATTERED.pv2Power, HOLDING_SCATTERED.soc],
    false
  );
  const optionalHolding = await reader.readScatteredWords(
    'holding',
    [
      HOLDING_SCATTERED.inverterState,
      HOLDING_SCATTERED.workMode,
      HOLDING_SCATTERED.remoteEnable,
      HOLDING_SCATTERED.remoteActivePower,
    ],
    true
  );
  const optionalInput = await reader.readScatteredWords(
    'input',
    [INPUT_ADDRESSES.residualEnergy, HOLDING_SCATTERED.remoteTimeout],
    true
  );
  const pv1 = holding.get(HOLDING_SCATTERED.pv1Power)!;
  const pv2 = holding.get(HOLDING_SCATTERED.pv2Power)!;
  const socReg = holding.get(HOLDING_SCATTERED.soc)!;
  const residualInput = optionalInput.get(INPUT_ADDRESSES.residualEnergy);
  const remoteTimeout = optionalInput.get(HOLDING_SCATTERED.remoteTimeout);
  const stateReg = optionalHolding.get(HOLDING_SCATTERED.inverterState);
  const workMode = optionalHolding.get(HOLDING_SCATTERED.workMode);
  const remoteEnable = optionalHolding.get(HOLDING_SCATTERED.remoteEnable);
  const remoteActivePower = optionalHolding.get(HOLDING_SCATTERED.remoteActivePower);

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
  const input = await reader.readScatteredWords(
    'input',
    [
      INPUT_ADDRESSES.pv1Power,
      INPUT_ADDRESSES.pv2Power,
      INPUT_ADDRESSES.gridVoltage,
      INPUT_ADDRESSES.gridCurrent,
      INPUT_ADDRESSES.gridFrequency,
      INPUT_ADDRESSES.epsVolt,
      INPUT_ADDRESSES.epsCurrent,
      INPUT_ADDRESSES.epsPower,
      INPUT_ADDRESSES.gridCt,
      INPUT_ADDRESSES.meterPower2,
      INPUT_ADDRESSES.loadPower,
      INPUT_ADDRESSES.deviceTemperature,
      INPUT_ADDRESSES.ambientTemperature,
      INPUT_ADDRESSES.batVoltage,
      INPUT_ADDRESSES.batCurrent,
      INPUT_ADDRESSES.soc,
      INPUT_ADDRESSES.residualEnergy,
      INPUT_ADDRESSES.batTemperature,
      INPUT_ADDRESSES.inverterState,
    ],
    false
  );
  const workMode = (await reader.readScatteredWords('input', [INPUT_ADDRESSES.workMode], true)).get(
    INPUT_ADDRESSES.workMode
  );
  const pv1 = input.get(INPUT_ADDRESSES.pv1Power)!;
  const pv2 = input.get(INPUT_ADDRESSES.pv2Power)!;
  const gridVoltage = input.get(INPUT_ADDRESSES.gridVoltage)!;
  const gridCurrent = input.get(INPUT_ADDRESSES.gridCurrent)!;
  const gridFrequency = input.get(INPUT_ADDRESSES.gridFrequency)!;
  const epsVolt = input.get(INPUT_ADDRESSES.epsVolt)!;
  const epsCurrent = input.get(INPUT_ADDRESSES.epsCurrent)!;
  const epsPowerRaw = input.get(INPUT_ADDRESSES.epsPower)!;
  const gridCtRaw = input.get(INPUT_ADDRESSES.gridCt)!;
  const meterPower2Raw = input.get(INPUT_ADDRESSES.meterPower2)!;
  const loadPower = input.get(INPUT_ADDRESSES.loadPower)!;
  const deviceTemperature = input.get(INPUT_ADDRESSES.deviceTemperature)!;
  const ambientTemperature = input.get(INPUT_ADDRESSES.ambientTemperature)!;
  const batVoltage = input.get(INPUT_ADDRESSES.batVoltage)!;
  const batCurrent = input.get(INPUT_ADDRESSES.batCurrent)!;
  const soc = input.get(INPUT_ADDRESSES.soc)!;
  const residualEnergy = input.get(INPUT_ADDRESSES.residualEnergy)!;
  const batTemperature = input.get(INPUT_ADDRESSES.batTemperature)!;
  const inverterState = input.get(INPUT_ADDRESSES.inverterState)!;

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

  try {
    const registers = H1_SERIES_AUX_TODAY_TOTAL_DEFINITIONS.flatMap((definition) => definition.registers);
    const valuesByRegister = await reader.readScatteredWords('input', registers, false);
    const valuesMap = new Map<number, number>();
    for (const [register, value] of valuesByRegister) {
      if (value !== undefined) {
        valuesMap.set(register, value);
      }
    }
    return buildTodayTotalsSnapshot(
      H1_SERIES_AUX_TODAY_TOTAL_DEFINITIONS,
      valuesMap,
      sampledAt,
      H1_SERIES_AUX_ENERGY_COUNTERS_START
    );
  } catch (error) {
    return {
      sampledAt,
      blockStart: H1_SERIES_AUX_ENERGY_COUNTERS_START,
      blockLength: 0,
      blockRaw: null,
      totals: [],
      readError: error instanceof Error ? error.message : String(error),
    };
  }
}
