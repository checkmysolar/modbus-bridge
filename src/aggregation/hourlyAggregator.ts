import { DateTime } from 'luxon';
import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import type { H1G2TodayTotalsSnapshot } from '../modbus/h1g2TodayTotals.js';
import type { RealtimeStore } from '../storage/sqlite.js';
import {
  counterValuesFromSnapshot,
  interpolatePower,
  readPowerValues,
  reconcileHourMetrics,
  trapezoidalEnergyKwh,
} from './metrics.js';
import {
  getLocalHourBucket,
  getNextHourStart,
} from './timezone.js';

const SAMPLE_RETENTION_DAYS = 14;

export interface AggregatorSample {
  telemetry: ModbusRealtimeTelemetry;
  sampledAt: string;
}

export class HourlyAggregator {
  private lastSample: AggregatorSample | null = null;
  private lastPollAt: string | null = null;

  constructor(
    private readonly store: RealtimeStore,
    private readonly timezone: string
  ) {}

  getLastPollAt(): string | null {
    return this.lastPollAt;
  }

  recordSample(
    telemetry: ModbusRealtimeTelemetry,
    todayCounters: H1G2TodayTotalsSnapshot,
    sampledAt: string
  ): void {
    this.lastPollAt = sampledAt;
    const counters = counterValuesFromSnapshot(todayCounters);

    if (this.lastSample) {
      this.integrateSamples(this.lastSample, { telemetry, sampledAt }, counters);
    } else {
      const bucket = getLocalHourBucket(sampledAt, this.timezone);
      this.store.ensureOpenHour(bucket.localDate, bucket.hour, counters);
      this.store.addSocSample(bucket.localDate, bucket.hour, telemetry.SoC ?? 0);
      this.store.incrementHourSampleCount(bucket.localDate, bucket.hour);
    }

    this.store.insertSample(sampledAt, telemetry);
    this.store.pruneSamplesOlderThan(
      DateTime.now().minus({ days: SAMPLE_RETENTION_DAYS }).toUTC().toISO()!
    );

    const bucket = getLocalHourBucket(sampledAt, this.timezone);
    this.store.upsertDailyRollup(bucket.localDate);

    this.lastSample = { telemetry, sampledAt };
  }

  finalizeHour(localDate: string, hour: number, endCounters: Record<string, number | null>): void {
    const row = this.store.getHourRow(localDate, hour);
    if (!row || row.finalized) {
      return;
    }

    const integrated = this.store.getHourMetrics(localDate, hour);
    const reconciled = reconcileHourMetrics(integrated, row.counterStart, endCounters);
    this.store.setHourMetrics(localDate, hour, reconciled);
    this.store.markHourFinalized(localDate, hour);
    this.store.upsertDailyRollup(localDate);
  }

  getHoursForDay(localDate: string): ReturnType<RealtimeStore['getHoursForDay']> {
    return this.store.getHoursForDay(localDate);
  }

  getDailyRowsForRange(startDate: string, endDate: string): ReturnType<RealtimeStore['getDailyRowsForRange']> {
    return this.store.getDailyRowsForRange(startDate, endDate);
  }

  getMonthlyRowsForYear(year: number): ReturnType<RealtimeStore['getDailyRowsForYear']> {
    return this.store.getDailyRowsForYear(year);
  }

  getReportStatus(todayLocalDate: string) {
    return {
      timezone: this.timezone,
      earliestDate: this.store.getEarliestDate(),
      latestDate: this.store.getLatestDate(),
      todaySampleCount: this.store.getTodaySampleCount(todayLocalDate),
      lastPollAt: this.lastPollAt,
    };
  }

  private integrateSamples(
    previous: AggregatorSample,
    current: AggregatorSample,
    endCounters: Record<string, number | null>
  ): void {
    const startDt = DateTime.fromISO(previous.sampledAt);
    const endDt = DateTime.fromISO(current.sampledAt);
    if (!startDt.isValid || !endDt.isValid || endDt <= startDt) {
      return;
    }

    const startPower = readPowerValues(previous.telemetry);
    const endPower = readPowerValues(current.telemetry);
    let segmentStart: DateTime = startDt;

    while (segmentStart < endDt) {
      const bucket = getLocalHourBucket(segmentStart.toISO()!, this.timezone);
      const hourEnd = getNextHourStart(bucket.localDate, bucket.hour, this.timezone);
      const segmentEnd = DateTime.min(endDt, hourEnd);
      const deltaHours = segmentEnd.diff(segmentStart, 'hours').hours;

      if (deltaHours > 0) {
        const ratioAtEnd =
          endDt > startDt ? segmentEnd.diff(startDt, 'milliseconds').milliseconds / endDt.diff(startDt, 'milliseconds').milliseconds : 1;
        const powerAtSegmentEnd = interpolatePower(startPower, endPower, ratioAtEnd);
        const powerAtSegmentStart =
          segmentStart.equals(startDt)
            ? startPower
            : interpolatePower(
                startPower,
                endPower,
                segmentStart.diff(startDt, 'milliseconds').milliseconds /
                  endDt.diff(startDt, 'milliseconds').milliseconds
              );

        this.store.ensureOpenHour(bucket.localDate, bucket.hour, endCounters);
        const deltas = trapezoidalEnergyKwh(powerAtSegmentStart, powerAtSegmentEnd, deltaHours);
        this.store.addHourMetrics(bucket.localDate, bucket.hour, deltas);
        this.store.addSocSample(bucket.localDate, bucket.hour, current.telemetry.SoC ?? 0);
        this.store.incrementHourSampleCount(bucket.localDate, bucket.hour);
      }

      if (segmentEnd >= endDt) {
        break;
      }

      this.finalizeHour(bucket.localDate, bucket.hour, endCounters);
      segmentStart = segmentEnd;
    }
  }
}
