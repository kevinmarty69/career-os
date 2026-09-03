const HEARTBEAT_INTERVAL_MS = 5_000;

export function keepWorkerHeartbeatFresh(
  refresh: () => Promise<void>,
  intervalMs = HEARTBEAT_INTERVAL_MS,
  reportFailure: () => void = () =>
    console.error('Worker heartbeat refresh failed.'),
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = Promise.resolve();

  const schedule = () => {
    timer = setTimeout(() => {
      active = refresh()
        .catch(reportFailure)
        .finally(() => {
          if (!stopped) schedule();
        });
    }, intervalMs);
  };

  schedule();
  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await active;
  };
}
