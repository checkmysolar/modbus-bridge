import { toSignedInt16 } from '@checkmysolar/modbus-telemetry/workMode';

export { toSignedInt16 };

export function scaleSignedPowerKw(raw: number): number {
  return toSignedInt16(raw) * 0.001;
}

export function scaleUnsigned(raw: number, scale: number): number {
  return raw * scale;
}

export function scaleSigned(raw: number, scale: number): number {
  return toSignedInt16(raw) * scale;
}

/** Combine Modbus registers (low address first) into a signed or unsigned int32. */
export function combineRegisters(values: number[], signed: boolean): number {
  let value = 0;
  for (let i = 0; i < values.length; i++) {
    value += (values[i]! & 0xffff) * 2 ** (16 * i);
  }
  if (!signed) {
    return value;
  }
  const bits = values.length * 16;
  const signBit = 2 ** (bits - 1);
  return value >= signBit ? value - 2 ** bits : value;
}

export function parseGridCtPowerKw(raw: number, scale = 0.001): { feedinPower: number; gridConsumptionPower: number } {
  const kw = toSignedInt16(raw) * scale;
  return {
    feedinPower: kw > 0 ? kw : 0,
    gridConsumptionPower: kw < 0 ? Math.abs(kw) : 0,
  };
}

export function parseGridCtPowerKwFromCombined(raw: number, scale: number): {
  feedinPower: number;
  gridConsumptionPower: number;
} {
  const kw = raw * scale;
  return {
    feedinPower: kw > 0 ? kw : 0,
    gridConsumptionPower: kw < 0 ? Math.abs(kw) : 0,
  };
}

export function parseBatteryPowerKw(raw: number, scale = 0.001): { batChargePower: number; batDischargePower: number } {
  const kw = toSignedInt16(raw) * scale;
  return {
    batChargePower: kw < 0 ? Math.abs(kw) : 0,
    batDischargePower: kw > 0 ? kw : 0,
  };
}

export function parseBatteryPowerKwFromCombined(raw: number, scale: number): {
  batChargePower: number;
  batDischargePower: number;
} {
  const kw = raw * scale;
  return {
    batChargePower: kw < 0 ? Math.abs(kw) : 0,
    batDischargePower: kw > 0 ? kw : 0,
  };
}

export function parseEpsPowerKw(raw: number, scale = 0.001): number {
  const kw = toSignedInt16(raw) * scale;
  return kw > 0 ? kw : 0;
}
