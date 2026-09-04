import { z } from 'zod';
import {
  normalizedJobFieldsSchema,
  type JobSourceKind,
  type NormalizedJobFields,
} from './discovered-job-contract';
import {
  extractReadablePageText,
  jobPostingExtractionSchema,
  type JobPostingExtraction,
} from './job-posting-extractor';
import { httpUrlSchema } from './http-url';

export type JobConnectorTarget = {
  sourceKind: Exclude<JobSourceKind, 'generic_html'>;
  pageUrl: string;
  fetchUrl: string;
  externalId: string;
  board: string;
  posting: string;
};

export type JobBoardTarget = Pick<
  JobConnectorTarget,
  'sourceKind' | 'board' | 'fetchUrl'
> & { pageUrl: string };

export type ConnectedBoardJob = ConnectedJob & {
  pageUrl: string;
};

export type ConnectedJob = {
  extraction: JobPostingExtraction;
  normalized: NormalizedJobFields;
  hashInput: string;
};

export class JobConnectorError extends Error {
  constructor() {
    super('The official job source response was not usable.');
    this.name = 'JobConnectorError';
  }
}

const greenhouseJobSchema = z
  .object({
    id: z.union([z.number().int().nonnegative(), z.string().min(1).max(100)]),
    title: z.string().min(1).max(200),
    company_name: z.string().min(1).max(200).optional(),
    first_published: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .optional(),
    location: z.object({ name: z.string().min(1).max(300) }).optional(),
    content: z.string().min(1).max(1_000_000).optional(),
    absolute_url: httpUrlSchema.optional(),
    pay_input_ranges: z
      .array(
        z.object({
          min_cents: z.number().int().nonnegative().nullable().optional(),
          max_cents: z.number().int().nonnegative().nullable().optional(),
          currency_type: z.string().regex(/^[A-Za-z]{3}$/),
        }),
      )
      .max(20)
      .optional(),
  })
  .passthrough();
const greenhouseBoardSchema = z
  .object({ jobs: z.array(greenhouseJobSchema).max(5_000) })
  .passthrough();

const ashbySalarySchema = z
  .object({
    compensationType: z.string(),
    interval: z.string(),
    currencyCode: z.string().nullable(),
    minValue: z.number().nonnegative().nullable(),
    maxValue: z.number().nonnegative().nullable(),
  })
  .passthrough();
