import type { MessageDictionary } from '../messages';

export const operationalMessages = {
  'operations.home.welcome': {
    fr: 'Votre suivi, aujourd’hui',
    en: 'Your follow-up, today',
  },
  'operations.home.signal': {
    fr: 'Signal d’accès',
    en: 'Access signal',
  },
  'operations.home.signal.title': {
    fr: 'La page {company} a été ouverte {count} fois.',
    en: 'The {company} page was opened {count} times.',
  },
  'operations.home.signal.detail': {
    fr: '{sections} sections consultées, {actions} actions et {downloads} téléchargements enregistrés.',
    en: '{sections} sections viewed, {actions} actions, and {downloads} downloads recorded.',
  },
  'operations.home.signal.caveat': {
    fr: 'Ces compteurs sont agrégés : ils n’identifient pas le lecteur et ne prouvent pas son intérêt.',
    en: 'These counters are aggregated: they neither identify the reader nor prove their interest.',
  },
  'operations.home.signal.empty.title': {
    fr: 'Aucun signal d’accès pour le moment.',
    en: 'No access signal yet.',
  },
  'operations.home.signal.empty.detail': {
    fr: 'Les liens actifs restent suivis sans adresse IP, fingerprint ni user-agent.',
    en: 'Active links remain monitored without IP addresses, fingerprints, or user agents.',
  },
  'operations.home.openings': { fr: 'Ouvertures', en: 'Opens' },
  'operations.home.sections': { fr: 'Sections', en: 'Sections' },
  'operations.home.actions': { fr: 'Actions', en: 'Actions' },
  'operations.home.downloads': { fr: 'Téléchargements', en: 'Downloads' },
  'operations.home.open.application': {
    fr: 'Ouvrir la candidature',
    en: 'Open application',
  },
  'operations.home.active.applications': {
    fr: 'Candidatures en cours',
    en: 'Active applications',
  },
  'operations.home.active.count': {
    fr: '{count} actives',
    en: '{count} active',
  },
  'operations.home.private.links.help': {
    fr: 'Les statistiques restent agrégées et respectent la confidentialité du lecteur.',
    en: 'Statistics stay aggregated and preserve the reader’s privacy.',
  },
  'operations.runs.title': {
    fr: 'Journal des agents',
    en: 'Agent run journal',
  },
  'operations.runs.summary': {
    fr: '{count} runs persistés · {failed} en erreur ou bloqués.',
    en: '{count} persisted runs · {failed} failed or blocked.',
  },
  'operations.runs.loading': {
    fr: 'Chargement des runs persistés…',
    en: 'Loading persisted runs…',
  },
  'operations.runs.empty': {
    fr: 'Aucun run enregistré. Lancez une candidature pour créer le premier journal.',
    en: 'No run recorded. Start an application to create the first journal.',
  },
  'operations.runs.unavailable': {
    fr: 'Le journal est momentanément indisponible.',
    en: 'The run journal is temporarily unavailable.',
  },
  'operations.runs.sign.in': {
    fr: 'Connectez-vous pour consulter les runs de votre espace.',
    en: 'Sign in to review the runs in your workspace.',
  },
  'operations.runs.interrupted': {
    fr: 'Run interrompu',
    en: 'Run interrupted',
  },
  'operations.runs.interrupted.detail': {
    fr: 'Le travail terminé reste enregistré. Ouvrez la candidature pour reprendre depuis son état réel.',
    en: 'Completed work remains recorded. Open the application to resume from its real state.',
  },
  'operations.runs.saved.steps': {
    fr: 'Étapes enregistrées',
    en: 'Saved steps',
  },
  'operations.runs.failed.step': {
    fr: 'Étape en échec',
    en: 'Failed step',
  },
  'operations.runs.no.failed.step': {
    fr: 'Aucune étape en échec n’est enregistrée.',
    en: 'No failed step is recorded.',
  },
  'operations.runs.recorded.usage': {
    fr: 'Usage enregistré',
    en: 'Recorded usage',
  },
  'operations.runs.cost': { fr: 'Coût', en: 'Cost' },
  'operations.runs.tokens': { fr: 'Tokens', en: 'Tokens' },
  'operations.runs.sources': { fr: 'Sources', en: 'Sources' },
  'operations.runs.stage': { fr: 'Étape active', en: 'Active stage' },
  'operations.runs.other': { fr: 'Tous les runs', en: 'All runs' },
  'operations.runs.steps': { fr: 'Étapes', en: 'Steps' },
  'operations.runs.events': {
    fr: 'Décisions et événements',
    en: 'Decisions and events',
  },
  'operations.runs.errors': { fr: 'Erreurs', en: 'Errors' },
  'operations.runs.no.steps': {
    fr: 'Aucune étape enregistrée.',
    en: 'No step recorded.',
  },
  'operations.runs.no.events': {
    fr: 'Aucun événement enregistré.',
    en: 'No event recorded.',
  },
  'operations.runs.no.sources': {
    fr: 'Aucune source externe enregistrée.',
    en: 'No external source recorded.',
  },
  'operations.runs.no.errors': {
    fr: 'Aucune erreur enregistrée.',
    en: 'No error recorded.',
  },
  'operations.runs.human.decision': {
    fr: 'décision humaine',
    en: 'human decision',
  },
  'operations.runs.human.decisions': {
    fr: 'décisions humaines',
    en: 'human decisions',
  },
  'operations.runs.open': {
    fr: 'Ouvrir la candidature',
    en: 'Open application',
  },
  'operations.links.title': { fr: 'Liens privés', en: 'Private links' },
  'operations.links.activity': {
    fr: 'Activité agrégée des liens privés',
    en: 'Aggregated private-link activity',
  },
  'operations.links.active': { fr: 'Liens actifs', en: 'Active links' },
  'operations.links.loading': {
    fr: 'Chargement des liens privés…',
    en: 'Loading private links…',
  },
  'operations.links.unavailable': {
    fr: 'Les liens privés sont momentanément indisponibles.',
    en: 'Private links are temporarily unavailable.',
  },
  'operations.links.status.active': { fr: 'Actif', en: 'Active' },
  'operations.links.status.expired': { fr: 'Expiré', en: 'Expired' },
  'operations.links.status.revoked': { fr: 'Révoqué', en: 'Revoked' },
  'operations.links.description': {
    fr: 'Un accès révocable par entreprise. Les vues restent agrégées et aucune page n’est indexable.',
    en: 'One revocable access link per company. Views stay aggregated and no page is indexable.',
  },
  'operations.links.empty.title': {
    fr: 'Aucun lien privé actif.',
    en: 'No active private link.',
  },
  'operations.links.empty.detail': {
    fr: 'Publiez une candidature validée pour créer un accès révocable.',
    en: 'Publish an approved application to create revocable access.',
  },
  'operations.links.create': {
    fr: 'Choisir une candidature',
    en: 'Choose an application',
  },
  'operations.links.first.open': {
    fr: 'Première ouverture',
    en: 'First opened',
  },
  'operations.links.last.open': {
    fr: 'Dernière ouverture',
    en: 'Last opened',
  },
  'operations.links.never.opened': {
    fr: 'Jamais ouvert',
    en: 'Never opened',
  },
  'operations.links.version': {
    fr: 'Version {version}',
    en: 'Version {version}',
  },
  'operations.links.open.application': {
    fr: 'Ouvrir le dossier',
    en: 'Open application',
  },
  'operations.links.revoke': { fr: 'Révoquer', en: 'Revoke' },
  'operations.links.revoking': {
    fr: 'Révocation…',
    en: 'Revoking…',
  },
  'operations.links.dialog.title': {
    fr: 'Révoquer le lien {company} ?',
    en: 'Revoke the {company} link?',
  },
  'operations.links.dialog.intro': {
    fr: 'L’accès est coupé immédiatement, y compris dans un onglet déjà ouvert.',
    en: 'Access is cut off immediately, including in an already open tab.',
  },
  'operations.links.dialog.opens': {
    fr: 'Ce lien compte {count} ouvertures enregistrées. Toute nouvelle requête sera refusée.',
    en: 'This link has {count} recorded opens. Every new request will be rejected.',
  },
  'operations.links.dialog.kept': {
    fr: 'Vos contenus, preuves et versions restent intacts dans l’app.',
    en: 'Your content, evidence, and versions remain intact in the app.',
  },
  'operations.links.dialog.new': {
    fr: 'Vous pourrez créer un nouveau lien depuis la même candidature.',
    en: 'You can create a new link from the same application.',
  },
  'operations.links.dialog.confirm.label': {
    fr: 'Tapez {confirmation} pour confirmer',
    en: 'Type {confirmation} to confirm',
  },
  'operations.links.dialog.cancel': { fr: 'Annuler', en: 'Cancel' },
  'operations.links.revocation.failed': {
    fr: 'La révocation a échoué. Le lien reste actif ; réessayez.',
    en: 'Revocation failed. The link remains active; try again.',
  },
  'operations.links.privacy': {
    fr: 'Aucun fingerprint, aucune adresse IP et aucun user-agent ne sont enregistrés.',
    en: 'No fingerprint, IP address, or user agent is recorded.',
  },
  'operations.links.privacy.title': {
    fr: 'Mesure respectueuse',
    en: 'Privacy-preserving measurement',
  },
  'operations.data.title': {
    fr: 'Vos données vous appartiennent',
    en: 'Your data belongs to you',
  },
  'operations.data.description': {
    fr: 'Exportez un instantané lisible sans Career OS, ou supprimez définitivement votre espace.',
    en: 'Export a snapshot readable without Career OS, or permanently delete your workspace.',
  },
  'operations.data.export.title': {
    fr: 'Export complet',
    en: 'Complete export',
  },
  'operations.data.export.description': {
    fr: 'Un fichier NDJSON versionné avec manifeste, catégories et somme de contrôle.',
    en: 'A versioned NDJSON file with a manifest, categories, and checksum.',
  },
  'operations.data.export.format': {
    fr: 'Format ouvert · NDJSON',
    en: 'Open format · NDJSON',
  },
  'operations.data.export.preparing': {
    fr: 'Préparation…',
    en: 'Preparing…',
  },
  'operations.data.export.download': {
    fr: 'Télécharger l’archive',
    en: 'Download archive',
  },
  'operations.data.export.done': {
    fr: 'Export téléchargé.',
    en: 'Export downloaded.',
  },
  'operations.data.export.error': {
    fr: 'L’export a échoué. Reconnectez-vous puis réessayez.',
    en: 'Export failed. Sign in again, then retry.',
  },
  'operations.data.export.claims': {
    fr: 'Mémoire et preuves',
    en: 'Career memory and evidence',
  },
  'operations.data.export.sources': {
    fr: 'Documents sources et métadonnées',
    en: 'Source documents and metadata',
  },
  'operations.data.export.applications': {
    fr: 'Candidatures, pages et versions',
    en: 'Applications, pages, and versions',
  },
  'operations.data.export.runs': {
    fr: 'Runs, journaux et décisions',
    en: 'Runs, logs, and decisions',
  },
  'operations.data.inventory.title': {
    fr: 'Ce qui est inclus',
    en: 'What is included',
  },
  'operations.data.inventory.note': {
    fr: 'Chaque enregistrement conserve son type et ses liens de provenance. Les secrets, sessions et empreintes de capacités sont exclus.',
    en: 'Every record keeps its type and provenance links. Secrets, sessions, and capability hashes are excluded.',
  },
  'operations.data.delete.title': {
    fr: 'Tout supprimer',
    en: 'Delete everything',
  },
  'operations.data.delete.warning.label': {
    fr: 'Zone irréversible',
    en: 'Irreversible action',
  },
  'operations.data.delete.description': {
    fr: 'Mémoire, candidatures, liens et journaux sont supprimés. Les liens privés cessent de répondre immédiatement.',
    en: 'Memory, applications, links, and logs are deleted. Private links stop responding immediately.',
  },
  'operations.data.delete.list.memory': {
    fr: 'Mémoire, preuves et documents',
    en: 'Memory, evidence, and documents',
  },
  'operations.data.delete.list.applications': {
    fr: 'Candidatures et versions',
    en: 'Applications and versions',
  },
  'operations.data.delete.list.links': {
    fr: 'Liens privés et sessions',
    en: 'Private links and sessions',
  },
  'operations.data.delete.list.runs': {
    fr: 'Runs et journaux d’agents',
    en: 'Agent runs and logs',
  },
  'operations.data.delete.confirm': {
    fr: 'Tapez {confirmation} pour confirmer',
    en: 'Type {confirmation} to confirm',
  },
  'operations.data.delete.pending': {
    fr: 'Suppression…',
    en: 'Deleting…',
  },
  'operations.data.delete.action': {
    fr: 'Supprimer mon compte',
    en: 'Delete my account',
  },
  'operations.data.delete.error': {
    fr: 'La suppression a échoué. Vos données sont toujours présentes ; reconnectez-vous puis réessayez.',
    en: 'Deletion failed. Your data is still present; sign in again, then retry.',
  },
  'operations.data.delete.warning': {
    fr: 'Aucun délai de grâce, aucune corbeille. Téléchargez d’abord une copie si vous souhaitez conserver vos données.',
    en: 'There is no grace period or trash. Download a copy first if you want to keep your data.',
  },
} as const satisfies MessageDictionary;
