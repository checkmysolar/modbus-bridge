import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import { resolveH3ModernWorkMode } from '@checkmysolar/modbus-telemetry/workMode';
import type { ModbusReader } from '../core/reader.js';
import {
  parseBatteryPowerKwFromCombined,
  parseGridCtPowerKwFromCombined,
  scaleSigned,
  scaleUnsigned,
} from '../core/scaling.js';
import { isOffGridRunningState, parseG2RunningState } from './runningState.js';
import {
  readTodayTotalsFromDefinitions,
  type TodayTotalDefinition,
  type TodayTotalsSnapshot,
} from './todayTotals.js';
import type { ProfileContext } from './types.js';

const H3_MODERN_TODAY_SCALE = 0.01;

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
  const [
    gridVoltage,
    gridFrequency,
    pv1,
    pv2,
    pv3,
    pv4,
    loadPower,
    gridCt,
    batPower,
    batVoltage,
    batCurrent,
    soc,
    batTemp,
    invTemp,
    ambTemp,
    stateStatus1,
    stateStatus3,
    residual,
    workMode,
  ] = await Promise.all([
    reader.readHoldingWord(39123),
    reader.readHoldingWord(39139),
    reader.readHoldingInt32([39280, 39279]),
    reader.readHoldingInt32([39282, 39281]),
    reader.readHoldingInt32Optional([39284, 39283]),
    reader.readHoldingInt32Optional([39286, 39285]),
    reader.readHoldingInt32([39226, 39225]),
    reader.readHoldingInt32([38815, 38814]),
    reader.readHoldingInt32([39238, 39237]),
    reader.readHoldingWord(37609),
    reader.readHoldingInt32([39229, 39228]),
    reader.readHoldingWord(37612),
    reader.readHoldingWord(37611),
    reader.readHoldingWord(39141),
    reader.readHoldingWordOptional(39142),
    reader.readHoldingWord(39063),
    reader.readHoldingWord(39065),
    reader.readHoldingWord(37632),
    reader.readHoldingWordOptional(49203),
  ]);

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
  const workModeResolved = resolveH3ModernWorkMode({ workModeRegister: workMode });

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
    ...(workModeResolved !== undefined ? { workMode: workModeResolved } : {}),
    sampledAt,
  };
}

export async function readH3ModernTodayTotals(
  reader: ModbusReader,
  _context: ProfileContext,
  sampledAt: string
): Promise<TodayTotalsSnapshot> {
  return readTodayTotalsFromDefinitions(
    async (registers) => {
      const values: number[] = [];
      for (const register of registers) {
        values.push(await reader.readHoldingWord(register));
      }
      return values;
    },
    H3_MODERN_TODAY_TOTAL_DEFINITIONS,
    39601,
    sampledAt
  );
}
