import { describe, expect, it } from 'vitest';
import { ModbusReader } from './core/reader.js';
import { getProfile, getReaderSpecialRegisters } from './profiles/registry.js';
import {
  fixtureToRegisterMaps,
  loadProfileFixtures,
  type ProfileFixture,
} from './profiles/testSupport/profileFixtures.js';
import { mapTodayTotalsSnapshotToFoxShape } from './profiles/todayTotals.js';
import { getAvailablePort } from './testSupport/getAvailablePort.js';
import { ModbusTcpFixtureServer } from './testSupport/modbusTcpFixtureServer.js';

const UNIT_ID = 247;
const TIMEOUT_MS = 5000;

const fixtures = loadProfileFixtures();

async function withTcpFixture<T>(
  fixture: ProfileFixture,
  run: (port: number) => Promise<T>
): Promise<T> {
  const port = await getAvailablePort();
  const server = new ModbusTcpFixtureServer({
    port,
    registers: fixtureToRegisterMaps(fixture),
  });
  await server.start();
  try {
    return await run(port);
  } finally {
    await server.close();
  }
}

async function connectReader(port: number, profileId: ProfileFixture['profileId']): Promise<ModbusReader> {
  const reader = new ModbusReader(
    { host: '127.0.0.1', port, unitId: UNIT_ID, timeoutMs: TIMEOUT_MS },
    getReaderSpecialRegisters(profileId)
  );
  await reader.connect();
  return reader;
}

describe('Modbus TCP integration (ServerTCP)', { timeout: 20000 }, () => {
  it('reads a contiguous holding block over TCP', async () => {
    const fixture = fixtures.find((entry) => entry.id === 'h1g2-h1g2_144')!;
    await withTcpFixture(fixture, async (port) => {
      const reader = await connectReader(port, fixture.profileId);
      try {
        const block = await reader.readHolding(31006, 3);
        expect(block).toEqual([2300, 50, 0]);
      } finally {
        await reader.close();
      }
    });
  });

  it('reads scattered holding and input registers over TCP', async () => {
    const fixture = fixtures.find((entry) => entry.id === 'h1g2-h1g2_144')!;
    await withTcpFixture(fixture, async (port) => {
      const reader = await connectReader(port, fixture.profileId);
      try {
        const holding = await reader.readScatteredWords('holding', [39280, 39282], false);
        const input = await reader.readScatteredWords('input', [44004], false);
        expect(holding.get(39280)).toBe(2000);
        expect(holding.get(39282)).toBe(1500);
        expect(input.get(44004)).toBe(0);
      } finally {
        await reader.close();
      }
    });
  });

  it('blacklists optional registers that return illegal data address', async () => {
    const port = await getAvailablePort();
    const server = new ModbusTcpFixtureServer({
      port,
      registers: {
        holding: { 31006: 2300 },
      },
    });
    await server.start();
    const reader = await connectReader(port, 'h1g2');
    try {
      await expect(reader.readHoldingWordOptional(41000)).resolves.toBeUndefined();
      expect(reader.isBlacklisted('holding', 41000)).toBe(true);
      await expect(reader.readHoldingWordOptional(41000)).resolves.toBeUndefined();
    } finally {
      await reader.close();
      await server.close();
    }
  });

  for (const fixture of fixtures) {
    it(`${fixture.id} profile realtime over TCP`, async () => {
      await withTcpFixture(fixture, async (port) => {
        const reader = await connectReader(port, fixture.profileId);
        try {
          const profile = getProfile(fixture.profileId);
          const realtime = await profile.readRealtime(reader, fixture.context, fixture.sampledAt);
          expect(realtime).toEqual(fixture.expected.realtime);
        } finally {
          await reader.close();
        }
      });
    });

    if (fixture.expected.todayTotals) {
      it(`${fixture.id} profile today totals over TCP`, async () => {
        await withTcpFixture(fixture, async (port) => {
          const reader = await connectReader(port, fixture.profileId);
          try {
            const profile = getProfile(fixture.profileId);
            const todayTotals = await profile.readTodayTotals(reader, fixture.context, fixture.sampledAt);
            const expected = fixture.expected.todayTotals!;
            expect(todayTotals.sampledAt).toBe(expected.sampledAt);
            expect(todayTotals.blockStart).toBe(expected.blockStart);
            expect(todayTotals.totals).toEqual(expected.totals);
            if (expected.readError) {
              expect(todayTotals.readError).toBeDefined();
            } else {
              expect(todayTotals.readError).toBeUndefined();
            }
            expect(mapTodayTotalsSnapshotToFoxShape(todayTotals)).toEqual(fixture.expected.foxTodayTotals);
          } finally {
            await reader.close();
          }
        });
      });
    }
  }
});
