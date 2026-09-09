'use client';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { reviewIssueDecisionResultSchema } from '@/lib/run-contract';
import {
  decisionScopeSchema,
  queueDecision,
  queuedDecisions,
  removeQueuedDecision,
  replayDecisions,
  sameDecisionScope,
  type DecisionScope,
  type QueuedDecision,
} from '@/lib/decision-outbox';

const Context = createContext<{
  items: QueuedDecision[];
  unavailable: boolean;
  enqueue: (
    item: Pick<QueuedDecision, 'key' | 'runId' | 'applicationId' | 'input'>,
  ) => Promise<void>;
  retry: () => void;
  discard: (key: string) => void;
}>({
  items: [],
  unavailable: false,
  enqueue: async () => {
    throw new Error('Outbox unavailable');
  },
  retry: () => {},
  discard: () => {},
});
export const useDecisionOutbox = () => useContext(Context);

export function DecisionOutboxProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const scope = useRef<DecisionScope | null>(null);
  const [items, setItems] = useState<QueuedDecision[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      try {
        if (active)
          setItems(
            scope.current ? queuedDecisions(localStorage, scope.current) : [],
          );
      } catch {
        if (active) setUnavailable(true);
      }
    };
    const sync = async () => {
      if (!navigator.onLine) return refresh();
      try {
        const response = await fetch('/api/auth/workspace-session', {
          cache: 'no-store',
        });
        if (!active) return;
        if (!response.ok) {
          scope.current = null;
          setItems([]);
          return;
        }
        const current = decisionScopeSchema.parse(await response.json());
        scope.current = current;
        refresh();
        // Web Locks serialize replay between tabs. Unsupported browsers retain the queue without sending.
        if (!navigator.locks) {
          setUnavailable(true);
          return;
        }
        await navigator.locks.request(
          'career-os:decision-outbox',
          { ifAvailable: true },
          async (lock) => {
            if (!lock || !active) return;
            const sent = await replayDecisions(
              localStorage,
              current,
              async (item) => {
                if (
                  !active ||
                  !scope.current ||
                  !sameDecisionScope(current, scope.current)
                )
                  throw new Error('Scope changed');
                const response = await fetch(
                  `/api/runs/${item.runId}/review-decisions`,
                  {
                    method: 'POST',
                    headers: {
                      'content-type': 'application/json',
                      'idempotency-key': item.key,
                      'x-career-user': current.userId,
                      'x-career-workspace': current.tenantId,
                    },
                    body: JSON.stringify(item.input),
                  },
                );
                if (response.ok) {
                  const saved = reviewIssueDecisionResultSchema.parse(
                    await response.clone().json(),
                  );
                  if (
                    saved.runId !== item.runId ||
                    saved.reviewId !== item.input.reviewId ||
                    saved.issueIndex !== item.input.issueIndex ||
                    saved.decision !== item.input.decision
                  )
                    throw new Error('Unexpected receipt');
                }
                return response;
              },
            );
            if (sent)
              window.dispatchEvent(new Event('career-os:decisions-synced'));
            refresh();
          },
        );
      } catch {
        if (active) setUnavailable(true);
      }
    };
    const update = () => {
      void sync();
    };
    const storage = () => refresh();
    void sync();
    window.addEventListener('online', update);
    window.addEventListener('focus', update);
    window.addEventListener('storage', storage);
    return () => {
      active = false;
      window.removeEventListener('online', update);
      window.removeEventListener('focus', update);
      window.removeEventListener('storage', storage);
    };
  }, [tick, pathname]);
  return (
    <Context.Provider
      value={{
        items,
        unavailable,
        enqueue: async (item) => {
          if (!scope.current || !navigator.locks)
            throw new Error('No confirmed workspace');
          await navigator.locks.request('career-os:decision-outbox', () => {
            if (!scope.current) throw new Error('No confirmed workspace');
            queueDecision(localStorage, {
              ...item,
              ...scope.current,
              version: 1,
              createdAt: new Date().toISOString(),
              blocked: false,
            });
            setItems(queuedDecisions(localStorage, scope.current));
          });
        },
        retry: () => {
          setUnavailable(false);
          setTick((value) => value + 1);
        },
        discard: (key) => {
          if (!scope.current || !items.some((item) => item.key === key)) return;
          try {
            removeQueuedDecision(localStorage, key);
            setItems(queuedDecisions(localStorage, scope.current));
          } catch {
            setUnavailable(true);
          }
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
