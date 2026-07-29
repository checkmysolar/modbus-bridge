import ModbusRTU from 'modbus-serial';
import { formatError } from '../../errors.js';
import { planBatchedReads } from './batching.js';
import { isIllegalDataAddressError } from './modbusErrors.js';
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
  writeRegister(address: number, value: number): Promise<{ address: number; value: number }>;
}

const ModbusClientCtor = ModbusRTU as unknown as { new (): ModbusSerialClient };

/** Matches foxess_modbus client retry and inter-read pacing for RS485/LAN adapters. */
const NUM_RETRIES = 3;
const POST_READ_DELAY_MS = 30;
const RETRY_DELAY_MS = 30;

export interface ModbusTcpConfig {
  host: string;
  port: number;
  unitId: number;
  timeoutMs: number;
}

export type ModbusDebugLog = (message: string) => void;

function assertRegisterData(data: number[] | undefined, label: string): number[] {
  if (!data || data.length === 0) {
    throw new Error(`Invalid Modbus response for ${label}`);
  }
  return data;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ModbusReader {
  private readonly client = new ModbusClientCtor();
  /** Serializes all Modbus transactions — Fox RS485 adapters reject concurrent requests. */
  private readChain: Promise<void> = Promise.resolve();
  /** Addresses that returned Modbus exception 2 (illegal data address). */
  private readonly blacklistedAddresses = new Set<string>();

  constructor(
    private readonly config: ModbusTcpConfig,
    private specialRegisters: SpecialRegisterConfig = {
      invalidRanges: [],
      individualReadRanges: [],
    },
    private readonly debugLog?: ModbusDebugLog
  ) {}

  setSpecialRegisters(config: SpecialRegisterConfig): void {
    this.specialRegisters = config;
  }

  async connect(): Promise<void> {
    await this.client.connectTCP(this.config.host, { port: this.config.port });
    this.client.setID(this.config.unitId);
    this.client.setTimeout(this.config.timeoutMs);
  }

  async close(): Promise<void> {
    this.client.close(() => undefined);
  }

  private addressKey(kind: RegisterKind, address: number): string {
    return `${kind}:${address}`;
  }

  isBlacklisted(kind: RegisterKind, address: number): boolean {
    return this.blacklistedAddresses.has(this.addressKey(kind, address));
  }

  private blacklistAddress(kind: RegisterKind, address: number): void {
    const key = this.addressKey(kind, address);
    if (!this.blacklistedAddresses.has(key)) {
      this.blacklistedAddresses.add(key);
      this.debugLog?.(`blacklisted ${kind} ${address} (illegal data address)`);
    }
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.readChain;
    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.readChain = previous.then(() => lock);
    const waitStart = Date.now();
    await previous;
    const waitedMs = Date.now() - waitStart;
    if (waitedMs > 0) {
      this.debugLog?.(`read lock acquired after ${waitedMs}ms wait`);
    }
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private async readRaw(
    kind: RegisterKind,
    address: number,
    length: number
  ): Promise<number[]> {
    return this.withLock(async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < NUM_RETRIES; attempt++) {
        const startedAt = Date.now();
        try {
          const response =
            kind === 'holding'
              ? await this.client.readHoldingRegisters(address, length)
              : await this.client.readInputRegisters(address, length);
          const data = assertRegisterData(response.data, `${kind} ${address}`);
          await sleep(POST_READ_DELAY_MS);
          this.debugLog?.(
            `read ${kind} ${address} len=${length} ok in ${Date.now() - startedAt}ms` +
              (attempt > 0 ? ` (attempt ${attempt + 1}/${NUM_RETRIES})` : '')
          );
          return data;
        } catch (error) {
          lastError = error;
          this.debugLog?.(
            `read ${kind} ${address} len=${length} failed attempt ${attempt + 1}/${NUM_RETRIES}: ${formatError(error)}`
          );
          if (attempt < NUM_RETRIES - 1) {
            await sleep(RETRY_DELAY_MS);
          }
        }
      }
      throw lastError;
    });
  }

  private async readRegistersWithFallback(
    kind: RegisterKind,
    startAddress: number,
    length: number,
    allowMissing: boolean
  ): Promise<(number | undefined)[]> {
    const readableAddresses: number[] = [];
    for (let offset = 0; offset < length; offset++) {
      const address = startAddress + offset;
      if (this.isBlacklisted(kind, address)) {
        if (!allowMissing) {
          throw new Error(`Register ${kind} ${address} is blacklisted (illegal data address)`);
        }
        continue;
      }
      readableAddresses.push(address);
    }

    if (readableAddresses.length === 0) {
      return Array.from({ length }, () => undefined);
    }

    const first = readableAddresses[0]!;
    const last = readableAddresses[readableAddresses.length - 1]!;
    const contiguous =
      readableAddresses.length === last - first + 1 &&
      readableAddresses.every((address, index) => address === first + index);

    if (!contiguous) {
      const values: (number | undefined)[] = Array.from({ length }, () => undefined);
      for (const address of readableAddresses) {
        values[address - startAddress] = (
          await this.readRegistersWithFallback(kind, address, 1, allowMissing)
        )[0];
      }
      return values;
    }

    try {
      const data = await this.readRaw(kind, first, last - first + 1);
      return Array.from({ length }, (_, offset) => {
        const address = startAddress + offset;
        if (this.isBlacklisted(kind, address)) {
          return undefined;
        }
        return data[address - first];
      });
    } catch (error) {
      if (!isIllegalDataAddressError(error) || length === 1) {
        if (length === 1 && isIllegalDataAddressError(error)) {
          this.blacklistAddress(kind, startAddress);
          return [undefined];
        }
        throw error;
      }

      this.debugLog?.(
        `splitting batch ${kind} ${startAddress}+${length} after illegal data address`
      );

      const values: (number | undefined)[] = [];
      for (let offset = 0; offset < length; offset++) {
        const address = startAddress + offset;
        if (this.isBlacklisted(kind, address)) {
          values.push(undefined);
          continue;
        }
        try {
          values.push((await this.readRaw(kind, address, 1))[0]);
        } catch (innerError) {
          if (isIllegalDataAddressError(innerError)) {
            this.blacklistAddress(kind, address);
            values.push(undefined);
          } else {
            throw innerError;
          }
        }
      }
      return values;
    }
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
      this.debugLog?.(
        `individual reads ${kind} ${startAddress}+${length} (special register ranges)`
      );
      const values: number[] = [];
      for (let address = startAddress; address <= endAddress; address++) {
        if (this.specialRegisters.invalidRanges.some((range) => address >= range.start && address <= range.end)) {
          continue;
        }
        const word = (await this.readRegistersWithFallback(kind, address, 1, false))[0];
        if (word === undefined) {
          throw new Error(`Invalid Modbus response for ${kind} ${address}`);
        }
        values.push(word);
      }
      return values;
    }

    const values = await this.readRegistersWithFallback(kind, startAddress, length, false);
    if (values.some((value) => value === undefined)) {
      throw new Error(`Invalid Modbus response for ${kind} ${startAddress}`);
    }
    return values as number[];
  }

  async readScatteredWords(
    kind: RegisterKind,
    addresses: readonly number[],
    optional = false
  ): Promise<Map<number, number | undefined>> {
    const result = new Map<number, number | undefined>();
    const readableAddresses = addresses.filter((address) => {
      if (this.isBlacklisted(kind, address)) {
        if (optional) {
          result.set(address, undefined);
        }
        return !optional;
      }
      return true;
    });

    const plans = planBatchedReads(readableAddresses, this.specialRegisters);
    if (plans.length > 0) {
      this.debugLog?.(
        `scattered ${kind} ${addresses.length} addrs → ${plans.length} batch(es): ` +
          plans.map((plan) => `${plan.startAddress}+${plan.length}`).join(', ')
      );
    }
    for (const plan of plans) {
      const values = await this.readRegistersWithFallback(
        kind,
        plan.startAddress,
        plan.length,
        optional
      );
      for (const address of plan.addresses) {
        const value = values[address - plan.startAddress];
        if (value === undefined && !optional) {
          throw new Error(`Invalid Modbus response for ${kind} ${address}`);
        }
        result.set(address, value);
      }
    }

    return result;
  }

  async readHolding(address: number, length = 1): Promise<number[]> {
    return this.readRegisters('holding', address, length);
  }

  async readInput(address: number, length = 1): Promise<number[]> {
    return this.readRegisters('input', address, length);
  }

  async readHoldingOptional(address: number, length = 1): Promise<number[] | null> {
    try {
      const values = await this.readRegistersWithFallback('holding', address, length, true);
      if (values.some((value) => value === undefined)) {
        return null;
      }
      return values as number[];
    } catch {
      return null;
    }
  }

  async readInputOptional(address: number, length = 1): Promise<number[] | null> {
    try {
      const values = await this.readRegistersWithFallback('input', address, length, true);
      if (values.some((value) => value === undefined)) {
        return null;
      }
      return values as number[];
    } catch {
      return null;
    }
  }

  async readHoldingWord(address: number): Promise<number> {
    if (this.isBlacklisted('holding', address)) {
      throw new Error(`Register holding ${address} is blacklisted (illegal data address)`);
    }
    return (await this.readHolding(address, 1))[0]!;
  }

  async readInputWord(address: number): Promise<number> {
    if (this.isBlacklisted('input', address)) {
      throw new Error(`Register input ${address} is blacklisted (illegal data address)`);
    }
    return (await this.readInput(address, 1))[0]!;
  }

  async readHoldingWordOptional(address: number): Promise<number | undefined> {
    if (this.isBlacklisted('holding', address)) {
      return undefined;
    }
    const data = await this.readHoldingOptional(address, 1);
    return data?.[0];
  }

  async readInputWordOptional(address: number): Promise<number | undefined> {
    if (this.isBlacklisted('input', address)) {
      return undefined;
    }
    const data = await this.readInputOptional(address, 1);
    return data?.[0];
  }

  /** Read a 32-bit value from two holding registers (low address first). */
  async readHoldingInt32(addresses: number[], signed = true): Promise<number> {
    const map = await this.readScatteredWords('holding', addresses, false);
    const values = addresses.map((address) => map.get(address)!);
    return combineRegisters(values, signed);
  }

  async readHoldingInt32Optional(addresses: number[], signed = true): Promise<number | undefined> {
    const map = await this.readScatteredWords('holding', addresses, true);
    if (addresses.some((address) => map.get(address) === undefined)) {
      return undefined;
    }
    const values = addresses.map((address) => map.get(address)!);
    return combineRegisters(values as number[], signed);
  }

  async writeHoldingRegister(address: number, value: number): Promise<void> {
    if (overlapsInvalidRange(this.specialRegisters, address, address)) {
      throw new Error(`Cannot write holding register ${address} (invalid range)`);
    }

    await this.writeRaw(address, value);
  }

  private async writeRaw(address: number, value: number): Promise<void> {
    return this.withLock(async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < NUM_RETRIES; attempt++) {
        const startedAt = Date.now();
        try {
          await this.client.writeRegister(address, value);
          await sleep(POST_READ_DELAY_MS);
          this.debugLog?.(
            `write holding ${address}=${value} ok in ${Date.now() - startedAt}ms` +
              (attempt > 0 ? ` (attempt ${attempt + 1}/${NUM_RETRIES})` : '')
          );
          return;
        } catch (error) {
          lastError = error;
          this.debugLog?.(
            `write holding ${address}=${value} failed attempt ${attempt + 1}/${NUM_RETRIES}: ${formatError(error)}`
          );
          if (attempt < NUM_RETRIES - 1) {
            await sleep(RETRY_DELAY_MS);
          }
        }
      }
      throw lastError;
    });
  }
}
