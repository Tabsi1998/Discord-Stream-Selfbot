import type { ControlPanelService } from "../services/ControlPanelService.js";

export class Scheduler {
  private interval?: NodeJS.Timeout;
  private tickInFlight = false;

  constructor(
    private readonly service: ControlPanelService,
    private readonly pollMs: number,
  ) {}

  public start() {
    if (this.interval) return;
    this.service.reconcileStateOnStartup();
    void this.tick();
    this.interval = setInterval(() => {
      void this.tick();
    }, this.pollMs);
  }

  public stop() {
    if (!this.interval) return;
    clearInterval(this.interval);
    this.interval = undefined;
  }

  private async tick() {
    if (this.tickInFlight) return;
    this.tickInFlight = true;

    try {
      this.service.markMissedEvents();

      const state = this.service.snapshot();
      const now = Date.now();
      const activeRuns = state.runtime.activeRuns ?? [];
      let stoppedAny = false;

      for (const activeRun of activeRuns) {
        if (!activeRun.plannedStopAt) continue;
        if (Date.parse(activeRun.plannedStopAt) > now) continue;
        if (
          this.service.stopActiveForBot(
            activeRun.kind === "event" ? "scheduled-end" : "planned-stop",
            activeRun.botId,
          )
        ) {
          stoppedAny = true;
        }
      }

      if (stoppedAny) return;

      if (
        state.queueConfig.active &&
        state.queueConfig.pausedByEvent &&
        state.queueConfig.botId &&
        state.queueConfig.pausedEventId
      ) {
        const pausedEvent = state.events.find(
          (event) => event.id === state.queueConfig.pausedEventId,
        );
        if (
          !pausedEvent ||
          (pausedEvent.status !== "scheduled" &&
            pausedEvent.status !== "running")
        ) {
          this.service.resumeQueueAfterScheduledEvent(
            state.queueConfig.botId,
            state.queueConfig.pausedEventId,
          );
        }
      }

      const busyBotIds = new Set(activeRuns.map((run) => run.botId));
      if (
        state.queueConfig.active &&
        state.queueConfig.botId &&
        state.queueConfig.conflictPolicy === "queue-first" &&
        !state.queueConfig.pausedByEvent
      ) {
        busyBotIds.add(state.queueConfig.botId);
      }

      const dueEvents = state.events
        .filter(
          (event) =>
            event.status === "scheduled" &&
            Date.parse(event.startAt) <= now &&
            Date.parse(event.endAt) > now,
        )
        .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

      for (const dueEvent of dueEvents) {
        const channel = state.channels.find(
          (entry) => entry.id === dueEvent.channelId,
        );
        const botId = channel?.botId ?? state.runtime.primaryBotId;
        const queueCanBePreempted =
          state.queueConfig.active &&
          state.queueConfig.botId === botId &&
          state.queueConfig.conflictPolicy === "event-first" &&
          !state.queueConfig.pausedByEvent;
        if (!botId) {
          continue;
        }
        if (queueCanBePreempted && busyBotIds.has(botId)) {
          this.service.preemptQueueForScheduledEvent(botId, dueEvent.id);
          continue;
        }
        if (busyBotIds.has(botId)) {
          continue;
        }

        try {
          await this.service.startScheduledEvent(dueEvent.id);
          busyBotIds.add(botId);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "Failed to start event";
          this.service.appendLog(
            "error",
            "Scheduler konnte Event nicht starten",
            {
              eventId: dueEvent.id,
              botId,
              error: message.slice(0, 160),
            },
          );
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Scheduler tick failed";
      this.service.snapshot();
      // Errors are already pushed into state by the runtime/service layers.
      console.error(message);
    } finally {
      this.tickInFlight = false;
    }
  }
}
