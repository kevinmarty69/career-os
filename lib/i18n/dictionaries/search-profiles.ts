import type { MessageDictionary } from '../messages';

export const searchProfilesMessages = {
  Rôle: 'Role',
  Séniorité: 'Seniority',
  Localisation: 'Location',
  'Mode de travail': 'Work mode',
  'Fuseau horaire': 'Time zone',
  Langue: 'Language',
  Contrat: 'Contract',
  Salaire: 'Salary',
  'Entreprise exclue': 'Excluded company',
  'Réseau exclu': 'Excluded network',
  'Connectez-vous pour retrouver vos profils de recherche.':
    'Sign in to access your search profiles.',
  'Impossible de charger vos profils. Réessayez.':
    'Unable to load your profiles. Try again.',
  'Donnez un nom au profil et vérifiez les critères saisis.':
    'Name the profile and review the entered criteria.',
  'Ce profil a changé ailleurs ou ce nom existe déjà. Rechargez la page.':
    'This profile changed elsewhere or this name already exists. Reload the page.',
  'Impossible d’enregistrer ce profil.': 'Unable to save this profile.',
  'Impossible de supprimer ce profil.': 'Unable to delete this profile.',
  'Filtrer sans deviner': 'Filter without guessing',
  'Une information absente reste à vérifier.':
    'Missing information remains unknown.',
  'Recherche d’offres': 'Job search',
  'Profils de recherche': 'Search profiles',
  'Définissez ce qui bloque une offre et ce qui améliore seulement son classement.':
    'Define what rules out a job and what only improves its ranking.',
  'Nouveau profil': 'New profile',
  Réessayer: 'Try again',
  'Profils enregistrés': 'Saved profiles',
  Profils: 'Profiles',
  'Chargement…': 'Loading…',
  'Vos recherches sauvegardées': 'Your saved searches',
  Actif: 'Active',
  'En pause': 'Paused',
  'Aucun profil enregistré. Commencez par celui-ci.':
    'No saved profile. Start with this one.',
  'Éditeur du profil': 'Profile editor',
  'Nom du profil': 'Profile name',
  'Seuil d’alerte': 'Alert threshold',
  Désactivé: 'Disabled',
  'Signal humain, en %': 'Human feedback signal, %',
  'Découverte planifiée': 'Scheduled discovery',
  'Surveillez des tableaux publics Greenhouse ou Ashby. Aucun service payant n’est requis.':
    'Monitor public Greenhouse or Ashby boards. No paid service is required.',
  Automatique: 'Automatic',
  Fréquence: 'Frequency',
  'Fréquence de découverte': 'Discovery frequency',
  'Toutes les 6 heures': 'Every 6 hours',
  'Toutes les 12 heures': 'Every 12 hours',
  'Chaque jour': 'Daily',
  'Tous les 3 jours': 'Every 3 days',
  'Ajouter un tableau': 'Add board',
  'URL du tableau public': 'Public board URL',
  'Aucun tableau surveillé. Ajoutez l’URL racine d’un tableau public.':
    'No board is monitored. Add the root URL of a public board.',
  'Profil actif': 'Active profile',
  'Profil enregistré.': 'Profile saved.',
  'Les changements ne sont pas automatiques.':
    'Changes are not applied automatically.',
  'Confirmer la suppression': 'Confirm deletion',
  Supprimer: 'Delete',
  'Enregistrer le profil': 'Save profile',
  'Contraintes dures': 'Hard constraints',
  'Un écart confirmé bloque la recommandation prioritaire. Une information absente ne bloque jamais.':
    'A confirmed mismatch blocks a priority recommendation. Missing information never blocks it.',
  Rôles: 'Roles',
  Séniorités: 'Seniority levels',
  'Langues de travail': 'Working languages',
  'Français, Anglais': 'French, English',
  Télétravail: 'Remote work',
  Hybride: 'Hybrid',
  'Sur site': 'On-site',
  'Salaire annuel minimum': 'Minimum annual salary',
  'Salaire minimum': 'Minimum salary',
  'Devise du salaire minimum': 'Minimum salary currency',
  Préférences: 'Preferences',
  'Elles améliorent le classement, mais n’éliminent jamais une offre.':
    'They improve ranking but never rule out a job.',
  'SaaS B2B, productivité': 'B2B SaaS, productivity',
  'Types de produit': 'Product types',
  'Taille d’entreprise': 'Company size',
  'Culture et autonomie': 'Culture and autonomy',
  'Ownership, équipe produit': 'Ownership, product team',
  Confidentialité: 'Privacy',
  'Ces règles restent dans votre espace et empêchent une recommandation prioritaire.':
    'These rules stay in your workspace and prevent a priority recommendation.',
  Privé: 'Private',
  'Entreprises à éviter': 'Companies to avoid',
  'Entreprise A, Entreprise B': 'Company A, Company B',
  'Réseaux à éviter': 'Networks to avoid',
  'Réseau de fondateurs, ancien employeur': 'Founder network, former employer',
  Bloqué: 'Blocked',
  'Tester une offre': 'Test a job',
  'Vérifiez l’effet exact d’une information avant d’enregistrer le profil.':
    'Check the exact effect of a value before saving the profile.',
  Aperçu: 'Preview',
  Critère: 'Criterion',
  'Critère à tester': 'Criterion to test',
  'Valeur trouvée dans l’offre': 'Value found in the job',
  'Valeur de l’offre': 'Job value',
  'Laissez vide si elle est absente': 'Leave blank if it is missing',
  Correspond: 'Matches',
  Inconnu: 'Unknown',
  'Inconnu ne signifie jamais refusé.': 'Unknown never means rejected.',
  'Séparez les valeurs par une virgule.': 'Separate values with commas.',
  'Contraintes obligatoires': 'Required constraints',
  Bloquant: 'Blocking',
  Localisations: 'Locations',
  'Fuseaux horaires': 'Time zones',
  Contrats: 'Contracts',
  CDI: 'Permanent',
  CDD: 'Fixed-term',
  Stage: 'Internship',
  Classement: 'Ranking',
  Secteurs: 'Industries',
  'Exclusions confidentielles': 'Confidential exclusions',
  Compatible: 'Compatible',
  'Information absente ou critère non défini : à vérifier.':
    'Missing information or undefined criterion: needs verification.',
  'La devise diffère : le montant doit être vérifié.':
    'The currency differs: the amount needs verification.',
  'Le salaire atteint le minimum demandé.':
    'The salary meets the required minimum.',
  'Le salaire est inférieur au minimum demandé.':
    'The salary is below the required minimum.',
  'L’entreprise figure dans vos exclusions.':
    'The company is in your exclusions.',
  'L’entreprise ne figure pas dans vos exclusions.':
    'The company is not in your exclusions.',
  'Ce réseau figure dans vos exclusions.': 'The network is in your exclusions.',
  'Ce réseau ne figure pas dans vos exclusions.':
    'The network is not in your exclusions.',
  'La valeur respecte ce critère obligatoire.':
    'The value meets this required criterion.',
  'La valeur ne respecte pas ce critère obligatoire.':
    'The value does not meet this required criterion.',
  'Le rôle correspond à une valeur autorisée.':
    'The role matches an allowed value.',
  'Le rôle ne correspond à aucune valeur autorisée.':
    'The role does not match any allowed value.',
  'La séniorité correspond à une valeur autorisée.':
    'The seniority matches an allowed value.',
  'La séniorité ne correspond à aucune valeur autorisée.':
    'The seniority does not match any allowed value.',
  'La localisation correspond à une valeur autorisée.':
    'The location matches an allowed value.',
  'La localisation ne correspond à aucune valeur autorisée.':
    'The location does not match any allowed value.',
  'Le mode de travail correspond à une valeur autorisée.':
    'The work mode matches an allowed value.',
  'Le mode de travail ne correspond à aucune valeur autorisée.':
    'The work mode does not match any allowed value.',
  'Le fuseau horaire correspond à une valeur autorisée.':
    'The time zone matches an allowed value.',
  'Le fuseau horaire ne correspond à aucune valeur autorisée.':
    'The time zone does not match any allowed value.',
  'La langue correspond à une valeur autorisée.':
    'The language matches an allowed value.',
  'La langue ne correspond à aucune valeur autorisée.':
    'The language does not match any allowed value.',
  'Le contrat correspond à une valeur autorisée.':
    'The contract matches an allowed value.',
  'Le contrat ne correspond à aucune valeur autorisée.':
    'The contract does not match any allowed value.',
  'Le salaire atteint le minimum défini.':
    'The salary meets the defined minimum.',
  'Le salaire est inférieur au minimum défini.':
    'The salary is below the defined minimum.',
  'Cette entreprise est exclue.': 'This company is excluded.',
  'Cette entreprise ne figure pas dans les exclusions.':
    'This company is not excluded.',
  'Ce réseau est exclu.': 'This network is excluded.',
  'Ce réseau ne figure pas dans les exclusions.':
    'This network is not excluded.',
} as const satisfies MessageDictionary;
