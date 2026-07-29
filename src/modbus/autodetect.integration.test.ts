import { describe, expect, it } from 'vitest';
import { FoxModbusClient } from './client.js';
import {
  fixtureToRegisterMaps,
  loadProfileFixtures,
} from './profiles/testSupport/profileFixtures.js';
import {
  AUTODETECT_CASES,
  buildAutodetectRegisterMaps,
} from './testSupport/autodetectCases.js';
import { getAvailablePort } from './testSupport/getAvailablePort.js';
import { ModbusTcpFixtureServer } from './testSupport/modbusTcpFixtureServer.js';
import { applyModelRegisters } from './testSupport/modelRegisters.js';
import { mapTodayTotalsSnapshotToFoxShape } from './profiles/todayTotals.js';

const UNIT_ID = 247;
const TIMEOUT_MS = 5000;

const fixturesById = new Map(loadProfileFixtures().map((fixture) => [fixture.id, fixture]));

describe('FoxModbusClient autodetect over TCP', { timeout: 25000 }, () => {
  for (const caseEntry of AUTODETECT_CASES) {
    const fixture = fixturesById.get(caseEntry.fixtureId);
    if (!fixture) {
      throw new Error(`Missing profile fixture for autodetect case ${caseEntry.fixtureId}`);
    }

    it(`${caseEntry.fixtureId} autodetects ${caseEntry.modelName}`, async () => {
      const fixtureMaps = fixtureToRegisterMaps(fixture);
      const registers = buildAutodetectRegisterMaps(
        caseEntry,
        fixture.profileId,
        caseEntry.expectedFirmwareVariant,
        fixtureMaps.holding ?? {},
        fixtureMaps.input ?? {}
      );

      const port = await getAvailablePort();
      const server = new ModbusTcpFixtureServer({ port, registers });
      await server.start();

      const client = new FoxModbusClient(
        { host: '127.0.0.1', port, unitId: UNIT_ID, timeoutMs: TIMEOUT_MS },
        { connectionType: caseEntry.connectionType }
      );

      try {
        await client.connect();
        const detected = client.getDetectedInverter();

        expect(detected).toMatchObject({
          modelId: caseEntry.expectedModelId,
          modelName: caseEntry.modelName,
          profileId: fixture.profileId,
          connectionType: caseEntry.connectionType,
          firmwareVariant: caseEntry.expectedFirmwareVariant,
        });
        expect(detected?.managerVersion).toBeDefined();

        const realtime = await client.readRealtimeSnapshot(fixture.sampledAt);
        expect(realtime).toEqual(fixture.expected.realtime);

        if (fixture.expected.todayTotals) {
          const todayTotals = await client.readTodayTotals(fixture.sampledAt);
          const expected = fixture.expected.todayTotals;
          expect(todayTotals.sampledAt).toBe(expected.sampledAt);
          expect(todayTotals.blockStart).toBe(expected.blockStart);
          expect(todayTotals.totals).toEqual(expected.totals);
          if (expected.readError) {
            expect(todayTotals.readError).toBeDefined();
          } else {
            expect(todayTotals.readError).toBeUndefined();
          }
          expect(mapTodayTotalsSnapshotToFoxShape(todayTotals)).toEqual(fixture.expected.foxTodayTotals);
        }
      } finally {
        await client.close();
        await server.close();
      }
    });
  }

  it('rejects an unsupported model string', async () => {
    const port = await getAvailablePort();
    const holding: Record<number, number> = {};
    applyModelRegisters(holding, 'UNKNOWN-1.0', 'plain');

    const server = new ModbusTcpFixtureServer({ port, registers: { holding } });
    await server.start();

    const client = new FoxModbusClient({
      host: '127.0.0.1',
      port,
      unitId: UNIT_ID,
      timeoutMs: TIMEOUT_MS,
    });

    try {
      await expect(client.connect()).rejects.toThrow(/Unsupported inverter model 'UNKNOWN-1.0'/);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
