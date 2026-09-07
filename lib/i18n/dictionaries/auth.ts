import type { MessageDictionary } from '../messages';
export const authMessages = {
  'auth.authentication.method': {
    fr: 'Mode d’authentification',
    en: 'Authentication method',
  },
  'auth.sign.in': {
    fr: 'Se connecter',
    en: 'Sign In',
  },
  'auth.create.account': {
    fr: 'Créer un compte',
    en: 'Create Account',
  },
  'auth.welcome.back': {
    fr: 'Bon retour',
    en: 'Welcome back',
  },
  'auth.create.your.account': {
    fr: 'Créez votre compte',
    en: 'Create your account',
  },
  'auth.choose.a.workspace': {
    fr: 'Choisissez un espace',
    en: 'Choose a workspace',
  },
  'auth.create.your.workspace': {
    fr: 'Créez votre espace',
    en: 'Create your workspace',
  },
  'auth.sign.in.to.manage.and.revoke.private.application.links': {
    fr: 'Connectez-vous pour gérer et révoquer vos liens de candidature privés.',
    en: 'Sign in to manage and revoke private application links.',
  },
  'auth.your.account.keeps.applications.isolated.from.every.other.user': {
    fr: 'Votre compte isole vos candidatures de celles des autres utilisateurs.',
    en: 'Your account keeps applications isolated from every other user.',
  },
  'auth.private.links.are.always.created.inside.one.active.workspace': {
    fr: 'Les liens privés sont toujours créés dans un seul espace actif.',
    en: 'Private links are always created inside one active workspace.',
  },
  'auth.workspace.name': {
    fr: 'Nom de l’espace',
    en: 'Workspace name',
  },
  'auth.please.wait': {
    fr: 'Veuillez patienter…',
    en: 'Please wait…',
  },
  'auth.create.workspace': {
    fr: 'Créer l’espace',
    en: 'Create Workspace',
  },
  'auth.name': {
    fr: 'Nom',
    en: 'Name',
  },
  'auth.password': {
    fr: 'Mot de passe',
    en: 'Password',
  },
  'auth.use.at.least.12.characters': {
    fr: 'Utilisez au moins 12 caractères.',
    en: 'Use at least 12 characters.',
  },
  'auth.back.to.local.workspace': {
    fr: 'Retour à l’espace local',
    en: 'Back to local workspace',
  },
  'auth.your.account.is.ready.but.the.workspace.could.not': {
    fr: 'Votre compte est prêt, mais l’espace n’a pas pu être chargé. Connectez-vous pour continuer.',
    en: 'Your account is ready, but the workspace could not be loaded. Sign in to continue.',
  },
  'auth.authentication.failed.check.your.details.and.retry': {
    fr: 'Échec de l’authentification. Vérifiez vos informations et réessayez.',
    en: 'Authentication failed. Check your details and retry.',
  },
  'auth.the.workspace.could.not.be.selected.retry': {
    fr: 'L’espace n’a pas pu être sélectionné. Réessayez.',
    en: 'The workspace could not be selected. Retry.',
  },
  'auth.the.workspace.could.not.be.created.retry': {
    fr: 'L’espace n’a pas pu être créé. Réessayez.',
    en: 'The workspace could not be created. Retry.',
  },
} as const satisfies MessageDictionary;
