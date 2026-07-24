import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import { resolveH1G2WorkMode, toSignedInt16 } from '@checkmysolar/modbus-telemetry/workMode';
import type { ModbusReader } from '../core/reader.js';
import {
  parseBatteryPowerKw,
  parseGridCtPowerKw,
  scaleSigned,
  scaleSignedPowerKw,
  scaleUnsigned,
} from '../core/scaling.js';
import { readH1G2TodayTotals } from './h1g2.js';
import type { TodayTotalsSnapshot } from './todayTotals.js';
import type { ProfileContext } from './types.js';

export async function readH3LegacyRealtime(
  reader: ModbusReader,
  _context: ProfileContext,
  sampledAt: string
): Promise<ModbusRealtimeTelemetry> {
  const holding = await reader.readScatteredWords(
    'holding',
    [
      31006, 31007, 31008, 31015, 31012, 31013, 31014, 31029, 31030, 31031, 31026, 31027, 31028,
      31002, 31005, 31036, 31038, 31037, 31032, 31033, 31020, 31021,
    ],
    false
  );
  const optionalHolding = await reader.readScatteredWords(
    'holding',
    [31041, 41000, 44000, 44002],
    true
  );
  const remoteTimeout = (await reader.readScatteredWords('input', [44004], true)).get(44004);
  const residual = (await reader.readScatteredWords('holding', [31123], true)).get(31123);

  const gridVoltage = holding.get(31006)!;
  const gridCurrentS = holding.get(31007)!;
  const gridCurrentT = holding.get(31008)!;
  const gridFrequency = holding.get(31015)!;
  const invPowerR = holding.get(31012)!;
  const loadR = holding.get(31029)!;
  const loadS = holding.get(31030)!;
  const loadT = holding.get(31031)!;
  const gridCtR = holding.get(31026)!;
  const gridCtS = holding.get(31027)!;
  const gridCtT = holding.get(31028)!;
  const pv1 = holding.get(31002)!;
  const pv2 = holding.get(31005)!;
  const batPower = holding.get(31036)!;
  const soc = holding.get(31038)!;
  const batTemp = holding.get(31037)!;
  const invTemp = holding.get(31032)!;
  const ambTemp = holding.get(31033)!;
  const batVoltage = holding.get(31020)!;
  const batCurrent = holding.get(31021)!;
  const stateCode = optionalHolding.get(31041);
  const workMode = optionalHolding.get(41000);
  const remoteEnable = optionalHolding.get(44000);
  const remoteActivePower = optionalHolding.get(44002);

  const gridCtTotal = parseGridCtPowerKw(gridCtR) ;
  const gridCtSData = parseGridCtPowerKw(gridCtS);
  const gridCtTData = parseGridCtPowerKw(gridCtT);
  const feedinPower = gridCtTotal.feedinPower + gridCtSData.feedinPower + gridCtTData.feedinPower;
  const gridConsumptionPower =
    gridCtTotal.gridConsumptionPower +
    gridCtSData.gridConsumptionPower +
    gridCtTData.gridConsumptionPower;

  const pv1Power = Math.max(0, scaleSignedPowerKw(pv1));
  const pv2Power = Math.max(0, scaleSignedPowerKw(pv2));
  const loadsPower =
    scaleSignedPowerKw(loadR) + scaleSignedPowerKw(loadS) + scaleSignedPowerKw(loadT);
  const batteryPower = parseBatteryPowerKw(batPower);
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
    feedinPower,
    gridConsumptionPower,
    batChargePower: batteryPower.batChargePower,
    batDischargePower: batteryPower.batDischargePower,
    SoC: soc,
    ResidualEnergy: residual !== undefined ? scaleUnsigned(residual, 0.01) : 0,
    batVoltage: scaleUnsigned(batVoltage, 0.1),
    batCurrent: scaleSigned(batCurrent, 0.1),
    batTemperature: scaleSigned(batTemp, 0.1),
    gridVoltage: scaleUnsigned(gridVoltage, 0.1),
    gridCurrent: scaleUnsigned(gridCurrentS, 0.1),
    gridFrequency: scaleUnsigned(gridFrequency, 0.01),
    meterPower2: scaleSignedPowerKw(invPowerR),
    ambientTemperature: scaleSigned(ambTemp, 0.1),
    deviceTemperature: scaleSigned(invTemp, 0.1),
    runningState: stateCode,
    isOffGrid: false,
    epsPower: 0,
    epsPowerR: 0,
    epsVoltR: 0,
    epsCurrentR: 0,
    ...(workMode !== undefined ? { workModeRegister: workMode } : {}),
    ...(remoteEnable !== undefined ? { remoteEnable } : {}),
    ...(remoteActivePower !== undefined ? { remoteActivePowerW: toSignedInt16(remoteActivePower) } : {}),
    ...(remoteTimeout !== undefined ? { remoteTimeoutCountdown: remoteTimeout } : {}),
    ...(workModeResolved !== undefined ? { workMode: workModeResolved } : {}),
    sampledAt,
  };
}

export async function readH3LegacyTodayTotals(
  reader: ModbusReader,
  context: ProfileContext,
  sampledAt: string
): Promise<TodayTotalsSnapshot> {
  return readH1G2TodayTotals(reader, context, sampledAt);
}
