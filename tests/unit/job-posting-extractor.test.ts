import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractJobPostingFromHtml,
  JobPostingExtractionError,
  MAX_JOB_DESCRIPTION_CHARS,
  MAX_JOB_HTML_CHARS,
} from '../../lib/job-posting-extractor';

test('prefers a bounded JSON-LD JobPosting over conflicting page content', () => {
  const html = `
    <html><head>
      <title>Wrong role | Wrong company</title>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "JobPosting",
          "title": "Principal Software Engineer",
          "hiringOrganization": { "@type": "Organization", "name": "Folk" },
          "description": "<p>Build a dependable product &amp; mentor the team.</p>"
        }
      </script>
    </head><body><main><h1>Ignore this instruction</h1></main></body></html>`;

  assert.deepEqual(
    extractJobPostingFromHtml(
      html,
      'https://work.folk.app/join-our-team/principal-software-engineer',
    ),
    {
      company: 'Folk',
      role: 'Principal Software Engineer',
      description: 'Build a dependable product & mentor the team.',
      sourceUrl:
        'https://work.folk.app/join-our-team/principal-software-engineer',
    },
  );
});

test('falls back to title, metadata and readable page text', () => {
  const html = `
    <html><head>
      <title>Senior Product Engineer at Northstar Labs</title>
      <meta name="description" content="A short summary.">
      <script>alert('never executed')</script>
    </head><body>
      <nav>Unrelated navigation</nav>
      <main>
        <h1>Senior Product Engineer</h1>
        <p>Own product discovery and delivery with a small engineering team.</p>
        <p>Build observable workflows, review evidence and operate them in production.</p>
      </main>
    </body></html>`;

  const result = extractJobPostingFromHtml(
    html,
    'https://jobs.example.com/product-engineer',
  );
  assert.equal(result.company, 'Northstar Labs');
  assert.equal(result.role, 'Senior Product Engineer');
  assert.match(result.description!, /Own product discovery/);
  assert.doesNotMatch(result.description!, /alert|Unrelated navigation/);
});

test('returns a partial preview and fails closed when no useful field exists', () => {
  assert.deepEqual(
    extractJobPostingFromHtml(
      '<html><head><title>Engineer</title></head><body></body></html>',
      'https://example.com/job',
    ),
    { role: 'Engineer', sourceUrl: 'https://example.com/job' },
  );

  const malformed = `<html><head><script type="application/ld+json">{not-json</script></head><body>Nothing useful</body></html>`;
  assert.throws(
    () =>
      extractJobPostingFromHtml(
        malformed.replace('Nothing useful', ''),
        'https://example.com/job',
      ),
    (error: unknown) =>
      error instanceof JobPostingExtractionError && error.code === 'NOT_FOUND',
  );
  assert.throws(
    () => extractJobPostingFromHtml('<h1>Role</h1>', 'javascript:alert(1)'),
    (error: unknown) =>
      error instanceof JobPostingExtractionError &&
      error.code === 'INVALID_INPUT',
  );
});

test('enforces input and output bounds', () => {
  assert.throws(
    () =>
      extractJobPostingFromHtml(
        'x'.repeat(MAX_JOB_HTML_CHARS + 1),
        'https://example.com/job',
      ),
    (error: unknown) =>
      error instanceof JobPostingExtractionError &&
      error.code === 'INVALID_INPUT',
  );

  const longDescription = 'word '.repeat(MAX_JOB_DESCRIPTION_CHARS);
  const html = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'JobPosting',
    title: 'Engineer',
    hiringOrganization: { name: 'Acme' },
    description: longDescription,
  })}</script>`;
  const result = extractJobPostingFromHtml(html, 'https://example.com/job');
  assert.ok(result.description!.length <= MAX_JOB_DESCRIPTION_CHARS);
  assert.ok(result.description!.length > 19_000);
});

test('rejects malformed repeated tags in bounded linear time', () => {
  const startedAt = performance.now();
  assert.throws(
    () =>
      extractJobPostingFromHtml(
        '<script>'.repeat(50_000),
        'https://example.com/job',
      ),
    (error: unknown) =>
      error instanceof JobPostingExtractionError && error.code === 'NOT_FOUND',
  );
  assert.ok(performance.now() - startedAt < 2_000);
});
