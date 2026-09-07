import type { MessageDictionary } from '../messages';
export const searchProfilesMessages = {
  'search-profiles.this.profile.changed.elsewhere.or.this.name.already.exists':
    {
      fr: 'Ce profil a chang\u00e9 ailleurs ou ce nom existe d\u00e9j\u00e0. Rechargez la page.',
      en: 'This profile changed elsewhere or this name already exists. Reload the page.',
    },
  'search-profiles.sign.in.to.access.your.search.profiles': {
    fr: 'Connectez-vous pour retrouver vos profils de recherche.',
    en: 'Sign in to access your search profiles.',
  },
  'search-profiles.unable.to.load.your.profiles.try.again': {
    fr: 'Impossible de charger vos profils. Réessayez.',
    en: 'Unable to load your profiles. Try again.',
  },
  'search-profiles.name.the.profile.and.review.the.entered.criteria': {
    fr: 'Donnez un nom au profil et vérifiez les critères saisis.',
    en: 'Name the profile and review the entered criteria.',
  },
  'search-profiles.unable.to.save.this.profile': {
    fr: 'Impossible d’enregistrer ce profil.',
    en: 'Unable to save this profile.',
  },
  'search-profiles.unable.to.delete.this.profile': {
    fr: 'Impossible de supprimer ce profil.',
    en: 'Unable to delete this profile.',
  },
  'search-profiles.role': {
    fr: 'Rôle',
    en: 'Role',
  },
  'search-profiles.seniority': {
    fr: 'Séniorité',
    en: 'Seniority',
  },
  'search-profiles.location': {
    fr: 'Localisation',
    en: 'Location',
  },
  'search-profiles.work.mode': {
    fr: 'Mode de travail',
    en: 'Work mode',
  },
  'search-profiles.time.zone': {
    fr: 'Fuseau horaire',
    en: 'Time zone',
  },
  'search-profiles.language': {
    fr: 'Langue',
    en: 'Language',
  },
  'search-profiles.contract': {
    fr: 'Contrat',
    en: 'Contract',
  },
  'search-profiles.salary': {
    fr: 'Salaire',
    en: 'Salary',
  },
  'search-profiles.excluded.company': {
    fr: 'Entreprise exclue',
    en: 'Excluded company',
  },
  'search-profiles.excluded.network': {
    fr: 'Réseau exclu',
    en: 'Excluded network',
  },
  'search-profiles.filter.without.guessing': {
    fr: 'Filtrer sans deviner',
    en: 'Filter without guessing',
  },
  'search-profiles.missing.information.remains.unknown': {
    fr: 'Une information absente reste à vérifier.',
    en: 'Missing information remains unknown.',
  },
  'search-profiles.job.search': {
    fr: 'Recherche d’offres',
    en: 'Job search',
  },
  'search-profiles.search.profiles': {
    fr: 'Profils de recherche',
    en: 'Search profiles',
  },
  'search-profiles.define.what.rules.out.a.job.and.what.only': {
    fr: 'Définissez ce qui bloque une offre et ce qui améliore seulement son classement.',
    en: 'Define what rules out a job and what only improves its ranking.',
  },
  'search-profiles.new.profile': {
    fr: 'Nouveau profil',
    en: 'New profile',
  },
  'search-profiles.try.again': {
    fr: 'Réessayer',
    en: 'Try again',
  },
  'search-profiles.saved.profiles': {
    fr: 'Profils enregistrés',
    en: 'Saved profiles',
  },
  'search-profiles.profiles': {
    fr: 'Profils',
    en: 'Profiles',
  },
  'search-profiles.loading': {
    fr: 'Chargement…',
    en: 'Loading…',
  },
  'search-profiles.your.saved.searches': {
    fr: 'Vos recherches sauvegardées',
    en: 'Your saved searches',
  },
  'search-profiles.active': {
    fr: 'Actif',
    en: 'Active',
  },
  'search-profiles.paused': {
    fr: 'En pause',
    en: 'Paused',
  },
  'search-profiles.no.saved.profile.start.with.this.one': {
    fr: 'Aucun profil enregistré. Commencez par celui-ci.',
    en: 'No saved profile. Start with this one.',
  },
  'search-profiles.profile.editor': {
    fr: 'Éditeur du profil',
    en: 'Profile editor',
  },
  'search-profiles.profile.name': {
    fr: 'Nom du profil',
    en: 'Profile name',
  },
  'search-profiles.alert.threshold': {
    fr: 'Seuil d’alerte',
    en: 'Alert threshold',
  },
  'search-profiles.disabled': {
    fr: 'Désactivé',
    en: 'Disabled',
  },
  'search-profiles.human.feedback.signal': {
    fr: 'Signal humain, en %',
    en: 'Human feedback signal, %',
  },
  'search-profiles.scheduled.discovery': {
    fr: 'Découverte planifiée',
    en: 'Scheduled discovery',
  },
  'search-profiles.monitor.public.greenhouse.or.ashby.boards.no.paid.service': {
    fr: 'Surveillez des tableaux publics Greenhouse ou Ashby. Aucun service payant n’est requis.',
    en: 'Monitor public Greenhouse or Ashby boards. No paid service is required.',
  },
  'search-profiles.automatic': {
    fr: 'Automatique',
    en: 'Automatic',
  },
  'search-profiles.frequency': {
    fr: 'Fréquence',
    en: 'Frequency',
  },
  'search-profiles.discovery.frequency': {
    fr: 'Fréquence de découverte',
    en: 'Discovery frequency',
  },
  'search-profiles.every.6.hours': {
    fr: 'Toutes les 6 heures',
    en: 'Every 6 hours',
  },
  'search-profiles.every.12.hours': {
    fr: 'Toutes les 12 heures',
    en: 'Every 12 hours',
  },
  'search-profiles.daily': {
    fr: 'Chaque jour',
    en: 'Daily',
  },
  'search-profiles.every.3.days': {
    fr: 'Tous les 3 jours',
    en: 'Every 3 days',
  },
  'search-profiles.add.board': {
    fr: 'Ajouter un tableau',
    en: 'Add board',
  },
  'search-profiles.public.board.url': {
    fr: 'URL du tableau public',
    en: 'Public board URL',
  },
  'search-profiles.no.board.is.monitored.add.the.root.url.of': {
    fr: 'Aucun tableau surveillé. Ajoutez l’URL racine d’un tableau public.',
    en: 'No board is monitored. Add the root URL of a public board.',
  },
  'search-profiles.active.profile': {
    fr: 'Profil actif',
    en: 'Active profile',
  },
  'search-profiles.profile.saved': {
    fr: 'Profil enregistré.',
    en: 'Profile saved.',
  },
  'search-profiles.changes.are.not.applied.automatically': {
    fr: 'Les changements ne sont pas automatiques.',
    en: 'Changes are not applied automatically.',
  },
  'search-profiles.confirm.deletion': {
    fr: 'Confirmer la suppression',
    en: 'Confirm deletion',
  },
  'search-profiles.delete': {
    fr: 'Supprimer',
    en: 'Delete',
  },
  'search-profiles.save.profile': {
    fr: 'Enregistrer le profil',
    en: 'Save profile',
  },
  'search-profiles.a.confirmed.mismatch.blocks.a.priority.recommendation.missing.information':
    {
      fr: 'Un écart confirmé bloque la recommandation prioritaire. Une information absente ne bloque jamais.',
      en: 'A confirmed mismatch blocks a priority recommendation. Missing information never blocks it.',
    },
  'search-profiles.roles': {
    fr: 'Rôles',
    en: 'Roles',
  },
  'search-profiles.seniority.levels': {
    fr: 'Séniorités',
    en: 'Seniority levels',
  },
  'search-profiles.working.languages': {
    fr: 'Langues de travail',
    en: 'Working languages',
  },
  'search-profiles.french.english': {
    fr: 'Français, Anglais',
    en: 'French, English',
  },
  'search-profiles.minimum.annual.salary': {
    fr: 'Salaire annuel minimum',
    en: 'Minimum annual salary',
  },
  'search-profiles.minimum.salary': {
    fr: 'Salaire minimum',
    en: 'Minimum salary',
  },
  'search-profiles.minimum.salary.currency': {
    fr: 'Devise du salaire minimum',
    en: 'Minimum salary currency',
  },
  'search-profiles.preferences': {
    fr: 'Préférences',
    en: 'Preferences',
  },
  'search-profiles.they.improve.ranking.but.never.rule.out.a.job': {
    fr: 'Elles améliorent le classement, mais n’éliminent jamais une offre.',
    en: 'They improve ranking but never rule out a job.',
  },
  'search-profiles.b2b.saas.productivity': {
    fr: 'SaaS B2B, productivité',
    en: 'B2B SaaS, productivity',
  },
  'search-profiles.product.types': {
    fr: 'Types de produit',
    en: 'Product types',
  },
  'search-profiles.company.size': {
    fr: 'Taille d’entreprise',
    en: 'Company size',
  },
  'search-profiles.culture.and.autonomy': {
    fr: 'Culture et autonomie',
    en: 'Culture and autonomy',
  },
  'search-profiles.ownership.product.team': {
    fr: 'Ownership, équipe produit',
    en: 'Ownership, product team',
  },
  'search-profiles.privacy': {
    fr: 'Confidentialité',
    en: 'Privacy',
  },
  'search-profiles.these.rules.stay.in.your.workspace.and.prevent.a': {
    fr: 'Ces règles restent dans votre espace et empêchent une recommandation prioritaire.',
    en: 'These rules stay in your workspace and prevent a priority recommendation.',
  },
  'search-profiles.private': {
    fr: 'Privé',
    en: 'Private',
  },
  'search-profiles.companies.to.avoid': {
    fr: 'Entreprises à éviter',
    en: 'Companies to avoid',
  },
  'search-profiles.company.a.company.b': {
    fr: 'Entreprise A, Entreprise B',
    en: 'Company A, Company B',
  },
  'search-profiles.networks.to.avoid': {
    fr: 'Réseaux à éviter',
    en: 'Networks to avoid',
  },
  'search-profiles.founder.network.former.employer': {
    fr: 'Réseau de fondateurs, ancien employeur',
    en: 'Founder network, former employer',
  },
  'search-profiles.blocked': {
    fr: 'Bloqué',
    en: 'Blocked',
  },
  'search-profiles.test.a.job': {
    fr: 'Tester une offre',
    en: 'Test a job',
  },
  'search-profiles.check.the.exact.effect.of.a.value.before.saving': {
    fr: 'Vérifiez l’effet exact d’une information avant d’enregistrer le profil.',
    en: 'Check the exact effect of a value before saving the profile.',
  },
  'search-profiles.preview': {
    fr: 'Aperçu',
    en: 'Preview',
  },
  'search-profiles.criterion': {
    fr: 'Critère',
    en: 'Criterion',
  },
  'search-profiles.criterion.to.test': {
    fr: 'Critère à tester',
    en: 'Criterion to test',
  },
  'search-profiles.value.found.in.the.job': {
    fr: 'Valeur trouvée dans l’offre',
    en: 'Value found in the job',
  },
  'search-profiles.job.value': {
    fr: 'Valeur de l’offre',
    en: 'Job value',
  },
  'search-profiles.leave.blank.if.it.is.missing': {
    fr: 'Laissez vide si elle est absente',
    en: 'Leave blank if it is missing',
  },
  'search-profiles.unknown': {
    fr: 'Inconnu',
    en: 'Unknown',
  },
  'search-profiles.unknown.never.means.rejected': {
    fr: 'Inconnu ne signifie jamais refusé.',
    en: 'Unknown never means rejected.',
  },
  'search-profiles.separate.values.with.commas': {
    fr: 'Séparez les valeurs par une virgule.',
    en: 'Separate values with commas.',
  },
  'search-profiles.required.constraints': {
    fr: 'Contraintes obligatoires',
    en: 'Required constraints',
  },
  'search-profiles.blocking': {
    fr: 'Bloquant',
    en: 'Blocking',
  },
  'search-profiles.locations': {
    fr: 'Localisations',
    en: 'Locations',
  },
  'search-profiles.time.zones': {
    fr: 'Fuseaux horaires',
    en: 'Time zones',
  },
  'search-profiles.contracts': {
    fr: 'Contrats',
    en: 'Contracts',
  },
  'search-profiles.ranking': {
    fr: 'Classement',
    en: 'Ranking',
  },
  'search-profiles.industries': {
    fr: 'Secteurs',
    en: 'Industries',
  },
  'search-profiles.confidential.exclusions': {
    fr: 'Exclusions confidentielles',
    en: 'Confidential exclusions',
  },
  'search-profiles.compatible': {
    fr: 'Compatible',
    en: 'Compatible',
  },
  'search-profiles.contract.permanent': { fr: 'CDI', en: 'Permanent' },
  'search-profiles.contract.fixed.term': { fr: 'CDD', en: 'Fixed-term' },
  'search-profiles.contract.freelance': { fr: 'Freelance', en: 'Freelance' },
  'search-profiles.source.company': {
    fr: 'Entreprise source {index}',
    en: 'Source company {index}',
  },
  'search-profiles.source.board.url': {
    fr: 'URL du tableau source {index}',
    en: 'Source board URL {index}',
  },
  'search-profiles.source.remove': {
    fr: 'Supprimer la source {index}',
    en: 'Remove source {index}',
  },
} as const satisfies MessageDictionary;
