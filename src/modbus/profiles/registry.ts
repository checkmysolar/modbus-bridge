import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import type { ModbusReader } from '../core/reader.js';
import { getSpecialRegistersForProfile } from '../core/specialRegisters.js';
import { readH1G2Realtime, readH1G2TodayTotals } from './h1g2.js';
import { readH1SeriesRealtime, readH1SeriesTodayTotals } from './h1Series.js';
import { readH3LegacyRealtime, readH3LegacyTodayTotals } from './h3Legacy.js';
import { readH3ModernRealtime, readH3ModernTodayTotals } from './h3Modern.js';
import { readKhRealtime, readKhTodayTotals } from './kh.js';
import type { TodayTotalsSnapshot } from './todayTotals.js';
import type { DetectedInverter, ProfileContext, ProfileId } from './types.js';

export interface ModbusProfile {
  id: ProfileId;
  readRealtime(reader: ModbusReader, context: ProfileContext, sampledAt: string): Promise<ModbusRealtimeTelemetry>;
  readTodayTotals(reader: ModbusReader, context: ProfileContext, sampledAt: string): Promise<TodayTotalsSnapshot>;
}

function createProfile(
  id: ProfileId,
  readRealtime: ModbusProfile['readRealtime'],
  readTodayTotals: ModbusProfile['readTodayTotals']
): ModbusProfile {
  return { id, readRealtime, readTodayTotals };
}

export const PROFILES: Record<ProfileId, ModbusProfile> = {
  h1g2: createProfile('h1g2', readH1G2Realtime, readH1G2TodayTotals),
  h1Series: createProfile('h1Series', readH1SeriesRealtime, readH1SeriesTodayTotals),
  kh: createProfile('kh', readKhRealtime, readKhTodayTotals),
  h3Legacy: createProfile('h3Legacy', readH3LegacyRealtime, readH3LegacyTodayTotals),
  h3Modern: createProfile('h3Modern', readH3ModernRealtime, readH3ModernTodayTotals),
};

export function getProfile(profileId: ProfileId): ModbusProfile {
  const profile = PROFILES[profileId];
  if (!profile) {
    throw new Error(`Unknown inverter profile: ${profileId}`);
  }
  return profile;
}

export function detectedInverterToContext(detected: DetectedInverter): ProfileContext {
  return {
    connectionType: detected.connectionType,
    firmwareVariant: detected.firmwareVariant,
    modelName: detected.modelName,
  };
}

export function getReaderSpecialRegisters(profileId: ProfileId) {
  return getSpecialRegistersForProfile(profileId);
}
