import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../..', import.meta.url);
const css = readFileSync(new URL('app/design-system.css', root), 'utf8');
const entryCss = readFileSync(new URL('app/globals.css', root), 'utf8');
const baseCss = readFileSync(new URL('app/styles/base.css', root), 'utf8');
const uiCss = readFileSync(new URL('app/styles/ui.css', root), 'utf8');
const layout = readFileSync(new URL('app/layout.tsx', root), 'utf8');
const scopedCss = [
  'components/applications/applications-page.module.css',
  'components/memory/memory-import-flow.module.css',
  'components/search-profiles/search-profiles.module.css',
  'components/demo-page.module.css',
].map((path) => readFileSync(new URL(path, root), 'utf8'));

test('shared styles use one theme and one ordered stylesheet entry point', () => {
  assert.equal(lastValue('--color-ink-900'), '#0d0d0f');
  assert.equal(lastValue('--color-canvas'), '#ebebf0');
  assert.match(css, /--primary:\s*var\(--color-ink-900\)/);
  assert.match(css, /--color-green-text:\s*#2a7a55/);
  assert.match(css, /--color-amber-text:\s*#8a6a1f/);
  assert.match(css, /--color-clay-text:\s*#a85643/);
  assert.match(css, /--color-pub-deep:\s*#16211f/);
  assert.match(css, /--color-pub-accent:\s*#2f6b5e/);
  assert.match(css, /--spacing-sidebar:\s*212px/);
  assert.match(uiCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(
    baseCss,
    /src:\s*url\('\/fonts\/material-symbols-rounded\.ttf'\)/,
  );
  assert.match(baseCss, /font-display:\s*block/);
  assert.match(layout, /Geist_Mono, Instrument_Sans/);
  assert.deepEqual(
    [...layout.matchAll(/import ['"]([^'"]+\.css)['"]/g)].map(
      (match) => match[1],
    ),
    ['./globals.css'],
  );
  assert.match(entryCss, /@import '\.\/design-system\.css'/);
  assert.match(css, /@theme static/);
  for (const file of readdirSync(new URL('app/', root), {
    recursive: true,
    encoding: 'utf8',
  })) {
    if (!file.endsWith('.css') || file === 'design-system.css') continue;
    const source = readFileSync(new URL(`app/${file}`, root), 'utf8');
    assert.doesNotMatch(source, /@theme\b/, `${file}: duplicate theme`);
    assert.doesNotMatch(
      source,
      /--(?:color|radius|text|spacing)-[\w-]+\s*:/,
      `${file}: shared design tokens belong in design-system.css`,
    );
  }
  const tokens = [...css.matchAll(/(?:^|\n)\s*(--[\w-]+):/g)].map(
    (match) => match[1],
  );
  assert.equal(
    new Set(tokens).size,
    tokens.length,
    'theme tokens are defined once',
  );
  assert.doesNotMatch(css, /\.co-(?:home|public|sidebar|button)/);
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
