/**
 * Regenerate profile fixture expected outputs from register maps.
 * Run: npx tsx scripts/generate-profile-fixtures.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapTodayTotalsSnapshotToFoxShape } from '../src/modbus/profiles/todayTotals.js';
import { getProfile } from '../src/modbus/profiles/registry.js';
import type { ProfileContext, ProfileId } from '../src/modbus/profiles/types.js';
import { createRegisterFixtureReader, type RegisterMaps } from '../src/modbus/profiles/testSupport/registerFixtureReader.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../src/modbus/profiles/fixtures');
mkdirSync(FIXTURES_DIR, { recursive: true });
const SAMPLED_AT = '2026-07-29T12:00:00.000Z';

interface FixtureDefinition {
  id: string;
  profileId: ProfileId;
  context: ProfileContext;
  registers: RegisterMaps;
  includeTodayTotals?: boolean;
}

function setH1G2Block(holding: Record<number, number>): void {
  const base = 31006;
  for (let offset = 0; offset < 21; offset++) {
    holding[base + offset] = 0;
  }
  holding[base] = 2300;
  holding[base + 1] = 50;
  holding[base + 3] = 5000;
  holding[base + 4] = 2400;
  holding[base + 5] = 100;
  holding[base + 6] = 500;
  holding[base + 8] = 1200;
  holding[base + 9] = 100;
  holding[base + 10] = 2880;
  holding[base + 12] = 450;
  holding[base + 13] = 250;
  holding[base + 14] = 512;
  holding[base + 15] = 65526;
  holding[base + 16] = 65536 - 1500;
  holding[base + 17] = 280;
  holding[base + 18] = 75;
}

function setH1G2Scattered(holding: Record<number, number>, input: Record<number, number>): void {
  holding[37632] = 5000;
  holding[39280] = 2000;
  holding[39282] = 1500;
  holding[39063] = 0x04;
  holding[39064] = 0;
  holding[39065] = 0x00;
  holding[41000] = 1;
  holding[44000] = 0;
  holding[44002] = 0;
  input[44004] = 0;
}

function setH1G2BmsBlock(holding: Record<number, number>): void {
  const base = 37609;
  for (let offset = 0; offset < 16; offset++) {
    holding[base + offset] = 0;
  }
  holding[base] = 520;
  holding[base + 1] = 65526;
  holding[base + 8] = 350;
  holding[base + 9] = 200;
  holding[base + 10] = 3300;
  holding[base + 11] = 3100;
  holding[base + 15] = 98;
  holding[39067] = 0x01;
  holding[39068] = 0x02;
  holding[39069] = 0x04;
}

function setH1G2TodayBlock(holding: Record<number, number>): void {
  const base = 32000;
  for (let offset = 0; offset < 24; offset++) {
    holding[base + offset] = 0;
  }
  holding[base + 2] = 150;
  holding[base + 5] = 40;
  holding[base + 8] = 30;
  holding[base + 11] = 20;
  holding[base + 14] = 10;
  holding[base + 23] = 80;
}

function setH1SeriesAuxInput(input: Record<number, number>): void {
  input[11002] = 2000;
  input[11005] = 1500;
  input[11009] = 2300;
  input[11010] = 50;
  input[11014] = 5000;
  input[11015] = 2400;
  input[11016] = 100;
  input[11017] = 500;
  input[11021] = 1200;
  input[11022] = 100;
  input[11023] = 2880;
  input[11024] = 450;
  input[11025] = 250;
  input[11034] = 512;
  input[11035] = 65526;
  input[11036] = 75;
  input[11037] = 5000;
  input[11038] = 280;
  input[11056] = 2;
  input[11071] = 150;
  input[11074] = 40;
  input[11077] = 30;
  input[11080] = 20;
  input[11083] = 10;
  input[11086] = 5;
  input[11089] = 3;
  input[11092] = 80;
  input[41000] = 1;
}

function setH3LegacyHolding(holding: Record<number, number>): void {
  holding[31006] = 2300;
  holding[31007] = 50;
  holding[31008] = 60;
  holding[31015] = 5000;
  holding[31012] = 100;
  holding[31013] = 0;
  holding[31014] = 0;
  holding[31029] = 2880;
  holding[31030] = 0;
  holding[31031] = 0;
  holding[31026] = 1200;
  holding[31027] = 0;
  holding[31028] = 0;
  holding[31002] = 2000;
  holding[31005] = 1500;
  holding[31036] = 65536 - 1500;
  holding[31038] = 75;
  holding[31037] = 280;
  holding[31032] = 450;
  holding[31033] = 250;
  holding[31020] = 512;
  holding[31021] = 65526;
  holding[31041] = 2;
  holding[31123] = 5000;
  holding[41000] = 1;
  holding[44000] = 0;
  holding[44002] = 0;
  setH1G2TodayBlock(holding);
}

function setH3ModernHolding(holding: Record<number, number>): void {
  holding[39123] = 2300;
  holding[39139] = 5000;
  holding[39279] = 0;
  holding[39280] = 2000;
  holding[39281] = 0;
  holding[39282] = 1500;
  holding[39283] = 0;
  holding[39284] = 800;
  holding[39285] = 0;
  holding[39286] = 600;
  holding[39225] = 0;
  holding[39226] = 2880;
  holding[38814] = 0;
  holding[38815] = 12000;
  holding[39237] = 0xffff;
  holding[39238] = 65536 - 1500;
  holding[37609] = 520;
  holding[39228] = 0;
  holding[39229] = 65526;
  holding[37612] = 75;
  holding[37611] = 280;
  holding[39141] = 450;
  holding[39063] = 0x04;
  holding[39064] = 0;
  holding[39065] = 0x00;
  holding[37632] = 5000;
  holding[39142] = 250;
  holding[49203] = 2;
  holding[39603] = 0;
  holding[39604] = 1500;
  holding[39607] = 0;
  holding[39608] = 400;
  holding[39611] = 0;
  holding[39612] = 300;
  holding[39615] = 0;
  holding[39616] = 2000;
  holding[39619] = 0;
  holding[39620] = 1000;
  holding[39631] = 0;
  holding[39632] = 8000;
}

const definitions: FixtureDefinition[] = [
  {
    id: 'h1g2-h1g2_144',
    profileId: 'h1g2',
    context: { connectionType: 'aux', firmwareVariant: 'h1g2_144' },
    includeTodayTotals: true,
    registers: (() => {
      const holding: Record<number, number> = {};
      const input: Record<number, number> = {};
      setH1G2Block(holding);
      setH1G2Scattered(holding, input);
      setH1G2BmsBlock(holding);
      setH1G2TodayBlock(holding);
      return { holding, input };
    })(),
  },
  {
    id: 'h1g2-h1g2Pre144',
    profileId: 'h1g2',
    context: { connectionType: 'aux', firmwareVariant: 'h1g2Pre144' },
    includeTodayTotals: true,
    registers: (() => {
      const holding: Record<number, number> = {};
      const input: Record<number, number> = {};
      setH1G2Block(holding);
      setH1G2Scattered(holding, input);
      setH1G2TodayBlock(holding);
      return { holding, input };
    })(),
  },
  {
    id: 'h1Series-aux',
    profileId: 'h1Series',
    context: { connectionType: 'aux', firmwareVariant: 'default' },
    includeTodayTotals: true,
    registers: (() => {
      const input: Record<number, number> = {};
      setH1SeriesAuxInput(input);
      return { input };
    })(),
  },
  {
    id: 'h1Series-lan',
    profileId: 'h1Series',
    context: { connectionType: 'lan', firmwareVariant: 'default' },
    includeTodayTotals: true,
    registers: (() => {
      const holding: Record<number, number> = {};
      const input: Record<number, number> = {};
      setH1G2Block(holding);
      holding[31002] = 2000;
      holding[31005] = 1500;
      holding[31024] = 75;
      holding[31027] = 2;
      setH1G2Scattered(holding, input);
      setH1G2TodayBlock(holding);
      return { holding, input };
    })(),
  },
  {
    id: 'kh-kh_133',
    profileId: 'kh',
    context: { connectionType: 'aux', firmwareVariant: 'kh_133' },
    includeTodayTotals: true,
    registers: (() => {
      const holding: Record<number, number> = {};
      const input: Record<number, number> = {};
      setH1G2Block(holding);
      holding[39280] = 2000;
      holding[39282] = 1500;
      holding[31016] = 2880;
      holding[39168] = 0;
      holding[39169] = 1200;
      holding[37632] = 5000;
      holding[39063] = 0x04;
      holding[39065] = 0x00;
      holding[31027] = 2;
      holding[41000] = 1;
      holding[44000] = 0;
      holding[44002] = 0;
      input[44004] = 0;
      setH1G2TodayBlock(holding);
      return { holding, input };
    })(),
  },
  {
    id: 'kh-khPre133',
    profileId: 'kh',
    context: { connectionType: 'aux', firmwareVariant: 'khPre133' },
    includeTodayTotals: true,
    registers: (() => {
      const holding: Record<number, number> = {};
      const input: Record<number, number> = {};
      setH1G2Block(holding);
      holding[31045] = 0;
      holding[31046] = 2000;
      holding[31047] = 0;
      holding[31048] = 1500;
      holding[31049] = 0;
      holding[31050] = 1200;
      holding[31053] = 0;
      holding[31054] = 2880;
      holding[37632] = 5000;
      holding[39063] = 0x04;
      holding[39065] = 0x00;
      holding[31027] = 2;
      holding[41000] = 1;
      holding[44000] = 0;
      holding[44002] = 0;
      input[44004] = 0;
      setH1G2TodayBlock(holding);
      return { holding, input };
    })(),
  },
  {
    id: 'h3Legacy-default',
    profileId: 'h3Legacy',
    context: { connectionType: 'aux', firmwareVariant: 'default' },
    includeTodayTotals: true,
    registers: (() => {
      const holding: Record<number, number> = {};
      const input: Record<number, number> = {};
      setH3LegacyHolding(holding);
      input[44004] = 0;
      return { holding, input };
    })(),
  },
  {
    id: 'h3Modern-default',
    profileId: 'h3Modern',
    context: { connectionType: 'aux', firmwareVariant: 'default' },
    includeTodayTotals: true,
    registers: (() => {
      const holding: Record<number, number> = {};
      setH3ModernHolding(holding);
      return { holding };
    })(),
  },
];

for (const definition of definitions) {
  const reader = createRegisterFixtureReader(definition.registers);
  const profile = getProfile(definition.profileId);
  const realtime = await profile.readRealtime(reader, definition.context, SAMPLED_AT);
  const todayTotals = definition.includeTodayTotals
    ? await profile.readTodayTotals(reader, definition.context, SAMPLED_AT)
    : undefined;
  const foxTodayTotals = todayTotals ? mapTodayTotalsSnapshotToFoxShape(todayTotals) : undefined;

  const fixture = {
    id: definition.id,
    profileId: definition.profileId,
    context: definition.context,
    sampledAt: SAMPLED_AT,
    registers: {
      holding: definition.registers.holding,
      input: definition.registers.input,
    },
    expected: {
      realtime,
      ...(todayTotals ? { todayTotals, foxTodayTotals } : {}),
    },
  };

  const path = join(FIXTURES_DIR, `${definition.id}.json`);
  writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`wrote ${path}`);
}

writeFileSync(
  join(FIXTURES_DIR, 'index.txt'),
  `${definitions.map((definition) => `${definition.id}.json`).join('\n')}\n`
);
console.log(`wrote ${join(FIXTURES_DIR, 'index.txt')}`);
