import { z } from 'zod';

export const MAX_PROFILE_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_PROFILE_TEXT_CHARS = 200_000;
export const MAX_PROFILE_CANDIDATES = 40;
export const MAX_PDF_PAGES = 100;

const declaredSuggestionSchema = z
  .object({
    value: z.string().min(1),
    provenance: z.literal('declared'),
    trust: z.literal('untrusted-data'),
  })
  .strict();

export const profileImportCandidateSchema = z
  .object({
    statement: z.string().min(1).max(1_000),
    excerpt: z.string().min(1).max(1_000),
    locator: z.string().min(1).max(200),
    group: z.enum([
      'summary',
      'experience',
      'project',
      'skill',
      'education',
      'other',
    ]),
    provenance: z.literal('declared'),
    trust: z.literal('untrusted-data'),
  })
  .strict();

export const profileImportSourceSchema = z
  .object({
    displayName: z.string().min(1).max(255),
    type: z.enum(['txt', 'pdf', 'docx']),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    trust: z.literal('untrusted-data'),
  })
  .strict();

export const profileImportResultSchema = z
  .object({
    version: z.literal(1),
    source: profileImportSourceSchema,
    suggestedName: declaredSuggestionSchema
      .extend({ value: z.string().min(2).max(200) })
      .nullable(),
    suggestedHeadline: declaredSuggestionSchema
      .extend({ value: z.string().min(2).max(500) })
      .nullable(),
    candidates: z
      .array(profileImportCandidateSchema)
      .max(MAX_PROFILE_CANDIDATES),
  })
  .strict();

export type ProfileImportFileType = 'txt' | 'pdf' | 'docx';
export type ProfileImportSuggestion = z.infer<typeof declaredSuggestionSchema>;
export type ProfileImportSource = z.infer<typeof profileImportSourceSchema>;
export type ProfileImportCandidate = z.infer<
  typeof profileImportCandidateSchema
>;
export type ProfileImportResult = z.infer<typeof profileImportResultSchema>;

export type ProfileImportErrorCode =
  | 'aborted'
  | 'binary_text'
  | 'docx_external_relationship'
  | 'docx_unsafe_archive'
  | 'empty_document'
  | 'file_too_large'
  | 'invalid_docx'
  | 'invalid_pdf'
  | 'invalid_utf8'
  | 'pdf_attachments'
  | 'pdf_encrypted'
  | 'pdf_too_many_pages'
  | 'text_too_large'
  | 'timeout'
  | 'type_mismatch'
  | 'unsupported_type'
  | 'worker_failed';

export class ProfileImportError extends Error {
  constructor(
    public readonly code: ProfileImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProfileImportError';
  }
}

export type ProfileFileDescriptor = {
  displayName: string;
  mimeType: string;
  size: number;
};

export type ProfileTextSection = {
  text: string;
  locator: string;
};

const PDF_MIME_TYPES = new Set([
  'application/pdf',
  'application/x-pdf',
  'application/octet-stream',
]);
const DOCX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'application/octet-stream',
]);
const TXT_MIME_TYPES = new Set(['text/plain', 'application/octet-stream']);

export function detectProfileFileType(
  file: ProfileFileDescriptor,
  bytes: Uint8Array,
): ProfileImportFileType {
  if (
    file.size > MAX_PROFILE_FILE_BYTES ||
    bytes.byteLength > MAX_PROFILE_FILE_BYTES
  )
    throw new ProfileImportError(
      'file_too_large',
      'The profile file must be 4 MiB or smaller.',
    );

  const extension = file.displayName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const mimeType = file.mimeType.toLowerCase().split(';', 1)[0].trim();
  const isPdf = startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  const isZip =
    startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]);

  if (extension === 'pdf') {
    assertMime(mimeType, PDF_MIME_TYPES);
    if (!isPdf) typeMismatch();
    return 'pdf';
  }
  if (extension === 'docx') {
    assertMime(mimeType, DOCX_MIME_TYPES);
    if (!isZip) typeMismatch();
    return 'docx';
  }
  if (extension === 'txt') {
    assertMime(mimeType, TXT_MIME_TYPES);
    if (isPdf || isZip) typeMismatch();
    return 'txt';
  }
  throw new ProfileImportError(
    'unsupported_type',
    'Only TXT, PDF and DOCX profile files are supported.',
  );
}

