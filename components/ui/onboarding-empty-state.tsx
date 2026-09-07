'use client';

import Link from 'next/link';
import { useI18n } from '@/components/i18n/i18n-provider';
import { Badge, Icon } from '@/components/ui/primitives';
import styles from './onboarding-empty-state.module.css';

const content = {
  memory: {
    icon: 'description',
    href: '/memory/import',
    en: {
      title: 'Your experience is the starting point.',
      copy: 'Start with your CV. Turn what you have done into a memory you can reuse for every application.',
      action: 'Import my CV',
      steps: [
        'Import a CV or a document',
        'Review the extracted claims and their sources',
        'Choose what can be used in your applications',
      ],
    },
    fr: {
      title: 'Tout commence par votre expérience.',
      copy: 'Commencez par votre CV. Transformez votre parcours en une mémoire réutilisable pour chaque candidature.',
      action: 'Importer mon CV',
      steps: [
        'Importez un CV ou un document',
        'Relisez les affirmations extraites et leurs sources',
        'Choisissez ce qui peut servir à vos candidatures',
      ],
    },
  },
  applications: {
    icon: 'add_link',
    href: '/applications/new',
    en: {
      title: 'One job. An application built around you.',
      copy: 'Paste a job URL to start a dedicated application. Connect the role to your experience, not to a generic template.',
      action: 'Add my first job',
      steps: [
        'Import and confirm the job details',
        'Match the requirements to your experience',
        'Review your tailored page before publishing',
      ],
    },
    fr: {
      title: 'Une offre. Une candidature qui vous ressemble.',
      copy: 'Collez le lien d’une offre pour créer son dossier. Reliez les attentes du poste à votre expérience, pas à un modèle générique.',
      action: 'Ajouter ma première offre',
      steps: [
        'Importez et confirmez les détails du poste',
        'Reliez les attentes à votre expérience',
        'Relisez votre page personnalisée avant de la publier',
      ],
    },
  },
  review: {
    icon: 'rule',
    href: '/applications',
    en: {
      title: 'The agents prepare. You decide.',
      copy: 'When an application needs your judgment, it appears here with the source and the proposed change side by side.',
      action: 'Start an application',
      steps: [
        'Start the workflow from an application',
        'Check unsupported or conflicting claims',
        'Confirm your decisions before publishing',
      ],
    },
    fr: {
      title: 'Les agents préparent. Vous décidez.',
      copy: 'Lorsqu’une candidature demande votre avis, elle apparaît ici avec la source et la correction proposée côte à côte.',
      action: 'Commencer une candidature',
      steps: [
        'Lancez le parcours depuis un dossier',
        'Vérifiez les affirmations sans preuve ou contradictoires',
        'Confirmez vos décisions avant de publier',
      ],
    },
  },
  links: {
    icon: 'link',
    href: '/applications',
    en: {
      title: 'Give a recruiter the full picture.',
      copy: 'Your published application pages will live here. Share a focused page for each company, with the experience that matters to them.',
      action: 'Open my applications',
      steps: [
        'Prepare and review an application page',
        'Publish it to create a private link',
        'Share the link, track activity, revoke when needed',
      ],
    },
    fr: {
      title: 'Donnez au recruteur le bon contexte.',
      copy: 'Vos pages de candidature publiées apparaîtront ici. Partagez une page par entreprise, avec les expériences qui comptent pour elle.',
      action: 'Ouvrir mes candidatures',
      steps: [
        'Préparez et relisez une page de candidature',
        'Publiez-la pour créer son lien privé',
        'Partagez le lien, suivez l’activité, révoquez-le au besoin',
      ],
    },
  },
  runs: {
    icon: 'history',
    href: '/applications',
    en: {
      title: 'Follow the work behind your application.',
      copy: 'Once you start a workflow, its steps, sources and decisions appear here. Nothing is running yet.',
      action: 'Open my applications',
      steps: [
        'Start a workflow from an application',
        'See the steps and sources it records',
        'Open the application when your input is needed',
      ],
    },
    fr: {
      title: 'Suivez le travail derrière votre candidature.',
      copy: 'Dès qu’un parcours démarre, ses étapes, sources et décisions apparaissent ici. Rien n’est encore en cours.',
      action: 'Ouvrir mes candidatures',
      steps: [
        'Lancez un parcours depuis une candidature',
        'Consultez les étapes et les sources enregistrées',
        'Ouvrez le dossier lorsque votre avis est nécessaire',
      ],
    },
  },
};

