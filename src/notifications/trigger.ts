import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';

export interface NotificationTriggerConfig {
  apiBaseUrl: string;
  bridgeToken: string;
  enabled: boolean;
  verboseLogging: boolean;
}

interface MonitoredSnapshot {
  soc: number;
  runningState?: number;
  workMode?: number;
}

export interface NotificationTriggerResult {
  triggered: boolean;
  reason: 'disabled' | 'baseline' | 'unchanged' | 'triggered';
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

function formatField(value: number | undefined): string {
  return value === undefined ? '?' : String(value);
}

function describeMonitoredChanges(
  previous: MonitoredSnapshot,
  current: MonitoredSnapshot
): string[] {
  const changes: string[] = [];
  if (previous.soc !== current.soc) {
    changes.push(`soc ${formatField(previous.soc)}→${formatField(current.soc)}`);
  }
  if (previous.runningState !== current.runningState) {
    changes.push(
      `runningState ${formatField(previous.runningState)}→${formatField(current.runningState)}`
    );
  }
  if (previous.workMode !== current.workMode) {
    changes.push(`workMode ${formatField(previous.workMode)}→${formatField(current.workMode)}`);
  }
  return changes;
}

function monitoredFieldsChanged(
  previous: MonitoredSnapshot | null,
  current: MonitoredSnapshot
): boolean {
  if (!previous) {
    return false;
  }
  return describeMonitoredChanges(previous, current).length > 0;
}

function buildTriggerPayload(telemetry: ModbusRealtimeTelemetry): Record<string, unknown> {
  return { ...telemetry };
}

async function postNotificationTrigger(
  config: NotificationTriggerConfig,
  payload: Record<string, unknown>,
  changes: string[]
): Promise<void> {
  const url = `${normalizeBaseUrl(config.apiBaseUrl)}/api/bridge/notifications/trigger`;
  if (config.verboseLogging) {
    console.log(`[notifications] change detected: ${changes.join(', ')}`);
    console.log(`[notifications] POST ${url}`);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.bridgeToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Notification trigger failed (${response.status}): ${body}`);
  }

  if (config.verboseLogging) {
    console.log(`[notifications] POST ${url} ${response.status}`);
  }
}

export function createNotificationTrigger(config: NotificationTriggerConfig) {
  let previousSnapshot: MonitoredSnapshot | null = null;

  return {
    async handleTelemetry(telemetry: ModbusRealtimeTelemetry): Promise<NotificationTriggerResult> {
      if (!config.enabled || !config.apiBaseUrl) {
        return { triggered: false, reason: 'disabled' };
      }

      const current: MonitoredSnapshot = {
        soc: telemetry.SoC,
        runningState: telemetry.runningState,
        workMode: telemetry.workMode,
      };

      if (!previousSnapshot) {
        previousSnapshot = current;
        return { triggered: false, reason: 'baseline' };
      }

      const changes = describeMonitoredChanges(previousSnapshot, current);
      if (changes.length === 0) {
        return { triggered: false, reason: 'unchanged' };
      }

      previousSnapshot = current;
      const payload = buildTriggerPayload(telemetry);

      void postNotificationTrigger(config, payload, changes).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (config.verboseLogging) {
          console.warn(`[notifications] POST failed: ${message}`);
        }
      });

      return { triggered: true, reason: 'triggered' };
    },
  };
}

export const notificationTriggerInternals = {
  monitoredFieldsChanged,
  describeMonitoredChanges,
  normalizeBaseUrl,
};
