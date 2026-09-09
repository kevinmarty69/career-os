import assert from 'node:assert/strict';
import test from 'node:test';
import {
  githubRepositorySchema,
  parseGitHubSource,
} from '../../lib/github-source';

test('GitHub import accepts only public repository metadata and bounded UTF-8 README content', () => {
  assert.equal(
    githubRepositorySchema.parse('https://github.com/octocat/project/'),
    'octocat/project',
  );
  for (const input of [
    'https://github.com@localhost/repo',
    'https://github.com/a/b?token=secret',
    'https://github.com/a/b/contents/x',
    'a/..',
    'a/%2e%2e',
    'https://elsewhere.test/a/b',
  ])
    assert.equal(githubRepositorySchema.safeParse(input).success, false);
  const text = 'A public project. No personal ownership is implied.';
  const repo = {
    full_name: 'octocat/project',
    private: false,
    stargazers_count: 3,
    updated_at: '2026-09-09T10:00:00.000Z',
  };
  const file = {
    type: 'file',
    encoding: 'base64',
    content: Buffer.from(text).toString('base64'),
    size: Buffer.byteLength(text),
    sha: 'a'.repeat(40),
  };
  const parse = (r: unknown = repo, f: unknown = file) =>
    parseGitHubSource(
      'octocat/project',
      r,
      f,
      { TypeScript: 200 },
      repo.updated_at,
    );
  assert.equal(parse().readme, text);
  assert.deepEqual(parse().languages, ['TypeScript']);
  assert.throws(() => parse({ ...repo, private: true }));
  assert.throws(() => parse({ ...repo, full_name: 'another/project' }));
  assert.throws(() => parse(repo, { ...file, size: 999 }));
  assert.throws(() => parse(repo, { ...file, size: 262145 }));
  assert.throws(() => parse(repo, { ...file, content: 'bad*base64' }));
  assert.throws(() => parse(repo, { ...file, content: '/w==', size: 1 }));
});
