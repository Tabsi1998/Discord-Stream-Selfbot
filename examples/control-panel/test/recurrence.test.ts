import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildOccurrenceWindows,
  normalizeRecurrenceInput,
} from "../src/domain/recurrence.js";

test("normalizeRecurrenceInput defaults weekly days to the event start weekday", () => {
  const rule = normalizeRecurrenceInput(
    {
      kind: "weekly",
      interval: 2,
      until: "2026-04-30T12:00:00.000Z",
    },
    "2026-04-02T12:00:00.000Z",
  );

  assert.deepEqual(rule, {
    kind: "weekly",
    interval: 2,
    daysOfWeek: [4],
    until: "2026-04-30T12:00:00.000Z",
  });
});

test("buildOccurrenceWindows keeps weekly interval and selected weekdays separate", () => {
  const windows = buildOccurrenceWindows(
    "2026-04-06T18:30:00.000Z",
    "2026-04-06T20:00:00.000Z",
    {
      kind: "weekly",
      interval: 2,
      daysOfWeek: [1, 3],
      until: "2026-04-24T23:59:59.000Z",
    },
  );

  assert.deepEqual(
    windows.map((entry) => entry.startAt),
    [
      "2026-04-06T18:30:00.000Z",
      "2026-04-08T18:30:00.000Z",
      "2026-04-20T18:30:00.000Z",
      "2026-04-22T18:30:00.000Z",
    ],
  );
  assert.deepEqual(
    windows.map((entry) => entry.occurrenceIndex),
    [1, 2, 3, 4],
  );
});

test("normalizeRecurrenceInput rejects recurrence until dates before the event start", () => {
  assert.throws(
    () =>
      normalizeRecurrenceInput(
        {
          kind: "daily",
          interval: 1,
          until: "2026-04-01T11:59:59.000Z",
        },
        "2026-04-01T12:00:00.000Z",
      ),
    /recurrence\.until must be after startAt/,
  );
});