export function decodeUtf8Text(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ProfileImportError(
      'invalid_utf8',
      'The TXT file must contain valid UTF-8 text.',
    );
  }
  if (text.includes('\0'))
    throw new ProfileImportError(
      'binary_text',
      'The TXT file contains binary data.',
    );
  return validateProfileText(text.replace(/^\uFEFF/, ''));
}

export function validateProfileText(text: string): string {
  if (text.length > MAX_PROFILE_TEXT_CHARS)
    throw new ProfileImportError(
      'text_too_large',
      'Extracted profile text must be 200,000 characters or fewer.',
    );
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized)
    throw new ProfileImportError(
      'empty_document',
      'No readable profile text was found.',
    );
  return normalized;
}

export function containsPdfEncryptionMarker(bytes: Uint8Array): boolean {
  return containsAscii(bytes, '/Encrypt');
}

export function extractProfileSuggestions(
  sections: ProfileTextSection[],
): Pick<
  ProfileImportResult,
  'suggestedName' | 'suggestedHeadline' | 'candidates'
> {
  const lines = sections.flatMap((section) =>
    section.text.split(/\r?\n/).map((text) => ({
      text: cleanLine(text),
    })),
  );
  const nonEmpty = lines.filter(({ text }) => text.length > 0);
  const suggestedNameValue = nonEmpty
    .slice(0, 5)
    .map(({ text }) => recoverNamePrefix(text))
    .find((value): value is string => value !== undefined);
  const suggestedHeadlineValue = nonEmpty
    .slice(0, 30)
    .find(
      ({ text }) =>
        text !== suggestedNameValue &&
        !isContactLine(text) &&
        !getSectionGroup(text) &&
        text.length <= 180 &&
        ROLE_PATTERN.test(text),
    )?.text;

  const candidates: ProfileImportCandidate[] = [];
  const seenCandidates = new Set<string>();
  for (const logicalLine of coalesceCandidateLines(
    sections,
    suggestedNameValue,
    suggestedHeadlineValue,
  )) {
    for (const excerpt of splitCandidateLine(logicalLine.text)) {
      const key = excerpt.toLocaleLowerCase();
      if (!isUsefulCandidate(excerpt) || seenCandidates.has(key)) continue;
      seenCandidates.add(key);
      candidates.push({
        statement: excerpt,
        excerpt,
        locator: logicalLine.locator,
        group: logicalLine.group,
        provenance: 'declared',
        trust: 'untrusted-data',
      });
      if (candidates.length === MAX_PROFILE_CANDIDATES) break;
    }
    if (candidates.length === MAX_PROFILE_CANDIDATES) break;
  }

  return {
    suggestedName: suggestion(suggestedNameValue),
    suggestedHeadline: suggestion(suggestedHeadlineValue),
    candidates,
  };
}

export function buildProfileImportResult(input: {
  displayName: string;
  type: ProfileImportFileType;
  sha256: string;
  sections: ProfileTextSection[];
}): ProfileImportResult {
  const sections = input.sections.map((section) => ({
    ...section,
    text: section.text.replace(/\r\n?/g, '\n').trim(),
  }));
  validateProfileText(sections.map(({ text }) => text).join('\n'));

  return profileImportResultSchema.parse({
    version: 1,
    source: {
      displayName: safeDisplayName(input.displayName, input.type),
      type: input.type,
      sha256: input.sha256,
      trust: 'untrusted-data',
    },
    ...extractProfileSuggestions(sections),
  });
}

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  dataOffset: number;
};

