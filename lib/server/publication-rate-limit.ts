const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

const windows = new Map<string, { attempts: number; startedAt: number }>();

export function takePublicationAttempt(key: string, now = Date.now()) {
  const current = windows.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    windows.set(key, { attempts: 1, startedAt: now });
    return true;
  }
  if (current.attempts >= MAX_ATTEMPTS) return false;
  current.attempts += 1;
  return true;
}

export function resetPublicationRateLimitForTests() {
  windows.clear();
}
