import { describe, expect, it } from 'vitest';
import {
  getLocalHourBucket,
  getMonthRange,
  getWeekRange,
  listDatesInclusive,
} from './timezone.js';

describe('timezone hour buckets', () => {
  it('buckets UTC timestamps into Europe/London local hours', () => {
    const bucket = getLocalHourBucket('2026-07-15T11:30:00.000Z', 'Europe/London');
    expect(bucket.localDate).toBe('2026-07-15');
    expect(bucket.hour).toBe(12);
  });

  it('maps timestamps during US DST spring-forward in America/New_York', () => {
    const bucket = getLocalHourBucket('2026-03-08T06:30:00.000Z', 'America/New_York');
    expect(bucket.localDate).toBe('2026-03-08');
    expect(bucket.hour).toBe(1);
  });

  it('builds Sunday-start week ranges', () => {
    const range = getWeekRange('2026-04-15', 'Europe/London');
    expect(range.startDate).toBe('2026-04-12');
    expect(range.endDate).toBe('2026-04-18');
  });

  it('lists all days in a month range', () => {
    const range = getMonthRange('2026-02-15', 'Europe/London');
    expect(range.startDate).toBe('2026-02-01');
    expect(range.endDate).toBe('2026-02-28');
    const dates = listDatesInclusive(range.startDate, range.endDate, 'Europe/London');
    expect(dates).toHaveLength(28);
    expect(dates[0]).toBe('2026-02-01');
    expect(dates.at(-1)).toBe('2026-02-28');
  });

  it('uses local date from ISO timestamp near midnight', () => {
    const bucket = getLocalHourBucket('2026-07-15T21:30:00.000Z', 'Europe/London');
    expect(bucket.localDate).toBe('2026-07-15');
    expect(bucket.hour).toBe(22);
  });
});
