export interface SlaPolicyConfig {
  targetResponseHours: number;
  targetResolutionHours: number;
  businessHoursOnly: boolean;
  businessStartTime: string; // "08:00:00"
  businessEndTime: string;   // "18:00:00"
  workingDays: number[];     // [0, 1, 2, 3, 4] for Sun-Thu
}

export interface SlaInstanceData {
  id: string;
  ticketId: string;
  responseTargetAt: string;
  responseActualAt?: string | null;
  responseBreached: boolean;
  resolutionTargetAt: string;
  resolutionActualAt?: string | null;
  resolutionBreached: boolean;
  isPaused: boolean;
  lastPausedAt?: string | null;
  totalPausedMinutes: number;
  pauseReason?: string | null;
}

/**
 * Calculates future target date given start time, target hours, and business calendar rules.
 */
export function calculateSlaTargetDate(
  startDate: Date,
  targetHours: number,
  config: SlaPolicyConfig
): Date {
  if (!config.businessHoursOnly) {
    return new Date(startDate.getTime() + targetHours * 3600 * 1000);
  }

  const [startH = 8, startM = 0] = config.businessStartTime.split(":").map(Number);
  const [endH = 18, endM = 0] = config.businessEndTime.split(":").map(Number);
  const dailyWorkMinutes = (endH * 60 + endM) - (startH * 60 + startM);

  let remainingMinutes = targetHours * 60;
  let current = new Date(startDate);

  // If start is outside working day or after hours, advance to next start of day
  while (remainingMinutes > 0) {
    const dayOfWeek = current.getDay();
    const isWorkDay = config.workingDays.includes(dayOfWeek);

    if (!isWorkDay) {
      // Advance to next day at businessStartTime
      current.setDate(current.getDate() + 1);
      current.setHours(startH, startM, 0, 0);
      continue;
    }

    const currentMinutes = current.getHours() * 60 + current.getMinutes();
    const dayStartMinutes = startH * 60 + startM;
    const dayEndMinutes = endH * 60 + endM;

    if (currentMinutes < dayStartMinutes) {
      current.setHours(startH, startM, 0, 0);
    } else if (currentMinutes >= dayEndMinutes) {
      current.setDate(current.getDate() + 1);
      current.setHours(startH, startM, 0, 0);
      continue;
    }

    const minutesLeftToday = (endH * 60 + endM) - (current.getHours() * 60 + current.getMinutes());
    if (remainingMinutes <= minutesLeftToday) {
      current.setMinutes(current.getMinutes() + remainingMinutes);
      remainingMinutes = 0;
    } else {
      remainingMinutes -= minutesLeftToday;
      current.setDate(current.getDate() + 1);
      current.setHours(startH, startM, 0, 0);
    }
  }

  return current;
}

/**
 * Pauses the SLA clock (e.g. while awaiting customer quote approval or customer payment)
 */
export function pauseSlaClock(
  instance: SlaInstanceData,
  reason: string,
  now: Date = new Date()
): SlaInstanceData {
  if (instance.isPaused) {
    return instance;
  }

  return {
    ...instance,
    isPaused: true,
    lastPausedAt: now.toISOString(),
    pauseReason: reason,
  };
}

/**
 * Resumes the SLA clock and extends the resolution target by the elapsed paused minutes
 */
export function resumeSlaClock(
  instance: SlaInstanceData,
  now: Date = new Date()
): SlaInstanceData {
  if (!instance.isPaused || !instance.lastPausedAt) {
    return instance;
  }

  const pausedStart = new Date(instance.lastPausedAt).getTime();
  const elapsedMs = Math.max(0, now.getTime() - pausedStart);
  const elapsedMinutes = Math.round(elapsedMs / (60 * 1000));

  const originalTargetMs = new Date(instance.resolutionTargetAt).getTime();
  const newTargetMs = originalTargetMs + elapsedMs;

  return {
    ...instance,
    isPaused: false,
    lastPausedAt: null,
    pauseReason: null,
    totalPausedMinutes: instance.totalPausedMinutes + elapsedMinutes,
    resolutionTargetAt: new Date(newTargetMs).toISOString(),
  };
}

/**
 * Evaluates SLA breach and warning conditions
 */
export function evaluateSlaStatus(
  instance: SlaInstanceData,
  createdAt: Date,
  now: Date = new Date()
): {
  isResolutionBreached: boolean;
  isResolutionWarning80: boolean;
  percentageElapsed: number;
} {
  if (instance.resolutionActualAt) {
    return {
      isResolutionBreached: instance.resolutionBreached,
      isResolutionWarning80: false,
      percentageElapsed: 100,
    };
  }

  const startMs = createdAt.getTime();
  const targetMs = new Date(instance.resolutionTargetAt).getTime();
  const nowMs = instance.isPaused && instance.lastPausedAt
    ? new Date(instance.lastPausedAt).getTime()
    : now.getTime();

  const totalDurationMs = targetMs - startMs;
  if (totalDurationMs <= 0) {
    return { isResolutionBreached: true, isResolutionWarning80: true, percentageElapsed: 100 };
  }

  const elapsedMs = nowMs - startMs;
  const percentageElapsed = Math.min(100, Math.max(0, Math.round((elapsedMs / totalDurationMs) * 100)));

  return {
    isResolutionBreached: nowMs >= targetMs,
    isResolutionWarning80: percentageElapsed >= 80 && nowMs < targetMs,
    percentageElapsed,
  };
}
