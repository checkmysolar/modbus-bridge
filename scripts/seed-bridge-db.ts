import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS realtime_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  telemetry_json TEXT NOT NULL,
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

const MONTH_SOLAR = [0.22, 0.32, 0.52, 0.72, 0.88, 0.98, 1.0, 0.92, 0.72, 0.48, 0.32, 0.2];
const SITE_TIMEZONE = 'Europe/London';

function mix(n: number): number {
  let x = Math.imul(n ^ (n >>> 16), 2246822507) | 0;
  x = Math.imul(x ^ (x >>> 13), 3266489909) | 0;
  return (x ^ (x >>> 16)) >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function parseDateParts(isoDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = isoDate.split('-').map(Number);
  return { year, month, day };
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function localDateNow(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SITE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function localHourNow(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SITE_TIMEZONE,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
}

function solarFactorForHour(hour: number): number {
  if (hour < 5 || hour > 20) return 0;
  const peak = 12.5;
  const spread = 4.5;
  const x = (hour - peak) / spread;
  return Math.exp(-0.5 * x * x);
}

interface HourMetrics {
  pvKwh: number;
  loadsKwh: number;
  feedinKwh: number;
  gridConsumptionKwh: number;
  batChargeKwh: number;
  batDischargeKwh: number;
  socAvg: number;
  sampleCount: number;
}

function makeHourMetrics(localDate: string, hour: number): HourMetrics {
  const { year, month, day } = parseDateParts(localDate);
  const seed = mix(mix(year * 5023 + month * 173 + day * 193 + hour * 37));
  const rnd = mulberry32(seed);
  const monthFactor = MONTH_SOLAR[month - 1];
  const hourFactor = solarFactorForHour(hour);

  const pvKwh = round3(Math.max(0, (0.15 + rnd() * 3.8) * monthFactor * hourFactor));
  const loadsKwh = round3(0.25 + rnd() * 0.9 + (hour >= 17 && hour <= 21 ? 0.35 : 0));

  const surplus = pvKwh - loadsKwh * 0.45;
  const feedinKwh = round3(surplus > 0 ? surplus * (0.25 + rnd() * 0.45) : 0);

  const toBattery = Math.max(0, pvKwh - loadsKwh * 0.5 - feedinKwh);
  const batChargeKwh = round3(toBattery * (0.35 + rnd() * 0.5));

  const shortage = loadsKwh - pvKwh * 0.5 + feedinKwh * 0.15;
  const batDischargeKwh = round3(
    shortage > 0 ? shortage * (0.3 + rnd() * 0.5) : hour < 7 || hour > 18 ? rnd() * 0.25 : 0
  );

  const gridConsumptionKwh = round3(
    Math.max(0, loadsKwh - pvKwh + feedinKwh + batDischargeKwh - batChargeKwh + (rnd() - 0.5) * 0.1)
  );

  const baseSoc = 45 + monthFactor * 20;
  const socAvg = round3(
    Math.min(98, Math.max(18, baseSoc + batChargeKwh * 8 - batDischargeKwh * 6 + (rnd() - 0.5) * 8))
  );

  return {
    pvKwh,
    loadsKwh,
    feedinKwh,
    gridConsumptionKwh,
    batChargeKwh,
    batDischargeKwh,
    socAvg,
    sampleCount: 12,
  };
}

function makeRealtimeTelemetry(
  metrics: HourMetrics,
  sampledAt: string,
  hour: number
): ModbusRealtimeTelemetry {
  const pvPower = round3(metrics.pvKwh * (0.8 + (hour >= 10 && hour <= 15 ? 0.9 : 0.2)));
  const loadsPower = round3(metrics.loadsKwh * 0.85);
  const pv1Power = round3(pvPower * 0.48);
  const pv2Power = round3(pvPower - pv1Power);

  return {
    loadsPower,
    pvPower,
    pv1Power,
    pv2Power,
    pvStringCount: 2,
    pvStringPowers: { pv1Power, pv2Power },
    feedinPower: round3(metrics.feedinKwh * 0.7),
    gridConsumptionPower: round3(metrics.gridConsumptionKwh * 0.75),
    batChargePower: round3(metrics.batChargeKwh * 0.6),
    batDischargePower: round3(metrics.batDischargeKwh * 0.65),
    SoC: Math.round(metrics.socAvg),
    ResidualEnergy: round3((metrics.socAvg / 100) * 10.6),
    batVoltage: 198 + (metrics.socAvg / 100) * 12,
    batCurrent: round3((metrics.batChargeKwh - metrics.batDischargeKwh) * 2),
    batTemperature: 28 + hourFactorTemp(hour),
    gridVoltage: 238 + Math.random() * 8,
    gridCurrent: round3(loadsPower * 4.2),
    gridFrequency: 49.95 + Math.random() * 0.1,
    meterPower2: 0,
    ambientTemperature: 8 + MONTH_SOLAR[parseDateParts(sampledAt.slice(0, 10)).month - 1] * 18,
    deviceTemperature: 35 + hourFactorTemp(hour),
    runningState: 163,
    isOffGrid: false,
    epsPower: loadsPower,
    epsPowerR: loadsPower,
    epsVoltR: 240 + Math.random() * 6,
    epsCurrentR: round3(loadsPower * 4),
    workMode: 2,
    remoteEnable: 0,
    remoteActivePowerW: 5000,
    sampledAt,
  };
}

function hourFactorTemp(hour: number): number {
  return hour >= 11 && hour <= 16 ? 12 : hour >= 6 && hour <= 20 ? 6 : 0;
}

function main(): void {
  const dbPath = process.argv[2] ?? path.resolve('tmp/sql-db-modbus/bridge.db');
  const startDate = process.argv[3] ?? '2024-01-01';
  const endDate = process.argv[4] ?? localDateNow();

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  db.exec('DELETE FROM day_hourly');
  db.exec('DELETE FROM day_daily');
  db.exec('DELETE FROM samples');

  const insertHour = db.prepare(
    `INSERT INTO day_hourly (
       local_date, hour, pv_kwh, loads_kwh, feedin_kwh, grid_consumption_kwh,
       bat_charge_kwh, bat_discharge_kwh, soc_sum, sample_count, finalized,
       counter_start_json, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertDaily = db.prepare(
    `INSERT INTO day_daily (
       local_date, pv_kwh, loads_kwh, feedin_kwh, grid_consumption_kwh,
       bat_charge_kwh, bat_discharge_kwh, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertSample = db.prepare('INSERT OR REPLACE INTO samples (ts, telemetry_json) VALUES (?, ?)');

  const upsertRealtime = db.prepare(
    `INSERT INTO realtime_snapshot (id, telemetry_json, sampled_at, updated_at)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       telemetry_json = excluded.telemetry_json,
       sampled_at = excluded.sampled_at,
       updated_at = excluded.updated_at`
  );

  const currentHour = localHourNow();
  let dayCount = 0;
  let hourCount = 0;
  let sampleCount = 0;

  const seedAll = db.transaction(() => {
    for (let localDate = startDate; localDate <= endDate; localDate = addDays(localDate, 1)) {
      const isToday = localDate === endDate;
      let dailyPv = 0;
      let dailyLoads = 0;
      let dailyFeedin = 0;
      let dailyGrid = 0;
      let dailyCharge = 0;
      let dailyDischarge = 0;

      for (let hour = 0; hour < 24; hour++) {
        if (isToday && hour > currentHour) {
          continue;
        }

        const metrics = makeHourMetrics(localDate, hour);
        if (isToday && hour === currentHour) {
          metrics.sampleCount = Math.max(1, Math.floor((Date.now() % 3_600_000) / 300_000));
        }

        const finalized = isToday && hour === currentHour ? 0 : 1;
        const updatedAt = new Date().toISOString();
        const socSum = round3(metrics.socAvg * metrics.sampleCount);

        insertHour.run(
          localDate,
          hour,
          metrics.pvKwh,
          metrics.loadsKwh,
          metrics.feedinKwh,
          metrics.gridConsumptionKwh,
          metrics.batChargeKwh,
          metrics.batDischargeKwh,
          socSum,
          metrics.sampleCount,
          finalized,
          JSON.stringify({
            solarGeneration: round3(metrics.pvKwh * 10),
            batteryCharge: round3(metrics.batChargeKwh * 10),
            batteryDischarge: round3(metrics.batDischargeKwh * 10),
            feedIn: round3(metrics.feedinKwh * 10),
            gridConsumption: round3(metrics.gridConsumptionKwh * 10),
          }),
          updatedAt
        );

        dailyPv += metrics.pvKwh;
        dailyLoads += metrics.loadsKwh;
        dailyFeedin += metrics.feedinKwh;
        dailyGrid += metrics.gridConsumptionKwh;
        dailyCharge += metrics.batChargeKwh;
        dailyDischarge += metrics.batDischargeKwh;
        hourCount += 1;

        const includeSamples = localDate >= addDays(endDate, -2);
        if (includeSamples) {
          for (let minute = 0; minute < 60; minute += 5) {
            if (isToday && hour === currentHour && minute > new Date().getMinutes()) {
              continue;
            }
            const ts = `${localDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
            const telemetry = makeRealtimeTelemetry(metrics, ts, hour);
            insertSample.run(ts, JSON.stringify(telemetry));
            sampleCount += 1;
          }
        }
      }

      insertDaily.run(
        localDate,
        round3(dailyPv),
        round3(dailyLoads),
        round3(dailyFeedin),
        round3(dailyGrid),
        round3(dailyCharge),
        round3(dailyDischarge),
        new Date().toISOString()
      );
      dayCount += 1;
    }

    const latestMetrics = makeHourMetrics(endDate, currentHour);
    const latestSampledAt = new Date().toISOString();
    const latestTelemetry = makeRealtimeTelemetry(latestMetrics, latestSampledAt, currentHour);
    upsertRealtime.run(JSON.stringify(latestTelemetry), latestSampledAt, latestSampledAt);
  });

  seedAll();
  db.close();

  console.log(`Seeded ${dbPath}`);
  console.log(`  days:    ${dayCount} (${startDate} → ${endDate})`);
  console.log(`  hours:   ${hourCount}`);
  console.log(`  samples: ${sampleCount}`);
  console.log(`  timezone: ${SITE_TIMEZONE}`);
}

main();
