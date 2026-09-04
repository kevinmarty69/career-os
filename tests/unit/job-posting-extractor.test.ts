import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractJobPostingFromHtml,
  extractReadablePageText,
  JobPostingExtractionError,
  jobPostingImportResponseSchema,
  MAX_JOB_DESCRIPTION_CHARS,
  MAX_JOB_HTML_CHARS,
} from '../../lib/job-posting-extractor';

test('extracts bounded readable text from HTML and plain pages', () => {
  assert.equal(
    extractReadablePageText(
      '<nav>Skip</nav><main><h1>Role</h1><p>Build products.</p></main>',
      'text/html',
    ),
    'Role\n\nBuild products.',
  );
  const plainText = extractReadablePageText(
    ' word '.repeat(10_000),
    'text/plain',
  );
  assert.ok(plainText!.length <= MAX_JOB_DESCRIPTION_CHARS);
  assert.ok(plainText!.length > 19_000);
  assert.throws(
    () =>
      extractReadablePageText('x'.repeat(MAX_JOB_HTML_CHARS + 1), 'text/html'),
    (error: unknown) =>
      error instanceof JobPostingExtractionError &&
      error.code === 'INVALID_INPUT',
  );
  assert.throws(
    () =>
      extractReadablePageText('content', 'application/json' as 'text/plain'),
    (error: unknown) =>
      error instanceof JobPostingExtractionError &&
      error.code === 'INVALID_INPUT',
  );
});

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

test('extracts at most three safe deduplicated company sources from JSON-LD', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'JobPosting',
    title: 'Engineer',
    hiringOrganization: {
      name: 'Folk',
      url: 'https://folk.app',
      sameAs: [
        'https://folk.app/',
        'https://www.linkedin.com/company/folk/',
        'ftp://files.example.com/folk',
        'https://user:secret@example.com/private',
        'https://github.com/folk',
        'https://example.com/ignored-fourth-source',
      ],
    },
    description: 'Build dependable product workflows.',
  })}</script>`;

  assert.deepEqual(
    extractJobPostingFromHtml(html, 'https://jobs.example.com/engineer')
      .companySources,
    [
      { url: 'https://folk.app/', origin: 'job-jsonld' },
      {
        url: 'https://www.linkedin.com/company/folk/',
        origin: 'job-jsonld',
      },
      { url: 'https://github.com/folk', origin: 'job-jsonld' },
    ],
  );
});

test('strictly validates imported company sources', () => {
  const base = {
    role: 'Engineer',
    sourceUrl: 'https://jobs.example.com/engineer',
  };
  const extraction = extractJobPostingFromHtml(
    '<h1>Engineer</h1>',
    base.sourceUrl,
  );
  assert.equal(extraction.companySources, undefined);

  const provenance = {
    requestedUrl: base.sourceUrl,
    finalUrl: base.sourceUrl,
    fetchedAt: new Date(0).toISOString(),
    contentType: 'text/html',
    bytes: 1,
    trust: 'untrusted-data',
  };
  assert.equal(
    jobPostingImportResponseSchema.safeParse({
      ...base,
      companySources: [
        { url: 'https://user:secret@example.com', origin: 'job-jsonld' },
      ],
      provenance,
    }).success,
    false,
  );
  assert.equal(
    jobPostingImportResponseSchema.safeParse({
      ...base,
      companySources: [{ url: 'javascript:alert(1)', origin: 'job-jsonld' }],
      provenance,
    }).success,
    false,
  );
  assert.equal(
    jobPostingImportResponseSchema.safeParse({
      ...base,
      companySources: [
        { url: 'https://example.com', origin: 'job-jsonld' },
        { url: 'https://example.com/', origin: 'job-jsonld' },
      ],
      provenance,
    }).success,
    false,
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
