import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { migrationSql } from '../../lib/migration-sql';

test('historical SQL cannot create or revoke Supabase Auth objects', () => {
  for (const name of readdirSync('supabase/migrations').filter((name) =>
    /^00(?:[0-3][0-9]|4[0-9])_/.test(name),
  )) {
    const original = readFileSync(`supabase/migrations/${name}`, 'utf8');
    const translated = migrationSql(name, original);
    assert.doesNotMatch(translated, /\bauth\b/, name);
    assert.doesNotMatch(translated, /\bpublic\.digest\(/, name);
    assert.doesNotMatch(translated, /alter role[^;]*nosuperuser/, name);
    assert.equal(readFileSync(`supabase/migrations/${name}`, 'utf8'), original);
  }
});

test('managed-role compatibility rejects existing elevated roles rather than skipping hardening', () => {
  const sql = migrationSql(
    '0012_example.sql',
    'alter role career_example nologin nosuperuser nocreatedb\n nocreaterole noinherit noreplication nobypassrls;',
  );
  assert.match(
    sql,
    /rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls/,
  );
  assert.match(sql, /raise exception 'Unsafe existing role: career_example'/);
  assert.match(sql, /alter role career_example nologin noinherit/);
});

test('new migrations use explicit schema names without translation', () => {
  const sql = 'select created_at from auth.sessions';
  assert.equal(migrationSql('0050_supabase_auth.sql', sql), sql);
});
