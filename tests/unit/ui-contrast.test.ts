import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(
  new URL('../../app/globals.css', import.meta.url),
  'utf8',
);
const designSystem = readFileSync(
  new URL('../../app/design-system.css', import.meta.url),
  'utf8',
);

test('the normative design tokens and ink primary action are installed', () => {
  for (const declaration of [
    '--color-ink-900: #0d0d0f',
    '--color-canvas: #ebebf0',
    '--color-panel: #f4f4f7',
    '--color-indigo: #5b6cc4',
    '--text-body-sm: 13.5px',
    '--radius-shell: 22px',
  ])
    assert.ok(designSystem.includes(declaration), `${declaration} is missing`);

  assert.match(
    designSystem,
    /\.co-button\s*\{[\s\S]*?background:\s*var\(--color-ink-900\)/,
  );
});

test('shared small-text status colors meet WCAG AA contrast', () => {
  for (const [foreground, background] of [
    ['--co-text-4', '#ffffff'],
    ['--co-ok-text', '--co-ok-bg'],
    ['--co-warn-text', '--co-warn-bg'],
    ['--co-crit-text', '--co-crit-bg'],
  ])
    assert.ok(
      contrast(color(foreground), color(background)) >= 4.5,
      `${foreground} must reach 4.5:1 against ${background}`,
    );
});

function color(value: string) {
  if (value.startsWith('#')) return value;
  const match = css.match(new RegExp(`${value}:\\s*(#[0-9a-f]{6})`, 'i'));
  assert.ok(match, `${value} is missing`);
  return match[1];
}

function contrast(a: string, b: string) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
