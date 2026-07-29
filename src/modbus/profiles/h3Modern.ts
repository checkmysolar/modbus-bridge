import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import { resolveH3ModernWorkMode, toSignedInt16 } from '@checkmysolar/modbus-telemetry/workMode';
import type { ModbusReader } from '../core/reader.js';
import {
  combineRegisters,
  parseBatteryPowerKwFromCombined,
  parseGridCtPowerKwFromCombined,
  scaleSigned,
  scaleUnsigned,
} from '../core/scaling.js';
import { isOffGridRunningState, parseG2RunningState } from './runningState.js';
import {
  buildTodayTotalsSnapshot,
  type TodayTotalDefinition,
  type TodayTotalsSnapshot,
} from './todayTotals.js';
import type { ProfileContext } from './types.js';

const H3_MODERN_TODAY_SCALE = 0.01;
export const H3_MODERN_WORK_MODE_REGISTER = 49203;
export const H3_MODERN_REMOTE_ENABLE_REGISTER = 46001;
export const H3_MODERN_REMOTE_ACTIVE_POWER_REGISTER = 46004;
export const H3_MODERN_REMOTE_TIMEOUT_COUNTDOWN_REGISTER = 46007;

export const H3_MODERN_TODAY_TOTAL_DEFINITIONS: readonly TodayTotalDefinition[] = [
  { key: 'solarGeneration', label: 'Solar generation', registers: [39604, 39603], scale: H3_MODERN_TODAY_SCALE, isPair: true },
  { key: 'batteryCharge', label: 'Battery charge', registers: [39608, 39607], scale: H3_MODERN_TODAY_SCALE, isPair: true },
  { key: 'batteryDischarge', label: 'Battery discharge', registers: [39612, 39611], scale: H3_MODERN_TODAY_SCALE, isPair: true },
  { key: 'feedIn', label: 'Feed-in (export)', registers: [39616, 39615], scale: H3_MODERN_TODAY_SCALE, isPair: true },
  { key: 'gridConsumption', label: 'Grid consumption (import)', registers: [39620, 39619], scale: H3_MODERN_TODAY_SCALE, isPair: true },
  { key: 'loadEnergy', label: 'Load energy', registers: [39632, 39631], scale: H3_MODERN_TODAY_SCALE, isPair: true },
] as const;

