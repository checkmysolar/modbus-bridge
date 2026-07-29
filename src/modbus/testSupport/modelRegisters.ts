const MODEL_REGISTER_COUNT = 16;
const MODEL_START_ADDRESS = 30000;

/** Encode a model string into 16 holding registers (packed ASCII, high byte first per pair). */
export function encodePackedModelRegisters(modelName: string): number[] {
  const registers = new Array<number>(MODEL_REGISTER_COUNT).fill(0);
  const chars = [...modelName].map((char) => char.charCodeAt(0));

  for (let index = 0; index < MODEL_REGISTER_COUNT; index++) {
    const high = chars[index * 2];
    const low = chars[index * 2 + 1];
    if (high === undefined) {
      break;
    }
    registers[index] = low === undefined ? (high << 8) : (high << 8) | low;
  }

  return registers;
}

/** Encode a model string into 16 holding registers (plain ASCII in low byte). */
export function encodePlainModelRegisters(modelName: string): number[] {
  const registers = new Array<number>(MODEL_REGISTER_COUNT).fill(0);
  for (let index = 0; index < modelName.length && index < MODEL_REGISTER_COUNT; index++) {
    registers[index] = modelName.charCodeAt(index);
  }
  return registers;
}

export function applyModelRegisters(
  holding: Record<number, number>,
  modelName: string,
  encoding: 'packed' | 'plain'
): void {
  const values =
    encoding === 'packed' ? encodePackedModelRegisters(modelName) : encodePlainModelRegisters(modelName);
  for (let offset = 0; offset < values.length; offset++) {
    holding[MODEL_START_ADDRESS + offset] = values[offset]!;
  }
}

/** Hex firmware version register value (major in high byte, minor in low byte). */
export function hexVersionRegister(major: number, minor: number): number {
  return (major << 8) | minor;
}

/** Decimal firmware version register value (major * 100 + minor). */
export function decimalVersionRegister(major: number, minor: number): number {
  return major * 100 + minor;
}