export async function guardDocxArchive(bytes: Uint8Array): Promise<void> {
  const entries = readZipCentralDirectory(bytes);
  const names = new Set(entries.map(({ name }) => name.toLowerCase()));
  if (!names.has('[content_types].xml') || !names.has('word/document.xml'))
    throw unsafeDocx('The DOCX package is missing required document parts.');

  for (const entry of entries) {
    const name = entry.name.toLowerCase();
    if (
      name === 'encryptedpackage' ||
      name === 'encryptioninfo' ||
      name.endsWith('.zip') ||
      name.endsWith('.docx') ||
      name.includes('/embeddings/') ||
      name.includes('/activex/') ||
      name.endsWith('/vbaproject.bin') ||
      name.endsWith('vbaproject.bin')
    )
      throw unsafeDocx(
        'Encrypted, macro-enabled or embedded-object DOCX files are not supported.',
      );
  }

  for (const entry of entries) {
    const content = await readZipEntry(bytes, entry);
    if (hasZipMagic(content))
      throw unsafeDocx('Nested archives in DOCX files are not supported.');

    const name = entry.name.toLowerCase();
    if (!name.endsWith('.xml') && !name.endsWith('.rels')) continue;

    const xml = decodeXml(content);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml))
      throw unsafeDocx(
        'DOCX files with DTD or entity declarations are not supported.',
      );
    if (
      name === '[content_types].xml' &&
      /macroenabled|vbaProject|oleObject/i.test(xml)
    )
      throw unsafeDocx('Macro-enabled DOCX files are not supported.');
    if (
      name.endsWith('.rels') &&
      /TargetMode\s*=\s*["']External["']/i.test(xml)
    )
      throw new ProfileImportError(
        'docx_external_relationship',
        'DOCX files with external relationships are not supported.',
      );
  }
}

function readZipCentralDirectory(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  if (eocd < 0) throw invalidDocx();
  const disk = view.getUint16(eocd + 4, true);
  const centralDisk = view.getUint16(eocd + 6, true);
  const diskEntries = view.getUint16(eocd + 8, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  const commentLength = view.getUint16(eocd + 20, true);

  if (
    disk !== 0 ||
    centralDisk !== 0 ||
    diskEntries !== entryCount ||
    entryCount > 256 ||
    entryCount === 0 ||
    entryCount === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff ||
    eocd + 22 + commentLength !== bytes.byteLength ||
    centralOffset + centralSize > eocd
  )
    throw unsafeDocx(
      'The DOCX archive structure exceeds the supported limits.',
    );

  const entries: ZipEntry[] = [];
  const seen = new Set<string>();
  let cursor = centralOffset;
  let totalCompressed = 0;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (
      cursor + 46 > bytes.byteLength ||
      view.getUint32(cursor, true) !== 0x02014b50
    )
      throw invalidDocx();
    const madeByHost = view.getUint16(cursor + 4, true) >> 8;
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const entryCommentLength = view.getUint16(cursor + 32, true);
    const diskStart = view.getUint16(cursor + 34, true);
    const externalAttributes = view.getUint32(cursor + 38, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nextCursor =
      cursor + 46 + nameLength + extraLength + entryCommentLength;
    if (nextCursor > bytes.byteLength || nameLength === 0) throw invalidDocx();
    if ((flags & 0x41) !== 0 || diskStart !== 0 || ![0, 8].includes(method))
      throw unsafeDocx(
        'Encrypted or unsupported DOCX entries are not supported.',
      );
    if (madeByHost === 3 && ((externalAttributes >>> 16) & 0xf000) === 0xa000)
      throw unsafeDocx(
        'DOCX archives containing symbolic links are not supported.',
      );
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      uncompressedSize > 5 * 1024 * 1024 ||
      (uncompressedSize > 0 && compressedSize === 0) ||
      (method === 0 && compressedSize !== uncompressedSize)
    )
      throw unsafeDocx('A DOCX entry exceeds the supported expansion limits.');

    const name = decodeZipName(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );
    const normalizedName = name.toLowerCase();
    if (
      name.includes('\0') ||
      name.includes('\\') ||
      name.startsWith('/') ||
      /^[a-z]:/i.test(name) ||
      name.split('/').includes('..') ||
      seen.has(normalizedName)
    )
      throw unsafeDocx('The DOCX archive contains an unsafe path.');
    seen.add(normalizedName);
    totalCompressed += compressedSize;
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > 25 * 1024 * 1024)
      throw unsafeDocx(
        'The DOCX archive exceeds the supported expansion limit.',
      );

    const dataOffset = validateLocalZipHeader(
      view,
      bytes,
      centralOffset,
      localOffset,
      name,
      flags,
      method,
      compressedSize,
      uncompressedSize,
    );
    entries.push({
      name,
      method,
      compressedSize,
      uncompressedSize,
      dataOffset,
    });
    cursor = nextCursor;
  }
  if (cursor !== centralOffset + centralSize) throw invalidDocx();
  if (totalCompressed === 0 || totalUncompressed / totalCompressed > 20)
    throw unsafeDocx('The DOCX archive exceeds the supported expansion ratio.');
  return entries;
}

