import type { ModbusReader } from '../../core/reader.js';
import { combineRegisters } from '../../core/scaling.js';

export interface RegisterMaps {
  holding?: Record<number, number>;
  input?: Record<number, number>;
}

function parseRegisterMaps(maps: RegisterMaps): {
  holding: Map<number, number>;
  input: Map<number, number>;
} {
  return {
    holding: new Map(Object.entries(maps.holding ?? {}).map(([address, value]) => [Number(address), value])),
    input: new Map(Object.entries(maps.input ?? {}).map(([address, value]) => [Number(address), value])),
  };
}

/**
 * In-memory ModbusReader for profile fixture tests — no TCP connection required.
 */
export function createRegisterFixtureReader(maps: RegisterMaps): ModbusReader {
  const { holding, input } = parseRegisterMaps(maps);

  const getMap = (kind: 'holding' | 'input'): Map<number, number> =>
    kind === 'holding' ? holding : input;

  const requireWord = (kind: 'holding' | 'input', address: number): number => {
    const value = getMap(kind).get(address);
    if (value === undefined) {
      throw new Error(`Missing ${kind} register ${address} in fixture`);
    }
    return value;
  };

  return {
    readHolding: async (address: number, length: number) => {
      const values: number[] = [];
      for (let offset = 0; offset < length; offset++) {
        values.push(requireWord('holding', address + offset));
      }
      return values;
    },
    readInput: async (address: number, length: number) => {
      const values: number[] = [];
      for (let offset = 0; offset < length; offset++) {
        values.push(requireWord('input', address + offset));
      }
      return values;
    },
    readScatteredWords: async (kind: 'holding' | 'input', addresses: readonly number[], optional = false) => {
      const map = getMap(kind);
      const result = new Map<number, number | undefined>();
      for (const address of addresses) {
        const value = map.get(address);
        if (value === undefined && !optional) {
          throw new Error(`Missing ${kind} register ${address} in fixture`);
        }
        result.set(address, value);
      }
      return result;
    },
    readHoldingInt32: async (addresses: number[], signed = true) => {
      const values = addresses.map((address) => requireWord('holding', address));
      return combineRegisters(values, signed);
    },
  } as unknown as ModbusReader;
}
