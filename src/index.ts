import { loadConfig } from './config.js';
import { formatError } from './errors.js';
import { HourlyAggregator } from './aggregation/hourlyAggregator.js';
import { startBridgeHttpServer } from './http/server.js';
import { FoxModbusClient } from './modbus/client.js';
import { mapH1G2TodayTotalsSnapshotToFoxShape } from './modbus/h1g2TodayTotals.js';
import { WorkModeNotifier } from './notify/workModeNotifier.js';
import { RealtimeStore } from './storage/sqlite.js';
import { formatStoredTelemetryLog } from './telemetryLog.js';

const MAX_BACKOFF_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPollCycle(
  modbus: FoxModbusClient,
  store: RealtimeStore,
  workModeNotifier: WorkModeNotifier,
  aggregator: HourlyAggregator,
  verboseLogging: boolean
): Promise<void> {
  const sampledAt = new Date().toISOString();
  const [telemetry, todayTotalsSnapshot] = await Promise.all([
    modbus.readRealtimeSnapshot(sampledAt),
    modbus.readTodayTotals(sampledAt),
  ]);

  store.upsert(telemetry, telemetry.sampledAt);
  await workModeNotifier.handleSample(telemetry);
  const todayTotals = mapH1G2TodayTotalsSnapshotToFoxShape(todayTotalsSnapshot);
  if (todayTotals) {
    store.upsertTodayTotals(todayTotals, todayTotalsSnapshot.sampledAt);
  }
  aggregator.recordSample(telemetry, todayTotalsSnapshot, telemetry.sampledAt);
  if (verboseLogging) {
    console.log(formatStoredTelemetryLog(telemetry));
  }
}

async function main(): Promise<void> {
  const bridgeVersion = process.env.BRIDGE_VERSION ?? 'dev';
  console.log(`Modbus bridge version: ${bridgeVersion}`);
  const config = loadConfig();
  const store = new RealtimeStore(config.dataDir, { verboseLogging: config.verboseLogging });
  const aggregator = new HourlyAggregator(store, config.siteTimezone);
  const latestSnapshot = store.getLatest();
  const workModeNotifier = new WorkModeNotifier(
    {
      apiUrl: config.cmsApiUrl,
      bridgeToken: config.bridgeToken,
      debouncePolls: config.notifyDebouncePolls,
    },
    latestSnapshot?.telemetry.workMode
  );

  let detectedInverter: ReturnType<FoxModbusClient['getDetectedInverter']> = null;

  startBridgeHttpServer({
    port: config.httpPort,
    bridgeToken: config.bridgeToken,
    bridgeVersion,
    siteTimezone: config.siteTimezone,
    store,
    aggregator,
    getDetectedInverter: () => detectedInverter,
    verboseLogging: config.verboseLogging,
  });

  if (config.bridgeHostname) {
    console.log(`Bridge hostname: ${config.bridgeHostname}`);
  }
  console.log(`Site timezone: ${config.siteTimezone}`);

  const modbus = new FoxModbusClient(
    {
      host: config.modbusHost,
      port: config.modbusPort,
      unitId: config.modbusUnitId,
      timeoutMs: config.modbusTimeoutMs,
    },
    {
      forcedProfileId: config.inverterProfile,
      connectionType: config.modbusConnection,
    }
  );

  let backoffMs = config.pollIntervalMs;

  while (true) {
    try {
      await modbus.connect();
      detectedInverter = modbus.getDetectedInverter();
      const detected = detectedInverter;
      if (detected) {
        console.log(
          `Detected ${detected.modelName} → profile ${detected.profileId}` +
            (detected.firmwareVariant !== 'default' ? ` (${detected.firmwareVariant})` : '') +
            ` [${detected.connectionType}]`
        );
      }
      if (!config.verboseLogging) {
        console.log(
          `Modbus connected to ${config.modbusHost}:${config.modbusPort} (unit ${config.modbusUnitId})`
        );
      }
      backoffMs = config.pollIntervalMs;

      while (true) {
        await runPollCycle(modbus, store, workModeNotifier, aggregator, config.verboseLogging);
        await sleep(config.pollIntervalMs);
      }
    } catch (error) {
      if (!config.verboseLogging) {
        console.error(
          `Modbus connection failed (${config.modbusHost}:${config.modbusPort}): ${formatError(error)}`
        );
      } else {
        console.error(`Bridge cycle failed: ${formatError(error)}`);
      }
      detectedInverter = null;
      try {
        await modbus.close();
      } catch {
        // Ignore close errors while recovering.
      }
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    }
  }
}

main().catch((error) => {
  console.error(`Fatal bridge error: ${formatError(error)}`);
  process.exit(1);
});
