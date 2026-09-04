import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';
import {
  containsPdfEncryptionMarker,
  buildProfileImportResult,
  decodeUtf8Text,
  detectProfileFileType,
  extractProfileSuggestions,
  guardDocxArchive,
  MAX_PROFILE_CANDIDATES,
  ProfileImportError,
} from '../../lib/profile-import-core';
import { importProfileText } from '../../lib/profile-import';

const encoder = new TextEncoder();

test('file detection requires matching extension, MIME and signature', () => {
  const pdf = encoder.encode('%PDF-1.7\n');
  assert.equal(
    detectProfileFileType(
      {
        displayName: 'resume.PDF',
        mimeType: 'application/pdf',
        size: pdf.length,
      },
      pdf,
    ),
    'pdf',
  );

  assert.throws(
    () =>
      detectProfileFileType(
        { displayName: 'resume.txt', mimeType: 'text/plain', size: pdf.length },
        pdf,
      ),
    (error) => hasCode(error, 'type_mismatch'),
  );
  assert.throws(
    () =>
      detectProfileFileType(
        { displayName: 'resume.pdf', mimeType: 'text/plain', size: pdf.length },
        pdf,
      ),
    (error) => hasCode(error, 'type_mismatch'),
  );
});

test('TXT decoding is fatal UTF-8 and rejects NUL bytes', () => {
  assert.equal(decodeUtf8Text(encoder.encode('Kévin Marty')), 'Kévin Marty');
  assert.throws(
    () => decodeUtf8Text(Uint8Array.of(0xc3, 0x28)),
    (error) => hasCode(error, 'invalid_utf8'),
  );
  assert.throws(
    () => decodeUtf8Text(encoder.encode('Kévin\0Marty')),
    (error) => hasCode(error, 'binary_text'),
  );
});

test('candidate extraction is bounded, located, declared and untrusted', () => {
  const claims = Array.from(
    { length: 60 },
    (_, index) =>
      `Built production workflow ${index + 1} with measured reliability.`,
  );
  const result = extractProfileSuggestions([
    {
      locator: 'page 1',
      text: ['Kévin Marty', 'Senior Product Engineer', ...claims].join('\n'),
    },
  ]);

  assert.equal(result.suggestedName?.value, 'Kévin Marty');
  assert.equal(result.suggestedHeadline?.value, 'Senior Product Engineer');
  assert.equal(result.candidates.length, MAX_PROFILE_CANDIDATES);
  assert.equal(
    result.candidates.some(
      ({ statement }) =>
        statement === 'Kévin Marty' || statement === 'Senior Product Engineer',
    ),
    false,
  );
  assert.equal(result.candidates[0].locator.startsWith('page 1, line '), true);
  assert.equal(
    result.candidates.every(
      (candidate) =>
        candidate.group === 'other' &&
        candidate.provenance === 'declared' &&
        candidate.trust === 'untrusted-data' &&
        candidate.statement === candidate.excerpt,
    ),
    true,
  );
});

test('name extraction recovers a title-cased prefix and fails closed on prose', () => {
  for (const firstLine of [
    'Kévin Marty | Paris, France',
    'Kévin Marty kevin@example.com',
    'Kévin Marty +33 6 12 34 56 78',
  ]) {
    const result = extractProfileSuggestions([
      {
        locator: 'page 1',
        text: [
          firstLine,
          'Senior Product Engineer',
          'Built and operated reliable production systems.',
        ].join('\n'),
      },
    ]);
    assert.equal(result.suggestedName?.value, 'Kévin Marty');
    assert.equal(
      result.candidates.some(({ statement }) => statement === firstLine),
      false,
    );
  }

  const contactHeader = extractProfileSuggestions([
    {
      locator: 'page 1',
      text: [
        'Kévin Marty | kevin@example.com | +33 6 12 34 56 78',
        'Senior Product Engineer',
        'Built and operated reliable production systems.',
      ].join('\n'),
    },
  ]);
  assert.equal(contactHeader.suggestedName?.value, 'Kévin Marty');
  assert.equal(
    contactHeader.candidates.some(({ statement }) =>
      statement.includes('kevin@example.com'),
    ),
    false,
  );

  const proseHeader = extractProfileSuggestions([
    {
      locator: 'page 1',
      text: [
        'building dependable systems with thoughtful teams',
        'Senior Product Engineer',
        'Built and operated reliable production systems.',
      ].join('\n'),
    },
  ]);
  assert.equal(proseHeader.suggestedName, null);
});

