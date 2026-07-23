/**
 * One-shot Modbus connectivity check with auto-detected inverter profile.
 *
 * Usage (local):
 *   npm run build && MODBUS_HOST=192.168.1.100 npm run probe
 *
 * Usage (Docker one-off):
 *   docker run --rm -e MODBUS_HOST=192.168.1.100 ghcr.io/checkmysolar/modbus-bridge:latest npm run probe
 */
import { formatError } from './errors.js';
import { buildBridgeInfoResponse, formatBridgeInfoLines } from './http/info.js';
import { FoxModbusClient } from './modbus/client.js';
import { H1_G2_ENERGY_COUNTERS_START } from './modbus/h1g2TodayTotals.js';
import { formatTelemetryFull } from './telemetryLog.js';
import type { ConnectionType, ProfileId } from './config.js';

function formatKwh(value: number | null): string {
  return value === null ? 'unavailable' : `${value.toFixed(2)} kWh`;
}

function formatRaw(value: number | null): string {
  return value === null ? 'n/a' : String(value);
}

function readInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer for ${name}: ${raw}`);
  }
  return parsed;
}

function readOptionalProfile(): ProfileId | undefined {
  const raw = process.env.INVERTER_PROFILE?.trim();
  if (!raw) {
    return undefined;
  }
  return raw as ProfileId;
}

function readConnectionType(): ConnectionType {
  const raw = process.env.MODBUS_CONNECTION?.trim().toLowerCase();
  if (!raw) {
    return 'aux';
  }
  if (raw !== 'aux' && raw !== 'lan') {
    throw new Error(`Invalid MODBUS_CONNECTION: ${raw}`);
  }
  return raw;
}

async function main(): Promise<void> {
  const host = process.env.MODBUS_HOST?.trim();
  if (!host) {
    console.error('Missing MODBUS_HOST (inverter / RS485 adapter IP)');
    process.exit(1);
  }

  const port = readInt('MODBUS_PORT', 502);
  const unitId = readInt('MODBUS_UNIT_ID', 247);
  const timeoutMs = readInt('MODBUS_TIMEOUT_MS', 5_000);

  console.log(`Connecting to ${host}:${port} (unit ${unitId}, timeout ${timeoutMs}ms)...`);

  const modbus = new FoxModbusClient(
    { host, port, unitId, timeoutMs },
    {
      forcedProfileId: readOptionalProfile(),
      connectionType: readConnectionType(),
    }
  );

  try {
    await modbus.connect();
    console.log('TCP connected');

    const detected = modbus.getDetectedInverter();
    const bridgeInfo = buildBridgeInfoResponse(process.env.BRIDGE_VERSION ?? 'dev', detected);
    console.log('Bridge info:');
    for (const line of formatBridgeInfoLines(bridgeInfo)) {
      console.log(`  ${line}`);
    }
    console.log('');
    const telemetry = await modbus.readRealtimeSnapshot();
    console.log('Realtime snapshot:');
    for (const line of formatTelemetryFull(telemetry)) {
      console.log(`  ${line}`);
    }

    const todayTotals = await modbus.readTodayTotals();
    console.log('');
    console.log(`Today totals (block start ${H1_G2_ENERGY_COUNTERS_START}+; profile-specific map):`);
    if (todayTotals.readError) {
      console.log(`  unavailable: ${todayTotals.readError}`);
      console.log('  (Some adapters/firmware omit energy counter blocks over LAN.)');
    } else {
      for (const total of todayTotals.totals) {
        console.log(
          `  ${total.label}: ${formatKwh(total.kwh)}  (reg ${total.register} raw=${formatRaw(total.raw)})`
        );
      }
    }

    console.log('OK — inverter Modbus connectivity works');
  } catch (error) {
    console.error(`FAILED: ${formatError(error)}`);
    console.error('');
    console.error('Checklist:');
    console.error('  - Adapter/inverter is on the same LAN as this machine');
    console.error('  - MODBUS_HOST is the RS485-to-Ethernet adapter IP (not the Fox Cloud SN)');
    console.error('  - Port is usually 502; unit ID for Fox ESS is usually 247');
    console.error('  - Modbus TCP is enabled on the adapter; no other master is holding the bus');
    console.error('  - For H1 G1 over RS485, set MODBUS_CONNECTION=aux');
    console.error('  - Override profile with INVERTER_PROFILE if auto-detect fails');
    process.exit(1);
  } finally {
    try {
      await modbus.close();
    } catch {
      // ignore
    }
  }
}

main();
