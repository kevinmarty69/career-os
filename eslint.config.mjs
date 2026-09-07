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
  globalIgnores([
    '.next/**',
    'playwright-report/**',
    'test-results/**',
    'benchmarks/**',
    'next-env.d.ts',
  ]),
]);
