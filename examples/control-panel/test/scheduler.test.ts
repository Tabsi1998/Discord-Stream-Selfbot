import assert from "node:assert/strict";
import { test } from "node:test";
import type { ControlPanelState } from "../src/domain/types.js";
import { Scheduler } from "../src/runtime/Scheduler.js";
import type { ControlPanelService } from "../src/services/ControlPanelService.js";

function createBaseState(): ControlPanelState {
  return {
    channels: [],
    presets: [],
    events: [],
    queue: [],
    queueConfig: {
      active: false,
      loop: false,
      currentIndex: 0,
    },
    notificationSettings: {
      webhookUrl: "",
      dmEnabled: false,
    },
    runtime: {
      discordStatus: "ready",
      activeRuns: [],
    },
    logs: [],
  };
}

test("Scheduler stops each expired active run independently per bot", async () => {
  const state = createBaseState();
  state.runtime.activeRuns = [
    {
      kind: "event",
      eventId: "event-1",
      botId: "bot-1",
      botName: "Primary Bot",
      channelId: "channel-1",
      presetId: "preset-1",
      channelName: "Stage One",
      presetName: "Main Feed",
      startedAt: "2026-03-30T09:30:00.000Z",
      plannedStopAt: "2026-03-30T09:59:00.000Z",
      status: "running",
    },
    {
      kind: "manual",
      botId: "bot-2",
      botName: "Backup Bot",
      channelId: "channel-2",
      presetId: "preset-2",
      channelName: "Stage Two",
      presetName: "Alt Feed",
      startedAt: "2026-03-30T09:40:00.000Z",
      plannedStopAt: "2026-03-30T10:30:00.000Z",
      status: "running",
    },
  ];

  const stopCalls: Array<{ reason: string; botId?: string }> = [];
  let markMissedCalls = 0;
  const service = {
    reconcileStateOnStartup() {},
    markMissedEvents() {
      markMissedCalls += 1;
    },
    snapshot() {
      return state;
    },
    stopActiveForBot(reason: string, botId?: string) {
      stopCalls.push({ reason, botId });
      return true;
    },
    async startScheduledEvent() {
      throw new Error("startScheduledEvent should not be called when a stop is due");
    },
  } as unknown as ControlPanelService;

  const scheduler = new Scheduler(service, 1000);
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-03-30T10:00:00.000Z");

  try {
    await (scheduler as unknown as { tick: () => Promise<void> }).tick();
  } finally {
    Date.now = originalNow;
  }

  assert.equal(markMissedCalls, 1);
  assert.deepEqual(stopCalls, [
    { reason: "scheduled-end", botId: "bot-1" },
  ]);
});

test("Scheduler starts due events for free bots while skipping queue and already-busy bots", async () => {
  const state = createBaseState();
  state.channels = [
    {
      id: "channel-queue",
      botId: "bot-queue",
      name: "Queue Channel",
      guildId: "guild-1",
      channelId: "voice-1",
      streamMode: "go-live",
      description: "",
      createdAt: "2026-03-30T09:00:00.000Z",
      updatedAt: "2026-03-30T09:00:00.000Z",
    },
    {
      id: "channel-c-1",
      botId: "bot-c",
      name: "Channel C1",
      guildId: "guild-1",
      channelId: "voice-2",
      streamMode: "go-live",
      description: "",
      createdAt: "2026-03-30T09:00:00.000Z",
      updatedAt: "2026-03-30T09:00:00.000Z",
    },
    {
      id: "channel-c-2",
      botId: "bot-c",
      name: "Channel C2",
      guildId: "guild-1",
      channelId: "voice-3",
      streamMode: "go-live",
      description: "",
      createdAt: "2026-03-30T09:00:00.000Z",
      updatedAt: "2026-03-30T09:00:00.000Z",
    },
    {
      id: "channel-d",
      botId: "bot-d",
      name: "Channel D",
      guildId: "guild-1",
      channelId: "voice-4",
      streamMode: "go-live",
      description: "",
      createdAt: "2026-03-30T09:00:00.000Z",
      updatedAt: "2026-03-30T09:00:00.000Z",
    },
  ];
  state.events = [
    {
      id: "event-queue",
      name: "Queue Conflict",
      channelId: "channel-queue",
      presetId: "preset-1",
      startAt: "2026-03-30T09:59:00.000Z",
      endAt: "2026-03-30T10:30:00.000Z",
      status: "scheduled",
      description: "",
      recurrence: { kind: "once", interval: 1, daysOfWeek: [] },
      occurrenceIndex: 1,
      createdAt: "2026-03-30T09:00:00.000Z",
      updatedAt: "2026-03-30T09:00:00.000Z",
    },
    {
      id: "event-c-1",
      name: "Channel C First",
      channelId: "channel-c-1",
      presetId: "preset-2",
      startAt: "2026-03-30T09:58:00.000Z",
      endAt: "2026-03-30T10:15:00.000Z",
      status: "scheduled",
      description: "",
      recurrence: { kind: "once", interval: 1, daysOfWeek: [] },
      occurrenceIndex: 1,
      createdAt: "2026-03-30T09:00:00.000Z",
      updatedAt: "2026-03-30T09:00:00.000Z",
    },
    {
      id: "event-c-2",
      name: "Channel C Second",
      channelId: "channel-c-2",
      presetId: "preset-3",
      startAt: "2026-03-30T09:59:30.000Z",
      endAt: "2026-03-30T10:20:00.000Z",
      status: "scheduled",
      description: "",
      recurrence: { kind: "once", interval: 1, daysOfWeek: [] },
      occurrenceIndex: 1,
      createdAt: "2026-03-30T09:00:00.000Z",
      updatedAt: "2026-03-30T09:00:00.000Z",
    },
    {
      id: "event-d",
      name: "Channel D",
      channelId: "channel-d",
      presetId: "preset-4",
      startAt: "2026-03-30T09:59:45.000Z",
      endAt: "2026-03-30T10:40:00.000Z",
      status: "scheduled",
      description: "",
      recurrence: { kind: "once", interval: 1, daysOfWeek: [] },
      occurrenceIndex: 1,
      createdAt: "2026-03-30T09:00:00.000Z",
      updatedAt: "2026-03-30T09:00:00.000Z",
    },
  ];
  state.runtime.primaryBotId = "primary";
  state.runtime.activeRuns = [
    {
      kind: "manual",
      botId: "bot-busy",
      botName: "Busy Bot",
      channelId: "busy-channel",
      presetId: "busy-preset",
      channelName: "Busy",
      presetName: "Busy Feed",
      startedAt: "2026-03-30T09:45:00.000Z",
      status: "running",
    },
  ];
  state.queueConfig = {
    active: true,
    loop: false,
    botId: "bot-queue",
    currentIndex: 0,
  };

  const startedEvents: string[] = [];
  const service = {
    reconcileStateOnStartup() {},
    markMissedEvents() {},
    snapshot() {
      return state;
    },
    stopActiveForBot() {
      return false;
    },
    async startScheduledEvent(id: string) {
      startedEvents.push(id);
    },
  } as unknown as ControlPanelService;

  const scheduler = new Scheduler(service, 1000);
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-03-30T10:00:00.000Z");

  try {
    await (scheduler as unknown as { tick: () => Promise<void> }).tick();
  } finally {
    Date.now = originalNow;
  }

  assert.deepEqual(startedEvents, ["event-c-1", "event-d"]);
});
