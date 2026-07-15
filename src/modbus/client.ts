import ModbusRTU from 'modbus-serial';
import {
  H1_G2_BLOCK_LENGTH,
  H1_G2_BLOCK_START,
  H1_G2_PV1_POWER_REGISTER,
  H1_G2_PV2_POWER_REGISTER,
  H1_G2_RESIDUAL_ENERGY_REGISTER,
  H1_G2_STATE_STATUS1_REGISTER,
  H1_G2_STATE_STATUS3_REGISTER,
  H1_G2_REMOTE_ACTIVE_POWER_REGISTER,
  H1_G2_REMOTE_ENABLE_REGISTER,
  H1_G2_WORK_MODE_REGISTER,
  parseH1G2RealtimeSnapshot,
} from './h1g2Registers.js';
import {
  H1_G2_ENERGY_COUNTERS_LENGTH,
  H1_G2_ENERGY_COUNTERS_START,
  parseH1G2TodayTotalsFromBlock,
  type H1G2TodayTotalsSnapshot,
} from './h1g2TodayTotals.js';
import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';

export interface ModbusTcpConfig {
  host: string;
  port: number;
  unitId: number;
  timeoutMs: number;
}

// modbus-serial is CJS; under NodeNext the default export typings are not constructable.
interface ModbusClient {
  connectTCP(host: string, options: { port: number }): Promise<void>;
  setID(id: number): void;
  setTimeout(timeoutMs: number): void;
  close(callback: () => void): void;
  readHoldingRegisters(
    dataAddress: number,
    length: number
  ): Promise<{ data: number[] }>;
}

const ModbusClientCtor = ModbusRTU as unknown as { new (): ModbusClient };

function assertRegisterData(data: number[] | undefined, label: string): number[] {
  if (!data || data.length === 0) {
    throw new Error(`Invalid Modbus response for ${label}`);
  }
  return data;
}

export class H1G2ModbusClient {
  private readonly client = new ModbusClientCtor();

  constructor(private readonly config: ModbusTcpConfig) {}

  async connect(): Promise<void> {
    await this.client.connectTCP(this.config.host, { port: this.config.port });
    this.client.setID(this.config.unitId);
    this.client.setTimeout(this.config.timeoutMs);
  }

  async close(): Promise<void> {
    this.client.close(() => undefined);
  }

  async readRealtimeSnapshot(sampledAt: string = new Date().toISOString()): Promise<ModbusRealtimeTelemetry> {
    const [blockRes, residualRes, pv1Res, pv2Res, stateRes, workModeRes, remoteEnableRes, remoteActivePowerRes] =
      await Promise.all([
      this.client.readHoldingRegisters(H1_G2_BLOCK_START, H1_G2_BLOCK_LENGTH),
      this.client.readHoldingRegisters(H1_G2_RESIDUAL_ENERGY_REGISTER, 1),
      this.client.readHoldingRegisters(H1_G2_PV1_POWER_REGISTER, 1),
      this.client.readHoldingRegisters(H1_G2_PV2_POWER_REGISTER, 1),
      this.client.readHoldingRegisters(H1_G2_STATE_STATUS1_REGISTER, 3),
      this.client.readHoldingRegisters(H1_G2_WORK_MODE_REGISTER, 1).catch(() => null),
      this.client.readHoldingRegisters(H1_G2_REMOTE_ENABLE_REGISTER, 1).catch(() => null),
      this.client.readHoldingRegisters(H1_G2_REMOTE_ACTIVE_POWER_REGISTER, 1).catch(() => null),
    ]);

    const block = assertRegisterData(blockRes.data, `block ${H1_G2_BLOCK_START}`);
    const residual = assertRegisterData(residualRes.data, 'residual energy')[0];
    const pv1 = assertRegisterData(pv1Res.data, 'pv1 power')[0];
    const pv2 = assertRegisterData(pv2Res.data, 'pv2 power')[0];
    const state = assertRegisterData(stateRes.data, 'inverter state');
    const workMode =
      workModeRes && workModeRes.data?.length
        ? assertRegisterData(workModeRes.data, 'work mode')[0]
        : undefined;
    const remoteEnable =
      remoteEnableRes && remoteEnableRes.data?.length
        ? assertRegisterData(remoteEnableRes.data, 'remote enable')[0]
        : undefined;
    const remoteActivePower =
      remoteActivePowerRes && remoteActivePowerRes.data?.length
        ? assertRegisterData(remoteActivePowerRes.data, 'remote active power')[0]
        : undefined;

    return parseH1G2RealtimeSnapshot({
      block,
      residualEnergyRaw: residual,
      pv1PowerRaw: pv1,
      pv2PowerRaw: pv2,
      stateStatus1: state[0],
      stateStatus3: state[2],
      workModeRaw: workMode,
      remoteEnableRaw: remoteEnable,
      remoteActivePowerRaw: remoteActivePower,
      sampledAt,
    });
  }

  async readTodayTotals(sampledAt: string = new Date().toISOString()): Promise<H1G2TodayTotalsSnapshot> {
    try {
      const blockRes = await this.client.readHoldingRegisters(
        H1_G2_ENERGY_COUNTERS_START,
        H1_G2_ENERGY_COUNTERS_LENGTH
      );
      const block = assertRegisterData(
        blockRes.data,
        `energy counters ${H1_G2_ENERGY_COUNTERS_START}`
      );
      return parseH1G2TodayTotalsFromBlock(block, H1_G2_ENERGY_COUNTERS_START, sampledAt);
    } catch (error) {
      return {
        sampledAt,
        blockStart: H1_G2_ENERGY_COUNTERS_START,
        blockLength: H1_G2_ENERGY_COUNTERS_LENGTH,
        blockRaw: null,
        totals: [],
        readError: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
