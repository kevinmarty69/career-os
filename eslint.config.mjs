import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    files: [
      'app/**/*.{ts,tsx}',
      'components/**/*.{ts,tsx}',
      'lib/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/scripts/simulation/**',
                '**/benchmarks/**',
                '**/tests/**',
              ],
              message:
                'Production modules must not import simulation or test code.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/kit-route-page', '**/kit-route-page.tsx'],
              message:
                'Screens and shared UI must not depend on the server route dispatcher.',
            },
            {
              group: [
                '**/scripts/simulation/**',
                '**/benchmarks/**',
                '**/tests/**',
              ],
              message:
                'Production modules must not import simulation or test code.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['components/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^(?:@/components/|\\.\\./)(?!(?:ui/|i18n/|use-dialog-focus$))',
              // Shared controls may use other controls, locale context, or dialog focus.
              // Keep product copy, navigation and business state in feature modules.
              message:
                'Shared UI must not import product screens or navigation.',
            },
            {
              group: [
                '**/scripts/simulation/**',
                '**/benchmarks/**',
                '**/tests/**',
              ],
              message:
                'Production modules must not import simulation or test code.',
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'playwright-report/**',
    'test-results/**',
    'benchmarks/**',
    'next-env.d.ts',
  ]),
]);
