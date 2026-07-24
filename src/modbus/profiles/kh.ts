import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import { resolveH1G2WorkMode, toSignedInt16 } from '@checkmysolar/modbus-telemetry/workMode';
import type { ModbusReader } from '../core/reader.js';
import {
  combineRegisters,
  parseBatteryPowerKw,
  parseEpsPowerKw,
  parseGridCtPowerKwFromCombined,
  scaleSigned,
  scaleSignedPowerKw,
  scaleUnsigned,
} from '../core/scaling.js';
import { isOffGridRunningState, parseG2RunningState, parseH1RunningState } from './runningState.js';
import { readH1G2TodayTotals } from './h1g2.js';
import type { TodayTotalsSnapshot } from './todayTotals.js';
import type { ProfileContext } from './types.js';

export async function readKhRealtime(
  reader: ModbusReader,
  context: ProfileContext,
  sampledAt: string
): Promise<ModbusRealtimeTelemetry> {
  const isPre133 = context.firmwareVariant === 'khPre133';

  const block = await reader.readHolding(31006, 21);
  let pv1Raw: number;
  let pv2Raw: number;
  let gridCtRaw: number;
  let loadPowerRaw: number;
  if (isPre133) {
    const pairs = await reader.readScatteredWords(
      'holding',
      [31045, 31046, 31047, 31048, 31049, 31050, 31053, 31054],
      false
    );
    pv1Raw = combineRegisters([pairs.get(31046)!, pairs.get(31045)!], true);
    pv2Raw = combineRegisters([pairs.get(31048)!, pairs.get(31047)!], true);
    gridCtRaw = combineRegisters([pairs.get(31050)!, pairs.get(31049)!], true);
    loadPowerRaw = combineRegisters([pairs.get(31054)!, pairs.get(31053)!], true);
  } else {
    const scattered = await reader.readScatteredWords('holding', [39280, 39282, 31016], false);
    pv1Raw = scattered.get(39280)!;
    pv2Raw = scattered.get(39282)!;
    gridCtRaw = await reader.readHoldingInt32([39169, 39168]);
    loadPowerRaw = scattered.get(31016)!;
  }
  const optionalHolding = await reader.readScatteredWords(
    'holding',
    [37632, 39063, 39065, 31027, 41000, 44000, 44002],
    true
  );
  const remoteTimeout = (await reader.readScatteredWords('input', [44004], true)).get(44004);
  const residual = optionalHolding.get(37632);
  const stateStatus1 = optionalHolding.get(39063);
  const stateStatus3 = optionalHolding.get(39065);
  const inverterState = optionalHolding.get(31027);
  const workMode = optionalHolding.get(41000);
  const remoteEnable = optionalHolding.get(44000);
  const remoteActivePower = optionalHolding.get(44002);

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
  context: ProfileContext,
  sampledAt: string
): Promise<TodayTotalsSnapshot> {
  return readH1G2TodayTotals(reader, context, sampledAt);
}
