import type { MessageDictionary } from '../messages';

export const authMessages = {
  'Mode d’authentification': 'Authentication method',
  'Se connecter': 'Sign In',
  'Créer un compte': 'Create Account',
  'Bon retour': 'Welcome back',
  'Créez votre compte': 'Create your account',
  'Choisissez un espace': 'Choose a workspace',
  'Créez votre espace': 'Create your workspace',
  'Connectez-vous pour gérer et révoquer vos liens de candidature privés.':
    'Sign in to manage and revoke private application links.',
  'Votre compte isole vos candidatures de celles des autres utilisateurs.':
    'Your account keeps applications isolated from every other user.',
  'Les liens privés sont toujours créés dans un seul espace actif.':
    'Private links are always created inside one active workspace.',
  'Nom de l’espace': 'Workspace name',
  'Veuillez patienter…': 'Please wait…',
  'Créer l’espace': 'Create Workspace',
  Nom: 'Name',
  'Mot de passe': 'Password',
  'Utilisez au moins 12 caractères.': 'Use at least 12 characters.',
  'Retour à l’espace local': 'Back to local workspace',
  'Votre compte est prêt, mais l’espace n’a pas pu être chargé. Connectez-vous pour continuer.':
    'Your account is ready, but the workspace could not be loaded. Sign in to continue.',
  'Échec de l’authentification. Vérifiez vos informations et réessayez.':
    'Authentication failed. Check your details and retry.',
  'L’espace n’a pas pu être sélectionné. Réessayez.':
    'The workspace could not be selected. Retry.',
  'L’espace n’a pas pu être créé. Réessayez.':
    'The workspace could not be created. Retry.',
} as const satisfies MessageDictionary;
