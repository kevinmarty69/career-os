import { z } from 'zod';

const boundedLabel = z.string().trim().min(1).max(120);
const boundedLabels = z.array(boundedLabel).max(30);

export const remoteModeSchema = z.enum(['remote', 'hybrid', 'onsite']);
export const contractTypeSchema = z.enum([
  'permanent',
  'fixed-term',
  'freelance',
  'internship',
]);
export const salaryCurrencySchema = z.enum(['EUR', 'USD', 'GBP']);

export const searchHardConstraintsSchema = z
  .object({
    roles: boundedLabels.default([]),
    seniorities: boundedLabels.default([]),
    locations: boundedLabels.default([]),
    remoteModes: z.array(remoteModeSchema).max(3).default([]),
    timezones: boundedLabels.default([]),
    languages: boundedLabels.default([]),
    contractTypes: z.array(contractTypeSchema).max(4).default([]),
    minimumSalary: z
      .object({
        amount: z.number().int().positive().max(10_000_000),
        currency: salaryCurrencySchema,
      })
      .strict()
      .optional(),
    excludedCompanies: boundedLabels.default([]),
    excludedNetworks: boundedLabels.default([]),
  })
  .strict();

export const searchSoftPreferencesSchema = z
  .object({
    stacks: boundedLabels.default([]),
    sectors: boundedLabels.default([]),
    productTypes: boundedLabels.default([]),
    companySizes: boundedLabels.default([]),
    cultures: boundedLabels.default([]),
  })
  .strict();

export const searchProfileFieldsSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    hardConstraints: searchHardConstraintsSchema,
    softPreferences: searchSoftPreferencesSchema,
    active: z.boolean(),
  })
  .strict();

export const searchProfileSchema = searchProfileFieldsSchema.extend({
  searchProfileId: z.string().uuid(),
  revision: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const updateSearchProfileInputSchema = searchProfileFieldsSchema
  .extend({ expectedRevision: z.number().int().positive() })
  .strict();

export const deleteSearchProfileInputSchema = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict();

export type SearchHardConstraints = z.infer<typeof searchHardConstraintsSchema>;
export type SearchSoftPreferences = z.infer<typeof searchSoftPreferencesSchema>;
export type SearchProfileFields = z.infer<typeof searchProfileFieldsSchema>;
export type SearchProfile = z.infer<typeof searchProfileSchema>;

export const emptySearchProfile: SearchProfileFields = {
  name: '',
  active: true,
  hardConstraints: {
    roles: [],
    seniorities: [],
    locations: [],
    remoteModes: [],
    timezones: [],
    languages: [],
    contractTypes: [],
    excludedCompanies: [],
    excludedNetworks: [],
  },
  softPreferences: {
    stacks: [],
    sectors: [],
    productTypes: [],
    companySizes: [],
    cultures: [],
  },
};

export type PreviewCriterion =
  | 'role'
  | 'seniority'
  | 'location'
  | 'remoteMode'
  | 'timezone'
  | 'language'
  | 'contractType'
  | 'salary'
  | 'company'
  | 'network';

export type CriterionState = 'compatible' | 'blocked' | 'unknown';

export type CriterionPreview = {
  state: CriterionState;
  blocks: boolean;
  explanation: string;
};

export function evaluateSearchCriterion(
  hard: SearchHardConstraints,
  criterion: PreviewCriterion,
  rawValue: string,
): CriterionPreview {
  const value = rawValue.trim();
  if (!value) return unknownPreview();

  if (criterion === 'salary') {
    const parsed = parseSalary(value);
    if (!parsed || !hard.minimumSalary) return unknownPreview();
    if (parsed.currency !== hard.minimumSalary.currency)
      return {
        state: 'unknown',
        blocks: false,
        explanation: 'La devise diffère : le montant doit être vérifié.',
      };
    return parsed.amount >= hard.minimumSalary.amount
      ? compatiblePreview('Le salaire atteint le minimum demandé.')
      : blockedPreview('Le salaire est inférieur au minimum demandé.');
  }

  if (criterion === 'company')
    return exclusionPreview(
      value,
      hard.excludedCompanies,
      'L’entreprise figure dans vos exclusions.',
      'L’entreprise ne figure pas dans vos exclusions.',
    );
  if (criterion === 'network')
    return exclusionPreview(
      value,
      hard.excludedNetworks,
      'Ce réseau figure dans vos exclusions.',
      'Ce réseau ne figure pas dans vos exclusions.',
    );

  const accepted = {
    role: hard.roles,
    seniority: hard.seniorities,
    location: hard.locations,
    remoteMode: hard.remoteModes,
    timezone: hard.timezones,
    language: hard.languages,
    contractType: hard.contractTypes,
  }[criterion];

  if (!accepted.length) return unknownPreview();
  return accepted.some((candidate) => sameLabel(candidate, value))
    ? compatiblePreview('La valeur respecte ce critère obligatoire.')
    : blockedPreview('La valeur ne respecte pas ce critère obligatoire.');
}

function parseSalary(value: string) {
  const match = value.match(/^\s*([0-9][0-9\s.,]*)\s*(EUR|USD|GBP)\s*$/i);
  if (!match) return undefined;
  const amount = Number(match[1].replace(/[\s,]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return {
    amount,
    currency: match[2].toUpperCase() as z.infer<typeof salaryCurrencySchema>,
  };
}

function exclusionPreview(
  value: string,
  exclusions: string[],
  blocked: string,
  compatible: string,
) {
  if (!exclusions.length) return unknownPreview();
  return exclusions.some((candidate) => sameLabel(candidate, value))
    ? blockedPreview(blocked)
    : compatiblePreview(compatible);
}

function sameLabel(left: string, right: string) {
  return normalizeLabel(left) === normalizeLabel(right);
}

function normalizeLabel(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('fr');
}

function unknownPreview(): CriterionPreview {
  return {
    state: 'unknown',
    blocks: false,
    explanation: 'Information absente ou critère non défini : à vérifier.',
  };
}

function compatiblePreview(explanation: string): CriterionPreview {
  return { state: 'compatible', blocks: false, explanation };
}

function blockedPreview(explanation: string): CriterionPreview {
  return { state: 'blocked', blocks: true, explanation };
}