function validateLocalZipHeader(
  view: DataView,
  bytes: Uint8Array,
  centralOffset: number,
  offset: number,
  expectedName: string,
  expectedFlags: number,
  expectedMethod: number,
  compressedSize: number,
  uncompressedSize: number,
): number {
  if (
    offset + 30 > centralOffset ||
    view.getUint32(offset, true) !== 0x04034b50
  )
    throw invalidDocx();
  const flags = view.getUint16(offset + 6, true);
  const method = view.getUint16(offset + 8, true);
  const localCompressed = view.getUint32(offset + 18, true);
  const localUncompressed = view.getUint32(offset + 22, true);
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const dataOffset = offset + 30 + nameLength + extraLength;
  if (
    flags !== expectedFlags ||
    method !== expectedMethod ||
    dataOffset + compressedSize > centralOffset ||
    decodeZipName(bytes.subarray(offset + 30, offset + 30 + nameLength)) !==
      expectedName ||
    ((flags & 0x08) === 0 &&
      (localCompressed !== compressedSize ||
        localUncompressed !== uncompressedSize))
  )
    throw invalidDocx();
  return dataOffset;
}

async function readZipEntry(
  bytes: Uint8Array,
  entry: ZipEntry,
): Promise<Uint8Array> {
  const compressed = bytes.slice(
    entry.dataOffset,
    entry.dataOffset + entry.compressedSize,
  );
  if (entry.method === 0) {
    if (compressed.byteLength !== entry.uncompressedSize) throw invalidDocx();
    return compressed;
  }
  if (typeof DecompressionStream === 'undefined')
    throw unsafeDocx(
      'This browser cannot safely inspect compressed DOCX files.',
    );
  try {
    const stream = new Blob([compressed])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let actualSize = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      actualSize += value.byteLength;
      if (actualSize > entry.uncompressedSize || actualSize > 5 * 1024 * 1024) {
        await reader.cancel();
        throw unsafeDocx('A DOCX entry exceeds its declared expansion limit.');
      }
      chunks.push(value);
    }
    if (actualSize !== entry.uncompressedSize)
      throw unsafeDocx('A DOCX entry does not match its declared size.');
    const inflated = new Uint8Array(actualSize);
    let offset = 0;
    for (const chunk of chunks) {
      inflated.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return inflated;
  } catch (error) {
    if (error instanceof ProfileImportError) throw error;
    throw invalidDocx();
  }
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1)
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  return -1;
}

function decodeZipName(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw invalidDocx();
  }
}

function decodeXml(bytes: Uint8Array): string {
  try {
    if (startsWith(bytes, [0xff, 0xfe]))
      return new TextDecoder('utf-16le', { fatal: true }).decode(bytes);
    if (startsWith(bytes, [0xfe, 0xff]))
      return new TextDecoder('utf-16be', { fatal: true }).decode(bytes);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw invalidDocx();
  }
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}

function hasZipMagic(bytes: Uint8Array): boolean {
  return [
    [0x50, 0x4b, 0x03, 0x04],
    [0x50, 0x4b, 0x05, 0x06],
    [0x50, 0x4b, 0x07, 0x08],
    [0x50, 0x4b, 0x01, 0x02],
  ].some((signature) => startsWith(bytes, signature));
}

function containsAscii(bytes: Uint8Array, text: string): boolean {
  const needle = new TextEncoder().encode(text);
  outer: for (
    let index = 0;
    index <= bytes.length - needle.length;
    index += 1
  ) {
    for (let offset = 0; offset < needle.length; offset += 1)
      if (bytes[index + offset] !== needle[offset]) continue outer;
    return true;
  }
  return false;
}

function assertMime(mimeType: string, allowed: Set<string>) {
  if (mimeType && !allowed.has(mimeType)) typeMismatch();
}

function typeMismatch(): never {
  throw new ProfileImportError(
    'type_mismatch',
    'The filename, media type and file signature do not match.',
  );
}

