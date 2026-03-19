import { ControlPanelService } from "./service.js";

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
      const activeRun = state.runtime.activeRun;
      const now = Date.now();

      if (activeRun?.plannedStopAt) {
        if (Date.parse(activeRun.plannedStopAt) <= now) {
          this.service.stopActive(
            activeRun.kind === "event" ? "scheduled-end" : "planned-stop",
          );
          return;
        }
      }

      if (activeRun) return;

      const dueEvent = state.events
        .filter(
          (event) =>
            event.status === "scheduled" &&
            Date.parse(event.startAt) <= now &&
            Date.parse(event.endAt) > now,
        )
        .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0];

      if (!dueEvent) return;

      await this.service.startScheduledEvent(dueEvent.id);
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
