import { describe, expect, it, vi } from 'vitest';
import {
  WORK_MODE_BACKUP,
  WORK_MODE_FEED_IN,
  WORK_MODE_FORCE_CHARGE,
  WORK_MODE_FORCE_DISCHARGE,
  WORK_MODE_PEAK_SHAVING,
  WORK_MODE_SELF_USE,
} from '@checkmysolar/modbus-telemetry/workMode';
import type { ModbusReader } from './core/reader.js';
import {
  H1_G2_REMOTE_ACTIVE_POWER_REGISTER,
  H1_G2_REMOTE_ENABLE_REGISTER,
  H1_G2_WORK_MODE_REGISTER,
} from './profiles/h1g2.js';
import type { DetectedInverter } from './profiles/types.js';
import {
  DEFAULT_FORCE_POWER_W,
  DEFAULT_REMOTE_TIMEOUT_S,
  WorkModeWriteError,
  writeWorkMode,
} from './workModeWrite.js';

function createMockReader() {
  const writes: Array<{ address: number; value: number }> = [];
  const reader = {
    writeHoldingRegister: vi.fn(async (address: number, value: number) => {
      writes.push({ address, value });
    }),
  } as unknown as ModbusReader;
  return { reader, writes };
}

function detected(overrides: Partial<DetectedInverter> = {}): DetectedInverter {
  return {
    modelId: 'H1_G2',
    modelName: 'H1-5.0-E',
    profileId: 'h1g2',
    connectionType: 'lan',
    firmwareVariant: 'default',
    ...overrides,
  };
}

describe('writeWorkMode', () => {
  it('writes standard H1 work mode after disabling remote control', async () => {
    const { reader, writes } = createMockReader();

    await expect(writeWorkMode(reader, detected(), WORK_MODE_FEED_IN)).resolves.toEqual({
      workMode: WORK_MODE_FEED_IN,
    });

    expect(writes).toEqual([
      { address: H1_G2_REMOTE_ENABLE_REGISTER, value: 0 },
      { address: H1_G2_WORK_MODE_REGISTER, value: 1 },
    ]);
  });

  it('writes peak shaving to register value 4 on H1 profiles', async () => {
    const { reader, writes } = createMockReader();

    await writeWorkMode(reader, detected({ profileId: 'kh' }), WORK_MODE_PEAK_SHAVING);

    expect(writes.at(-1)).toEqual({ address: H1_G2_WORK_MODE_REGISTER, value: 4 });
  });

  it('writes standard H3 modern work mode to register 49203', async () => {
    const { reader, writes } = createMockReader();

    await writeWorkMode(reader, detected({ profileId: 'h3Modern' }), WORK_MODE_BACKUP);

    expect(writes).toEqual([
      { address: 46001, value: 0 },
      { address: 49203, value: 3 },
    ]);
  });

  it('writes force charge via remote control on H1 profiles', async () => {
    const { reader, writes } = createMockReader();

    await writeWorkMode(reader, detected(), WORK_MODE_FORCE_CHARGE);

    expect(writes).toEqual([
      { address: H1_G2_REMOTE_ENABLE_REGISTER, value: 0 },
      { address: H1_G2_REMOTE_ENABLE_REGISTER, value: 1 },
      { address: 44001, value: DEFAULT_REMOTE_TIMEOUT_S },
      {
        address: H1_G2_REMOTE_ACTIVE_POWER_REGISTER,
        value: 65536 - DEFAULT_FORCE_POWER_W,
      },
    ]);
  });

  it('writes force discharge via H3 modern remote control registers', async () => {
    const { reader, writes } = createMockReader();

    await writeWorkMode(reader, detected({ profileId: 'h3Modern' }), WORK_MODE_FORCE_DISCHARGE);

    expect(writes).toEqual([
      { address: 46001, value: 0 },
      { address: 46001, value: 1 },
      { address: 46002, value: DEFAULT_REMOTE_TIMEOUT_S },
      { address: 46004, value: DEFAULT_FORCE_POWER_W },
    ]);
  });

  it('rejects unsupported H1 AUX profiles', async () => {
    const { reader } = createMockReader();

    await expect(
      writeWorkMode(reader, detected({ profileId: 'h1Series', connectionType: 'aux' }), WORK_MODE_SELF_USE)
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED',
    } satisfies Partial<WorkModeWriteError>);
  });

  it('rejects invalid work mode codes', async () => {
    const { reader } = createMockReader();

    await expect(writeWorkMode(reader, detected(), 9)).rejects.toMatchObject({
      code: 'INVALID_CODE',
    } satisfies Partial<WorkModeWriteError>);
  });
});
