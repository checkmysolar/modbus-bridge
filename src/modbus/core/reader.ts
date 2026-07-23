import ModbusRTU from 'modbus-serial';
import { combineRegisters } from './scaling.js';
import {
  type SpecialRegisterConfig,
  overlapsInvalidRange,
  requiresIndividualRead,
} from './specialRegisters.js';

export type RegisterKind = 'holding' | 'input';

// modbus-serial is CJS; under NodeNext the default export typings are not constructable.
interface ModbusSerialClient {
  connectTCP(host: string, options: { port: number }): Promise<void>;
  setID(id: number): void;
  setTimeout(timeoutMs: number): void;
  close(callback: () => void): void;
  readHoldingRegisters(dataAddress: number, length: number): Promise<{ data: number[] }>;
  readInputRegisters(dataAddress: number, length: number): Promise<{ data: number[] }>;
}

const ModbusClientCtor = ModbusRTU as unknown as { new (): ModbusSerialClient };

export interface ModbusTcpConfig {
  host: string;
  port: number;
  unitId: number;
  timeoutMs: number;
}

function assertRegisterData(data: number[] | undefined, label: string): number[] {
  if (!data || data.length === 0) {
    throw new Error(`Invalid Modbus response for ${label}`);
  }
  return data;
}

export class ModbusReader {
  private readonly client = new ModbusClientCtor();

  constructor(
    private readonly config: ModbusTcpConfig,
    private readonly specialRegisters: SpecialRegisterConfig = {
      invalidRanges: [],
      individualReadRanges: [],
    }
  ) {}

  async connect(): Promise<void> {
    await this.client.connectTCP(this.config.host, { port: this.config.port });
    this.client.setID(this.config.unitId);
    this.client.setTimeout(this.config.timeoutMs);
  }

  async close(): Promise<void> {
    this.client.close(() => undefined);
  }

  private async readRaw(
    kind: RegisterKind,
    address: number,
    length: number
  ): Promise<number[]> {
    const response =
      kind === 'holding'
        ? await this.client.readHoldingRegisters(address, length)
        : await this.client.readInputRegisters(address, length);
    return assertRegisterData(response.data, `${kind} ${address}`);
  }

  async readRegisters(kind: RegisterKind, startAddress: number, length: number): Promise<number[]> {
    if (length <= 0) {
      return [];
    }

    const endAddress = startAddress + length - 1;
    if (
      overlapsInvalidRange(this.specialRegisters, startAddress, endAddress) ||
      Array.from({ length }, (_, index) => startAddress + index).some((address) =>
        requiresIndividualRead(this.specialRegisters, address)
      )
    ) {
      const values: number[] = [];
      for (let address = startAddress; address <= endAddress; address++) {
        if (this.specialRegisters.invalidRanges.some((range) => address >= range.start && address <= range.end)) {
          continue;
        }
        values.push((await this.readRaw(kind, address, 1))[0]!);
      }
      return values;
    }

    return this.readRaw(kind, startAddress, length);
  }

  async readHolding(address: number, length = 1): Promise<number[]> {
    return this.readRegisters('holding', address, length);
  }

  async readInput(address: number, length = 1): Promise<number[]> {
    return this.readRegisters('input', address, length);
  }

  async readHoldingOptional(address: number, length = 1): Promise<number[] | null> {
    try {
      return await this.readHolding(address, length);
    } catch {
      return null;
    }
  }

  async readInputOptional(address: number, length = 1): Promise<number[] | null> {
    try {
      return await this.readInput(address, length);
    } catch {
      return null;
    }
  }

  async readHoldingWord(address: number): Promise<number> {
    return (await this.readHolding(address, 1))[0]!;
  }

  async readInputWord(address: number): Promise<number> {
    return (await this.readInput(address, 1))[0]!;
  }

  async readHoldingWordOptional(address: number): Promise<number | undefined> {
    const data = await this.readHoldingOptional(address, 1);
    return data?.[0];
  }

  async readInputWordOptional(address: number): Promise<number | undefined> {
    const data = await this.readInputOptional(address, 1);
    return data?.[0];
  }

  /** Read a 32-bit value from two holding registers (low address first). */
  async readHoldingInt32(addresses: number[], signed = true): Promise<number> {
    const values: number[] = [];
    for (const address of addresses) {
      values.push(await this.readHoldingWord(address));
    }
    return combineRegisters(values, signed);
  }

  async readHoldingInt32Optional(addresses: number[], signed = true): Promise<number | undefined> {
    try {
      return await this.readHoldingInt32(addresses, signed);
    } catch {
      return undefined;
    }
  }
}
