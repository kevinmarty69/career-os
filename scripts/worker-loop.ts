type ShutdownSignal = 'SIGINT' | 'SIGTERM';

type SignalSource = {
  once(signal: ShutdownSignal, listener: () => void): unknown;
  removeListener(signal: ShutdownSignal, listener: () => void): unknown;
};

type WorkerLoopOptions<Result extends { status: string }> = {
  workerName: string;
  once: boolean;
  iteration: () => Promise<Result>;
  signalSource?: SignalSource;
  idleDelayMs?: number;
  busyDelayMs?: number;
  retryDelayMs?: number;
  log?: (message: string) => void;
  logError?: (message: string) => void;
};

export async function runWorkerLoop<Result extends { status: string }>({
  workerName,
  once,
  iteration,
  signalSource = process,
  idleDelayMs = 1_000,
  busyDelayMs = 50,
  retryDelayMs = 1_000,
  log = console.log,
  logError = console.error,
}: WorkerLoopOptions<Result>) {
  const shutdown = new AbortController();
  let stopping = false;
  let iterationSucceeded = false;
  const stop = () => {
    stopping = true;
    shutdown.abort();
  };
  signalSource.once('SIGINT', stop);
  signalSource.once('SIGTERM', stop);

  try {
    while (!stopping) {
      try {
        const result = await iteration();
        iterationSucceeded = true;
        log(JSON.stringify(result));
        if (once || stopping) return;
        await wait(
          result.status === 'idle' ? idleDelayMs : busyDelayMs,
          shutdown.signal,
        );
      } catch {
        logError(`${workerName} worker iteration failed.`);
        if (once || !iterationSucceeded)
          throw new Error(`${workerName} worker failed before becoming ready.`);
        if (stopping) return;
        await wait(retryDelayMs, shutdown.signal);
      }
    }
  } finally {
    signalSource.removeListener('SIGINT', stop);
    signalSource.removeListener('SIGTERM', stop);
  }
}

function wait(milliseconds: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(done, milliseconds);
    signal.addEventListener('abort', done, { once: true });

    function done() {
      clearTimeout(timeout);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}
