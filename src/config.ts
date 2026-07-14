export interface BridgeConfig {
  bridgeToken: string;
  modbusHost: string;
  modbusPort: number;
  modbusUnitId: number;
  pollIntervalMs: number;
  modbusTimeoutMs: number;
  httpPort: number;
  dataDir: string;
  bridgeHostname?: string;
}

function readRequired(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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

function readOptional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function loadConfig(): BridgeConfig {
  return {
    bridgeToken: readRequired('CMS_BRIDGE_TOKEN'),
    modbusHost: readRequired('MODBUS_HOST'),
    modbusPort: readInt('MODBUS_PORT', 502),
    modbusUnitId: readInt('MODBUS_UNIT_ID', 247),
    pollIntervalMs: readInt('POLL_INTERVAL_MS', 10_000),
    modbusTimeoutMs: readInt('MODBUS_TIMEOUT_MS', 5_000),
    httpPort: readInt('BRIDGE_HTTP_PORT', 8080),
    dataDir: process.env.BRIDGE_DATA_DIR?.trim() || '/data',
    bridgeHostname: readOptional('BRIDGE_HOSTNAME'),
  };
}
