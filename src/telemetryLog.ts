import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';

const PREVIEW_FIELDS: Array<{ key: keyof ModbusRealtimeTelemetry; label: string }> = [
  { key: 'loadsPower', label: 'loads' },
  { key: 'pvPower', label: 'pv' },
  { key: 'SoC', label: 'soc' },
  { key: 'feedinPower', label: 'feedin' },
];

function formatMetricValue(key: string, value: unknown): string {
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
  return String(value);
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
