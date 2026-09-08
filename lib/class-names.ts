import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Semantic font sizes and text colors must survive class merging together.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'decision',
        'display',
        'h1',
        'hero',
        'h2',
        'metric',
        'h3',
        'drawer',
        'wordmark',
        'section',
        'body-lg',
        'nav',
        'body',
        'btn',
        'body-sm',
        'ui',
        'label',
        'caption',
        'overline',
        'mono-xs',
        'mono-sm',
        'mono',
        'mono-lg',
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
