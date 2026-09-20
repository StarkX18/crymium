/**
 * Placeholder for daily portal runs. Next step: parse cron, call probe + batch per Portals tab.
 */
export type SchedulerTick = {
  at: string;
  message: string;
};

let interval: ReturnType<typeof setInterval> | null = null;

export function startScheduler(
  onTick: () => Promise<void>,
  intervalMs = 60_000
): void {
  stopScheduler();
  interval = setInterval(() => {
    void onTick();
  }, intervalMs);
}

export function stopScheduler(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
