import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contactResearchOutputSchema } from '../../lib/application-contact';

const source = {
  url: 'https://company.example/team',
  title: 'Company team',
  collectedAt: '2026-09-05T08:00:00.000Z',
  trust: 'authoritative' as const,
  supports: ['identity', 'current_role', 'hiring_scope'] as const,
};

const contact = {
  rank: 1,
  name: 'Morgan Lee',
  role: 'VP Engineering',
  profileUrl: 'https://www.linkedin.com/in/morgan-lee',
  relationship: 'hiring_manager' as const,
  rationale: 'Owns the team hiring for this role.',
  sources: [source],
  confidence: 'verified' as const,
  connectionNote: 'Hello Morgan, I am applying to the product role.',
  acceptedMessage: 'Thanks for connecting. Here is why I applied.',
};

test('accepts at most three unique, publicly supported contacts', () => {
  assert.equal(
    contactResearchOutputSchema.parse({
      schemaVersion: 1,
      purpose: 'application-contact-research-result',
      contacts: [contact],
    }).contacts.length,
    1,
  );
  assert.equal(
    contactResearchOutputSchema.safeParse({
      schemaVersion: 1,
      purpose: 'application-contact-research-result',
      contacts: [contact, contact],
    }).success,
    false,
  );
});

test('rejects a hiring-manager guess supported only by a weak match', () => {
  assert.equal(
    contactResearchOutputSchema.safeParse({
      schemaVersion: 1,
      purpose: 'application-contact-research-result',
      contacts: [
        {
          ...contact,
          confidence: 'uncertain',
          sources: [{ ...source, trust: 'weak' }],
        },
      ],
    }).success,
    false,
  );
});

test('rejects duplicated sources and unsupported verified confidence', () => {
  const output = (overrides: object) => ({
    schemaVersion: 1,
    purpose: 'application-contact-research-result',
    contacts: [{ ...contact, relationship: 'team_leader', ...overrides }],
  });
  assert.equal(
    contactResearchOutputSchema.safeParse(output({ sources: [source, source] }))
      .success,
    false,
  );
  assert.equal(
    contactResearchOutputSchema.safeParse(
      output({ sources: [{ ...source, trust: 'weak' }] }),
    ).success,
    false,
  );
});

test('accepts only credential-free HTTP contact links', () => {
  const output = (profileUrl: string) => ({
    schemaVersion: 1,
    purpose: 'application-contact-research-result',
    contacts: [{ ...contact, profileUrl }],
  });
  assert.equal(
    contactResearchOutputSchema.safeParse(output('javascript:alert(1)'))
      .success,
    false,
  );
  assert.equal(
    contactResearchOutputSchema.safeParse(
      output('https://user:password@company.example/profile'),
    ).success,
    false,
  );
});
