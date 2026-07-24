import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import { autodetectInverter, type AutodetectOptions } from './core/autodetect.js';
import { ModbusReader, type ModbusDebugLog, type ModbusTcpConfig } from './core/reader.js';
import {
  detectedInverterToContext,
  getProfile,
  getReaderSpecialRegisters,
  type ModbusProfile,
} from './profiles/registry.js';
import { mapTodayTotalsSnapshotToFoxShape, type TodayTotalsSnapshot } from './profiles/todayTotals.js';
import type { DetectedInverter } from './profiles/types.js';

export type { ModbusTcpConfig };
export type { DetectedInverter };
export type { TodayTotalsSnapshot };
export { mapTodayTotalsSnapshotToFoxShape as mapH1G2TodayTotalsSnapshotToFoxShape };

export class FoxModbusClient {
  private reader: ModbusReader | null = null;
  private profile: ModbusProfile | null = null;
  private detected: DetectedInverter | null = null;
  private readonly debugLog?: ModbusDebugLog;

  constructor(
    private readonly config: ModbusTcpConfig,
    private readonly autodetectOptions: AutodetectOptions = {},
    debugLogging = false
  ) {
    if (debugLogging) {
      this.debugLog = (message) => console.log(`[modbus] ${message}`);
    }
  }

  async connect(): Promise<void> {
    this.reader = new ModbusReader(this.config, undefined, this.debugLog);
    await this.reader.connect();

    this.debugLog?.(`connected ${this.config.host}:${this.config.port} unit ${this.config.unitId}`);
    this.detected = await autodetectInverter(this.reader, this.autodetectOptions);
    this.reader.setSpecialRegisters(getReaderSpecialRegisters(this.detected.profileId));
    this.profile = getProfile(this.detected.profileId);
    this.debugLog?.(
      `profile ${this.detected.profileId}` +
        (this.detected.firmwareVariant !== 'default' ? ` (${this.detected.firmwareVariant})` : '') +
        ` [${this.detected.connectionType}] model=${this.detected.modelName}`
    );
  }

  getDetectedInverter(): DetectedInverter | null {
    return this.detected;
  }

  async close(): Promise<void> {
    if (this.reader) {
      await this.reader.close();
      this.reader = null;
    }
  }

  private requireReady(): { reader: ModbusReader; profile: ModbusProfile; detected: DetectedInverter } {
    if (!this.reader || !this.profile || !this.detected) {
      throw new Error('Modbus client is not connected');
    }
    return { reader: this.reader, profile: this.profile, detected: this.detected };
  }

  async readRealtimeSnapshot(sampledAt: string = new Date().toISOString()): Promise<ModbusRealtimeTelemetry> {
    const { reader, profile, detected } = this.requireReady();
    const startedAt = Date.now();
    this.debugLog?.('poll realtime snapshot start');
    const telemetry = await profile.readRealtime(reader, detectedInverterToContext(detected), sampledAt);
    this.debugLog?.(`poll realtime snapshot done in ${Date.now() - startedAt}ms`);
    return telemetry;
  }

  async readTodayTotals(sampledAt: string = new Date().toISOString()): Promise<TodayTotalsSnapshot> {
    const { reader, profile, detected } = this.requireReady();
    const startedAt = Date.now();
    this.debugLog?.('poll today totals start');
    const totals = await profile.readTodayTotals(reader, detectedInverterToContext(detected), sampledAt);
    this.debugLog?.(`poll today totals done in ${Date.now() - startedAt}ms`);
    return totals;
  }
}

/** @deprecated Use FoxModbusClient */
export class H1G2ModbusClient extends FoxModbusClient {}
