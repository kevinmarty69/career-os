import { z } from 'zod';
import {
  evaluateSearchCriterion,
  searchProfileSchema,
  type CriterionPreview,
  type SearchProfile,
} from './search-profile';

export const hardMatchJobSchema = z
  .object({
    opportunityId: z.string().uuid(),
    company: z.string().min(1).max(200).optional(),
    role: z.string().min(1).max(200).optional(),
    location: z.string().min(1).max(300).nullable(),
    remoteMode: z.enum(['unknown', 'onsite', 'hybrid', 'remote']),
    contractType: z.enum([
      'unknown',
      'full_time',
      'part_time',
      'internship',
      'contract',
      'temporary',
    ]),
    salaryMin: z.number().nonnegative().max(1_000_000_000).nullable(),
    salaryMax: z.number().nonnegative().max(1_000_000_000).nullable(),
    salaryCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    salaryPeriod: z.enum(['unknown', 'year', 'month', 'hour']),
    lifecycle: z.enum(['open', 'changed', 'closed', 'reposted']),
    revision: z.number().int().positive(),
  })
  .strict();

export const hardMatchCriterionSchema = z
  .object({
    criterion: z.enum([
      'availability',
      'role',
      'seniority',
      'location',
      'remoteMode',
      'timezone',
      'language',
      'contractType',
      'salary',
      'company',
      'network',
    ]),
    state: z.enum(['compatible', 'blocked', 'unknown']),
    blocks: z.boolean(),
    expected: z.array(z.string().min(1).max(120)).max(30),
    observed: z.string().min(1).max(300).nullable(),
    explanation: z.string().min(1).max(500),
    references: z
      .array(
        z
          .object({
            entity: z.enum(['discovered_job', 'search_profile']),
            field: z.string().min(1).max(120),
          })
          .strict(),
      )
      .min(1)
      .max(5),
  })
  .strict();

export const hardMatchEvaluationSchema = z
  .object({
    decision: z.enum(['priority', 'ineligible']),
    eligibleForPriority: z.boolean(),
    criteria: z.array(hardMatchCriterionSchema).length(11),
    blockedCriteria: z.array(hardMatchCriterionSchema.shape.criterion).max(11),
  })
  .strict();

export const jobMatchRequestSchema = z
  .object({ searchProfileId: z.string().uuid() })
  .strict();

