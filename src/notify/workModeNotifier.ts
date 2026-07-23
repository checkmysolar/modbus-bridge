import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import { formatError } from '../errors.js';

export interface WorkModeNotifierOptions {
  apiUrl: string;
  bridgeToken: string;
  debouncePolls: number;
  timeoutMs: number;
}

export interface WorkModeNotifyStateStore {
  getLastEmittedWorkMode(): number | undefined;
  setLastEmittedWorkMode(workMode: number): void;
}

export interface WorkModeEventPayload {
  workMode: number;
  sampledAt: string;
  previousWorkMode?: number;
  soc?: number;
}

export class WorkModeNotifier {
  private pendingWorkMode: number | undefined;
  private pendingCount = 0;
  private lastEmittedWorkMode: number | undefined;
  private inFlightWorkMode: number | undefined;

  constructor(
    private readonly options: WorkModeNotifierOptions,
    private readonly stateStore: WorkModeNotifyStateStore
  ) {
    this.lastEmittedWorkMode = stateStore.getLastEmittedWorkMode();
  }

  handleSample(telemetry: ModbusRealtimeTelemetry): void {
    const workMode = telemetry.workMode;
    if (workMode === undefined || workMode === null) {
      return;
    }

    if (workMode === this.lastEmittedWorkMode || workMode === this.inFlightWorkMode) {
      this.pendingWorkMode = undefined;
      this.pendingCount = 0;
      return;
    }

    if (workMode === this.pendingWorkMode) {
      this.pendingCount += 1;
    } else {
      this.pendingWorkMode = workMode;
      this.pendingCount = 1;
    }

    if (this.pendingCount < this.options.debouncePolls) {
      return;
    }

    this.inFlightWorkMode = workMode;
    this.pendingWorkMode = undefined;
    this.pendingCount = 0;

    void this.emitWorkMode(workMode, telemetry);
  }

  private async emitWorkMode(
    workMode: number,
    telemetry: ModbusRealtimeTelemetry
  ): Promise<void> {
    const previousWorkMode = this.lastEmittedWorkMode;

    try {
      await postWorkModeEvent(this.options, {
        workMode,
        sampledAt: telemetry.sampledAt,
        previousWorkMode,
        soc: telemetry.SoC,
      });
      this.lastEmittedWorkMode = workMode;
      this.stateStore.setLastEmittedWorkMode(workMode);
    } catch (error) {
      console.error(`Work mode notification failed: ${formatError(error)}`);
    } finally {
      if (this.inFlightWorkMode === workMode) {
        this.inFlightWorkMode = undefined;
      }
    }
  }
}

export async function postWorkModeEvent(
  options: Pick<WorkModeNotifierOptions, 'apiUrl' | 'bridgeToken' | 'timeoutMs'>,
  payload: WorkModeEventPayload
): Promise<void> {
  const url = `${options.apiUrl.replace(/\/$/, '')}/api/bridge/events/work-mode`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.bridgeToken}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(options.timeoutMs),
  });

  if (response.status === 401) {
    throw new Error('Bridge token rejected');
  }

  if (!response.ok && response.status !== 204) {
    const text = await response.text().catch(() => '');
    throw new Error(`Work mode event rejected: ${response.status}${text ? ` ${text}` : ''}`);
  }
}
