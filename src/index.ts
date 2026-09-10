import { loadConfig } from './config.js';
import { formatError } from './errors.js';
import { HourlyAggregator } from './aggregation/hourlyAggregator.js';
import { startBridgeHttpServer } from './http/server.js';
import { FoxModbusClient } from './modbus/client.js';
import { mapH1G2TodayTotalsSnapshotToFoxShape } from './modbus/h1g2TodayTotals.js';
import { RealtimeStore } from './storage/sqlite.js';
import { formatStoredTelemetryLog } from './telemetryLog.js';
import { createNotificationTrigger } from './notifications/trigger.js';

const MAX_BACKOFF_MS = 60_000;
/** foxess_modbus tolerates several failed polls before tearing down the TCP session. */
const MAX_CONSECUTIVE_POLL_FAILURES = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPollCycle(
  modbus: FoxModbusClient,
  store: RealtimeStore,
  aggregator: HourlyAggregator,
  verboseLogging: boolean,
  onTelemetry?: (telemetry: Awaited<ReturnType<FoxModbusClient['readRealtimeSnapshot']>>) => Promise<void>
): Promise<void> {
  const sampledAt = new Date().toISOString();
  const telemetry = await modbus.readRealtimeSnapshot(sampledAt);
  const todayTotalsSnapshot = await modbus.readTodayTotals(sampledAt);

  store.upsert(telemetry, telemetry.sampledAt);
  const todayTotals = mapH1G2TodayTotalsSnapshotToFoxShape(todayTotalsSnapshot);
  if (todayTotals) {
    store.upsertTodayTotals(todayTotals, todayTotalsSnapshot.sampledAt);
  }
  aggregator.recordSample(telemetry, todayTotalsSnapshot, telemetry.sampledAt);
  if (verboseLogging) {
    console.log(formatStoredTelemetryLog(telemetry));
  }
  if (onTelemetry) {
    await onTelemetry(telemetry);
  }
}

async function main(): Promise<void> {
  const bridgeVersion = process.env.BRIDGE_VERSION ?? 'dev';
  console.log(`Modbus bridge version: ${bridgeVersion}`);
  const config = loadConfig();
  const store = new RealtimeStore(config.dataDir);
  const aggregator = new HourlyAggregator(store, config.siteTimezone);

  let detectedInverter: ReturnType<FoxModbusClient['getDetectedInverter']> = null;
  let setWorkMode: ((workMode: number) => Promise<{ workMode: number }>) | undefined;

  const notificationTrigger = createNotificationTrigger({
    apiBaseUrl: config.apiBaseUrl,
    bridgeToken: config.bridgeToken,
    enabled: config.notificationsEnabled,
    verboseLogging: config.verboseLogging,
  });

  if (config.notificationsEnabled) {
    console.log(`Instant notifications enabled via ${config.apiBaseUrl}`);
  }

  startBridgeHttpServer({
    port: config.httpPort,
    bridgeToken: config.bridgeToken,
    bridgeVersion,
    siteTimezone: config.siteTimezone,
    store,
    aggregator,
    getDetectedInverter: () => detectedInverter,
    readOnly: config.modbusReadOnly,
    setWorkMode: config.modbusReadOnly
      ? undefined
      : (workMode) => {
          if (!setWorkMode) {
            return Promise.reject(new Error('Modbus client is not connected'));
          }
          return setWorkMode(workMode);
        },
    verboseLogging: config.verboseLogging,
  });

  if (config.bridgeHostname) {
    console.log(`Bridge hostname: ${config.bridgeHostname}`);
  }
  console.log(`Site timezone: ${config.siteTimezone}`);
  if (config.modbusDebugLogging) {
    console.log('Modbus debug logging enabled (MODBUS_DEBUG_LOG)');
  }
  if (config.modbusReadOnly) {
    console.log('Modbus read-only mode enabled (MODBUS_READ_ONLY)');
  }

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
    },
    config.modbusDebugLogging
  );

  let backoffMs = config.pollIntervalMs;

  while (true) {
    try {
      await modbus.connect();
      detectedInverter = modbus.getDetectedInverter();
      if (!config.modbusReadOnly) {
        setWorkMode = (workMode) => modbus.setWorkMode(workMode);
      }
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
      let consecutivePollFailures = 0;

      while (true) {
        try {
          await runPollCycle(
            modbus,
            store,
            aggregator,
            config.verboseLogging,
            async (telemetry) => {
              await notificationTrigger.handleTelemetry(telemetry);
            }
          );
          consecutivePollFailures = 0;
        } catch (error) {
          consecutivePollFailures += 1;
          if (config.verboseLogging) {
            console.error(
              `Poll cycle failed (${consecutivePollFailures}/${MAX_CONSECUTIVE_POLL_FAILURES}): ${formatError(error)}`
            );
          }
          if (consecutivePollFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
            throw error;
          }
        }
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
      setWorkMode = undefined;
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
