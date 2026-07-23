export const BRIDGE_HTTP_PORT = 8080;

export type ConnectionType = 'aux' | 'lan';

export type ProfileId = 'h1g2' | 'h1Series' | 'kh' | 'h3Legacy' | 'h3Modern';

export interface BridgeConfig {
  bridgeToken: string;
  modbusHost: string;
  modbusPort: number;
  modbusUnitId: number;
  pollIntervalMs: number;
  modbusTimeoutMs: number;
  httpPort: number;
  dataDir: string;
  siteTimezone: string;
  bridgeHostname?: string;
  /** When true, log each Modbus poll and each HTTP request. */
  verboseLogging: boolean;
  /** Force a register profile instead of auto-detecting from the inverter model. */
  inverterProfile?: ProfileId;
  /** RS485 adapter (aux) vs direct inverter LAN connection. */
  modbusConnection: ConnectionType;
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

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

const PROFILE_IDS: ProfileId[] = ['h1g2', 'h1Series', 'kh', 'h3Legacy', 'h3Modern'];

function readProfileId(name: string): ProfileId | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return undefined;
  }
  if (!PROFILE_IDS.includes(raw as ProfileId)) {
    throw new Error(`Invalid ${name}: ${raw}. Expected one of ${PROFILE_IDS.join(', ')}`);
  }
  return raw as ProfileId;
}

function readConnectionType(name: string, fallback: ConnectionType): ConnectionType {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (raw !== 'aux' && raw !== 'lan') {
    throw new Error(`Invalid ${name}: ${raw}. Expected aux or lan`);
  }
  return raw;
}

function readTimezone(name: string): string {
  const value = readRequired(name);
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
  } catch {
    throw new Error(`Invalid IANA timezone for ${name}: ${value}`);
  }
  return value;
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
    siteTimezone: readTimezone('SITE_TIMEZONE'),
    bridgeHostname: readOptional('BRIDGE_HOSTNAME'),
    verboseLogging: readBoolean('BRIDGE_VERBOSE_LOG', false),
    inverterProfile: readProfileId('INVERTER_PROFILE'),
    modbusConnection: readConnectionType('MODBUS_CONNECTION', 'aux'),
  };
}
