const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

let windowStartedAt = 0;
let attempts = 0;

export function takePublicationAttempt(now = Date.now()) {
  if (now - windowStartedAt >= WINDOW_MS) {
    windowStartedAt = now;
    attempts = 0;
  }
  if (attempts >= MAX_ATTEMPTS) return false;
  attempts += 1;
  return true;
}

export function resetPublicationRateLimitForTests() {
  windowStartedAt = 0;
  attempts = 0;
}
