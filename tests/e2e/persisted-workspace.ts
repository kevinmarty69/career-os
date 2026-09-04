import type { Page } from '@playwright/test';

export const applicationId = '988c0a00-0000-4000-8000-000000000041';
export const opportunityId = '988c0a00-0000-4000-8000-000000000043';
export const pendingReviewRun = {
  runId: '988c0a00-0000-4000-8000-000000000045',
  status: 'awaiting_approval',
  stage: 'review_decision',
  revision: 1,
  usedTokens: 1_200,
  usedCostMicros: 0,
  profile: {
    name: 'Alex Morgan',
    headline: 'Staff Platform Engineer',
    sources: [],
    evidence: [],
    claims: [],
  },
  steps: [],
  reviews: [
    {
      reviewId: '988c0a00-0000-4000-8000-000000000046',
      reviewer: 'factuality',
      passed: false,
      findings: ['A metric exceeds its source.'],
      issues: [
        {
          section: 'Opening',
          message: 'Use the measured value from the source.',
          blocking: true,
        },
      ],
    },
  ],
  reviewDecisions: [],
  publicationEligible: false,
  events: [],
};

export const journalRun = {
  ...pendingReviewRun,
  usedTokens: 2_400,
  usedCostMicros: 180_000,
  steps: [
    {
      stage: 'company-researcher',
      status: 'completed',
      attempt: 1,
    },
    {
      stage: 'factuality-reviewer',
      status: 'failed',
      attempt: 2,
      failureCode: 'source_mismatch',
    },
  ],
  reviewDecisions: [
    {
      reviewId: pendingReviewRun.reviews[0]!.reviewId,
      issueIndex: 0,
      decision: 'keep',
    },
  ],
  events: [
    {
      actor: 'company-researcher',
      type: 'research.completed',
      summary: 'Company sources were collected and bounded to this run.',
      costMicros: 80_000,
    },
    {
      actor: 'fact-checker',
      type: 'review.failed',
      summary: 'One claim exceeded the value found in its source.',
      costMicros: 100_000,
    },
  ],
};

const positioningRun = {
  ...pendingReviewRun,
  pageSpecId: '988c0a00-0000-4000-8000-000000000071',
  pageSpecHash: 'a'.repeat(64),
  pageSpecArtifactId: '988c0a00-0000-4000-8000-000000000072',
  pageSpecArtifactHash: 'b'.repeat(64),
  spec: {
    version: 1,
    company: {
      name: 'Signal Forge',
      role: 'Staff Platform Engineer',
      accent: '#5847e8',
    },
    hero: {
      eyebrow: 'Independent application',
      title: 'Reliable systems for small teams.',
      thesis: 'Production ownership with explicit evidence boundaries.',
    },
    blocks: [
      {
        type: 'fit',
        title: 'Relevant proof',
        claimIds: ['claim-result'],
      },
    ],
  },
};

export async function mockPositioningAuditWorkspace(page: Page) {
  await mockPersistedWorkspace(page, positioningRun);
  await page.route('**/api/search-profiles', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        searchProfiles: [
          {
            searchProfileId: '988c0a00-0000-4000-8000-000000000073',
            revision: 1,
            createdAt: '2026-09-04T12:00:00.000Z',
            updatedAt: '2026-09-04T12:00:00.000Z',
            name: 'Platform roles',
            active: true,
            hardConstraints: {
              roles: ['Staff Platform Engineer'],
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
              stacks: ['Kubernetes'],
              sectors: [],
              productTypes: [],
              companySizes: [],
              cultures: [],
            },
          },
        ],
      }),
    }),
  );
  await page.route('**/api/profile', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        revision: 1,
        profile: {
          name: 'Alex Morgan',
          headline: 'Platform engineer',
          sources: [
            {
              id: 'source-cv',
              kind: 'document',
              title: 'Alex Morgan CV 2026.pdf',
              sensitivity: 'private',
              allowedUses: ['resume', 'application'],
              trust: 'untrusted-data',
            },
            {
              id: 'source-linkedin',
              kind: 'linkedin',
              title: 'LinkedIn export',
              sensitivity: 'private',
              allowedUses: ['linkedin', 'application'],
              trust: 'untrusted-data',
            },
          ],
          evidence: [
            {
              id: 'evidence-cv',
              sourceId: 'source-cv',
              label: 'Experience',
              excerpt: 'Helped improve deployment reliability.',
            },
            {
              id: 'evidence-linkedin',
              sourceId: 'source-linkedin',
              label: 'About',
              excerpt: 'Built a platform used by product teams.',
            },
          ],
          claims: [
            {
              id: 'claim-result',
              statement: 'Helped improve deployment reliability.',
              kind: 'result',
              level: 'declared',
              evidenceIds: ['evidence-cv'],
              sensitivity: 'private',
              allowedUses: ['resume', 'application'],
            },
            {
              id: 'claim-linkedin',
              statement: 'Built a platform used by product teams.',
              kind: 'experience',
              level: 'declared',
              evidenceIds: ['evidence-linkedin'],
              sensitivity: 'private',
              allowedUses: ['linkedin', 'application'],
            },
            {
              id: 'claim-kubernetes',
              statement: 'Owned Kubernetes operations.',
              kind: 'skill',
              level: 'unsupported',
              evidenceIds: [],
              sensitivity: 'private',
              allowedUses: ['resume', 'linkedin', 'application'],
            },
          ],
        },
      }),
    }),
  );
}

