import { toSignedInt16 } from '@checkmysolar/modbus-telemetry/workMode';
import {
  H1_G2_ENERGY_COUNTERS_START,
  H1_G2_TODAY_TOTAL_DEFINITIONS,
  H1_G2_TODAY_TOTALS_SCALE,
} from './profiles/h1g2.js';
import {
  buildTodayTotalsSnapshot,
  decodeTodayTotalRaw,
  mapTodayTotalsSnapshotToFoxShape,
  type FoxShapedTodayTotals,
  type TodayTotalDefinition,
  type TodayTotalReading,
  type TodayTotalsSnapshot,
} from './profiles/todayTotals.js';

export {
  H1_G2_ENERGY_COUNTERS_START,
  H1_G2_TODAY_TOTALS_SCALE,
  H1_G2_TODAY_TOTAL_DEFINITIONS,
  decodeTodayTotalRaw,
};

export type H1G2TodayTotalDefinition = TodayTotalDefinition;
export type H1G2TodayTotalReading = TodayTotalReading;
export type H1G2TodayTotalsSnapshot = TodayTotalsSnapshot;
export type { FoxShapedTodayTotals };

export const H1_G2_ENERGY_COUNTERS_LENGTH = 24;

export const mapH1G2TodayTotalsSnapshotToFoxShape = mapTodayTotalsSnapshotToFoxShape;

export function parseH1G2TodayTotalsFromBlock(
  block: number[],
  blockStart: number = H1_G2_ENERGY_COUNTERS_START,
  sampledAt: string = new Date().toISOString()
): H1G2TodayTotalsSnapshot {
  const valuesByRegister = new Map<number, number>();
  for (const definition of H1_G2_TODAY_TOTAL_DEFINITIONS) {
    const offset = definition.registers[0]! - blockStart;
    if (offset >= 0 && offset < block.length) {
      valuesByRegister.set(definition.registers[0]!, block[offset]!);
    }
  }
  return buildTodayTotalsSnapshot(H1_G2_TODAY_TOTAL_DEFINITIONS, valuesByRegister, sampledAt, blockStart);
}

// Backward-compat alias used in tests
export function decodeTodayTotalRawLegacy(raw: number, signed = false): number {
  const value = signed ? toSignedInt16(raw) : raw & 0xffff;
  return value * H1_G2_TODAY_TOTALS_SCALE;
}
