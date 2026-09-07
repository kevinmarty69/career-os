import type { MessageDictionary } from '../messages';
export const inboxMessages = {
  'inbox.needs.review': {
    fr: 'À trancher',
    en: 'Needs review',
  },
} as const satisfies MessageDictionary;
