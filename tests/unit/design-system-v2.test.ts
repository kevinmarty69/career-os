import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../..', import.meta.url);
const css = readFileSync(new URL('app/globals.css', root), 'utf8');
const layout = readFileSync(new URL('app/layout.tsx', root), 'utf8');
const scopedCss = [
  'components/applications/applications-page.module.css',
  'components/memory/memory-import-flow.module.css',
  'components/search-profiles/search-profiles.module.css',
  'components/demo-page.module.css',
].map((path) => readFileSync(new URL(path, root), 'utf8'));

test('design system v2 remains the final active visual contract', () => {
  assert.equal(lastValue('--primary'), '#0d0d0f');
  assert.equal(lastValue('--canvas'), '#ebebf0');
  assert.match(css, /--co-public-deep:\s*#0e2a2e/);
  assert.match(css, /--co-public-accent:\s*#0e7c86/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /src:\s*url\('\/fonts\/material-symbols-rounded\.ttf'\)/);
  assert.match(css, /font-display:\s*block/);
  assert.match(layout, /Geist_Mono, Instrument_Sans/);
  assert.doesNotMatch(layout, /fonts\.googleapis\.com/);

  for (const source of scopedCss) {
    assert.doesNotMatch(source, /(?:linear|radial)-gradient\(/);
    assert.doesNotMatch(source, /font-weight:\s*(?:700|750|800)/);
  }
});

function lastValue(token: string) {
  const matches = [
    ...css.matchAll(new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, 'gi')),
  ];
  assert.ok(matches.length, `${token} is missing`);
  return matches.at(-1)![1].toLowerCase();
}
