/** Fox-shaped report types served by GET /v1/report (matches backend/src/types.ts). */
export interface HistoricalDataPoint {
  time: string;
  power: number;
  pvPower: number;
  feedinPower: number;
  loadsPower: number;
  SoC: number;
  batChargePower: number;
  batDischargePower: number;
  gridConsumptionPower: number;
  meterPower2?: number;
}

export interface TotalsData {
  generation: number;
  feedin: number;
  gridConsumption: number;
  chargeEnergyToTal: number;
  dischargeEnergyToTal: number;
  loadConsumption: number;
}

export type ReportDimension = 'day' | 'week' | 'month' | 'year';

export interface DayHourlyRow {
  localDate: string;
  hour: number;
  pvKwh: number;
  loadsKwh: number;
  feedinKwh: number;
  gridConsumptionKwh: number;
  batChargeKwh: number;
  batDischargeKwh: number;
  socAvg: number;
  sampleCount: number;
  finalized: boolean;
  updatedAt: string;
}

export interface DayDailyRow {
  localDate: string;
  pvKwh: number;
  loadsKwh: number;
  feedinKwh: number;
  gridConsumptionKwh: number;
  batChargeKwh: number;
  batDischargeKwh: number;
  updatedAt: string;
}

export interface ModbusReportResponse {
  historicalData: HistoricalDataPoint[];
  todayTotals?: TotalsData;
  totals?: TotalsData;
  sampledAt?: string;
}

export interface ReportStatusResponse {
  timezone: string;
  earliestDate: string | null;
  latestDate: string | null;
  todaySampleCount: number;
  lastPollAt: string | null;
}
