import { describe, expect, it } from 'vitest';
import { getReportableHoursForDay, isReportableHourRow } from './buildReport.js';
import type { DayHourlyRow } from './types.js';

function hourRow(overrides: Partial<DayHourlyRow> = {}): DayHourlyRow {
  return {
    localDate: '2026-07-21',
    hour: 15,
    pvKwh: 1.2,
    loadsKwh: 0.4,
    feedinKwh: 0.1,
    gridConsumptionKwh: 0,
    batChargeKwh: 0,
    batDischargeKwh: 0.2,
    socAvg: 60,
    sampleCount: 12,
    finalized: true,
    updatedAt: '2026-07-21T15:00:00.000Z',
    ...overrides,
  };
}

describe('reportable hour rows', () => {
  it('includes only finalized hours that were sampled', () => {
    expect(isReportableHourRow(hourRow())).toBe(true);
    expect(isReportableHourRow(hourRow({ finalized: false }))).toBe(false);
    expect(isReportableHourRow(hourRow({ sampleCount: 0 }))).toBe(false);
  });

  it('sorts reportable hours chronologically', () => {
    const rows = getReportableHoursForDay([
      hourRow({ hour: 16 }),
      hourRow({ hour: 15, finalized: false }),
      hourRow({ hour: 14 }),
    ]);

    expect(rows.map((row) => row.hour)).toEqual([14, 16]);
  });
});
