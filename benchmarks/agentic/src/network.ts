type MutableModule = Record<string, (...args: unknown[]) => unknown>;

export async function blockNetwork() {
  let attempts = 0;
  const blocked = () => {
    attempts += 1;
    throw new Error('Network disabled by agentic bake-off');
  };

  globalThis.fetch = blocked as typeof fetch;
  for (const name of ['node:http', 'node:https', 'node:net'] as const) {
    const module = (await import(name)).default as unknown as MutableModule;
    for (const method of ['request', 'get', 'connect', 'createConnection'])
      if (method in module) module[method] = blocked;
  }

  return { attempts: () => attempts };
}
