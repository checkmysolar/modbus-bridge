import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import type { FoxShapedTodayTotals } from '../modbus/h1g2TodayTotals.js';
import type { DayDailyRow, DayHourlyRow } from '../report/types.js';
import type { KwhField, KwhMetrics } from '../aggregation/metrics.js';
import { emptyKwhMetrics } from '../aggregation/metrics.js';

export interface RealtimeSnapshot {
  telemetry: ModbusRealtimeTelemetry;
  sampledAt: string;
  updatedAt: string;
}

export interface TodayTotalsSnapshot {
  totals: FoxShapedTodayTotals;
  sampledAt: string;
  updatedAt: string;
}

interface HourRowDb {
  local_date: string;
  hour: number;
  pv_kwh: number;
  loads_kwh: number;
  feedin_kwh: number;
  grid_consumption_kwh: number;
  bat_charge_kwh: number;
  bat_discharge_kwh: number;
  soc_sum: number;
  sample_count: number;
  finalized: number;
  counter_start_json: string | null;
  updated_at: string;
}

interface DailyRowDb {
  local_date: string;
  pv_kwh: number;
  loads_kwh: number;
  feedin_kwh: number;
  grid_consumption_kwh: number;
  bat_charge_kwh: number;
  bat_discharge_kwh: number;
  updated_at: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS realtime_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  telemetry_json TEXT NOT NULL,
  sampled_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS today_totals_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  totals_json TEXT NOT NULL,
  sampled_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS day_hourly (
  local_date TEXT NOT NULL,
  hour INTEGER NOT NULL,
  pv_kwh REAL NOT NULL DEFAULT 0,
  loads_kwh REAL NOT NULL DEFAULT 0,
  feedin_kwh REAL NOT NULL DEFAULT 0,
  grid_consumption_kwh REAL NOT NULL DEFAULT 0,
  bat_charge_kwh REAL NOT NULL DEFAULT 0,
  bat_discharge_kwh REAL NOT NULL DEFAULT 0,
  soc_sum REAL NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  finalized INTEGER NOT NULL DEFAULT 0,
  counter_start_json TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (local_date, hour)
);

CREATE TABLE IF NOT EXISTS day_daily (
  local_date TEXT PRIMARY KEY,
  pv_kwh REAL NOT NULL DEFAULT 0,
  loads_kwh REAL NOT NULL DEFAULT 0,
  feedin_kwh REAL NOT NULL DEFAULT 0,
  grid_consumption_kwh REAL NOT NULL DEFAULT 0,
  bat_charge_kwh REAL NOT NULL DEFAULT 0,
  bat_discharge_kwh REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS samples (
  ts TEXT PRIMARY KEY,
  telemetry_json TEXT NOT NULL
);
`;

function mapHourRow(row: HourRowDb): DayHourlyRow {
  return {
    localDate: row.local_date,
    hour: row.hour,
    pvKwh: row.pv_kwh,
    loadsKwh: row.loads_kwh,
    feedinKwh: row.feedin_kwh,
    gridConsumptionKwh: row.grid_consumption_kwh,
    batChargeKwh: row.bat_charge_kwh,
    batDischargeKwh: row.bat_discharge_kwh,
    socAvg: row.sample_count > 0 ? row.soc_sum / row.sample_count : 0,
    sampleCount: row.sample_count,
    finalized: row.finalized === 1,
    updatedAt: row.updated_at,
  };
}

function mapDailyRow(row: DailyRowDb): DayDailyRow {
  return {
    localDate: row.local_date,
    pvKwh: row.pv_kwh,
    loadsKwh: row.loads_kwh,
    feedinKwh: row.feedin_kwh,
    gridConsumptionKwh: row.grid_consumption_kwh,
    batChargeKwh: row.bat_charge_kwh,
    batDischargeKwh: row.bat_discharge_kwh,
    updatedAt: row.updated_at,
  };
}

export class RealtimeStore {
  private readonly db: Database.Database;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, 'bridge.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  upsert(telemetry: ModbusRealtimeTelemetry, sampledAt: string): void {
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO realtime_snapshot (id, telemetry_json, sampled_at, updated_at)
         VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           telemetry_json = excluded.telemetry_json,
           sampled_at = excluded.sampled_at,
           updated_at = excluded.updated_at`
      )
      .run(JSON.stringify(telemetry), sampledAt, updatedAt);
  }

  getLatest(): RealtimeSnapshot | null {
    const row = this.db
      .prepare('SELECT telemetry_json, sampled_at, updated_at FROM realtime_snapshot WHERE id = 1')
      .get() as { telemetry_json: string; sampled_at: string; updated_at: string } | undefined;

    if (!row) {
      return null;
    }

    try {
      return {
        telemetry: JSON.parse(row.telemetry_json) as ModbusRealtimeTelemetry,
        sampledAt: row.sampled_at,
        updatedAt: row.updated_at,
      };
    } catch {
      return null;
    }
  }

  upsertTodayTotals(totals: FoxShapedTodayTotals, sampledAt: string): void {
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO today_totals_snapshot (id, totals_json, sampled_at, updated_at)
         VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           totals_json = excluded.totals_json,
           sampled_at = excluded.sampled_at,
           updated_at = excluded.updated_at`
      )
      .run(JSON.stringify(totals), sampledAt, updatedAt);
  }

  getLatestTodayTotals(): TodayTotalsSnapshot | null {
    const row = this.db
      .prepare('SELECT totals_json, sampled_at, updated_at FROM today_totals_snapshot WHERE id = 1')
      .get() as { totals_json: string; sampled_at: string; updated_at: string } | undefined;

    if (!row) {
      return null;
    }

    try {
      return {
        totals: JSON.parse(row.totals_json) as FoxShapedTodayTotals,
        sampledAt: row.sampled_at,
        updatedAt: row.updated_at,
      };
    } catch {
      return null;
    }
  }

  ensureOpenHour(
    localDate: string,
    hour: number,
    counters: Record<string, number | null>
  ): void {
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO day_hourly (
           local_date, hour, counter_start_json, updated_at
         ) VALUES (?, ?, ?, ?)
         ON CONFLICT(local_date, hour) DO NOTHING`
      )
      .run(localDate, hour, JSON.stringify(counters), updatedAt);
  }

  addHourMetrics(localDate: string, hour: number, deltas: KwhMetrics): void {
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE day_hourly SET
           pv_kwh = pv_kwh + ?,
           loads_kwh = loads_kwh + ?,
           feedin_kwh = feedin_kwh + ?,
           grid_consumption_kwh = grid_consumption_kwh + ?,
           bat_charge_kwh = bat_charge_kwh + ?,
           bat_discharge_kwh = bat_discharge_kwh + ?,
           updated_at = ?
         WHERE local_date = ? AND hour = ?`
      )
      .run(
        deltas.pv_kwh,
        deltas.loads_kwh,
        deltas.feedin_kwh,
        deltas.grid_consumption_kwh,
        deltas.bat_charge_kwh,
        deltas.bat_discharge_kwh,
        updatedAt,
        localDate,
        hour
      );
  }

  addSocSample(localDate: string, hour: number, soc: number): void {
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE day_hourly SET
           soc_sum = soc_sum + ?,
           updated_at = ?
         WHERE local_date = ? AND hour = ?`
      )
      .run(soc, updatedAt, localDate, hour);
  }

  incrementHourSampleCount(localDate: string, hour: number): void {
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE day_hourly SET
           sample_count = sample_count + 1,
           updated_at = ?
         WHERE local_date = ? AND hour = ?`
      )
      .run(updatedAt, localDate, hour);
  }

  getHourRow(
    localDate: string,
    hour: number
  ): (DayHourlyRow & { counterStart: Record<string, number | null> }) | null {
    const row = this.db
      .prepare('SELECT * FROM day_hourly WHERE local_date = ? AND hour = ?')
      .get(localDate, hour) as HourRowDb | undefined;

    if (!row) {
      return null;
    }

    let counterStart: Record<string, number | null> = {};
    if (row.counter_start_json) {
      try {
        counterStart = JSON.parse(row.counter_start_json) as Record<string, number | null>;
      } catch {
        counterStart = {};
      }
    }

    return {
      ...mapHourRow(row),
      counterStart,
    };
  }

  getHourMetrics(localDate: string, hour: number): KwhMetrics {
    const row = this.db
      .prepare(
        `SELECT pv_kwh, loads_kwh, feedin_kwh, grid_consumption_kwh, bat_charge_kwh, bat_discharge_kwh
         FROM day_hourly WHERE local_date = ? AND hour = ?`
      )
      .get(localDate, hour) as Record<KwhField, number> | undefined;

    if (!row) {
      return emptyKwhMetrics();
    }

    return {
      pv_kwh: row.pv_kwh,
      loads_kwh: row.loads_kwh,
      feedin_kwh: row.feedin_kwh,
      grid_consumption_kwh: row.grid_consumption_kwh,
      bat_charge_kwh: row.bat_charge_kwh,
      bat_discharge_kwh: row.bat_discharge_kwh,
    };
  }

  setHourMetrics(localDate: string, hour: number, metrics: KwhMetrics): void {
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE day_hourly SET
           pv_kwh = ?,
           loads_kwh = ?,
           feedin_kwh = ?,
           grid_consumption_kwh = ?,
           bat_charge_kwh = ?,
           bat_discharge_kwh = ?,
           updated_at = ?
         WHERE local_date = ? AND hour = ?`
      )
      .run(
        metrics.pv_kwh,
        metrics.loads_kwh,
        metrics.feedin_kwh,
        metrics.grid_consumption_kwh,
        metrics.bat_charge_kwh,
        metrics.bat_discharge_kwh,
        updatedAt,
        localDate,
        hour
      );
  }

  markHourFinalized(localDate: string, hour: number): void {
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE day_hourly SET finalized = 1, updated_at = ? WHERE local_date = ? AND hour = ?`
      )
      .run(updatedAt, localDate, hour);
  }

  upsertDailyRollup(localDate: string): void {
    const row = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(pv_kwh), 0) AS pv_kwh,
           COALESCE(SUM(loads_kwh), 0) AS loads_kwh,
           COALESCE(SUM(feedin_kwh), 0) AS feedin_kwh,
           COALESCE(SUM(grid_consumption_kwh), 0) AS grid_consumption_kwh,
           COALESCE(SUM(bat_charge_kwh), 0) AS bat_charge_kwh,
           COALESCE(SUM(bat_discharge_kwh), 0) AS bat_discharge_kwh
         FROM day_hourly
         WHERE local_date = ?`
      )
      .get(localDate) as DailyRowDb;

    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO day_daily (
           local_date, pv_kwh, loads_kwh, feedin_kwh, grid_consumption_kwh,
           bat_charge_kwh, bat_discharge_kwh, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(local_date) DO UPDATE SET
           pv_kwh = excluded.pv_kwh,
           loads_kwh = excluded.loads_kwh,
           feedin_kwh = excluded.feedin_kwh,
           grid_consumption_kwh = excluded.grid_consumption_kwh,
           bat_charge_kwh = excluded.bat_charge_kwh,
           bat_discharge_kwh = excluded.bat_discharge_kwh,
           updated_at = excluded.updated_at`
      )
      .run(
        localDate,
        row.pv_kwh,
        row.loads_kwh,
        row.feedin_kwh,
        row.grid_consumption_kwh,
        row.bat_charge_kwh,
        row.bat_discharge_kwh,
        updatedAt
      );
  }

  getHoursForDay(localDate: string): DayHourlyRow[] {
    const rows = this.db
      .prepare('SELECT * FROM day_hourly WHERE local_date = ? ORDER BY hour ASC')
      .all(localDate) as HourRowDb[];
    return rows.map(mapHourRow);
  }

  getDailyRowsForRange(startDate: string, endDate: string): DayDailyRow[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM day_daily
         WHERE local_date >= ? AND local_date <= ?
         ORDER BY local_date ASC`
      )
      .all(startDate, endDate) as DailyRowDb[];
    return rows.map(mapDailyRow);
  }

  getDailyRowsForYear(year: number): DayDailyRow[] {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    return this.getDailyRowsForRange(startDate, endDate);
  }

  getEarliestDate(): string | null {
    const row = this.db
      .prepare(
        `SELECT local_date FROM day_daily ORDER BY local_date ASC LIMIT 1`
      )
      .get() as { local_date: string } | undefined;
    return row?.local_date ?? null;
  }

  getLatestDate(): string | null {
    const row = this.db
      .prepare(
        `SELECT local_date FROM day_daily ORDER BY local_date DESC LIMIT 1`
      )
      .get() as { local_date: string } | undefined;
    return row?.local_date ?? null;
  }

  getTodaySampleCount(localDate: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(sample_count), 0) AS total
         FROM day_hourly WHERE local_date = ?`
      )
      .get(localDate) as { total: number };
    return row.total;
  }

  insertSample(ts: string, telemetry: ModbusRealtimeTelemetry): void {
    this.db
      .prepare('INSERT OR REPLACE INTO samples (ts, telemetry_json) VALUES (?, ?)')
      .run(ts, JSON.stringify(telemetry));
  }

  pruneSamplesOlderThan(cutoffIso: string): void {
    this.db.prepare('DELETE FROM samples WHERE ts < ?').run(cutoffIso);
  }

  close(): void {
    this.db.close();
  }
}
