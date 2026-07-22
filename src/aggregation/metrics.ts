import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import type { H1G2TodayTotalsSnapshot } from '../modbus/h1g2TodayTotals.js';

export const POWER_TO_KWH_FIELDS = [
  ['pvPower', 'pv_kwh'],
  ['loadsPower', 'loads_kwh'],
  ['feedinPower', 'feedin_kwh'],
  ['gridConsumptionPower', 'grid_consumption_kwh'],
  ['batChargePower', 'bat_charge_kwh'],
  ['batDischargePower', 'bat_discharge_kwh'],
] as const;

export type PowerField = (typeof POWER_TO_KWH_FIELDS)[number][0];
export type KwhField = (typeof POWER_TO_KWH_FIELDS)[number][1];

export const COUNTER_KEY_TO_KWH_FIELD: Record<string, KwhField> = {
  solarGeneration: 'pv_kwh',
  loadEnergy: 'loads_kwh',
  feedIn: 'feedin_kwh',
  gridConsumption: 'grid_consumption_kwh',
  batteryCharge: 'bat_charge_kwh',
  batteryDischarge: 'bat_discharge_kwh',
};

export type KwhMetrics = Record<KwhField, number>;

export function emptyKwhMetrics(): KwhMetrics {
  return {
    pv_kwh: 0,
    loads_kwh: 0,
    feedin_kwh: 0,
    grid_consumption_kwh: 0,
    bat_charge_kwh: 0,
    bat_discharge_kwh: 0,
  };
}

export function readPowerValues(telemetry: ModbusRealtimeTelemetry): Record<PowerField, number> {
  return {
    pvPower: telemetry.pvPower ?? 0,
    loadsPower: telemetry.loadsPower ?? 0,
    feedinPower: telemetry.feedinPower ?? 0,
    gridConsumptionPower: telemetry.gridConsumptionPower ?? 0,
    batChargePower: telemetry.batChargePower ?? 0,
    batDischargePower: telemetry.batDischargePower ?? 0,
  };
}

export function interpolatePower(
  start: Record<PowerField, number>,
  end: Record<PowerField, number>,
  ratio: number
): Record<PowerField, number> {
  const clamped = Math.min(1, Math.max(0, ratio));
  const result = {} as Record<PowerField, number>;
  for (const [key] of POWER_TO_KWH_FIELDS) {
    result[key] = start[key] + (end[key] - start[key]) * clamped;
  }
  return result;
}

export function trapezoidalEnergyKwh(
  startPower: Record<PowerField, number>,
  endPower: Record<PowerField, number>,
  deltaHours: number
): KwhMetrics {
  if (deltaHours <= 0) {
    return emptyKwhMetrics();
  }

  const metrics = emptyKwhMetrics();
  for (const [powerKey, kwhKey] of POWER_TO_KWH_FIELDS) {
    metrics[kwhKey] = ((startPower[powerKey] + endPower[powerKey]) / 2) * deltaHours;
  }
  return metrics;
}

export function counterValuesFromSnapshot(snapshot: H1G2TodayTotalsSnapshot): Record<string, number | null> {
  const values: Record<string, number | null> = {};
  for (const total of snapshot.totals) {
    values[total.key] = total.kwh;
  }
  return values;
}

export function counterDelta(start: number | null | undefined, end: number | null | undefined): number | null {
  if (start == null || end == null) {
    return null;
  }
  if (end >= start) {
    return end - start;
  }
  // Midnight rollover — counters reset; treat end as the hour delta.
  return end;
}

const RECONCILE_DRIFT_THRESHOLD = 0.02;

export function reconcileHourMetrics(
  integrated: KwhMetrics,
  counterStart: Record<string, number | null>,
  counterEnd: Record<string, number | null>
): KwhMetrics {
  const result = { ...integrated };

  for (const [counterKey, kwhField] of Object.entries(COUNTER_KEY_TO_KWH_FIELD)) {
    const counterHourDelta = counterDelta(counterStart[counterKey], counterEnd[counterKey]);
    const integratedDelta = integrated[kwhField as KwhField];

    if (counterHourDelta == null || counterHourDelta <= 0 || integratedDelta <= 0) {
      continue;
    }

    const drift = Math.abs(integratedDelta - counterHourDelta) / counterHourDelta;
    if (drift > RECONCILE_DRIFT_THRESHOLD) {
      const scale = counterHourDelta / integratedDelta;
      result[kwhField as KwhField] = integratedDelta * scale;
    }
  }

  return result;
}
