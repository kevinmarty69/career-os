import type { Application } from './application-contract';
import type { PersistedRun } from './run-contract';

export type DashboardItem = {
  application: Pick<
    Application,
    'applicationId' | 'company' | 'role' | 'updatedAt'
  >;
  run?: Pick<
    PersistedRun,
    'status' | 'stage' | 'reviews' | 'reviewDecisions' | 'publicationEligible'
  >;
  unavailable?: boolean;
};

export type DashboardAction = DashboardItem & {
  kind: 'review' | 'decision' | 'running' | 'recover' | 'start' | 'publish';
  pendingDecisions: number;
};

const rank: Record<DashboardAction['kind'], number> = {
  review: 0,
  decision: 1,
  recover: 2,
  running: 3,
  publish: 4,
  start: 5,
};

export function dashboardActions(items: DashboardItem[]): DashboardAction[] {
  return items
    .filter((item) => !item.unavailable)
    .map((item) => {
      const decided = new Set(
        item.run?.reviewDecisions.map(
          ({ reviewId, issueIndex }) => `${reviewId}:${issueIndex}`,
        ) ?? [],
      );
      const pendingDecisions =
        item.run?.reviews.reduce(
          (total, review) =>
            total +
            review.issues.filter(
              (_, issueIndex) =>
                !decided.has(`${review.reviewId}:${issueIndex}`),
            ).length,
          0,
        ) ?? 0;
      const status = item.run?.status;
      const kind: DashboardAction['kind'] = pendingDecisions
        ? 'review'
        : status === 'paused' || status === 'awaiting_approval'
          ? 'decision'
          : status === 'failed' ||
              status === 'blocked' ||
              status === 'budget_exhausted'
            ? 'recover'
            : status === 'running'
              ? 'running'
              : item.run?.publicationEligible
                ? 'publish'
                : 'start';
      return { ...item, kind, pendingDecisions };
    })
    .sort(
      (left, right) =>
        rank[left.kind] - rank[right.kind] ||
        right.application.updatedAt.localeCompare(left.application.updatedAt),
    );
}
