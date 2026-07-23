import { toSignedInt16 } from '@checkmysolar/modbus-telemetry/workMode';

export interface TodayTotalDefinition {
  key: string;
  label: string;
  /** Single register or low/high pair (low address first). */
  registers: number[];
  signed?: boolean;
  scale: number;
  isPair?: boolean;
}

export interface TodayTotalReading {
  key: string;
  label: string;
  register: number;
  raw: number | null;
  kwh: number | null;
}

export interface TodayTotalsSnapshot {
  sampledAt: string;
  blockStart: number;
  blockLength: number;
  blockRaw: number[] | null;
  totals: TodayTotalReading[];
  readError?: string;
}

/** Fox Cloud-shaped daily totals (kWh) for Check My Solar API compatibility. */
export interface FoxShapedTodayTotals {
  generation: number;
  feedin: number;
  gridConsumption: number;
  chargeEnergyToTal: number;
  dischargeEnergyToTal: number;
  loadConsumption: number;
}

export function decodeTodayTotalRaw(raw: number, scaleOrSigned: number | boolean = 0.1, signed = false): number {
  const scale = typeof scaleOrSigned === 'boolean' ? 0.1 : scaleOrSigned;
  const isSigned = typeof scaleOrSigned === 'boolean' ? scaleOrSigned : signed;
  const value = isSigned ? toSignedInt16(raw) : raw & 0xffff;
  return value * scale;
}

export function decodeTodayTotalPair(values: number[], scale: number, signed = false): number {
  let combined = 0;
  for (let i = 0; i < values.length; i++) {
    combined |= (values[i]! & 0xffff) << (i * 16);
  }
  if (signed) {
    const bits = values.length * 16;
    const modulus = 2 ** bits;
    const signBit = 2 ** (bits - 1);
    combined = (combined & signBit) !== 0 ? combined - modulus : combined;
  }
  return combined * scale;
}

function kwhForKey(snapshot: TodayTotalsSnapshot, key: string): number | null {
  const reading = snapshot.totals.find((total) => total.key === key);
  return reading?.kwh ?? null;
}

export function mapTodayTotalsSnapshotToFoxShape(snapshot: TodayTotalsSnapshot): FoxShapedTodayTotals | null {
  if (snapshot.readError) {
    return null;
  }

  const generation = kwhForKey(snapshot, 'solarGeneration');
  const feedin = kwhForKey(snapshot, 'feedIn');
  const gridConsumption = kwhForKey(snapshot, 'gridConsumption');
  const chargeEnergyToTal = kwhForKey(snapshot, 'batteryCharge');
  const dischargeEnergyToTal = kwhForKey(snapshot, 'batteryDischarge');
  const loadConsumption = kwhForKey(snapshot, 'loadEnergy');

  if (
    generation === null ||
    feedin === null ||
    gridConsumption === null ||
    chargeEnergyToTal === null ||
    dischargeEnergyToTal === null ||
    loadConsumption === null
  ) {
    return null;
  }

  return {
    generation,
    feedin,
    gridConsumption,
    chargeEnergyToTal,
    dischargeEnergyToTal,
    loadConsumption,
  };
}

export function buildTodayTotalsSnapshot(
  definitions: readonly TodayTotalDefinition[],
  valuesByRegister: Map<number, number>,
  sampledAt: string,
  blockStart: number
): TodayTotalsSnapshot {
  const totals = definitions.map((definition) => {
    const rawValues = definition.registers.map((register) => valuesByRegister.get(register) ?? null);
    const hasAll = rawValues.every((value) => value !== null);
    const raw = rawValues[0];
    const kwh =
      !hasAll || raw === null
        ? null
        : definition.isPair
          ? decodeTodayTotalPair(rawValues as number[], definition.scale, definition.signed)
          : decodeTodayTotalRaw(raw, definition.scale, definition.signed);

    return {
      key: definition.key,
      label: definition.label,
      register: definition.registers[0]!,
      raw,
      kwh,
    };
  });

  return {
    sampledAt,
    blockStart,
    blockLength: valuesByRegister.size,
    blockRaw: [...valuesByRegister.values()],
    totals,
  };
}

export async function readTodayTotalsFromDefinitions(
  readPair: (registers: number[]) => Promise<number[]>,
  definitions: readonly TodayTotalDefinition[],
  blockStart: number,
  sampledAt: string
): Promise<TodayTotalsSnapshot> {
  try {
    const valuesByRegister = new Map<number, number>();
    for (const definition of definitions) {
      const values = await readPair(definition.registers);
      definition.registers.forEach((register, index) => {
        valuesByRegister.set(register, values[index]!);
      });
    }
    return buildTodayTotalsSnapshot(definitions, valuesByRegister, sampledAt, blockStart);
  } catch (error) {
    return {
      sampledAt,
      blockStart,
      blockLength: 0,
      blockRaw: null,
      totals: [],
      readError: error instanceof Error ? error.message : String(error),
    };
  }
}
