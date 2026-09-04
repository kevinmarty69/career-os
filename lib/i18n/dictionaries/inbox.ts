import type { MessageDictionary } from '../messages';

export const inboxMessages = {
  'Règles de notification': 'Notification rules',
  'Un run demande un arbitrage': 'A run needs a decision',
  'Une page privée est ouverte': 'A private page is opened',
  'Un run échoue': 'A run fails',
  'Une preuve devient périmée': 'Evidence becomes outdated',
  'Un lien approche de son expiration': 'A link is close to expiring',
  'Les emails ne contiennent jamais le texte des preuves.':
    'Emails never contain evidence text.',
  'À trancher': 'Needs review',
  '4 décisions bloquent une publication ou une candidature.':
    '4 decisions are blocking a publication or application.',
  'Tout marquer comme lu': 'Mark all as read',
  '3 modifications à trancher': '3 changes need review',
  'Un chiffre dépasse la preuve · run 8f2c terminé il y a 2 min':
    'A figure exceeds the evidence · run 8f2c completed 2 min ago',
  'Ouvrir la revue': 'Open review',
  'Run interrompu': 'Run interrupted',
  'Quota API dépassé. Reprise possible sur modèle local.':
    'API quota exceeded. You can resume with a local model.',
  Reprendre: 'Resume',
  'Relance prévue aujourd’hui': 'Follow-up due today',
  'Envoyée il y a 8 jours, page ouverte 4 fois.':
    'Sent 8 days ago, page opened 4 times.',
  'Relire le brouillon': 'Review draft',
  'Débrief d’entretien à écrire': 'Interview debrief to write',
  'Deux questions restées sans preuve.': 'Two questions are still unsupported.',
  Débriefer: 'Write debrief',
  'Activité récente': 'Recent activity',
  'Camille Lefort a ouvert votre page privée et consulté 3 preuves':
    'Camille Lefort opened your private page and viewed 3 evidence items',
  'CV adapté téléchargé — Nimbus Robotics':
    'Tailored resume downloaded — Nimbus Robotics',
  'Lien Atlas Health ouvert depuis une deuxième adresse IP':
    'Atlas Health link opened from a second IP address',
  'review_q2.pdf indexé — 4 affirmations': 'review_q2.pdf indexed — 4 claims',
  'GitHub resynchronisé — aucune nouvelle preuve':
    'GitHub resynced — no new evidence',
  hier: 'yesterday',
  'hier 17:40': 'yesterday 17:40',
  lundi: 'Monday',
} as const satisfies MessageDictionary;