export async function readH3ModernRealtime(
  reader: ModbusReader,
  _context: ProfileContext,
  sampledAt: string
): Promise<ModbusRealtimeTelemetry> {
  const holding = await reader.readScatteredWords(
    'holding',
    [
      39123, 39139, 39279, 39280, 39281, 39282, 39225, 39226, 38814, 38815, 39237, 39238, 37609,
      39228, 39229, 37612, 37611, 39141, 39063, 39065, 37632,
    ],
    false
  );
  const optionalPairs = await reader.readScatteredWords('holding', [39283, 39284, 39285, 39286], true);
  const optionalHolding = await reader.readScatteredWords(
    'holding',
    [
      39142,
      H3_MODERN_WORK_MODE_REGISTER,
      H3_MODERN_REMOTE_ENABLE_REGISTER,
      H3_MODERN_REMOTE_ACTIVE_POWER_REGISTER,
    ],
    true
  );
  const optionalInput = await reader.readScatteredWords(
    'input',
    [H3_MODERN_REMOTE_TIMEOUT_COUNTDOWN_REGISTER],
    true
  );

  const gridVoltage = holding.get(39123)!;
  const gridFrequency = holding.get(39139)!;
  const pv1 = combineRegisters([holding.get(39280)!, holding.get(39279)!], true);
  const pv2 = combineRegisters([holding.get(39282)!, holding.get(39281)!], true);
  const pv3Low = optionalPairs.get(39283);
  const pv3High = optionalPairs.get(39284);
  const pv4Low = optionalPairs.get(39285);
  const pv4High = optionalPairs.get(39286);
  const pv3 =
    pv3Low !== undefined && pv3High !== undefined
      ? combineRegisters([pv3High, pv3Low], true)
      : undefined;
  const pv4 =
    pv4Low !== undefined && pv4High !== undefined
      ? combineRegisters([pv4High, pv4Low], true)
      : undefined;
  const loadPower = combineRegisters([holding.get(39226)!, holding.get(39225)!], true);
  const gridCt = combineRegisters([holding.get(38815)!, holding.get(38814)!], true);
  const batPower = combineRegisters([holding.get(39238)!, holding.get(39237)!], true);
  const batVoltage = holding.get(37609)!;
  const batCurrent = combineRegisters([holding.get(39229)!, holding.get(39228)!], true);
  const soc = holding.get(37612)!;
  const batTemp = holding.get(37611)!;
  const invTemp = holding.get(39141)!;
  const ambTemp = optionalHolding.get(39142);
  const stateStatus1 = holding.get(39063)!;
  const stateStatus3 = holding.get(39065)!;
  const residual = holding.get(37632)!;
  const workMode = optionalHolding.get(H3_MODERN_WORK_MODE_REGISTER);
  const remoteEnable = optionalHolding.get(H3_MODERN_REMOTE_ENABLE_REGISTER);
  const remoteActivePower = optionalHolding.get(H3_MODERN_REMOTE_ACTIVE_POWER_REGISTER);
  const remoteTimeoutCountdown = optionalInput.get(H3_MODERN_REMOTE_TIMEOUT_COUNTDOWN_REGISTER);

  const pv1Power = Math.max(0, pv1 * 0.001);
  const pv2Power = Math.max(0, pv2 * 0.001);
  const pv3Power = Math.max(0, (pv3 ?? 0) * 0.001);
  const pv4Power = Math.max(0, (pv4 ?? 0) * 0.001);
  const pvStringPowers: Record<string, number> = { pv1Power, pv2Power };
  if (pv3 !== undefined) pvStringPowers.pv3Power = pv3Power;
  if (pv4 !== undefined) pvStringPowers.pv4Power = pv4Power;

  const gridCtData = parseGridCtPowerKwFromCombined(gridCt, 0.0001);
  const batteryPower = parseBatteryPowerKwFromCombined(batPower, 0.001);
  const runningState = parseG2RunningState(stateStatus1, stateStatus3);
  const workModeResolved = resolveH3ModernWorkMode({
    workModeRegister: workMode,
    remoteEnable,
    remoteActivePowerRaw: remoteActivePower,
    remoteTimeoutCountdown,
  });

  return {
    loadsPower: loadPower * 0.001,
    pvPower: pv1Power + pv2Power + pv3Power + pv4Power,
    pv1Power,
    pv2Power,
    pvStringCount: Object.keys(pvStringPowers).length,
    pvStringPowers,
    feedinPower: gridCtData.feedinPower,
    gridConsumptionPower: gridCtData.gridConsumptionPower,
    batChargePower: batteryPower.batChargePower,
    batDischargePower: batteryPower.batDischargePower,
    SoC: soc,
    ResidualEnergy: scaleUnsigned(residual, 0.01),
    batVoltage: scaleUnsigned(batVoltage, 0.1),
    batCurrent: scaleSigned(batCurrent, 0.001),
    batTemperature: scaleSigned(batTemp, 0.1),
    gridVoltage: scaleUnsigned(gridVoltage, 0.1),
    gridCurrent: 0,
    gridFrequency: scaleUnsigned(gridFrequency, 0.01),
    meterPower2: 0,
    ambientTemperature: ambTemp !== undefined ? scaleSigned(ambTemp, 0.1) : 0,
    deviceTemperature: scaleSigned(invTemp, 0.1),
    runningState,
    isOffGrid: isOffGridRunningState(runningState),
    epsPower: 0,
    epsPowerR: 0,
    epsVoltR: 0,
    epsCurrentR: 0,
    ...(workMode !== undefined ? { workModeRegister: workMode } : {}),
    ...(remoteEnable !== undefined ? { remoteEnable } : {}),
    ...(remoteActivePower !== undefined
      ? { remoteActivePowerW: toSignedInt16(remoteActivePower) }
      : {}),
    ...(remoteTimeoutCountdown !== undefined ? { remoteTimeoutCountdown } : {}),
    ...(workModeResolved !== undefined ? { workMode: workModeResolved } : {}),
    sampledAt,
  };
}

export async function readH3ModernTodayTotals(
  reader: ModbusReader,
  _context: ProfileContext,
  sampledAt: string
): Promise<TodayTotalsSnapshot> {
  try {
    const registers = H3_MODERN_TODAY_TOTAL_DEFINITIONS.flatMap((definition) => definition.registers);
    const valuesByRegister = await reader.readScatteredWords('holding', registers, false);
    const valuesMap = new Map<number, number>();
    for (const [register, value] of valuesByRegister) {
      if (value !== undefined) {
        valuesMap.set(register, value);
      }
    }
    return buildTodayTotalsSnapshot(
      H3_MODERN_TODAY_TOTAL_DEFINITIONS,
      valuesMap,
      sampledAt,
      39601
    );
  } catch (error) {
    return {
      sampledAt,
      blockStart: 39601,
      blockLength: 0,
      blockRaw: null,
      totals: [],
      readError: error instanceof Error ? error.message : String(error),
    };
  }
}
