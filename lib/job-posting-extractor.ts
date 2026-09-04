import { z } from 'zod';
import { httpUrlSchema } from './http-url';

export const MAX_JOB_HTML_CHARS = 1_000_000;
export const MAX_JOB_DESCRIPTION_CHARS = 20_000;

const companySourceSchema = z
  .object({
    url: httpUrlSchema.refine((value) => {
      const url = new URL(value);
      return !url.username && !url.password;
    }),
    origin: z.literal('job-jsonld'),
  })
  .strict();

const companySourcesSchema = z
  .array(companySourceSchema)
  .min(1)
  .max(3)
  .refine(
    (sources) =>
      new Set(sources.map(({ url }) => new URL(url).href)).size ===
      sources.length,
    'Company source URLs must be unique.',
  );

export const jobPostingExtractionSchema = z
  .object({
    company: z.string().min(1).max(200).optional(),
    role: z.string().min(1).max(200).optional(),
    description: z.string().min(1).max(MAX_JOB_DESCRIPTION_CHARS).optional(),
    companySources: companySourcesSchema.optional(),
    sourceUrl: httpUrlSchema,
  })
  .refine(
    ({ company, role, description }) => Boolean(company || role || description),
    'At least one job field is required.',
  )
  .strict();

export type JobPostingExtraction = z.infer<typeof jobPostingExtractionSchema>;

export const jobPostingImportResponseSchema = z
  .object({
    company: z.string().min(1).max(200).optional(),
    role: z.string().min(1).max(200).optional(),
    description: z.string().min(1).max(MAX_JOB_DESCRIPTION_CHARS).optional(),
    companySources: companySourcesSchema.optional(),
    sourceUrl: httpUrlSchema,
    provenance: z
      .object({
        requestedUrl: httpUrlSchema,
        finalUrl: httpUrlSchema,
        fetchedAt: z.string().datetime(),
        contentType: z.enum(['text/html', 'text/plain']),
        bytes: z.number().int().nonnegative().max(1_048_576),
        trust: z.literal('untrusted-data'),
      })
      .strict(),
  })
  .refine(
    ({ company, role, description }) => Boolean(company || role || description),
    'At least one job field is required.',
  )
  .strict();

export type JobPostingImportResponse = z.infer<
  typeof jobPostingImportResponseSchema
>;

export class JobPostingExtractionError extends Error {
  constructor(public readonly code: 'INVALID_INPUT' | 'NOT_FOUND') {
    super(
      code === 'INVALID_INPUT'
        ? 'The job posting input is invalid.'
        : 'The job posting could not be extracted.',
    );
    this.name = 'JobPostingExtractionError';
  }
}

const inputSchema = z
  .object({
    html: z.string().min(1).max(MAX_JOB_HTML_CHARS),
    sourceUrl: httpUrlSchema,
  })
  .strict();

type JobPostingCandidate = {
  company?: string;
  role?: string;
  description?: string;
  companySources?: Array<z.infer<typeof companySourceSchema>>;
};

/**
 * Extracts untrusted job-posting content without executing HTML or performing IO.
 */
export function extractJobPostingFromHtml(
  html: string,
  finalUrl: string,
): JobPostingExtraction {
  const input = inputSchema.safeParse({ html, sourceUrl: finalUrl });
  if (!input.success) throw new JobPostingExtractionError('INVALID_INPUT');

  const jsonLd = extractJsonLdJobPosting(input.data.html);
  const fallback = extractFallback(input.data.html);
  const company = jsonLd?.company ?? fallback.company;
  const role = jsonLd?.role ?? fallback.role;
  const description = jsonLd?.description ?? fallback.description;
  const companySources = jsonLd?.companySources;
  const candidate = {
    ...(company ? { company } : {}),
    ...(role ? { role } : {}),
    ...(description ? { description } : {}),
    ...(companySources ? { companySources } : {}),
    sourceUrl: input.data.sourceUrl,
  };
  const result = jobPostingExtractionSchema.safeParse(candidate);
  if (!result.success) throw new JobPostingExtractionError('NOT_FOUND');
  return result.data;
}

export function extractReadablePageText(
  content: string,
  contentType: 'text/html' | 'text/plain',
): string | undefined {
  if (
    !content ||
    content.length > MAX_JOB_HTML_CHARS ||
    !['text/html', 'text/plain'].includes(contentType)
  )
    throw new JobPostingExtractionError('INVALID_INPUT');
  return contentType === 'text/html'
    ? readablePageText(content)
    : boundedText(content, MAX_JOB_DESCRIPTION_CHARS);
}