export async function mockPersistedWorkspace(page: Page, run?: unknown) {
  const now = '2026-09-04T12:00:00.000Z';
  const sourceId = '988c0a00-0000-4000-8000-000000000042';
  const sourceUrl = 'https://jobs.example.test/platform-engineer';
  const normalized = {
    location: 'Paris, France',
    remoteMode: 'hybrid',
    contractType: 'full_time',
    salaryMin: 80_000,
    salaryMax: 100_000,
    salaryCurrency: 'EUR',
    salaryPeriod: 'year',
    publishedAt: null,
    externalId: 'northstar-42',
    sourceKind: 'generic_html',
    lifecycleSignal: 'open',
  };
  const application = {
    applicationId,
    discoveredJobId: opportunityId,
    company: 'Signal Forge',
    role: 'Staff Platform Engineer',
    description: 'Build a reliable platform for a small team.',
    url: sourceUrl,
    accent: '#5847e8',
    stage: 'draft',
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  await page.route('**/api/insights', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        totalApplications: 4,
        sentOrLater: 2,
        applicationsWithResponse: 1,
        responseCoveragePct: 50,
        interviews: 1,
        outcomes: 1,
        weekly: Array.from({ length: 8 }, (_, index) => ({
          weekStart: new Date(Date.UTC(2026, 6, 13 + index * 7)).toISOString(),
          responses: index === 6 ? 1 : 0,
          interviews: index === 7 ? 1 : 0,
          outcomes: index === 7 ? 1 : 0,
        })),
      }),
    }),
  );
  await page.route(`**/api/applications/${applicationId}/run`, (route) =>
    run
      ? route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(run),
        })
      : route.fulfill({ status: 204 }),
  );
  await page.route('**/api/applications', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ applications: [application] }),
    }),
  );
  await page.route(`**/api/applications/${applicationId}`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(application),
    }),
  );
  await page.route('**/api/profile', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        revision: 1,
        profile: {
          name: 'Alex Morgan',
          headline: 'Staff Platform Engineer',
          sources: [
            {
              id: 'source-1',
              kind: 'document',
              title: 'Corvid postmortem',
              sensitivity: 'private',
              allowedUses: ['application', 'resume', 'interview'],
              trust: 'untrusted-data',
            },
          ],
          evidence: [
            {
              id: 'evidence-1',
              sourceId: 'source-1',
              label: 'Build time postmortem',
              excerpt: 'Build p50 moved from 11 to 7 minutes.',
            },
          ],
          claims: [
            {
              id: 'claim-1',
              statement: 'Reduced build p50 from 11 to 7 minutes.',
              kind: 'result',
              level: 'verified',
              evidenceIds: ['evidence-1'],
              sensitivity: 'private',
              allowedUses: ['application', 'resume', 'interview'],
            },
          ],
        },
      }),
    }),
  );
  await page.route('**/api/publications', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        publications: [
          {
            publicationId: '988c0a00-0000-4000-8000-000000000047',
            applicationId,
            company: application.company,
            role: application.role,
            publishedAt: now,
            revokedAt: null,
            expiresAt: '2026-09-11T12:00:00.000Z',
            status: 'active',
            version: 1,
            isCurrent: true,
            firstOpenedAt: null,
            lastOpenedAt: null,
            opens: 0,
            sections: 0,
            actions: 0,
            downloads: 0,
          },
        ],
      }),
    }),
  );
  await page.route('**/api/opportunities/decisions', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        decisions: [
          {
            decisionId: '988c0a00-0000-4000-8000-000000000048',
            opportunityId,
            searchProfileId: null,
            disposition: 'saved',
            qualification: 'priority',
            reason: 'strong_fit',
            note: 'Strong platform ownership match.',
            revision: 1,
            actor: 'human',
            actorId: '988c0a00-0000-4000-8000-000000000049',
            createdAt: now,
            updatedAt: now,
            history: [
              {
                eventId: '988c0a00-0000-4000-8000-000000000050',
                searchProfileId: null,
                disposition: 'saved',
                qualification: 'priority',
                reason: 'strong_fit',
                note: 'Strong platform ownership match.',
                revision: 1,
                actor: 'human',
                actorId: '988c0a00-0000-4000-8000-000000000049',
                createdAt: now,
              },
            ],
          },
        ],
        feedback: [],
      }),
    }),
  );
  await page.route('**/api/opportunities', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        opportunities: [
          {
            opportunityId,
            company: 'Northstar Labs',
            role: 'Platform Engineer',
            description: 'Operate reliable developer infrastructure.',
            sourceUrl,
            location: normalized.location,
            remoteMode: normalized.remoteMode,
            contractType: normalized.contractType,
            salaryMin: normalized.salaryMin,
            salaryMax: normalized.salaryMax,
            salaryCurrency: normalized.salaryCurrency,
            salaryPeriod: normalized.salaryPeriod,
            publishedAt: normalized.publishedAt,
            externalId: normalized.externalId,
            sourceKind: normalized.sourceKind,
            lifecycle: 'open',
            fingerprint: 'a'.repeat(64),
            revision: 1,
            sources: [
              {
                sourceRecordId: sourceId,
                requestedUrl: sourceUrl,
                finalUrl: sourceUrl,
                fetchedUrl: sourceUrl,
                sourceKind: 'generic_html',
                externalId: 'northstar-42',
                matchedBy: 'new',
                fetchedAt: now,
                contentType: 'text/html',
                bytes: 2_048,
                sha256: 'a'.repeat(64),
                trust: 'untrusted-data',
              },
            ],
            observations: [
              {
                observationId: '988c0a00-0000-4000-8000-000000000044',
                sourceRecordId: sourceId,
                observedAt: now,
                sha256: 'a'.repeat(64),
                change: 'first_seen',
                lifecycleSignal: 'open',
                matchedBy: 'new',
                normalized,
              },
            ],
            firstSeenAt: now,
            lastSeenAt: now,
          },
        ],
      }),
    }),
  );
  await page.route('**/api/search-profiles', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ searchProfiles: [] }),
    }),
  );
}
