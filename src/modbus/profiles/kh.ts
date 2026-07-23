import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import { resolveH1G2WorkMode, toSignedInt16 } from '@checkmysolar/modbus-telemetry/workMode';
import type { ModbusReader } from '../core/reader.js';
import {
  parseBatteryPowerKw,
  parseEpsPowerKw,
  parseGridCtPowerKwFromCombined,
  scaleSigned,
  scaleSignedPowerKw,
  scaleUnsigned,
} from '../core/scaling.js';
import { isOffGridRunningState, parseG2RunningState, parseH1RunningState } from './runningState.js';
import {
  H1_G2_ENERGY_COUNTERS_START,
  H1_G2_TODAY_TOTAL_DEFINITIONS,
} from './h1g2.js';
import { readTodayTotalsFromDefinitions, type TodayTotalsSnapshot } from './todayTotals.js';
import type { ProfileContext } from './types.js';

export async function readKhRealtime(
  reader: ModbusReader,
  context: ProfileContext,
  sampledAt: string
): Promise<ModbusRealtimeTelemetry> {
  const isPre133 = context.firmwareVariant === 'khPre133';

  const block = await reader.readHolding(31006, 21);
  const [pv1Raw, pv2Raw, gridCtRaw, loadPowerRaw, residual, stateStatus1, stateStatus3, inverterState, workMode, remoteEnable, remoteActivePower, remoteTimeout] =
    await Promise.all([
      isPre133
        ? reader.readHoldingInt32([31046, 31045])
        : reader.readHoldingWord(39280),
      isPre133
        ? reader.readHoldingInt32([31048, 31047])
        : reader.readHoldingWord(39282),
      isPre133
        ? reader.readHoldingInt32([31050, 31049])
        : reader.readHoldingInt32([39169, 39168]),
      isPre133
        ? reader.readHoldingInt32([31054, 31053])
        : reader.readHoldingWord(31016),
      reader.readHoldingWordOptional(37632),
      reader.readHoldingWordOptional(39063),
      reader.readHoldingWordOptional(39065),
      reader.readHoldingWordOptional(31027),
      reader.readHoldingWordOptional(41000),
      reader.readHoldingWordOptional(44000),
      reader.readHoldingWordOptional(44002),
      reader.readInputWordOptional(44004),
    ]);

  const gridCtScale = -0.001;
  const gridCt = parseGridCtPowerKwFromCombined(gridCtRaw, gridCtScale);
  const pv1Power = Math.max(0, isPre133 ? pv1Raw * 0.001 : scaleSignedPowerKw(pv1Raw));
  const pv2Power = Math.max(0, isPre133 ? pv2Raw * 0.001 : scaleSignedPowerKw(pv2Raw));
  const loadsPower = isPre133 ? loadPowerRaw * 0.001 : scaleSignedPowerKw(loadPowerRaw);
  const batteryPower = parseBatteryPowerKw(block[16]!);
  const epsPower = parseEpsPowerKw(block[6]!);

  const runningState =
    stateStatus1 !== undefined && stateStatus3 !== undefined
      ? parseG2RunningState(stateStatus1, stateStatus3)
      : inverterState !== undefined
        ? parseH1RunningState(inverterState)
        : undefined;

  const workModeResolved = resolveH1G2WorkMode({
    workModeRegister: workMode,
    remoteEnable,
    remoteActivePowerRaw: remoteActivePower,
    remoteTimeoutCountdown: remoteTimeout,
  });

  return {
    loadsPower,
    pvPower: pv1Power + pv2Power,
    pv1Power,
    pv2Power,
    pvStringCount: 2,
    pvStringPowers: { pv1Power, pv2Power },
    feedinPower: gridCt.feedinPower,
    gridConsumptionPower: gridCt.gridConsumptionPower,
    batChargePower: batteryPower.batChargePower,
    batDischargePower: batteryPower.batDischargePower,
    SoC: block[18]!,
    ResidualEnergy: residual !== undefined ? scaleUnsigned(residual, 0.01) : 0,
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

export async function readKhTodayTotals(
  reader: ModbusReader,
  _context: ProfileContext,
  sampledAt: string
): Promise<TodayTotalsSnapshot> {
  return readTodayTotalsFromDefinitions(
    async (registers) => {
      const block = await reader.readHolding(H1_G2_ENERGY_COUNTERS_START, 24);
      return registers.map((register) => block[register - H1_G2_ENERGY_COUNTERS_START]!);
    },
    H1_G2_TODAY_TOTAL_DEFINITIONS,
    H1_G2_ENERGY_COUNTERS_START,
    sampledAt
  );
}
