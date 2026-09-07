import type { MessageDictionary } from '../messages';
export const homeMessages = {
  'home.active.private.links': {
    fr: 'Liens privés actifs',
    en: 'Active private links',
  },
  'home.view.all': {
    fr: 'Tout voir',
    en: 'View all',
  },
  'home.no.active.link': {
    fr: 'Aucun lien actif.',
    en: 'No active link.',
  },
  'home.explainable.priorities': {
    fr: 'Priorités explicables',
    en: 'Explainable priorities',
  },
  'home.the.next.action.comes.only.from.the.recorded.state': {
    fr: 'La prochaine action vient uniquement de l’état enregistré de vos candidatures et de vos décisions humaines.',
    en: 'The next action comes only from the recorded state of your applications and human decisions.',
  },
  'home.never.opened': {
    fr: 'Jamais ouvert',
    en: 'Never opened',
  },
  'home.your.evidence.never.leaves.your.instance': {
    fr: 'Vos preuves ne quittent pas votre instance.',
    en: 'Your evidence never leaves your instance.',
  },
  'home.view.configuration': {
    fr: 'Voir la config',
    en: 'View configuration',
  },
  'home.view.activity.log': {
    fr: 'Voir le journal',
    en: 'View activity log',
  },
  'home.key.metrics': {
    fr: 'Indicateurs principaux',
    en: 'Key metrics',
  },
  'home.priority.actions': {
    fr: 'Actions prioritaires',
    en: 'Priority actions',
  },
  'home.do.now': {
    fr: 'À faire maintenant',
    en: 'Do now',
  },
} as const satisfies MessageDictionary;
