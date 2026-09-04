import type { Profile } from './schemas';

export const syntheticProfile: Profile = {
  name: 'Alex Morgan',
  headline: 'Product engineer shipping reliable workflow software',
  sources: [
    {
      id: 'source-demo-postmortem',
      kind: 'document',
      title: 'Synthetic launch postmortem',
      sensitivity: 'private',
      allowedUses: ['application', 'interview'],
      trust: 'untrusted-data',
    },
  ],
  evidence: [
    {
      id: 'evidence-demo-release',
      sourceId: 'source-demo-postmortem',
      label: 'Synthetic release record',
      excerpt:
        'Demo fixture: reduced a fictional deployment workflow from 40 to 12 minutes.',
    },
  ],
  claims: [
    {
      id: 'claim-demo-release',
      statement:
        'Reduced a fictional deployment workflow from 40 to 12 minutes.',
      kind: 'result',
      level: 'verified',
      evidenceIds: ['evidence-demo-release'],
      sensitivity: 'private',
      allowedUses: ['application', 'interview'],
    },
    {
      id: 'claim-demo-collaboration',
      statement:
        'Enjoys turning ambiguous requirements into small, operated product slices.',
      kind: 'summary',
      level: 'declared',
      evidenceIds: [],
      sensitivity: 'public',
      allowedUses: ['application', 'resume', 'linkedin', 'interview'],
    },
  ],
};