test('candidate extraction groups sections and coalesces wrapped prose', () => {
  const result = extractProfileSuggestions([
    {
      locator: 'page 1',
      text: [
        'Kévin Marty',
        'Senior Product Engineer',
        'Summary',
        'I turn ambiguous product problems into',
        'reliable systems used by real teams.',
        '',
        'Experience',
        'Built reliable agent systems for teams',
        'across several production workflows.',
        '',
        'Projects',
        'Created an open source workflow orchestration toolkit.',
        '',
        'Skills',
        'TypeScript, Python and PostgreSQL in production.',
        '',
        'Education',
        'Software engineering degree with distributed systems coursework.',
      ].join('\n'),
    },
  ]);

  assert.deepEqual(
    result.candidates.map(({ group }) => group),
    ['summary', 'experience', 'project', 'skill', 'education'],
  );
  assert.equal(
    result.candidates[1].statement,
    'Built reliable agent systems for teams across several production workflows.',
  );
  assert.equal(result.candidates[1].locator, 'page 1, lines 8-9');
  assert.equal(
    result.candidates.some(({ statement }) =>
      ['Kévin Marty', 'Senior Product Engineer', 'Experience'].includes(
        statement,
      ),
    ),
    false,
  );
});

test('candidate extraction preserves explicit result sections', () => {
  const result = buildProfileImportResult({
    displayName: 'profile.txt',
    type: 'txt',
    sha256: 'a'.repeat(64),
    sections: [
      {
        locator: 'document',
        text: 'Alex Morgan\nProduct Engineer\nResults\nReduced build time from eleven to seven minutes.',
      },
    ],
  });

  assert.equal(result.candidates[0].group, 'result');
});

test('letter-spaced headings group candidates without merging role dates', () => {
  const result = extractProfileSuggestions([
    {
      locator: 'page 1',
      text: [
        'Kévin Marty',
        'Senior Product Engineer',
        'E X P E R I E N C E',
        'MagicPost | Lead Developer | 2024 - Present',
        'built an agent platform used by production teams.',
        '',
        'S I D E P R O J E C T',
        'Created a collector for complex product catalogues.',
        '',
        'S K I L L S',
        'TypeScript, Python and PostgreSQL in production.',
      ].join('\n'),
    },
  ]);

  assert.deepEqual(
    result.candidates.map(({ group }) => group),
    ['experience', 'experience', 'project', 'skill'],
  );
  assert.equal(
    result.candidates.some(({ statement }) =>
      statement.includes('Present built an agent'),
    ),
    false,
  );
  assert.equal(
    result.candidates.some(
      ({ statement }) =>
        statement === 'built an agent platform used by production teams.',
    ),
    true,
  );
});

test('the French letter-spaced personal-project heading groups SideQuest evidence', () => {
  const result = extractProfileSuggestions([
    {
      locator: 'page 2',
      text: [
        'Kévin Marty',
        'Senior Product Engineer',
        'P R O J E T P E R S O N N E L',
        'SideQuest',
        'Built a collector that turns incomplete catalogues into reliable decisions.',
        'Operated the product from ingestion through production monitoring.',
      ].join('\n'),
    },
  ]);

  assert.equal(
    result.candidates.some(({ statement }) =>
      statement.includes('P R O J E T P E R S O N N E L'),
    ),
    false,
  );
  assert.equal(result.candidates.length, 2);
  assert.equal(
    result.candidates.every(({ group }) => group === 'project'),
    true,
  );
});

test('pasted text produces the same bounded public contract locally', async () => {
  const result = await importProfileText(
    'Kévin Marty\nSenior Product Engineer\nBuilt and operated agentic production systems.',
    'cv.txt',
  );
  assert.equal(result.source.displayName, 'cv.txt');
  assert.equal(result.source.type, 'txt');
  assert.match(result.source.sha256, /^[0-9a-f]{64}$/);
  assert.equal(result.source.trust, 'untrusted-data');
  assert.equal(result.candidates[0].provenance, 'declared');
});

test('PDF encryption markers are rejected by the parser preflight', () => {
  assert.equal(
    containsPdfEncryptionMarker(
      encoder.encode('%PDF-1.7\ntrailer << /Encrypt 7 0 R >>'),
    ),
    true,
  );
  assert.equal(containsPdfEncryptionMarker(encoder.encode('%PDF-1.7')), false);
});

test('DOCX guard accepts a minimal package and rejects external relationships', async () => {
  await guardDocxArchive(minimalDocx());
  await assert.rejects(
    guardDocxArchive(
      minimalDocx({
        relationship:
          '<Relationships><Relationship Target="https://example.com" TargetMode="External" /></Relationships>',
      }),
    ),
    (error) => hasCode(error, 'docx_external_relationship'),
  );
});

test('DOCX guard inspects compressed XML for DTD and entity declarations', async () => {
  await guardDocxArchive(
    zip(baseDocxEntries().map((entry) => ({ ...entry, compressed: true }))),
  );
  await assert.rejects(
    guardDocxArchive(
      zip([
        {
          name: '[Content_Types].xml',
          content: '<Types />',
          compressed: true,
        },
        {
          name: 'word/document.xml',
          content:
            '<!DOCTYPE x [<!ENTITY leak "value">]><document>&leak;</document>',
          compressed: true,
        },
      ]),
    ),
    (error) => hasCode(error, 'docx_unsafe_archive'),
  );
  await assert.rejects(
    guardDocxArchive(
      zip([
        {
          name: '[Content_Types].xml',
          content: '<!DOCTYPE Types><Types />',
        },
        { name: 'word/document.xml', content: '<document />' },
      ]),
    ),
    (error) => hasCode(error, 'docx_unsafe_archive'),
  );
  await assert.rejects(
    guardDocxArchive(
      zip([
        ...baseDocxEntries(),
        {
          name: 'word/_rels/document.xml.rels',
          content: '<!ENTITY unsafe "value"><Relationships />',
        },
      ]),
    ),
    (error) => hasCode(error, 'docx_unsafe_archive'),
  );
  await assert.rejects(
    guardDocxArchive(
      zip([
        ...baseDocxEntries(),
        {
          name: 'word/styles.xml',
          content: '<!DOCTYPE styles><styles />',
        },
      ]),
    ),
    (error) => hasCode(error, 'docx_unsafe_archive'),
  );
});