function safeDisplayName(name: string, type: ProfileImportFileType): string {
  const basename = name.split(/[\\/]/).at(-1)?.replace(/\0/g, '').trim();
  return (basename || `profile.${type}`).slice(0, 255);
}

function cleanLine(text: string): string {
  return text
    .replace(/^[\s•●▪◦·*\-–—]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const ROLE_PATTERN =
  /\b(engineer|engineering|developer|développeu(?:r|se)|architect|product|produit|software|full[ -]?stack|front[ -]?end|back[ -]?end|data|design|designer|manager|lead|founder|fondateur|consultant|research|recherche|sales|marketing|operations|ops|intelligence artificielle|\bAI\b|\bIA\b)\b/i;
const SECTION_GROUPS = new Map<string, ProfileImportCandidate['group']>([
  ['about', 'summary'],
  ['about me', 'summary'],
  ['à propos', 'summary'],
  ['profile', 'summary'],
  ['profil', 'summary'],
  ['professional summary', 'summary'],
  ['résumé', 'summary'],
  ['summary', 'summary'],
  ['experience', 'experience'],
  ['experiences', 'experience'],
  ['expérience', 'experience'],
  ['expériences', 'experience'],
  ['professional experience', 'experience'],
  ['expérience professionnelle', 'experience'],
  ['parcours', 'experience'],
  ['project', 'project'],
  ['projects', 'project'],
  ['personal project', 'project'],
  ['personal projects', 'project'],
  ['projet', 'project'],
  ['projets', 'project'],
  ['projet personnel', 'project'],
  ['projets personnels', 'project'],
  ['side project', 'project'],
  ['side projects', 'project'],
  ['skill', 'skill'],
  ['skills', 'skill'],
  ['compétence', 'skill'],
  ['compétences', 'skill'],
  ['expertise', 'skill'],
  ['technologies', 'skill'],
  ['stack', 'skill'],
  ['education', 'education'],
  ['formation', 'education'],
  ['formations', 'education'],
  ['études', 'education'],
  ['certification', 'education'],
  ['certifications', 'education'],
  ['contact', 'other'],
  ['contacts', 'other'],
  ['interests', 'other'],
  ['intérêts', 'other'],
  ['languages', 'other'],
  ['langues', 'other'],
]);
const SECTION_NAMES = new Set(SECTION_GROUPS.keys());

function isLikelyName(text: string): boolean {
  if (
    text.length > 80 ||
    ROLE_PATTERN.test(text) ||
    SECTION_NAMES.has(text.toLowerCase())
  )
    return false;
  const words = text.split(/\s+/);
  return (
    words.length >= 2 &&
    words.length <= 5 &&
    words.every((word) => /^[\p{Lu}][\p{L}\p{M}'’.\-]*$/u.test(word))
  );
}

function recoverNamePrefix(text: string): string | undefined {
  const boundaries = [text.indexOf('|')];
  const email = text.match(/[\p{L}\d._%+-]+@[\p{L}\d.-]+\.[\p{L}]{2,}/iu);
  const phone = text.match(/(?:\+\s?\d|0\d)(?:[\s().-]*\d){7,}/u);
  if (email?.index !== undefined) boundaries.push(email.index);
  if (phone?.index !== undefined) boundaries.push(phone.index);
  const end = boundaries.filter((index) => index > 0).sort((a, b) => a - b)[0];
  const candidate = (end === undefined ? text : text.slice(0, end))
    .replace(/[\s,;:|•·\-–—]+$/, '')
    .trim();
  return isLikelyName(candidate) ? candidate : undefined;
}

function getSectionGroup(
  text: string,
): ProfileImportCandidate['group'] | undefined {
  const normalized = text
    .replace(/[:：]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const direct = SECTION_GROUPS.get(normalized);
  if (direct) return direct;

  const tokens = normalized.split(' ');
  if (tokens.length < 3 || !tokens.every((token) => /^\p{L}$/u.test(token)))
    return undefined;
  const compact = tokens.join('');
  for (const [heading, group] of SECTION_GROUPS)
    if (heading.replace(/\s+/g, '') === compact) return group;
  return undefined;
}

function isContactLine(text: string): boolean {
  return (
    /[\p{L}\d._%+-]+@[\p{L}\d.-]+\.[\p{L}]{2,}/iu.test(text) ||
    /(?:https?:\/\/|www\.|linkedin\.com|github\.com)/i.test(text) ||
    /(?:^|\s)(?:\+\s?\d|0\d)(?:[\s().-]*\d){7,}(?:\s|$)/u.test(text)
  );
}

function coalesceCandidateLines(
  sections: ProfileTextSection[],
  suggestedName: string | undefined,
  suggestedHeadline: string | undefined,
): Array<{
  text: string;
  locator: string;
  group: ProfileImportCandidate['group'];
}> {
  const result: Array<{
    text: string;
    locator: string;
    group: ProfileImportCandidate['group'];
  }> = [];
  let group: ProfileImportCandidate['group'] = 'other';

  for (const section of sections) {
    let pending:
      | {
          text: string;
          startLine: number;
          endLine: number;
          group: ProfileImportCandidate['group'];
          bullet: boolean;
        }
      | undefined;

    const flush = () => {
      if (!pending) return;
      const lineLabel =
        pending.startLine === pending.endLine
          ? `line ${pending.startLine}`
          : `lines ${pending.startLine}-${pending.endLine}`;
      result.push({
        text: pending.text,
        locator: `${section.locator}, ${lineLabel}`,
        group: pending.group,
      });
      pending = undefined;
    };

    for (const [index, rawText] of section.text.split(/\r?\n/).entries()) {
      const lineNumber = index + 1;
      const text = cleanLine(rawText);
      if (!text) {
        flush();
        continue;
      }

      const sectionGroup = getSectionGroup(text);
      if (sectionGroup) {
        flush();
        group = sectionGroup;
        continue;
      }
      if (
        text === suggestedName ||
        text === suggestedHeadline ||
        (suggestedName !== undefined &&
          text.startsWith(`${suggestedName} |`)) ||
        isContactLine(text)
      ) {
        flush();
        continue;
      }

      const bullet = /^[\s]*[•●▪◦·*\-–—]\s+/.test(rawText);
      if (bullet) {
        flush();
        pending = {
          text,
          startLine: lineNumber,
          endLine: lineNumber,
          group,
          bullet,
        };
        continue;
      }

      if (pending && shouldCoalesce(pending.text, text, pending.bullet)) {
        pending.text = `${pending.text} ${text}`;
        pending.endLine = lineNumber;
      } else {
        flush();
        pending = {
          text,
          startLine: lineNumber,
          endLine: lineNumber,
          group,
          bullet: false,
        };
      }
    }
    flush();
  }
  return result;
}

function shouldCoalesce(
  previous: string,
  next: string,
  bullet: boolean,
): boolean {
  if (bullet) return true;
  if (/[.!?]$/.test(previous) || isRoleDateLine(previous)) return false;
  return (
    /[,;:]$/.test(previous) ||
    /^[\p{Ll}\d(]/u.test(next) ||
    previous.length >= 70
  );
}

function isRoleDateLine(text: string): boolean {
  return (
    ROLE_PATTERN.test(text) &&
    /(?:\b(?:19|20)\d{2}\b|\bpresent\b|\bcurrent\b|\btoday\b|aujourd['’]hui)/i.test(
      text,
    )
  );
}

function splitCandidateLine(text: string): string[] {
  if (text.length <= 1_000) return [text];
  return (text.match(/.{1,950}(?:[.!?](?=\s|$)|\s|$)/gu) ?? []).map((part) =>
    part.trim(),
  );
}

function isUsefulCandidate(text: string): boolean {
  if (
    text.length < 20 ||
    text.length > 1_000 ||
    text.split(/\s+/).length < 3 ||
    SECTION_NAMES.has(text.toLowerCase()) ||
    /^[\d\s./-]+$/.test(text) ||
    /^(?:https?:\/\/|www\.|[^\s@]+@[^\s@]+$)/i.test(text)
  )
    return false;
  return true;
}

function suggestion(value: string | undefined): ProfileImportSuggestion | null {
  return value
    ? { value, provenance: 'declared', trust: 'untrusted-data' }
    : null;
}

function invalidDocx(): ProfileImportError {
  return new ProfileImportError(
    'invalid_docx',
    'The DOCX archive is corrupted.',
  );
}

function unsafeDocx(message: string): ProfileImportError {
  return new ProfileImportError('docx_unsafe_archive', message);
}