export const jobMatchSchema = z
  .object({
    matchId: z.string().uuid(),
    opportunityId: z.string().uuid(),
    jobRevision: z.number().int().positive(),
    searchProfileId: z.string().uuid(),
    searchProfileRevision: z.number().int().positive(),
    livingProfile: z
      .object({
        profileId: z.string().uuid(),
        revision: z.number().int().positive(),
      })
      .strict()
      .nullable(),
    evaluation: hardMatchEvaluationSchema,
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type HardMatchJob = z.infer<typeof hardMatchJobSchema>;
export type HardMatchEvaluation = z.infer<typeof hardMatchEvaluationSchema>;
export type JobMatch = z.infer<typeof jobMatchSchema>;
type HardMatchCriterion = z.infer<typeof hardMatchCriterionSchema>;
type CriterionName = HardMatchCriterion['criterion'];

export function evaluateHardMatch(
  rawJob: HardMatchJob,
  rawSearchProfile: SearchProfile,
): HardMatchEvaluation {
  const job = hardMatchJobSchema.parse(rawJob);
  const searchProfile = searchProfileSchema.parse(rawSearchProfile);
  const hard = searchProfile.hardConstraints;
  const criteria: HardMatchCriterion[] = [
    criterion(
      'availability',
      job.lifecycle === 'closed'
        ? blocked('Cette offre est explicitement fermée.')
        : compatible(
            'Cette offre ne porte aucun signal explicite de fermeture.',
          ),
      ['open'],
      job.lifecycle,
      refs('lifecycle'),
    ),
    criterion(
      'role',
      evaluateSearchCriterion(hard, 'role', job.role ?? ''),
      hard.roles,
      job.role ?? null,
      refs('role', 'hardConstraints.roles'),
    ),
    criterion(
      'seniority',
      unknown('Aucune séniorité structurée n’est disponible dans cette offre.'),
      hard.seniorities,
      null,
      refs('role', 'hardConstraints.seniorities'),
    ),
    criterion(
      'location',
      evaluateSearchCriterion(hard, 'location', job.location ?? ''),
      hard.locations,
      job.location,
      refs('location', 'hardConstraints.locations'),
    ),
    criterion(
      'remoteMode',
      evaluateSearchCriterion(
        hard,
        'remoteMode',
        job.remoteMode === 'unknown' ? '' : job.remoteMode,
      ),
      hard.remoteModes,
      job.remoteMode === 'unknown' ? null : job.remoteMode,
      refs('remoteMode', 'hardConstraints.remoteModes'),
    ),
    criterion(
      'timezone',
      unknown(
        'Aucun fuseau horaire structuré n’est disponible dans cette offre.',
      ),
      hard.timezones,
      null,
      refs('location', 'hardConstraints.timezones'),
    ),
    criterion(
      'language',
      unknown('Aucune langue structurée n’est disponible dans cette offre.'),
      hard.languages,
      null,
      refs('description', 'hardConstraints.languages'),
    ),
    contractCriterion(job, searchProfile),
    salaryCriterion(job, searchProfile),
    criterion(
      'company',
      evaluateSearchCriterion(hard, 'company', job.company ?? ''),
      hard.excludedCompanies,
      job.company ?? null,
      refs('company', 'hardConstraints.excludedCompanies'),
    ),
    criterion(
      'network',
      unknown('Aucun réseau d’entreprise structuré n’est disponible.'),
      hard.excludedNetworks,
      null,
      refs('company', 'hardConstraints.excludedNetworks'),
    ),
  ];
  const blockedCriteria = criteria
    .filter((item) => item.blocks)
    .map((item) => item.criterion);
  return hardMatchEvaluationSchema.parse({
    decision: blockedCriteria.length ? 'ineligible' : 'priority',
    eligibleForPriority: blockedCriteria.length === 0,
    criteria,
    blockedCriteria,
  });
}

function contractCriterion(job: HardMatchJob, profile: SearchProfile) {
  const hard = profile.hardConstraints;
  const directlyComparable =
    job.contractType === 'internship' ? 'internship' : undefined;
  const preview = directlyComparable
    ? evaluateSearchCriterion(hard, 'contractType', directlyComparable)
    : unknown(
        job.contractType === 'unknown'
          ? 'Le type de contrat est absent de l’offre.'
          : 'Le format de travail publié ne permet pas de conclure sur la forme juridique du contrat.',
      );
  return criterion(
    'contractType',
    preview,
    hard.contractTypes,
    directlyComparable ??
      (job.contractType === 'unknown' ? null : job.contractType),
    refs('contractType', 'hardConstraints.contractTypes'),
  );
}

function salaryCriterion(job: HardMatchJob, profile: SearchProfile) {
  const minimum = profile.hardConstraints.minimumSalary;
  const expected = minimum
    ? [`${minimum.amount} ${minimum.currency}/year`]
    : [];
  const observed = salaryLabel(job);
  const references = [
    { entity: 'discovered_job' as const, field: 'salaryMin' },
    { entity: 'discovered_job' as const, field: 'salaryMax' },
    { entity: 'discovered_job' as const, field: 'salaryCurrency' },
    { entity: 'discovered_job' as const, field: 'salaryPeriod' },
    {
      entity: 'search_profile' as const,
      field: 'hardConstraints.minimumSalary',
    },
  ];
  if (!minimum)
    return criterion(
      'salary',
      unknown(
        'Aucun minimum salarial n’est défini dans ce profil de recherche.',
      ),
      expected,
      observed,
      references,
    );
  if (
    job.salaryPeriod !== 'year' ||
    !job.salaryCurrency ||
    (job.salaryMin === null && job.salaryMax === null)
  )
    return criterion(
      'salary',
      unknown(
        'Le salaire annuel comparable est absent ou sa période est inconnue.',
      ),
      expected,
      observed,
      references,
    );
  if (job.salaryCurrency !== minimum.currency)
    return criterion(
      'salary',
      evaluateSearchCriterion(
        profile.hardConstraints,
        'salary',
        `${job.salaryMin ?? job.salaryMax} ${job.salaryCurrency}`,
      ),
      expected,
      observed,
      references,
    );
  if (job.salaryMin !== null && job.salaryMin >= minimum.amount)
    return criterion(
      'salary',
      evaluateSearchCriterion(
        profile.hardConstraints,
        'salary',
        `${job.salaryMin} ${job.salaryCurrency}`,
      ),
      expected,
      observed,
      references,
    );
  if (job.salaryMax !== null && job.salaryMax < minimum.amount)
    return criterion(
      'salary',
      evaluateSearchCriterion(
        profile.hardConstraints,
        'salary',
        `${job.salaryMax} ${job.salaryCurrency}`,
      ),
      expected,
      observed,
      references,
    );
  return criterion(
    'salary',
    unknown(
      'La fourchette traverse le minimum demandé : le résultat doit être vérifié.',
    ),
    expected,
    observed,
    references,
  );
}

function salaryLabel(job: HardMatchJob) {
  if (!job.salaryCurrency || (job.salaryMin === null && job.salaryMax === null))
    return null;
  const amount =
    job.salaryMin === null
      ? `≤ ${job.salaryMax}`
      : job.salaryMax === null
        ? `≥ ${job.salaryMin}`
        : `${job.salaryMin}–${job.salaryMax}`;
  return `${amount} ${job.salaryCurrency}/${job.salaryPeriod}`;
}

function criterion(
  name: CriterionName,
  preview: CriterionPreview,
  expected: readonly string[],
  observed: string | null,
  references: HardMatchCriterion['references'],
): HardMatchCriterion {
  return hardMatchCriterionSchema.parse({
    criterion: name,
    ...preview,
    expected: [...expected],
    observed,
    references,
  });
}

function refs(jobField: string, searchProfileField?: string) {
  return [
    { entity: 'discovered_job' as const, field: jobField },
    ...(searchProfileField
      ? [
          {
            entity: 'search_profile' as const,
            field: searchProfileField,
          },
        ]
      : []),
  ];
}

function unknown(explanation: string): CriterionPreview {
  return { state: 'unknown', blocks: false, explanation };
}

function compatible(explanation: string): CriterionPreview {
  return { state: 'compatible', blocks: false, explanation };
}

function blocked(explanation: string): CriterionPreview {
  return { state: 'blocked', blocks: true, explanation };
}