test('DOCX guard rejects traversal, expansion bombs, macros and excessive entries', async () => {
  await assert.rejects(
    guardDocxArchive(
      zip([...baseDocxEntries(), { name: '../escape.xml', content: 'nope' }]),
    ),
    (error) => hasCode(error, 'docx_unsafe_archive'),
  );
  await assert.rejects(
    guardDocxArchive(
      zip([
        ...baseDocxEntries(),
        {
          name: 'word/styles.xml',
          content: `<styles>${'x'.repeat(4_096)}</styles>`,
          compressed: true,
          declaredUncompressedSize: 128,
        },
      ]),
    ),
    (error) => hasCode(error, 'docx_unsafe_archive'),
  );
  await assert.rejects(
    guardDocxArchive(
      zip([
        ...baseDocxEntries(),
        {
          name: 'word/bomb.xml',
          content: 'x',
          declaredUncompressedSize: 10_000,
        },
      ]),
    ),
    (error) => hasCode(error, 'docx_unsafe_archive'),
  );
  await assert.rejects(
    guardDocxArchive(
      zip([
        ...baseDocxEntries(),
        { name: 'word/vbaProject.bin', content: 'macro' },
      ]),
    ),
    (error) => hasCode(error, 'docx_unsafe_archive'),
  );
  await assert.rejects(
    guardDocxArchive(
      zip([
        ...baseDocxEntries(),
        ...Array.from({ length: 255 }, (_, index) => ({
          name: `word/item-${index}.xml`,
          content: 'x',
        })),
      ]),
    ),
    (error) => hasCode(error, 'docx_unsafe_archive'),
  );
});

test('DOCX guard rejects nested archives and Unix symbolic links', async () => {
  for (const name of ['word/nested.docx', 'word/nested.zip'])
    await assert.rejects(
      guardDocxArchive(zip([...baseDocxEntries(), { name, content: 'PK' }])),
      (error) => hasCode(error, 'docx_unsafe_archive'),
    );
  await assert.rejects(
    guardDocxArchive(
      zip([
        ...baseDocxEntries(),
        { name: 'word/media/payload.bin', content: 'PK\u0003\u0004nested' },
      ]),
    ),
    (error) => hasCode(error, 'docx_unsafe_archive'),
  );
  await assert.rejects(
    guardDocxArchive(
      zip([
        ...baseDocxEntries(),
        { name: 'word/link.xml', content: 'target', unixSymlink: true },
      ]),
    ),
    (error) => hasCode(error, 'docx_unsafe_archive'),
  );
});

function hasCode(error: unknown, code: string): boolean {
  return error instanceof ProfileImportError && error.code === code;
}

function minimalDocx(options?: { relationship?: string }): Uint8Array {
  return zip([
    ...baseDocxEntries(),
    {
      name: 'word/_rels/document.xml.rels',
      content: options?.relationship ?? '<Relationships />',
    },
  ]);
}

function baseDocxEntries(): ZipInput[] {
  return [
    {
      name: '[Content_Types].xml',
      content:
        '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" /></Types>',
    },
    { name: 'word/document.xml', content: '<document><p>CV</p></document>' },
  ];
}

type ZipInput = {
  name: string;
  content: string;
  compressed?: boolean;
  declaredUncompressedSize?: number;
  unixSymlink?: boolean;
};

function zip(inputs: ZipInput[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const input of inputs) {
    const name = encoder.encode(input.name);
    const content = encoder.encode(input.content);
    const payload = input.compressed ? deflateRawSync(content) : content;
    const size = input.declaredUncompressedSize ?? content.length;
    const method = input.compressed ? 8 : 0;
    const local = new Uint8Array(30 + name.length + payload.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, method, true);
    localView.setUint32(18, payload.length, true);
    localView.setUint32(22, size, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(payload, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, input.unixSymlink ? (3 << 8) | 20 : 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, method, true);
    centralView.setUint32(20, payload.length, true);
    centralView.setUint32(24, size, true);
    centralView.setUint16(28, name.length, true);
    if (input.unixSymlink)
      centralView.setUint32(38, (0xa1ff << 16) >>> 0, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralParts.push(central);
    localOffset += local.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, inputs.length, true);
  endView.setUint16(10, inputs.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  return concat([...localParts, ...centralParts, end]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