/** Illustrations only: these examples never enter the user's memory or workflows. */
export function OnboardingEmptyState({
  kind,
  onAction,
}: {
  kind: keyof typeof content;
  onAction?: () => void;
}) {
  const { locale } = useI18n();
  const fr = locale === 'fr';
  const entry = content[kind];
  const copy = entry[locale];
  return (
    <section className={styles.empty} data-onboarding={kind}>
      <div className={styles.intro}>
        <span className={styles.mark}>
          <Icon>{entry.icon}</Icon>
        </span>
        <p className={styles.eyebrow}>
          {fr ? 'Votre prochaine étape' : 'Your next step'}
        </p>
        <h2>{copy.title}</h2>
        <p className={styles.copy}>{copy.copy}</p>
        <ol className={styles.steps}>
          {copy.steps.map((step, index) => (
            <li key={step}>
              <span>{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
        {onAction ? (
          <button className="co-button" type="button" onClick={onAction}>
            {copy.action}
            <Icon>arrow_forward</Icon>
          </button>
        ) : (
          <Link className="co-button" href={entry.href}>
            {copy.action}
            <Icon>arrow_forward</Icon>
          </Link>
        )}
        {kind === 'memory' ? (
          <Link
            className={styles.alternative}
            href="/memory/import#profile-text"
          >
            {fr
              ? 'Pas de CV sous la main ? Collez vos notes'
              : 'No CV handy? Paste your career notes'}
            <Icon>arrow_forward</Icon>
          </Link>
        ) : null}
      </div>
      <figure className={styles.example}>
        <figcaption>
          <Icon>visibility</Icon>
          {fr ? 'Aperçu · exemple fictif' : 'Preview · illustrative example'}
        </figcaption>
        <div className={styles.preview}>
          {kind === 'memory' ? (
            <>
              <div className={styles.document}>
                <Icon>description</Icon>
                <span>
                  <strong>{fr ? 'Votre CV' : 'Your CV'}</strong>
                  <small>
                    {fr ? 'Expérience professionnelle' : 'Work experience'}
                  </small>
                </span>
              </div>
              <div className={styles.connector}>
                <Icon>arrow_downward</Icon>
                <span>
                  {fr
                    ? 'Une expérience, reliée à sa source'
                    : 'An experience, linked to its source'}
                </span>
              </div>
              <article className={styles.card}>
                <Badge tone="warn">{fr ? 'À relire' : 'To review'}</Badge>
                <h3>
                  {fr
                    ? 'Création du guide d’accueil de l’équipe.'
                    : 'Created the team’s onboarding guide.'}
                </h3>
                <p>
                  {fr
                    ? 'Source : CV · rubrique Expérience'
                    : 'Source: CV · Experience section'}
                </p>
                <footer>
                  <Icon>lock</Icon>
                  {fr
                    ? 'Vous choisissez les usages autorisés.'
                    : 'You choose the allowed uses.'}
                </footer>
              </article>
            </>
          ) : kind === 'review' ? (
            <>
              <article className={styles.card}>
                <Badge tone="warn">
                  {fr ? 'Décision humaine' : 'Human decision'}
                </Badge>
                <h3>
                  {fr
                    ? 'Le chiffre dépasse la preuve.'
                    : 'The number goes beyond the evidence.'}
                </h3>
                <p>
                  {fr
                    ? 'Le brouillon annonce −50 %. Le document indique 10 → 8 minutes, soit −20 %.'
                    : 'The draft says −50%. The document says 10 → 8 minutes: −20%.'}
                </p>
                <footer>
                  <Icon>description</Icon>
                  {fr
                    ? 'Rapport d’exemple · Résultats'
                    : 'Example report · Results'}
                </footer>
              </article>
              <div className={styles.explanation}>
                <Icon>rule</Icon>
                <p>
                  {fr
                    ? 'La vraie revue vous permet de corriger à partir de la source. Cet exemple n’enregistre aucune décision.'
                    : 'In a real review, you can correct the claim using its source. This example records no decision.'}
                </p>
              </div>
            </>
          ) : kind === 'links' ? (
            <>
              <article className={styles.card}>
                <Badge tone="muted">
                  {fr ? 'Brouillon · non publié' : 'Draft · not published'}
                </Badge>
                <p>{fr ? 'ENTREPRISE EXEMPLE' : 'EXAMPLE COMPANY'}</p>
                <h3>
                  {fr
                    ? 'Pourquoi mon parcours répond à votre besoin.'
                    : 'How my experience meets your needs.'}
                </h3>
                <ul>
                  <li>
                    {fr
                      ? 'Une introduction adaptée au poste'
                      : 'An introduction tailored to the role'}
                  </li>
                  <li>
                    {fr
                      ? 'Des expériences avec leurs sources'
                      : 'Experience with supporting sources'}
                  </li>
                  <li>{fr ? 'Un lien vers mon CV' : 'A link to my CV'}</li>
                </ul>
              </article>
              <div className={styles.explanation}>
                <Icon>lock</Icon>
                <p>
                  {fr
                    ? 'Aucun lien n’est créé avant votre publication. Cet aperçu n’est pas une page partagée.'
                    : 'No link is created until you publish. This preview is not a shared page.'}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className={styles.document}>
                <Icon>work_outline</Icon>
                <span>
                  <strong>
                    {fr ? 'Entreprise exemple' : 'Example company'}
                  </strong>
                  <small>
                    {fr
                      ? 'Le poste qui vous intéresse'
                      : 'The role you are interested in'}
                  </small>
                </span>
              </div>
              <ol className={styles.workflow}>
                {(fr
                  ? [
                      'Comprendre l’offre et l’entreprise',
                      'Retenir les expériences pertinentes',
                      'Préparer le dossier personnalisé',
                      'Votre relecture avant publication',
                    ]
                  : [
                      'Understand the role and company',
                      'Select relevant experience',
                      'Prepare the tailored application',
                      'Your review before publication',
                    ]
                ).map((step, index) => (
                  <li key={step}>
                    <Icon>
                      {['search', 'account_tree', 'description', 'rule'][index]}
                    </Icon>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              <div className={styles.explanation}>
                <Icon>info</Icon>
                <p>
                  {fr
                    ? 'Aucune candidature envoyée automatiquement.'
                    : 'No application is sent automatically.'}
                </p>
              </div>
            </>
          )}
        </div>
        <p className={styles.caption}>
          {fr
            ? 'Pour vous montrer le résultat attendu. Aucune donnée d’exemple n’est ajoutée à votre espace.'
            : 'A look at what you can build. No example data is added to your workspace.'}
        </p>
      </figure>
    </section>
  );
}