function extractJsonLdJobPosting(
  html: string,
): JobPostingCandidate | undefined {
  let best: JobPostingCandidate | undefined;
  for (const script of closedElements(html, 'script', 24)) {
    const type = readAttribute(script.attributes, 'type')?.toLowerCase();
    if (type !== 'application/ld+json' || script.content.length > 250_000)
      continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.content);
    } catch {
      continue;
    }
    for (const item of topLevelJsonLdItems(parsed)) {
      if (!isJobPosting(item)) continue;
      const organization = item.hiringOrganization;
      const company =
        typeof organization === 'string'
          ? boundedText(organization, 200)
          : isRecord(organization)
            ? boundedText(organization.name, 200)
            : undefined;
      const role = boundedText(item.title, 200);
      const description = htmlToText(
        item.description,
        MAX_JOB_DESCRIPTION_CHARS,
      );
      const companySources = isRecord(organization)
        ? extractCompanySources(organization)
        : undefined;
      const candidate = { company, role, description, companySources };
      if (company && role && description) return candidate;
      if (candidateScore(candidate) > candidateScore(best)) best = candidate;
    }
  }
  return best;
}

function extractCompanySources(organization: Record<string, unknown>) {
  const candidates = [
    organization.url,
    ...(Array.isArray(organization.sameAs)
      ? organization.sameAs
      : [organization.sameAs]),
  ];
  const sources: Array<z.infer<typeof companySourceSchema>> = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const parsed = companySourceSchema.shape.url.safeParse(candidate);
    if (!parsed.success) continue;
    const url = new URL(parsed.data).href;
    if (seen.has(url)) continue;
    seen.add(url);
    sources.push({ url, origin: 'job-jsonld' });
    if (sources.length === 3) break;
  }
  return sources.length ? sources : undefined;
}

function candidateScore(candidate: JobPostingCandidate | undefined): number {
  if (!candidate) return 0;
  return (
    Number(Boolean(candidate.company)) +
    Number(Boolean(candidate.role)) +
    Number(Boolean(candidate.description))
  );
}

function topLevelJsonLdItems(value: unknown): Record<string, unknown>[] {
  const roots = Array.isArray(value) ? value : [value];
  const items: Record<string, unknown>[] = [];
  for (const root of roots.slice(0, 50)) {
    if (!isRecord(root)) continue;
    items.push(root);
    if (Array.isArray(root['@graph'])) {
      for (const item of root['@graph'].slice(0, 50)) {
        if (isRecord(item)) items.push(item);
      }
    }
  }
  return items;
}

function isJobPosting(value: Record<string, unknown>): boolean {
  const type = value['@type'];
  return typeof type === 'string'
    ? type.toLowerCase() === 'jobposting'
    : Array.isArray(type) &&
        type.some(
          (item) =>
            typeof item === 'string' && item.toLowerCase() === 'jobposting',
        );
}

function extractFallback(html: string): JobPostingCandidate {
  const metadata = extractMetadata(html);
  const rawHeading = firstTagText(html, 'h1');
  const rawTitle =
    metadata.get('og:title') ??
    metadata.get('twitter:title') ??
    firstTagText(html, 'title') ??
    rawHeading;
  const split = splitRoleAndCompany(rawTitle);
  const role = boundedText(split?.role ?? rawHeading ?? rawTitle, 200);
  const company = boundedText(
    metadata.get('job:company') ??
      metadata.get('og:site_name') ??
      split?.company,
    200,
  );
  const readable = extractReadablePageText(html, 'text/html');
  const metaDescription =
    metadata.get('description') ??
    metadata.get('og:description') ??
    metadata.get('twitter:description');
  const description = chooseDescription(readable, metaDescription);
  return { company, role, description };
}

function extractMetadata(html: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const attributes of openingTags(html, 'meta', 50)) {
    const key = (
      readAttribute(attributes, 'property') ?? readAttribute(attributes, 'name')
    )?.toLowerCase();
    const content = readAttribute(attributes, 'content');
    if (key && content && !result.has(key))
      result.set(key, decodeEntities(content));
  }
  return result;
}

function readAttribute(attributes: string, name: string): string | undefined {
  if (attributes.length > 8_192) return undefined;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = attributes.match(
    new RegExp(
      `(?:^|\\s)${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\\x60]+))`,
      'i',
    ),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function firstTagText(html: string, tag: 'title' | 'h1'): string | undefined {
  return htmlToText(closedElements(html, tag, 1)[0]?.content, 400);
}

function splitRoleAndCompany(
  value: string | undefined,
): { role: string; company: string } | undefined {
  const text = boundedText(value, 400);
  if (!text) return undefined;
  const at = text.match(/^(.{2,200}?)\s+(?:at|chez)\s+(.{2,200})$/i);
  if (at) return { role: at[1].trim(), company: at[2].trim() };
  for (const separator of [' | ', ' - ', ' · ', ' — ', ' – ']) {
    const parts = text
      .split(separator)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 2) return { role: parts[0], company: parts[1] };
  }
  return undefined;
}

function readablePageText(html: string): string | undefined {
  const region =
    closedElements(html, 'main', 1)[0]?.content ??
    closedElements(html, 'article', 1)[0]?.content ??
    closedElements(html, 'body', 1)[0]?.content ??
    html;
  return htmlToText(region, MAX_JOB_DESCRIPTION_CHARS);
}

function chooseDescription(
  readable: string | undefined,
  metadata: string | undefined,
): string | undefined {
  const body = boundedText(readable, MAX_JOB_DESCRIPTION_CHARS);
  const meta = boundedText(metadata, MAX_JOB_DESCRIPTION_CHARS);
  if (body && body.length >= 120) return body;
  return meta ?? body;
}

function htmlToText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  return boundedText(decodeEntities(stripHtml(value)), maximum);
}

