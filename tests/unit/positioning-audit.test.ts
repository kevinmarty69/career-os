import assert from 'node:assert/strict';
import test from 'node:test';
import { auditPositioning } from '../../lib/positioning-audit';
import type { SearchProfile } from '../../lib/search-profile';
import type { Profile } from '../../lib/schemas';

test('audits imported channels, targets and missing proof without inventing fit', () => {
  const profile: Profile = {
    name: 'Alex Morgan',
    headline: 'Platform engineer',
    sources: [
      {
        id: 'cv',
        kind: 'document',
        title: 'CV 2026.pdf',
        sensitivity: 'private',
        allowedUses: ['resume', 'application'],
        trust: 'untrusted-data',
      },
      {
        id: 'linkedin',
        kind: 'linkedin',
        title: 'LinkedIn export',
        sensitivity: 'private',
        allowedUses: ['linkedin', 'application'],
        trust: 'untrusted-data',
      },
    ],
    evidence: [
      { id: 'cv-proof', sourceId: 'cv', label: 'CV p.1', excerpt: 'Shipped.' },
      {
        id: 'linkedin-proof',
        sourceId: 'linkedin',
        label: 'Experience',
        excerpt: 'Built a platform.',
      },
    ],
    claims: [
      {
        id: 'result',
        statement: 'Helped improve deployment reliability.',
        kind: 'result',
        level: 'declared',
        evidenceIds: ['cv-proof'],
        sensitivity: 'private',
        allowedUses: ['resume', 'application'],
      },
      {
        id: 'platform',
        statement: 'Built a platform.',
        kind: 'experience',
        level: 'declared',
        evidenceIds: ['linkedin-proof'],
        sensitivity: 'private',
        allowedUses: ['linkedin', 'application'],
      },
      {
        id: 'unsupported',
        statement: 'Owned Kubernetes operations.',
        kind: 'skill',
        level: 'unsupported',
        evidenceIds: [],
        sensitivity: 'private',
        allowedUses: ['resume', 'linkedin', 'application'],
      },
      {
        id: 'duplicate',
        statement: 'Built a platform.',
        kind: 'experience',
        level: 'declared',
        evidenceIds: [],
        sensitivity: 'private',
        allowedUses: ['application'],
      },
    ],
  };
  const searchProfile = {
    searchProfileId: '988c0a00-0000-4000-8000-000000000061',
    revision: 1,
    createdAt: '2026-09-05T08:00:00.000Z',
    updatedAt: '2026-09-05T08:00:00.000Z',
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
  } satisfies SearchProfile;

  const audit = auditPositioning(profile, [searchProfile], ['result']);

  assert.deepEqual(audit.targets, ['Staff Platform Engineer', 'Kubernetes']);
  assert.equal(audit.channels.resume.claimIds.length, 1);
  assert.equal(audit.channels.linkedin.claimIds.length, 1);
  assert.equal(audit.channels.applications.claimIds.length, 1);
  assert.equal(audit.channels.resume.explicitTargets.length, 0);
  assert.equal(audit.coherence.resumeAndLinkedin, 0);
  assert.deepEqual(audit.missingTargetTerms, ['Staff Platform Engineer']);
  assert.equal(audit.vagueClaims[0]?.id, 'result');
  assert.equal(audit.missingEvidence[0]?.id, 'unsupported');
  assert.deepEqual(audit.duplicateClaims[0]?.claimIds, [
    'platform',
    'duplicate',
  ]);
  assert.match(audit.suggestions[0]!.template, /\[measured outcome\]/);
});