const ashbyJobSchema = z
  .object({
    title: z.string().min(1).max(200),
    location: z.string().min(1).max(300).nullable().optional(),
    isRemote: z.boolean().optional(),
    workplaceType: z.enum(['OnSite', 'Remote', 'Hybrid']).optional(),
    descriptionHtml: z.string().max(1_000_000).optional(),
    descriptionPlain: z.string().max(20_000).optional(),
    publishedAt: z.string().datetime({ offset: true }).nullable().optional(),
    employmentType: z
      .enum(['FullTime', 'PartTime', 'Intern', 'Contract', 'Temporary'])
      .optional(),
    jobUrl: httpUrlSchema,
    isListed: z.boolean().optional(),
    compensation: z
      .object({
        summaryComponents: z.array(ashbySalarySchema).max(100).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
const ashbyBoardSchema = z
  .object({
    apiVersion: z.literal('1'),
    jobs: z.array(ashbyJobSchema).max(5_000),
  })
  .passthrough();

export function resolveJobConnector(rawUrl: string): JobConnectorTarget | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  url.hash = '';
  const parts = url.pathname.split('/').filter(Boolean);
  const host = url.hostname.toLowerCase();

  if (
    ['boards.greenhouse.io', 'job-boards.greenhouse.io'].includes(host) &&
    parts.length >= 3 &&
    parts[1] === 'jobs' &&
    /^\d+$/.test(parts[2])
  ) {
    const [board, , posting] = parts;
    return {
      sourceKind: 'greenhouse',
      pageUrl: url.href,
      fetchUrl: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${posting}?pay_transparency=true`,
      externalId: `${board}:${posting}`,
      board,
      posting,
    };
  }

  if (host === 'jobs.ashbyhq.com' && parts.length >= 2) {
    const [board, posting] = parts;
    return {
      sourceKind: 'ashby',
      pageUrl: url.href,
      fetchUrl: `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`,
      externalId: `${board}:${posting}`,
      board,
      posting,
    };
  }
  return null;
}

export function resolveJobBoard(rawUrl: string): JobBoardTarget | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  url.hash = '';
  const parts = url.pathname.split('/').filter(Boolean);
  const host = url.hostname.toLowerCase();
  if (
    ['boards.greenhouse.io', 'job-boards.greenhouse.io'].includes(host) &&
    parts.length === 1
  ) {
    const [board] = parts;
    return {
      sourceKind: 'greenhouse',
      board,
      pageUrl: url.href,
      fetchUrl: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true&pay_transparency=true`,
    };
  }
  if (host === 'jobs.ashbyhq.com' && parts.length === 1) {
    const [board] = parts;
    return {
      sourceKind: 'ashby',
      board,
      pageUrl: url.href,
      fetchUrl: `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`,
    };
  }
  return null;
}

export function parseJobBoard(
  target: JobBoardTarget,
  payload: string,
): ConnectedBoardJob[] {
  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    throw new JobConnectorError();
  }
  if (target.sourceKind === 'greenhouse') {
    const parsed = greenhouseBoardSchema.safeParse(json);
    if (!parsed.success) throw new JobConnectorError();
    return parsed.data.jobs.map((job) => {
      const pageUrl =
        job.absolute_url ??
        `https://job-boards.greenhouse.io/${encodeURIComponent(target.board)}/jobs/${job.id}`;
      return {
        ...parseGreenhouse(
          {
            ...target,
            pageUrl,
            externalId: `${target.board}:${job.id}`,
            posting: String(job.id),
          },
          job,
        ),
        pageUrl,
      };
    });
  }
  const parsed = ashbyBoardSchema.safeParse(json);
  if (!parsed.success) throw new JobConnectorError();
  return parsed.data.jobs.map((job) => ({
    ...parseAshbyJob(target.board, job),
    pageUrl: job.jobUrl,
  }));
}

export function parseJobConnector(
  target: JobConnectorTarget,
  payload: string,
): ConnectedJob {
  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    throw new JobConnectorError();
  }
  return target.sourceKind === 'greenhouse'
    ? parseGreenhouse(target, json)
    : parseAshby(target, json);
}

export function genericNormalizedFields(): NormalizedJobFields {
  return normalizedJobFieldsSchema.parse({
    location: null,
    remoteMode: 'unknown',
    contractType: 'unknown',
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: 'unknown',
    publishedAt: null,
    externalId: null,
    sourceKind: 'generic_html',
    lifecycleSignal: 'unknown',
  });
}

function parseGreenhouse(
  target: JobConnectorTarget,
  value: unknown,
): ConnectedJob {
  const parsed = greenhouseJobSchema.safeParse(value);
  if (!parsed.success || String(parsed.data.id) !== target.posting)
    throw new JobConnectorError();
  const job = parsed.data;
  const description = job.content
    ? extractReadablePageText(job.content, 'text/html')
    : undefined;
  const salary = greenhouseSalary(job.pay_input_ranges);
  const sourceUrl = job.absolute_url ?? target.pageUrl;
  return {
    extraction: jobPostingExtractionSchema.parse({
      ...(job.company_name ? { company: job.company_name } : {}),
      role: job.title,
      ...(description ? { description } : {}),
      sourceUrl,
    }),
    normalized: normalizedJobFieldsSchema.parse({
      location: job.location?.name ?? null,
      remoteMode: 'unknown',
      contractType: 'unknown',
      salaryMin: salary?.minimum ?? null,
      salaryMax: salary?.maximum ?? null,
      salaryCurrency: salary?.currency ?? null,
      salaryPeriod: 'unknown',
      publishedAt: job.first_published ?? null,
      externalId: target.externalId,
      sourceKind: 'greenhouse',
      lifecycleSignal: 'open',
    }),
    hashInput: JSON.stringify(job),
  };
}

function parseAshby(target: JobConnectorTarget, value: unknown): ConnectedJob {
  const parsed = ashbyBoardSchema.safeParse(value);
  if (!parsed.success) throw new JobConnectorError();
  const candidates = parsed.data.jobs.filter((job) => {
    const url = new URL(job.jobUrl);
    return (
      url.href === target.pageUrl ||
      url.pathname.split('/').filter(Boolean).at(-1) === target.posting
    );
  });
  if (candidates.length !== 1) throw new JobConnectorError();
  return parseAshbyJob(target.board, candidates[0]);
}

function parseAshbyJob(
  board: string,
  job: z.infer<typeof ashbyJobSchema>,
): ConnectedJob {
  const description =
    job.descriptionPlain?.trim() ||
    (job.descriptionHtml
      ? extractReadablePageText(job.descriptionHtml, 'text/html')
      : undefined);
  const salary = ashbySalary(job.compensation?.summaryComponents);
  return {
    extraction: jobPostingExtractionSchema.parse({
      role: job.title,
      ...(description ? { description } : {}),
      sourceUrl: job.jobUrl,
    }),
    normalized: normalizedJobFieldsSchema.parse({
      location: job.location ?? null,
      remoteMode: remoteMode(job.workplaceType, job.isRemote),
      contractType: contractType(job.employmentType),
      salaryMin: salary?.minimum ?? null,
      salaryMax: salary?.maximum ?? null,
      salaryCurrency: salary?.currency ?? null,
      salaryPeriod: salary ? 'year' : 'unknown',
      publishedAt: job.publishedAt ?? null,
      externalId: `${board}:${new URL(job.jobUrl).pathname.split('/').filter(Boolean).at(-1)}`,
      sourceKind: 'ashby',
      lifecycleSignal: job.isListed === false ? 'closed' : 'open',
    }),
    hashInput: JSON.stringify(job),
  };
}

function greenhouseSalary(
  ranges: z.infer<typeof greenhouseJobSchema>['pay_input_ranges'],
) {
  if (!ranges || ranges.length !== 1) return undefined;
  const [range] = ranges;
  const minimum =
    range.min_cents === null
      ? null
      : range.min_cents === undefined
        ? null
        : range.min_cents / 100;
  const maximum =
    range.max_cents === null
      ? null
      : range.max_cents === undefined
        ? null
        : range.max_cents / 100;
  if (minimum === null && maximum === null) return undefined;
  return { minimum, maximum, currency: range.currency_type.toUpperCase() };
}

function ashbySalary(
  components: z.infer<typeof ashbySalarySchema>[] | undefined,
) {
  const salaries = (components ?? []).filter(
    (component) =>
      component.compensationType === 'Salary' &&
      component.interval === '1 YEAR' &&
      component.currencyCode &&
      (component.minValue !== null || component.maxValue !== null),
  );
  if (salaries.length !== 1) return undefined;
  const [salary] = salaries;
  return {
    minimum: salary.minValue,
    maximum: salary.maxValue,
    currency: salary.currencyCode!.toUpperCase(),
  };
}

function remoteMode(
  workplaceType: 'OnSite' | 'Remote' | 'Hybrid' | undefined,
  isRemote: boolean | undefined,
) {
  if (workplaceType === 'OnSite') return 'onsite';
  if (workplaceType === 'Remote') return 'remote';
  if (workplaceType === 'Hybrid') return 'hybrid';
  return isRemote ? 'remote' : 'unknown';
}

function contractType(
  value:
    'FullTime' | 'PartTime' | 'Intern' | 'Contract' | 'Temporary' | undefined,
) {
  if (!value) return 'unknown';
  const types = {
    FullTime: 'full_time',
    PartTime: 'part_time',
    Intern: 'internship',
    Contract: 'contract',
    Temporary: 'temporary',
  } as const;
  return types[value];
}
