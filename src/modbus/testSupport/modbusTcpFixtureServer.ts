import { ServerTCP } from 'modbus-serial';
import type { IServiceVector } from 'modbus-serial/ServerTCP';
import type { RegisterMaps } from '../profiles/testSupport/registerFixtureReader.js';

const ILLEGAL_DATA_ADDRESS = 0x02;

function illegalAddressError(): Error & { modbusErrorCode: number } {
  const error = new Error('Illegal data address (register not supported by device)') as Error & {
    modbusErrorCode: number;
  };
  error.modbusErrorCode = ILLEGAL_DATA_ADDRESS;
  return error;
}

function readWord(map: Map<number, number>, address: number): number {
  const value = map.get(address);
  if (value === undefined) {
    throw illegalAddressError();
  }
  return value;
}

function readBlock(map: Map<number, number>, address: number, length: number): number[] {
  const values: number[] = [];
  for (let offset = 0; offset < length; offset++) {
    values.push(readWord(map, address + offset));
  }
  return values;
}

function callbackStyle<T>(
  run: () => T,
  cb: (err: Error | null, value?: T) => void
): void {
  setImmediate(() => {
    try {
      cb(null, run());
    } catch (error) {
      cb(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export interface ModbusTcpFixtureServerOptions {
  host?: string;
  port: number;
  registers: RegisterMaps;
}

/**
 * Software Modbus TCP slave backed by modbus-serial ServerTCP.
 * Uses callback-style service vectors for compatibility with modbus-serial internals.
 */
export class ModbusTcpFixtureServer {
  private server?: ServerTCP;

  constructor(private readonly options: ModbusTcpFixtureServerOptions) {}

  async start(): Promise<void> {
    const holding = new Map(Object.entries(this.options.registers.holding ?? {}).map(([k, v]) => [Number(k), v]));
    const input = new Map(Object.entries(this.options.registers.input ?? {}).map(([k, v]) => [Number(k), v]));

    const vector: IServiceVector = {
      getHoldingRegister: (address, _unitId, cb) => {
        callbackStyle(() => readWord(holding, address), cb);
      },
      getMultipleHoldingRegisters: (address, length, _unitId, cb) => {
        callbackStyle(() => readBlock(holding, address, length), cb);
      },
      getInputRegister: (address, _unitId, cb) => {
        callbackStyle(() => readWord(input, address), cb);
      },
      getMultipleInputRegisters: (address, length, _unitId, cb) => {
        callbackStyle(() => readBlock(input, address, length), cb);
      },
    };

    const server = new ServerTCP(vector, {
      host: this.options.host ?? '127.0.0.1',
      port: this.options.port,
      unitID: 255,
    });
    this.server = server;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Modbus TCP fixture server failed to start')), 5000);
      server.once('initialized', () => {
        clearTimeout(timeout);
        resolve();
      });
      server.once('serverError', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async close(): Promise<void> {
    if (!this.server) {
      return;
    }
    const server = this.server;
    this.server = undefined;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}
