import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import { resolveH1G2WorkMode, toSignedInt16 } from '@checkmysolar/modbus-telemetry/workMode';

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

/** Fox runningState codes (docs/fox-api.md). */
export const RUNNING_STATE_ON_GRID = 163;
export const RUNNING_STATE_OFF_GRID = 164;
export const RUNNING_STATE_FAULT = 165;
export const RUNNING_STATE_STANDBY = 167;

export function scaleSignedPowerKw(raw: number): number {
  return toSignedInt16(raw) * 0.001;
}

export function scaleUnsigned(raw: number, scale: number): number {
  return raw * scale;
}

export function scaleSigned(raw: number, scale: number): number {
  return toSignedInt16(raw) * scale;
}

export function parseGridCtPowerKw(raw: number): { feedinPower: number; gridConsumptionPower: number } {
  const kw = scaleSignedPowerKw(raw);
  return {
    feedinPower: kw > 0 ? kw : 0,
    gridConsumptionPower: kw < 0 ? Math.abs(kw) : 0,
  };
}

export function parseBatteryPowerKw(raw: number): { batChargePower: number; batDischargePower: number } {
  const kw = scaleSignedPowerKw(raw);
  return {
    batChargePower: kw < 0 ? Math.abs(kw) : 0,
    batDischargePower: kw > 0 ? kw : 0,
  };
}

export function parseEpsPowerKw(raw: number): number {
  const kw = scaleSignedPowerKw(raw);
  return kw > 0 ? kw : 0;
}

/** Map G2 status registers to Fox Cloud runningState (foxess_modbus G2 inverter state). */
export function parseG2RunningState(status1: number, status3: number): number | undefined {
  if ((status1 & 0x40) > 0) return RUNNING_STATE_FAULT;
  if ((status3 & 0x01) > 0) return RUNNING_STATE_OFF_GRID;
  if ((status1 & 0x04) > 0) return RUNNING_STATE_ON_GRID;
  if ((status1 & 0x01) > 0) return RUNNING_STATE_STANDBY;
  return undefined;
}

export function isOffGridRunningState(runningState?: number): boolean {
  return runningState === RUNNING_STATE_OFF_GRID;
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
  sampledAt: string;
}

/** Parse raw register values into app telemetry fields. */
export function parseH1G2RealtimeSnapshot(input: H1G2RegisterInputs): ModbusRealtimeTelemetry {
  const block = input.block;
  if (block.length < H1_G2_BLOCK_LENGTH) {
    throw new Error(`Expected ${H1_G2_BLOCK_LENGTH} registers in block starting at ${H1_G2_BLOCK_START}`);
  }

  const gridCt = parseGridCtPowerKw(block[8]);
  const batteryPower = parseBatteryPowerKw(block[16]);
  const epsPower = parseEpsPowerKw(block[6]);
  const pv1Power = Math.max(0, scaleSignedPowerKw(input.pv1PowerRaw));
  const pv2Power = Math.max(0, scaleSignedPowerKw(input.pv2PowerRaw));
  const { pvStringCount, pvStringPowers } = buildPvStringPowers(pv1Power, pv2Power);
  const runningState = parseG2RunningState(input.stateStatus1, input.stateStatus3);

  return {
    loadsPower: scaleSignedPowerKw(block[10]),
    pvPower: pv1Power + pv2Power,
    pv1Power,
    pv2Power,
    pvStringCount,
    pvStringPowers,
    feedinPower: gridCt.feedinPower,
    gridConsumptionPower: gridCt.gridConsumptionPower,
    batChargePower: batteryPower.batChargePower,
    batDischargePower: batteryPower.batDischargePower,
    SoC: block[18],
    ResidualEnergy: scaleUnsigned(input.residualEnergyRaw, 0.01),
    batVoltage: scaleUnsigned(block[14], 0.1),
    batCurrent: scaleSigned(block[15], 0.1),
    batTemperature: scaleSigned(block[17], 0.1),
    gridVoltage: scaleUnsigned(block[0], 0.1),
    gridCurrent: scaleUnsigned(block[1], 0.1),
    gridFrequency: scaleUnsigned(block[3], 0.01),
    meterPower2: scaleSignedPowerKw(block[9]),
    ambientTemperature: scaleSigned(block[13], 0.1),
    deviceTemperature: scaleSigned(block[12], 0.1),
    runningState,
    isOffGrid: isOffGridRunningState(runningState),
    epsPower,
    epsPowerR: epsPower,
    epsVoltR: scaleUnsigned(block[4], 0.1),
    epsCurrentR: scaleUnsigned(block[5], 0.1),
    ...(() => {
      const workMode = resolveH1G2WorkMode({
        workModeRegister: input.workModeRaw,
        remoteEnable: input.remoteEnableRaw,
        remoteActivePowerRaw: input.remoteActivePowerRaw,
      });
      return {
        ...(input.workModeRaw !== undefined ? { workModeRegister: input.workModeRaw } : {}),
        ...(input.remoteEnableRaw !== undefined ? { remoteEnable: input.remoteEnableRaw } : {}),
        ...(input.remoteActivePowerRaw !== undefined
          ? { remoteActivePowerW: toSignedInt16(input.remoteActivePowerRaw) }
          : {}),
        ...(workMode !== undefined ? { workMode } : {}),
      };
    })(),
    sampledAt: input.sampledAt,
  };
}

// Backward-compat export for tests
export const H1_G2_LOAD_POWER_REGISTER = 31016;
export function parseLoadsPowerRegister(raw: number): number {
  return scaleSignedPowerKw(raw);
}
