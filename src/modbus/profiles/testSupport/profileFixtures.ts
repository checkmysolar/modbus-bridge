import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import type { FoxShapedTodayTotals, TodayTotalsSnapshot } from '../todayTotals.js';
import type { ProfileContext, ProfileId } from '../types.js';
import type { RegisterMaps } from './registerFixtureReader.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');

export interface ProfileFixture {
  id: string;
  profileId: ProfileId;
  context: ProfileContext;
  sampledAt: string;
  registers: {
    holding?: Record<string, number>;
    input?: Record<string, number>;
  };
  expected: {
    realtime: ModbusRealtimeTelemetry;
    todayTotals?: TodayTotalsSnapshot;
    foxTodayTotals?: FoxShapedTodayTotals | null;
  };
}

export function fixtureToRegisterMaps(fixture: ProfileFixture): RegisterMaps {
  return {
    holding: Object.fromEntries(
      Object.entries(fixture.registers.holding ?? {}).map(([address, value]) => [Number(address), value])
    ),
    input: Object.fromEntries(
      Object.entries(fixture.registers.input ?? {}).map(([address, value]) => [Number(address), value])
    ),
  };
}

export function loadProfileFixtures(): ProfileFixture[] {
  const indexPath = join(FIXTURES_DIR, 'index.txt');
  const files = readFileSync(indexPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return files.map((file) => {
    const raw = readFileSync(join(FIXTURES_DIR, file), 'utf8');
    return JSON.parse(raw) as ProfileFixture;
  });
}
