import { createHash, randomUUID } from 'node:crypto';
import { evaluateHardMatch, type HardMatchJob } from './hard-match';
import {
  parseJobBoard,
  resolveJobBoard,
  type ConnectedBoardJob,
} from './job-source-connectors';
import type { SearchProfile } from './search-profile';
import type { DiscoveredJobPersistenceInput } from './discovered-job-contract';
import type { PublicationSession } from './server/publications';
import type { SafeHttpResult } from './server/safe-http';

const MAX_JOBS_PER_RUN = 100;

export type DiscoverySummary = {
  boards: number;
  jobsRead: number;
  stored: number;
  filtered: number;
  failedBoards: number;
};

export async function discoverSearchProfile(
  profile: SearchProfile,
  session: PublicationSession,
  fetchText: (url: string) => Promise<SafeHttpResult>,
  storeJob: (
    session: PublicationSession,
    input: DiscoveredJobPersistenceInput,
  ) => Promise<unknown>,
): Promise<DiscoverySummary> {
  const summary = emptyDiscoverySummary();
  for (const source of profile.discoverySources) {
    if (summary.jobsRead >= MAX_JOBS_PER_RUN) break;
    summary.boards += 1;
    const target = resolveJobBoard(source.url);
    if (!target) {
      summary.failedBoards += 1;
      continue;
    }
    try {
      const fetched = await fetchText(target.fetchUrl);
      const jobs = parseJobBoard(target, fetched.text);
      for (const job of jobs.slice(0, MAX_JOBS_PER_RUN - summary.jobsRead)) {
        summary.jobsRead += 1;
        const extraction = { ...job.extraction, company: source.company };
        if (!eligible(job, source.company, profile)) {
          summary.filtered += 1;
          continue;
        }
        await storeJob(session, {
          extraction,
          normalized: job.normalized,
          provenance: {
            requestedUrl: job.pageUrl,
            finalUrl: job.extraction.sourceUrl,
            fetchedUrl: fetched.finalUrl,
            fetchedAt: new Date().toISOString(),
            contentType: fetched.contentType,
            bytes: Buffer.byteLength(job.hashInput),
            sha256: createHash('sha256').update(job.hashInput).digest('hex'),
            trust: 'untrusted-data',
          },
        });
        summary.stored += 1;
      }
    } catch {
      summary.failedBoards += 1;
    }
  }
  return summary;
}

export function emptyDiscoverySummary(boards = 0): DiscoverySummary {
  return { boards, jobsRead: 0, stored: 0, filtered: 0, failedBoards: 0 };
}

function eligible(
  job: ConnectedBoardJob,
  company: string,
  profile: SearchProfile,
) {
  const candidate: HardMatchJob = {
    opportunityId: randomUUID(),
    company,
    ...(job.extraction.role ? { role: job.extraction.role } : {}),
    location: job.normalized.location,
    remoteMode: job.normalized.remoteMode,
    contractType: job.normalized.contractType,
    salaryMin: job.normalized.salaryMin,
    salaryMax: job.normalized.salaryMax,
    salaryCurrency: job.normalized.salaryCurrency,
    salaryPeriod: job.normalized.salaryPeriod,
    lifecycle: job.normalized.lifecycleSignal === 'closed' ? 'closed' : 'open',
    revision: 1,
  };
  return evaluateHardMatch(candidate, profile).eligibleForPriority;
}
