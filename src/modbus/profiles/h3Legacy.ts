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
import { H1_G2_ENERGY_COUNTERS_START, H1_G2_TODAY_TOTAL_DEFINITIONS } from './h1g2.js';
import { readTodayTotalsFromDefinitions, type TodayTotalsSnapshot } from './todayTotals.js';
import type { ProfileContext } from './types.js';

export async function readH3LegacyRealtime(
  reader: ModbusReader,
  _context: ProfileContext,
  sampledAt: string
): Promise<ModbusRealtimeTelemetry> {
  const [
    gridVoltage,
    gridCurrentS,
    gridCurrentT,
    gridFrequency,
    invPowerR,
    invPowerS,
    invPowerT,
    loadR,
    loadS,
    loadT,
    gridCtR,
    gridCtS,
    gridCtT,
    pv1,
    pv2,
    batPower,
    soc,
    batTemp,
    invTemp,
    ambTemp,
    stateCode,
    workMode,
    remoteEnable,
    remoteActivePower,
    remoteTimeout,
    batVoltage,
    batCurrent,
    residual,
  ] = await Promise.all([
    reader.readHoldingWord(31006),
    reader.readHoldingWord(31007),
    reader.readHoldingWord(31008),
    reader.readHoldingWord(31015),
    reader.readHoldingWord(31012),
    reader.readHoldingWord(31013),
    reader.readHoldingWord(31014),
    reader.readHoldingWord(31029),
    reader.readHoldingWord(31030),
    reader.readHoldingWord(31031),
    reader.readHoldingWord(31026),
    reader.readHoldingWord(31027),
    reader.readHoldingWord(31028),
    reader.readHoldingWord(31002),
    reader.readHoldingWord(31005),
    reader.readHoldingWord(31036),
    reader.readHoldingWord(31038),
    reader.readHoldingWord(31037),
    reader.readHoldingWord(31032),
    reader.readHoldingWord(31033),
    reader.readHoldingWordOptional(31041),
    reader.readHoldingWordOptional(41000),
    reader.readHoldingWordOptional(44000),
    reader.readHoldingWordOptional(44002),
    reader.readInputWordOptional(44004),
    reader.readHoldingWord(31020),
    reader.readHoldingWord(31021),
    reader.readHoldingWordOptional(31123),
  ]);

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
