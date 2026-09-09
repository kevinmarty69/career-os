import {
  MAX_PROFILE_CANDIDATES,
  ProfileImportError,
  profileImportResultSchema,
  validateProfileText,
  type ProfileImportSource,
} from './profile-import-core';

/** Only explicit position fields. No names, messages, contacts or inferred results. */
export function importLinkedInPositions(
  text: string,
  source: ProfileImportSource,
) {
  if (text.includes('\0')) invalid();
  const [header, ...rows] = readCsv(validateProfileText(text));
  const columns = [
    'company name',
    'title',
    'description',
    'started on',
    'finished on',
  ];
  const names = header.map((value) => value.trim().toLowerCase());
  if (
    new Set(names).size !== names.length ||
    !columns.every((column) => names.includes(column))
  )
    invalid();
  if (rows.length > MAX_PROFILE_CANDIDATES) invalid();
  const candidates = rows.map((row, index) => {
    if (row.length !== header.length) invalid();
    const [company, title, description, start, end] = columns.map((column) =>
      row[names.indexOf(column)].trim(),
    );
    if (!company || !title) invalid();
    const statement = [
      `${title} — ${company}`,
      [start, end].filter(Boolean).join(' — '),
      description,
    ]
      .filter(Boolean)
      .join('\n');
    if (statement.length > 1000) invalid();
    return {
      statement,
      excerpt: statement,
      locator: `Positions.csv, record ${index + 2}`,
      group: 'experience' as const,
      provenance: 'declared' as const,
      trust: 'untrusted-data' as const,
    };
  });
  if (!candidates.length) invalid();
  return profileImportResultSchema.parse({
    version: 1,
    source,
    suggestedName: null,
    suggestedHeadline: null,
    candidates,
  });
}

// CSV quoting is data, never spreadsheet formulas or executable markup.
function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closed = false;
  for (let index = 0; index <= text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === undefined) invalid();
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += char;
      continue;
    }
    if (char === '"' && !field && !closed) {
      quoted = true;
      continue;
    }
    if (char === ',' || char === '\n' || char === '\r' || char === undefined) {
      row.push(field);
      if (row.length > 32) invalid();
      field = '';
      closed = false;
      if (char !== ',') {
        if (row.some((value) => value.trim())) rows.push(row);
        if (rows.length > MAX_PROFILE_CANDIDATES + 1) invalid();
        row = [];
        if (char === '\r' && text[index + 1] === '\n') index++;
      }
    } else {
      if (closed || char === '"') invalid();
      field += char;
    }
  }
  if (!rows.length) invalid();
  return rows;
}

function invalid(): never {
  throw new ProfileImportError(
    'invalid_linkedin',
    'Import Positions.csv with Company Name, Title, Description, Started On and Finished On columns. Maximum 40 positions and 1,000 characters per position.',
  );
}
