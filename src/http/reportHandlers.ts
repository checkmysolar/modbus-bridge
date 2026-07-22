import type { HourlyAggregator } from '../aggregation/hourlyAggregator.js';
import {
  formatWeekDateLabel,
  getLocalDate,
  getMonthRange,
  getWeekRange,
} from '../aggregation/timezone.js';
import {
  dailyRowToDataPoint,
  getReportableHoursForDay,
  hourlyRowToDataPoint,
  sumDailyRowsToMonthlyPoint,
  sumDailyRowsToTotals,
  sumHourlyRowsToTotals,
} from '../report/buildReport.js';
import type {
  HistoricalDataPoint,
  ModbusReportResponse,
  ReportDimension,
  ReportStatusResponse,
} from '../report/types.js';

function buildDayReport(
  aggregator: HourlyAggregator,
  localDate: string,
  sampledAt: string | null
): ModbusReportResponse {
  const reportableRows = getReportableHoursForDay(aggregator.getHoursForDay(localDate));
  if (reportableRows.length === 0) {
    return {
      historicalData: [],
      todayTotals: {
        generation: 0,
        feedin: 0,
        gridConsumption: 0,
        loadConsumption: 0,
        chargeEnergyToTal: 0,
        dischargeEnergyToTal: 0,
      },
      totals: {
        generation: 0,
        feedin: 0,
        gridConsumption: 0,
        loadConsumption: 0,
        chargeEnergyToTal: 0,
        dischargeEnergyToTal: 0,
      },
      sampledAt: sampledAt ?? undefined,
    };
  }

  const historicalData = reportableRows.map(hourlyRowToDataPoint);
  const totals = sumHourlyRowsToTotals(reportableRows);
  return {
    historicalData,
    todayTotals: totals,
    totals,
    sampledAt: sampledAt ?? undefined,
  };
}

function buildWeekReport(
  aggregator: HourlyAggregator,
  anchorDate: string,
  timezone: string,
  sampledAt: string | null
): ModbusReportResponse {
  const { startDate, endDate } = getWeekRange(anchorDate, timezone);
  const dailyRows = aggregator.getDailyRowsForRange(startDate, endDate);
  const historicalData = dailyRows.map((row) =>
    dailyRowToDataPoint(row, formatWeekDateLabel(row.localDate, timezone))
  );

  const totals = sumDailyRowsToTotals(dailyRows);
  return { historicalData, totals, sampledAt: sampledAt ?? undefined };
}

function buildMonthReport(
  aggregator: HourlyAggregator,
  anchorDate: string,
  timezone: string,
  sampledAt: string | null
): ModbusReportResponse {
  const { startDate, endDate } = getMonthRange(anchorDate, timezone);
  const dailyRows = aggregator.getDailyRowsForRange(startDate, endDate);
  const historicalData = dailyRows.map((row) =>
    dailyRowToDataPoint(row, formatWeekDateLabel(row.localDate, timezone))
  );

  const totals = sumDailyRowsToTotals(dailyRows);
  return { historicalData, totals, sampledAt: sampledAt ?? undefined };
}

function buildYearReport(
  aggregator: HourlyAggregator,
  year: number,
  sampledAt: string | null
): ModbusReportResponse {
  const dailyRows = aggregator.getMonthlyRowsForYear(year);
  const byMonth = new Map<number, typeof dailyRows>();
  for (const row of dailyRows) {
    const month = Number.parseInt(row.localDate.slice(5, 7), 10);
    const list = byMonth.get(month) ?? [];
    list.push(row);
    byMonth.set(month, list);
  }

  const historicalData: HistoricalDataPoint[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const monthRows = byMonth.get(month) ?? [];
    if (monthRows.length === 0) {
      continue;
    }
    historicalData.push(sumDailyRowsToMonthlyPoint(month, year, monthRows));
  }

  const totals = sumDailyRowsToTotals(dailyRows);
  return { historicalData, totals, sampledAt: sampledAt ?? undefined };
}

export function buildReportResponse(
  aggregator: HourlyAggregator,
  timezone: string,
  dimension: ReportDimension,
  params: { date?: string; year?: number }
): ModbusReportResponse {
  const sampledAt = aggregator.getLastPollAt();
  const todayLocalDate = sampledAt ? getLocalDate(sampledAt, timezone) : getLocalDate(new Date().toISOString(), timezone);

  switch (dimension) {
    case 'day': {
      const localDate = params.date ?? todayLocalDate;
      return buildDayReport(aggregator, localDate, sampledAt);
    }
    case 'week': {
      const anchorDate = params.date ?? todayLocalDate;
      return buildWeekReport(aggregator, anchorDate, timezone, sampledAt);
    }
    case 'month': {
      const anchorDate = params.date ?? todayLocalDate;
      return buildMonthReport(aggregator, anchorDate, timezone, sampledAt);
    }
    case 'year': {
      const year = params.year ?? Number.parseInt(todayLocalDate.slice(0, 4), 10);
      return buildYearReport(aggregator, year, sampledAt);
    }
    default:
      throw new Error(`Unsupported report dimension: ${dimension satisfies never}`);
  }
}

export function buildReportStatusResponse(
  aggregator: HourlyAggregator,
  timezone: string
): ReportStatusResponse {
  const sampledAt = aggregator.getLastPollAt();
  const todayLocalDate = sampledAt
    ? getLocalDate(sampledAt, timezone)
    : getLocalDate(new Date().toISOString(), timezone);
  return aggregator.getReportStatus(todayLocalDate);
}

export function parseReportDimension(value: string | null): ReportDimension | null {
  if (value === 'day' || value === 'week' || value === 'month' || value === 'year') {
    return value;
  }
  return null;
}

export function parseReportDate(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return undefined;
}

export function parseReportYear(value: string | null): number | undefined {
  if (!value || !/^\d{4}$/.test(value)) {
    return undefined;
  }
  const year = Number.parseInt(value, 10);
  return Number.isFinite(year) ? year : undefined;
}