const hiddenElements = new Set([
  'footer',
  'form',
  'header',
  'nav',
  'noscript',
  'script',
  'style',
  'svg',
  'template',
]);
const lineBreakElements = new Set([
  'br',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'p',
]);

function stripHtml(html: string): string {
  const lower = html.toLowerCase();
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf('<', cursor);
    if (start < 0) {
      chunks.push(html.slice(cursor));
      break;
    }
    chunks.push(html.slice(cursor, start));
    if (lower.startsWith('<!--', start)) {
      const commentEnd = lower.indexOf('-->', start + 4);
      if (commentEnd < 0) break;
      cursor = commentEnd + 3;
      continue;
    }
    const end = html.indexOf('>', start + 1);
    if (end < 0) break;
    const tag = tagName(lower, start, end);
    const closing = lower[start + 1] === '/';
    if (!closing && tag && hiddenElements.has(tag)) {
      const closeStart = lower.indexOf(`</${tag}`, end + 1);
      if (closeStart < 0) break;
      const closeEnd = lower.indexOf('>', closeStart + tag.length + 2);
      if (closeEnd < 0) break;
      cursor = closeEnd + 1;
      chunks.push(' ');
      continue;
    }
    if (tag && lineBreakElements.has(tag)) chunks.push('\n');
    else chunks.push(' ');
    cursor = end + 1;
  }
  return chunks.join('');
}

function closedElements(html: string, tag: string, maximum: number) {
  const lower = html.toLowerCase();
  const elements: { attributes: string; content: string }[] = [];
  let cursor = 0;
  while (elements.length < maximum) {
    const start = nextOpeningTag(lower, tag, cursor);
    if (start < 0) break;
    const openEnd = lower.indexOf('>', start + tag.length + 1);
    if (openEnd < 0) break;
    const closeStart = lower.indexOf(`</${tag}`, openEnd + 1);
    if (closeStart < 0) break;
    const closeEnd = lower.indexOf('>', closeStart + tag.length + 2);
    if (closeEnd < 0) break;
    elements.push({
      attributes: html.slice(start + tag.length + 1, openEnd),
      content: html.slice(openEnd + 1, closeStart),
    });
    cursor = closeEnd + 1;
  }
  return elements;
}

function openingTags(html: string, tag: string, maximum: number) {
  const lower = html.toLowerCase();
  const attributes: string[] = [];
  let cursor = 0;
  while (attributes.length < maximum) {
    const start = nextOpeningTag(lower, tag, cursor);
    if (start < 0) break;
    const end = lower.indexOf('>', start + tag.length + 1);
    if (end < 0) break;
    attributes.push(html.slice(start + tag.length + 1, end));
    cursor = end + 1;
  }
  return attributes;
}

function nextOpeningTag(html: string, tag: string, from: number) {
  const needle = `<${tag}`;
  let cursor = from;
  while (cursor < html.length) {
    const start = html.indexOf(needle, cursor);
    if (start < 0) return -1;
    const boundary = html[start + needle.length];
    if (!boundary || /[\s/>]/.test(boundary)) return start;
    cursor = start + needle.length;
  }
  return -1;
}

function tagName(html: string, start: number, end: number) {
  let cursor = start + 1;
  if (html[cursor] === '/') cursor += 1;
  while (cursor < end && /\s/.test(html[cursor])) cursor += 1;
  const nameStart = cursor;
  while (cursor < end && /[a-z0-9:-]/.test(html[cursor])) cursor += 1;
  return cursor > nameStart ? html.slice(nameStart, cursor) : undefined;
}

function boundedText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value
    .replace(/\u0000/g, '')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!normalized) return undefined;
  if (normalized.length <= maximum) return normalized;
  return normalized.slice(0, maximum).trimEnd();
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };
  return value.replace(
    /&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]{2,8}));/gi,
    (entity, decimal: string, hexadecimal: string, name: string) => {
      if (name) return named[name.toLowerCase()] ?? entity;
      const point = Number.parseInt(
        decimal ?? hexadecimal,
        hexadecimal ? 16 : 10,
      );
      return Number.isSafeInteger(point) && point > 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : entity;
    },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
