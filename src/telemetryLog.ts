import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import { workModeCodeToLabel } from '@checkmysolar/modbus-telemetry/workMode';

const PREVIEW_FIELDS: Array<{ key: keyof ModbusRealtimeTelemetry; label: string }> = [
  { key: 'loadsPower', label: 'loads' },
  { key: 'pvPower', label: 'pv' },
  { key: 'SoC', label: 'soc' },
  { key: 'feedinPower', label: 'feedin' },
];

const TELEMETRY_FIELDS: Array<keyof ModbusRealtimeTelemetry> = [
  'loadsPower',
  'pvPower',
  'pv1Power',
  'pv2Power',
  'pvStringCount',
  'feedinPower',
  'gridConsumptionPower',
  'batChargePower',
  'batDischargePower',
  'meterPower2',
  'SoC',
  'ResidualEnergy',
  'batVoltage',
  'batCurrent',
  'batTemperature',
  'gridVoltage',
  'gridCurrent',
  'gridFrequency',
  'ambientTemperature',
  'deviceTemperature',
  'runningState',
  'isOffGrid',
  'epsPower',
  'epsPowerR',
  'epsVoltR',
  'epsCurrentR',
  'workMode',
  'workModeRegister',
  'remoteEnable',
  'remoteActivePowerW',
  'remoteTimeoutCountdown',
  'sampledAt',
];

function formatMetricValue(key: string, value: unknown): string {
  if (typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value !== 'number') {
    return String(value);
  }
  if (key.endsWith('Power') || key === 'epsPower' || key === 'epsPowerR') {
    return `${value.toFixed(3)} kW`;
  }
  if (key === 'SoC') {
    return `${value}%`;
  }
  if (key === 'ResidualEnergy') {
    return `${value.toFixed(2)} kWh`;
  }
  if (key.endsWith('Temperature')) {
    return `${value.toFixed(1)} °C`;
  }
  if (key.endsWith('Voltage') || key === 'epsVoltR') {
    return `${value.toFixed(1)} V`;
  }
  if (key.endsWith('Current') || key === 'epsCurrentR') {
    return `${value.toFixed(1)} A`;
  }
  if (key === 'gridFrequency') {
    return `${value.toFixed(2)} Hz`;
  }
  if (key === 'remoteActivePowerW') {
    return `${value} W`;
  }
  if (key === 'remoteTimeoutCountdown') {
    return `${value} s`;
  }
  return String(value);
}

function formatTelemetryField(key: keyof ModbusRealtimeTelemetry, value: unknown): string {
  if (value === undefined) {
    return 'unavailable';
  }
  if (key === 'workMode' && typeof value === 'number') {
    return `${workModeCodeToLabel(value)} (code ${value})`;
  }
  return formatMetricValue(key, value);
}

export function formatTelemetryFull(telemetry: ModbusRealtimeTelemetry): string[] {
  const lines: string[] = [];

  for (const key of TELEMETRY_FIELDS) {
    lines.push(`${key}=${formatTelemetryField(key, telemetry[key])}`);
  }

  for (const [stringKey, power] of Object.entries(telemetry.pvStringPowers)) {
    lines.push(`pvStringPowers.${stringKey}=${formatMetricValue('pv1Power', power)}`);
  }

  return lines;
}

export function countTelemetryMetrics(telemetry: ModbusRealtimeTelemetry): number {
  return Object.entries(telemetry).filter(([key, value]) => {
    if (key === 'sampledAt' || key === 'pvStringCount' || key === 'pvStringPowers') {
      return false;
    }
    return value !== undefined;
  }).length;
}

export function formatTelemetryPreview(
  telemetry: ModbusRealtimeTelemetry,
  limit = PREVIEW_FIELDS.length
): string {
  const preview = PREVIEW_FIELDS.slice(0, limit)
    .map(({ key, label }) => {
      const value = telemetry[key];
      if (value === undefined) {
        return null;
      }
      return `${label}=${formatMetricValue(key, value)}`;
    })
    .filter((entry): entry is string => entry !== null);

  return preview.join(', ');
}

export function formatStoredTelemetryLog(telemetry: ModbusRealtimeTelemetry): string {
  const metricCount = countTelemetryMetrics(telemetry);
  const preview = formatTelemetryPreview(telemetry);
  return preview
    ? `Stored telemetry: ${metricCount} metrics — ${preview}`
    : `Stored telemetry: ${metricCount} metrics`;
}
