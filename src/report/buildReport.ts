import type { DayDailyRow, DayHourlyRow, HistoricalDataPoint, TotalsData } from './types.js';

/** Include only closed hour buckets that were actually sampled (omit pre-bridge gaps). */
export function isReportableHourRow(row: DayHourlyRow): boolean {
  return row.finalized && row.sampleCount > 0;
}

export function getReportableHoursForDay(rows: DayHourlyRow[]): DayHourlyRow[] {
  return rows.filter(isReportableHourRow).sort((left, right) => left.hour - right.hour);
}

export function hourlyRowToDataPoint(row: DayHourlyRow): HistoricalDataPoint {
  return {
    time: `${String(row.hour).padStart(2, '0')}:00`,
    power: row.pvKwh,
    pvPower: row.pvKwh,
    feedinPower: row.feedinKwh,
    loadsPower: row.loadsKwh,
    SoC: row.socAvg,
    batChargePower: row.batChargeKwh,
    batDischargePower: row.batDischargeKwh,
    gridConsumptionPower: row.gridConsumptionKwh,
  };
}

export function dailyRowToDataPoint(row: DayDailyRow, timeLabel: string): HistoricalDataPoint {
  return {
    time: timeLabel,
    power: row.pvKwh,
    pvPower: row.pvKwh,
    feedinPower: row.feedinKwh,
    loadsPower: row.loadsKwh,
    SoC: 0,
    batChargePower: row.batChargeKwh,
    batDischargePower: row.batDischargeKwh,
    gridConsumptionPower: row.gridConsumptionKwh,
  };
}

export function sumHourlyRowsToTotals(rows: DayHourlyRow[]): TotalsData {
  return rows.reduce(
    (acc, row) => {
      acc.generation += row.pvKwh;
      acc.feedin += row.feedinKwh;
      acc.gridConsumption += row.gridConsumptionKwh;
      acc.loadConsumption += row.loadsKwh;
      acc.chargeEnergyToTal += row.batChargeKwh;
      acc.dischargeEnergyToTal += row.batDischargeKwh;
      return acc;
    },
    {
      generation: 0,
      feedin: 0,
      gridConsumption: 0,
      loadConsumption: 0,
      chargeEnergyToTal: 0,
      dischargeEnergyToTal: 0,
    } satisfies TotalsData
  );
}

export function sumDailyRowsToTotals(rows: DayDailyRow[]): TotalsData {
  return rows.reduce(
    (acc, row) => {
      acc.generation += row.pvKwh;
      acc.feedin += row.feedinKwh;
      acc.gridConsumption += row.gridConsumptionKwh;
      acc.loadConsumption += row.loadsKwh;
      acc.chargeEnergyToTal += row.batChargeKwh;
      acc.dischargeEnergyToTal += row.batDischargeKwh;
      return acc;
    },
    {
      generation: 0,
      feedin: 0,
      gridConsumption: 0,
      loadConsumption: 0,
      chargeEnergyToTal: 0,
      dischargeEnergyToTal: 0,
    } satisfies TotalsData
  );
}

export function sumDailyRowsToMonthlyPoint(
  month: number,
  year: number,
  rows: DayDailyRow[]
): HistoricalDataPoint {
  const totals = sumDailyRowsToTotals(rows);
  const monthDate = new Date(year, month - 1, 1);
  const timeLabel = monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  return {
    time: timeLabel,
    power: totals.generation,
    pvPower: totals.generation,
    feedinPower: totals.feedin,
    loadsPower: totals.loadConsumption,
    SoC: 0,
    batChargePower: totals.chargeEnergyToTal,
    batDischargePower: totals.dischargeEnergyToTal,
    gridConsumptionPower: totals.gridConsumption,
  };
}
