import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import type { FoxShapedTodayTotals } from '../modbus/h1g2TodayTotals.js';

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
`;

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

  close(): void {
    this.db.close();
  }
}
