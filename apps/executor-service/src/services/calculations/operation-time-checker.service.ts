/**
 * @usage This service is lightweight and can be instantiated directly within pipeline steps
 * when broker operation hours validation is required.
 */
import { DateTime } from 'luxon';
import { OperationHoursConfig } from '@dal';
import { LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';

/**
 * Pre-parsed schedule data for high-performance comparisons
 */
interface ParsedSchedule {
  startDay: number; // 0-6
  endDay: number; // 0-6
  startMinutes: number; // minutes since midnight (0-1439)
  endMinutes: number; // minutes since midnight (0-1439)
  isOvernight: boolean;
}

/**
 * Purpose: Validate if the current time is within broker operation hours
 * Exports: OperationTimeCheckerService class
 * Core Flow: Parses schedule string → Converts "Now" to target timezone → Validates against weekly and daily constraints
 */
export class OperationTimeCheckerService {
  private static readonly SCHEDULE_PATTERN =
    /^(\w{3})-(\w{3}):\s*(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})$/i;

  private readonly dayMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };

  private scheduleCache = new Map<string, ParsedSchedule>();

  constructor(private logger: LoggerInstance) {}

  /**
   * Check if current time is within configured operation hours
   * @param config - Operation hours configuration (timezone and schedule)
   * @param overrideNow - (Optional) date to check instead of current time (useful for tests)
   */
  isInside(config: OperationHoursConfig, overrideNow?: Date): boolean {
    try {
      const { timezone, schedule } = config;
      const parsed = this.getOrParse(schedule);
      if (!parsed) return true; // Safety fallback

      const now = overrideNow
        ? DateTime.fromJSDate(overrideNow)
        : DateTime.now();
      const nowInTz = now.setZone(timezone);

      if (!nowInTz.isValid) {
        throw new Error(`Invalid timezone: ${timezone}`);
      }

      // 1. Weekly Check
      // luxon uses 1-7 (Mon-Sun), our mapping is 0-6 (Sun-Sat)
      const currentDay = nowInTz.weekday === 7 ? 0 : nowInTz.weekday;
      if (!this.isDayInRange(currentDay, parsed.startDay, parsed.endDay)) {
        return false;
      }

      // 2. Daily Check using integer minutes (very fast)
      const currentMinutes = nowInTz.hour * 60 + nowInTz.minute;

      if (parsed.isOvernight) {
        // Case: "18:05 - 16:59" (Daily break between 17:00 - 18:00)

        // If it's the start day, only allow AFTER startTime
        if (currentDay === parsed.startDay) {
          return currentMinutes >= parsed.startMinutes;
        }

        // If it's the end day, only allow BEFORE endTime
        if (currentDay === parsed.endDay) {
          return currentMinutes <= parsed.endMinutes;
        }

        // If it's a middle day (Mon-Thu), exclude the break
        // Valid if >= startTime OR <= endTime
        return (
          currentMinutes >= parsed.startMinutes ||
          currentMinutes <= parsed.endMinutes
        );
      } else {
        // Case: "09:00 - 17:00" (Normal intraday)
        return (
          currentMinutes >= parsed.startMinutes &&
          currentMinutes <= parsed.endMinutes
        );
      }
    } catch (error) {
      this.logger.error({ error, config }, 'Error checking operation hours');
      return true; // Safety fallback
    }
  }

  /**
   * Get parsed schedule from cache or parse it if not found
   */
  private getOrParse(schedule: string): ParsedSchedule | null {
    const cached = this.scheduleCache.get(schedule);
    if (cached) return cached;

    const match = schedule.match(OperationTimeCheckerService.SCHEDULE_PATTERN);
    if (!match) {
      this.logger.error(
        { schedule },
        'Invalid schedule format. Expected "Day-Day: HH:mm - HH:mm"',
      );
      return null;
    }

    const [, startDayStr, endDayStr, startH, startM, endH, endM] = match;
    const startDay = this.dayMap[startDayStr.toLowerCase()];
    const endDay = this.dayMap[endDayStr.toLowerCase()];

    if (startDay === undefined || endDay === undefined) {
      this.logger.error({ startDayStr, endDayStr }, 'Invalid day in schedule');
      return null;
    }

    const startMinutes = parseInt(startH, 10) * 60 + parseInt(startM, 10);
    const endMinutes = parseInt(endH, 10) * 60 + parseInt(endM, 10);

    const parsed: ParsedSchedule = {
      startDay,
      endDay,
      startMinutes,
      endMinutes,
      isOvernight: startMinutes > endMinutes,
    };

    this.scheduleCache.set(schedule, parsed);
    return parsed;
  }

  /**
   * Helper to check if a day is within a range (circular)
   */
  private isDayInRange(day: number, start: number, end: number): boolean {
    if (start <= end) {
      return day >= start && day <= end;
    } else {
      // Circular range (e.g., Fri-Sun)
      return day >= start || day <= end;
    }
  }
}
