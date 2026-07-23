import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import { autodetectInverter, type AutodetectOptions } from './core/autodetect.js';
import { ModbusReader, type ModbusTcpConfig } from './core/reader.js';
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

  constructor(
    private readonly config: ModbusTcpConfig,
    private readonly autodetectOptions: AutodetectOptions = {}
  ) {}

  async connect(): Promise<void> {
    const preliminaryReader = new ModbusReader(this.config);
    await preliminaryReader.connect();

    this.detected = await autodetectInverter(preliminaryReader, this.autodetectOptions);
    const specialRegisters = getReaderSpecialRegisters(this.detected.profileId);
    await preliminaryReader.close();

    this.reader = new ModbusReader(this.config, specialRegisters);
    await this.reader.connect();
    this.profile = getProfile(this.detected.profileId);
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
    return profile.readRealtime(reader, detectedInverterToContext(detected), sampledAt);
  }

  async readTodayTotals(sampledAt: string = new Date().toISOString()): Promise<TodayTotalsSnapshot> {
    const { reader, profile, detected } = this.requireReady();
    return profile.readTodayTotals(reader, detectedInverterToContext(detected), sampledAt);
  }
}

/** @deprecated Use FoxModbusClient */
export class H1G2ModbusClient extends FoxModbusClient {}
