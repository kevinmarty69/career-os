type RunOperationStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function persistedRunOperation(
  storage: RunOperationStorage,
  storageKey: string,
  input: string,
  forceNew = false,
) {
  if (!forceNew) {
    try {
      const stored = JSON.parse(storage.getItem(storageKey) ?? 'null') as {
        input?: unknown;
        key?: unknown;
      } | null;
      if (
        stored?.input === input &&
        typeof stored.key === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          stored.key,
        )
      )
        return { input, key: stored.key };
    } catch {
      // Replace corrupt browser state with a fresh operation below.
    }
  }
  const operation = { input, key: crypto.randomUUID() };
  storage.setItem(storageKey, JSON.stringify(operation));
  return operation;
}
