import {
  type SpecialRegisterConfig,
  requiresIndividualRead,
} from './specialRegisters.js';

/** foxess_modbus default max registers per Modbus read. */
export const DEFAULT_MAX_READ = 20;

export interface BatchReadPlan {
  startAddress: number;
  length: number;
  addresses: number[];
}

function isInvalidAddress(address: number, config: SpecialRegisterConfig): boolean {
  return config.invalidRanges.some((range) => address >= range.start && address <= range.end);
}

export function planBatchedReads(
  addresses: readonly number[],
  config: SpecialRegisterConfig,
  maxRead = DEFAULT_MAX_READ
): BatchReadPlan[] {
  const readable = [...new Set(addresses)]
    .filter((address) => !isInvalidAddress(address, config))
    .sort((left, right) => left - right);

  const plans: BatchReadPlan[] = [];
  let index = 0;

  while (index < readable.length) {
    const address = readable[index]!;
    if (requiresIndividualRead(config, address)) {
      plans.push({ startAddress: address, length: 1, addresses: [address] });
      index += 1;
      continue;
    }

    const run: number[] = [address];
    index += 1;
    while (index < readable.length) {
      const next = readable[index]!;
      const previous = run[run.length - 1]!;
      if (next !== previous + 1 || requiresIndividualRead(config, next) || run.length >= maxRead) {
        break;
      }
      run.push(next);
      index += 1;
    }

    plans.push({
      startAddress: run[0]!,
      length: run.length,
      addresses: run,
    });
  }

  return plans;
}
