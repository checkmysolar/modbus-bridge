import { toSignedInt16 } from '@checkmysolar/modbus-telemetry/workMode';

/** foxess_modbus holding registers for H1 G2 daily energy counters (scale 0.1 kWh). */
export const H1_G2_ENERGY_COUNTERS_START = 32000;
export const H1_G2_ENERGY_COUNTERS_LENGTH = 24;
export const H1_G2_TODAY_TOTALS_SCALE = 0.1;

export interface H1G2TodayTotalDefinition {
  key: string;
  label: string;
  register: number;
  signed?: boolean;
}

/** Daily energy counters on H1 G2 (foxess_modbus entity_descriptions, Inv.H1_G2_SET). */
export const H1_G2_TODAY_TOTAL_DEFINITIONS: readonly H1G2TodayTotalDefinition[] = [
  { key: 'solarGeneration', label: 'Solar generation', register: 32002 },
  { key: 'batteryCharge', label: 'Battery charge', register: 32005 },
  { key: 'batteryDischarge', label: 'Battery discharge', register: 32008 },
  { key: 'feedIn', label: 'Feed-in (export)', register: 32011 },
  { key: 'gridConsumption', label: 'Grid consumption (import)', register: 32014 },
  { key: 'totalYield', label: 'Total yield', register: 32017, signed: true },
  { key: 'inputEnergy', label: 'Input energy', register: 32020, signed: true },
  { key: 'loadEnergy', label: 'Load energy', register: 32023, signed: true },
] as const;

export interface H1G2TodayTotalReading {
  key: string;
  label: string;
  register: number;
  raw: number | null;
  kwh: number | null;
}

export interface H1G2TodayTotalsSnapshot {
  sampledAt: string;
  blockStart: number;
  blockLength: number;
  blockRaw: number[] | null;
  totals: H1G2TodayTotalReading[];
  readError?: string;
}

export function decodeTodayTotalRaw(raw: number, signed = false): number {
  const value = signed ? toSignedInt16(raw) : raw & 0xffff;
  return value * H1_G2_TODAY_TOTALS_SCALE;
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

function kwhForKey(snapshot: H1G2TodayTotalsSnapshot, key: string): number | null {
  const reading = snapshot.totals.find((total) => total.key === key);
  return reading?.kwh ?? null;
}

/** Map H1 G2 daily counter snapshot to Fox-shaped totals; null when read failed or incomplete. */
export function mapH1G2TodayTotalsSnapshotToFoxShape(
  snapshot: H1G2TodayTotalsSnapshot
): FoxShapedTodayTotals | null {
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

export function parseH1G2TodayTotalsFromBlock(
  block: number[],
  blockStart: number = H1_G2_ENERGY_COUNTERS_START,
  sampledAt: string = new Date().toISOString()
): H1G2TodayTotalsSnapshot {
  const totals = H1_G2_TODAY_TOTAL_DEFINITIONS.map((definition) => {
    const offset = definition.register - blockStart;
    const raw = offset >= 0 && offset < block.length ? block[offset]! : null;
    return {
      key: definition.key,
      label: definition.label,
      register: definition.register,
      raw,
      kwh: raw === null ? null : decodeTodayTotalRaw(raw, definition.signed),
    };
  });

  return {
    sampledAt,
    blockStart,
    blockLength: block.length,
    blockRaw: block,
    totals,
  };
}
