/**
 * One-shot Modbus connectivity check for H1 G2 realtime snapshot.
 *
 * Usage (local, after build):
 *   MODBUS_HOST=192.168.1.100 npm run probe
 *
 * Usage (Docker one-off):
 *   docker run --rm -e MODBUS_HOST=192.168.1.100 ghcr.io/checkmysolar/modbus-bridge:latest npm run probe
 */
import { formatError } from './errors.js';
import { H1G2ModbusClient } from './modbus/client.js';
import { H1_G2_ENERGY_COUNTERS_START } from './modbus/h1g2TodayTotals.js';
import { workModeCodeToLabel } from '@checkmysolar/modbus-telemetry/workMode';

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

  const modbus = new H1G2ModbusClient({ host, port, unitId, timeoutMs });

  try {
    await modbus.connect();
    console.log('TCP connected');

    const telemetry = await modbus.readRealtimeSnapshot();
    console.log('Realtime snapshot:');
    console.log(`  loadsPower=${telemetry.loadsPower.toFixed(3)} kW`);
    console.log(`  pvPower=${telemetry.pvPower.toFixed(3)} kW (pv1=${telemetry.pv1Power.toFixed(3)}, pv2=${telemetry.pv2Power.toFixed(3)})`);
    console.log(`  SoC=${telemetry.SoC}%  ResidualEnergy=${telemetry.ResidualEnergy.toFixed(2)} kWh`);
    console.log(`  feedin=${telemetry.feedinPower.toFixed(3)} kW  gridConsumption=${telemetry.gridConsumptionPower.toFixed(3)} kW`);
    console.log(`  batCharge=${telemetry.batChargePower.toFixed(3)} kW  batDischarge=${telemetry.batDischargePower.toFixed(3)} kW`);
    if (telemetry.workMode !== undefined) {
      console.log(`  workMode=${workModeCodeToLabel(telemetry.workMode)} (code ${telemetry.workMode})`);
    } else {
      console.log('  workMode=unavailable');
    }
    if (
      telemetry.workModeRegister !== undefined ||
      telemetry.remoteEnable !== undefined ||
      telemetry.remoteActivePowerW !== undefined ||
      telemetry.remoteTimeoutCountdown !== undefined
    ) {
      const reg41000 =
        telemetry.workModeRegister !== undefined ? String(telemetry.workModeRegister) : 'n/a';
      const reg44000 = telemetry.remoteEnable !== undefined ? String(telemetry.remoteEnable) : 'n/a';
      const reg44002 =
        telemetry.remoteActivePowerW !== undefined ? `${telemetry.remoteActivePowerW} W` : 'n/a';
      const reg44004 =
        telemetry.remoteTimeoutCountdown !== undefined
          ? `${telemetry.remoteTimeoutCountdown} s`
          : 'n/a';
      console.log(`  reg41000=${reg41000}  reg44000=${reg44000}  reg44002=${reg44002}  reg44004=${reg44004}`);
    }

    const todayTotals = await modbus.readTodayTotals();
    console.log('');
    console.log(
      `Today totals (holding ${H1_G2_ENERGY_COUNTERS_START}+, scale 0.1 kWh; foxess_modbus H1 G2 map):`
    );
    if (todayTotals.readError) {
      console.log(`  unavailable: ${todayTotals.readError}`);
      console.log('  (Some adapters/firmware omit the 32000 energy counter block over LAN.)');
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
