import { DateTime } from 'luxon';

export function assertValidTimezone(timezone: string): void {
  const probe = DateTime.now().setZone(timezone);
  if (!probe.isValid) {
    throw new Error(`Invalid SITE_TIMEZONE: ${timezone}`);
  }
}

export function getLocalHourBucket(
  isoTimestamp: string,
  timezone: string
): { localDate: string; hour: number } {
  const dt = DateTime.fromISO(isoTimestamp, { zone: timezone });
  if (!dt.isValid) {
    throw new Error(`Invalid timestamp ${isoTimestamp} for timezone ${timezone}`);
  }
  return {
    localDate: dt.toFormat('yyyy-MM-dd'),
    hour: dt.hour,
  };
}

export function getLocalDate(isoTimestamp: string, timezone: string): string {
  return getLocalHourBucket(isoTimestamp, timezone).localDate;
}

export function getHourStart(
  localDate: string,
  hour: number,
  timezone: string
): DateTime {
  const dt = DateTime.fromISO(`${localDate}T00:00:00`, { zone: timezone }).plus({ hours: hour });
  if (!dt.isValid) {
    throw new Error(`Invalid local hour bucket ${localDate} hour ${hour}`);
  }
  return dt;
}

export function getNextHourStart(
  localDate: string,
  hour: number,
  timezone: string
): DateTime {
  return getHourStart(localDate, hour, timezone).plus({ hours: 1 });
}

export function formatWeekDateLabel(localDate: string, timezone: string): string {
  const dt = DateTime.fromISO(`${localDate}T12:00:00`, { zone: timezone });
  return dt.setLocale('en-US').toFormat('LLL d');
}

export function formatMonthYearLabel(year: number, month: number): string {
  const dt = DateTime.fromObject({ year, month, day: 1 }, { zone: 'utc' });
  return dt.setLocale('en-US').toFormat('LLL yyyy');
}

export function getWeekRange(
  anchorDate: string,
  timezone: string
): { startDate: string; endDate: string } {
  const anchor = DateTime.fromISO(`${anchorDate}T12:00:00`, { zone: timezone });
  const start = anchor.minus({ days: anchor.weekday % 7 });
  const end = start.plus({ days: 6 });
  return {
    startDate: start.toFormat('yyyy-MM-dd'),
    endDate: end.toFormat('yyyy-MM-dd'),
  };
}

export function getMonthRange(
  anchorDate: string,
  timezone: string
): { startDate: string; endDate: string } {
  const anchor = DateTime.fromISO(`${anchorDate}T12:00:00`, { zone: timezone });
  const start = anchor.startOf('month');
  const end = anchor.endOf('month');
  return {
    startDate: start.toFormat('yyyy-MM-dd'),
    endDate: end.toFormat('yyyy-MM-dd'),
  };
}

export function listDatesInclusive(startDate: string, endDate: string, timezone: string): string[] {
  const dates: string[] = [];
  let current = DateTime.fromISO(`${startDate}T12:00:00`, { zone: timezone });
  const end = DateTime.fromISO(`${endDate}T12:00:00`, { zone: timezone });
  while (current <= end) {
    dates.push(current.toFormat('yyyy-MM-dd'));
    current = current.plus({ days: 1 });
  }
  return dates;
}
