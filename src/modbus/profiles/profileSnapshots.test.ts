import { describe, expect, it } from 'vitest';
import { getProfile } from './registry.js';
import {
  fixtureToRegisterMaps,
  loadProfileFixtures,
} from './testSupport/profileFixtures.js';
import { createRegisterFixtureReader } from './testSupport/registerFixtureReader.js';
import {
  type FoxShapedTodayTotals,
  type TodayTotalsSnapshot,
  mapTodayTotalsSnapshotToFoxShape,
} from './todayTotals.js';

const fixtures = loadProfileFixtures();

describe('profile register fixtures', () => {
  for (const fixture of fixtures) {
    describe(fixture.id, () => {
      it('maps realtime registers to expected telemetry', async () => {
        const reader = createRegisterFixtureReader(fixtureToRegisterMaps(fixture));
        const profile = getProfile(fixture.profileId);
        const realtime = await profile.readRealtime(reader, fixture.context, fixture.sampledAt);
        expect(realtime).toEqual(fixture.expected.realtime);
      });

      if (fixture.expected.todayTotals) {
        it('maps today-total registers to expected snapshot', async () => {
          const reader = createRegisterFixtureReader(fixtureToRegisterMaps(fixture));
          const profile = getProfile(fixture.profileId);
          const todayTotals = await profile.readTodayTotals(reader, fixture.context, fixture.sampledAt);
          expect(todayTotals).toEqual(fixture.expected.todayTotals);
        });

        it('maps today totals to Fox Cloud shape', async () => {
          const reader = createRegisterFixtureReader(fixtureToRegisterMaps(fixture));
          const profile = getProfile(fixture.profileId);
          const todayTotals = await profile.readTodayTotals(reader, fixture.context, fixture.sampledAt);
          expect(mapTodayTotalsSnapshotToFoxShape(todayTotals)).toEqual(fixture.expected.foxTodayTotals);
        });
      }
    });
  }
});
