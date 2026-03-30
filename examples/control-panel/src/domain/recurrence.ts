import type {
  RecurrenceInput,
  RecurrenceKind,
  RecurrenceRule,
} from "./types.js";

export type OccurrenceWindow = {
  startAt: string;
  endAt: string;
  occurrenceIndex: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_GENERATED_OCCURRENCES = 260;
const WEEKDAY_LABELS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function asDate(value: string, fieldName: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO date`);
  }
  return parsed;
}

function asPositiveInteger(value: number | undefined, fieldName: string) {
  const normalized = value ?? 1;
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return normalized;
}

function uniqueSortedDays(input: number[]) {
  const unique = [...new Set(input)].sort((a, b) => a - b);
  if (unique.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error(
      "daysOfWeek must only contain weekday indexes between 0 and 6",
    );
  }
  return unique;
}

function shiftLocalDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfLocalWeek(date: Date) {
  const next = startOfLocalDay(date);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function calendarDayDiff(start: Date, end: Date) {
  const startUtc = Date.UTC(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - startUtc) / DAY_MS);
}

function applyLocalTime(targetDate: Date, timeSource: Date) {
  const next = new Date(targetDate);
  next.setHours(
    timeSource.getHours(),
    timeSource.getMinutes(),
    timeSource.getSeconds(),
    timeSource.getMilliseconds(),
  );
  return next;
}

function fallbackRule(kind: RecurrenceKind = "once"): RecurrenceRule {
  if (kind === "weekly") {
    return {
      kind,
      interval: 1,
      daysOfWeek: [],
    };
  }

  return {
    kind,
    interval: 1,
    daysOfWeek: [],
  };
}

export function coerceRecurrenceRule(
  input: RecurrenceInput | RecurrenceRule | undefined,
  startAtIso: string,
) {
  try {
    return normalizeRecurrenceInput(input, startAtIso);
  } catch {
    return fallbackRule();
  }
}

export function normalizeRecurrenceInput(
  input: RecurrenceInput | RecurrenceRule | undefined,
  startAtIso: string,
): RecurrenceRule {
  const startAt = asDate(startAtIso, "startAt");
  const kind = input?.kind ?? "once";

  if (kind === "once") {
    return fallbackRule("once");
  }

  const interval = asPositiveInteger(input?.interval, "recurrence.interval");
  const until = input?.until?.trim();
  if (!until) {
    throw new Error("recurrence.until is required for recurring events");
  }

  const untilDate = asDate(until, "recurrence.until");
  if (untilDate <= startAt) {
    throw new Error("recurrence.until must be after startAt");
  }

  if (kind === "daily") {
    return {
      kind,
      interval,
      daysOfWeek: [],
      until: untilDate.toISOString(),
    };
  }

  const daysOfWeek = uniqueSortedDays(
    input?.daysOfWeek?.length ? input.daysOfWeek : [startAt.getDay()],
  );
  if (!daysOfWeek.length) {
    throw new Error("Select at least one weekday for weekly recurrence");
  }

  return {
    kind: "weekly",
    interval,
    daysOfWeek,
    until: untilDate.toISOString(),
  };
}

export function recurrenceSummary(rule: RecurrenceRule) {
  if (rule.kind === "once") {
    return "einmalig";
  }

  if (rule.kind === "daily") {
    const cadence =
      rule.interval === 1 ? "taeglich" : `alle ${rule.interval} Tage`;
    return rule.until ? `${cadence} bis ${rule.until}` : cadence;
  }

  const cadence =
    rule.interval === 1 ? "woechentlich" : `alle ${rule.interval} Wochen`;
  const days =
    rule.daysOfWeek.length > 0
      ? rule.daysOfWeek.map((day) => WEEKDAY_LABELS[day]).join(", ")
      : "kein Tag";
  return rule.until
    ? `${cadence} (${days}) bis ${rule.until}`
    : `${cadence} (${days})`;
}

export function buildOccurrenceWindows(
  startAtIso: string,
  endAtIso: string,
  recurrence: RecurrenceRule,
): OccurrenceWindow[] {
  const startAt = asDate(startAtIso, "startAt");
  const endAt = asDate(endAtIso, "endAt");

  if (endAt <= startAt) {
    throw new Error("endAt must be after startAt");
  }

  const durationMs = endAt.getTime() - startAt.getTime();
  if (recurrence.kind === "once") {
    return [
      {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        occurrenceIndex: 1,
      },
    ];
  }

  if (!recurrence.until) {
    throw new Error("recurrence.until is required for recurring events");
  }

  const untilDate = asDate(recurrence.until, "recurrence.until");
  const occurrences: OccurrenceWindow[] = [];

  const pushOccurrence = (occurrenceStart: Date) => {
    if (occurrences.length >= MAX_GENERATED_OCCURRENCES) {
      throw new Error(
        `Recurring series would generate more than ${MAX_GENERATED_OCCURRENCES} events`,
      );
    }

    occurrences.push({
      startAt: occurrenceStart.toISOString(),
      endAt: new Date(occurrenceStart.getTime() + durationMs).toISOString(),
      occurrenceIndex: occurrences.length + 1,
    });
  };

  if (recurrence.kind === "daily") {
    let cursor = new Date(startAt);
    while (cursor <= untilDate) {
      pushOccurrence(cursor);
      cursor = shiftLocalDays(cursor, recurrence.interval);
    }
  } else {
    const anchorWeek = startOfLocalWeek(startAt);
    let cursor = startOfLocalDay(startAt);

    while (cursor <= untilDate) {
      const occurrenceStart = applyLocalTime(cursor, startAt);
      const candidateWeek = startOfLocalWeek(occurrenceStart);
      const weekDiff = Math.floor(
        calendarDayDiff(anchorWeek, candidateWeek) / 7,
      );

      if (
        occurrenceStart >= startAt &&
        occurrenceStart <= untilDate &&
        recurrence.daysOfWeek.includes(occurrenceStart.getDay()) &&
        weekDiff % recurrence.interval === 0
      ) {
        pushOccurrence(occurrenceStart);
      }

      cursor = shiftLocalDays(cursor, 1);
    }
  }

  if (!occurrences.length) {
    throw new Error("Recurrence did not generate any events");
  }

  return occurrences;
}
