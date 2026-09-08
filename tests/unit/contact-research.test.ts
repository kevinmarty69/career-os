import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  contactResearchRequestSchema,
  groundContactSuggestions,
  publicPageLinks,
} from '../../lib/contact-research';

const source = {
  url: 'https://example.com/team',
  title: 'Example team',
  collectedAt: '2026-09-08T12:00:00.000Z',
  excerpt: 'Jane Doe is CTO at Example. Alex Smith is Recruiter at Example.',
  profileUrls: ['https://example.com/jane', 'https://example.com/alex'],
};
const person = {
  name: 'Jane Doe',
  role: 'CTO',
  profileUrl: source.profileUrls[0],
  sourceIndex: 0,
  quote: 'Jane Doe is CTO at Example.',
};

test('contact research grounds employment and ranks recruiters before founders without hiring-manager assertions', () => {
  const drafts = groundContactSuggestions(
    {
      people: [
        person,
        {
          name: 'Alex Smith',
          role: 'Recruiter',
          profileUrl: source.profileUrls[1],
          sourceIndex: 0,
          quote: 'Alex Smith is Recruiter at Example.',
        },
      ],
    },
    [source],
    'Example',
    'Engineer',
    'en',
  );
  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].name, 'Alex Smith');
  assert.equal(drafts[1].rank, 2);
  assert.equal(drafts[1].confidence, 'uncertain');
  assert.equal(drafts[1].relationship, 'founder_or_technical_leader');
  assert.equal(drafts[1].sources[0].excerpt, person.quote);
  assert.match(drafts[0].connectionNote, /Would you be the right person/);
});

test('contact research rejects invented URLs, quotes, company, role, duplicate profiles and missing source', () => {
  for (const changed of [
    { ...person, profileUrl: 'https://example.com/invented' },
    { ...person, quote: 'Jane Doe is hiring for Example.' },
    { ...person, role: 'CEO' },
    { ...person, sourceIndex: 5 },
  ])
    assert.throws(() =>
      groundContactSuggestions(
        { people: [changed] },
        [source],
        'Example',
        'Engineer',
        'en',
      ),
    );
  assert.throws(() =>
    groundContactSuggestions(
      { people: [person, person] },
      [source],
      'Example',
      'Engineer',
      'en',
    ),
  );
  assert.throws(() =>
    groundContactSuggestions(
      { people: [person] },
      [source],
      'OtherCompany',
      'Engineer',
      'en',
    ),
  );
  assert.deepEqual(
    groundContactSuggestions(
      { people: [] },
      [source],
      'Example',
      'Engineer',
      'fr',
    ),
    [],
  );
});

test('public source links reject credentials and executable URLs; request is bounded', () => {
  assert.deepEqual(
    publicPageLinks(
      `<a href="/team">Team</a><a href="javascript:alert(1)">bad</a>
    <a href="https://user:secret@example.com/person">bad</a><a href="/team">dup</a>`,
      source.url,
    ),
    ['https://example.com/team'],
  );
  assert.equal(
    contactResearchRequestSchema.safeParse({
      urls: Array(4).fill(source.url),
      locale: 'en',
    }).success,
    false,
  );
});

test('past employment cannot be passed off as current contact evidence', () => {
  const quote = 'Jane Doe was CTO at Example.';
  assert.throws(() =>
    groundContactSuggestions(
      { people: [{ ...person, quote }] },
      [{ ...source, excerpt: quote }],
      'Example',
      'Engineer',
      'en',
    ),
  );
});
