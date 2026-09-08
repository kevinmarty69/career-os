'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { LocaleSwitch, useI18n } from '@/components/i18n/i18n-provider';
import { Icon } from '@/components/ui/controls';
import styles from './landing.module.css';

const repository = 'https://github.com/kevinmarty69/career-os';

export function LandingScreen() {
  const fr = useI18n().locale === 'fr';
  const [proof, setProof] = useState(false);
  return (
    <main className={styles.landing}>
      <nav className={styles.nav} aria-label={fr ? 'Présentation' : 'Overview'}>
        <div>
          <Link href="/welcome" className={styles.brand}>
            <span>
              <Image
                src="/brand/symbol/careeros-symbol.svg"
                width={18}
                height={18}
                alt=""
              />
            </span>
            Career OS
          </Link>
          <div className={styles.navLinks}>
            <a href="#proof">{fr ? 'La preuve' : 'Evidence'}</a>
            <a href="#refusal">{fr ? 'Le refus' : 'The refusal'}</a>
            <a href="#private-page">
              {fr ? 'La page privée' : 'Private pages'}
            </a>
            <a href="#hosting">{fr ? 'Hébergement' : 'Hosting'}</a>
          </div>
          <LocaleSwitch compact />
          <Link href="/sign-in" className={styles.button}>
            {fr ? 'Commencer' : 'Get started'}
          </Link>
        </div>
      </nav>
      <section className={styles.hero}>
        <div className={styles.inner}>
          <div className={styles.tags}>
            <span>OPEN SOURCE · AGPL-3.0</span>
            <span>
              {fr
                ? 'VOS PREUVES · VOTRE DÉCISION'
                : 'YOUR EVIDENCE · YOUR DECISION'}
            </span>
          </div>
          <h1>
            {fr
              ? 'L’IA de candidature qui vous dit '
              : 'Application AI that can say '}
            <em>{fr ? 'non' : 'no'}</em>.
          </h1>
          <p className={styles.lead}>
            {fr
              ? 'Elle confronte vos affirmations à vos documents. Elle vous propose le chiffre qui est écrit noir sur blanc dans votre post-mortem. Puis elle vous laisse trancher.'
              : 'It checks your claims against your documents. It brings back the number written in your postmortem. Then it leaves the decision to you.'}
          </p>
          <div className={styles.actions}>
            <Link className={styles.button} href="/sign-in">
              {fr ? 'Construire ma mémoire pro' : 'Build my career memory'}
              <Icon name="arrow_forward" />
            </Link>
            <a className={styles.outlineButton} href="#refusal">
              <Icon name="play_arrow" />
              {fr ? 'Voir l’IA refuser' : 'See the refusal'}
            </a>
          </div>
          <div className={styles.principles}>
            {(fr
              ? [
                  ['Sources', 'Des affirmations rattachées à leurs preuves'],
                  ['Review', 'Les retours restent visibles avant publication'],
                  ['Vous', 'La validation finale reste humaine'],
                  ['Ouvert', 'Un code inspectable et modifiable'],
                ]
              : [
                  ['Sources', 'Claims linked to supporting evidence'],
                  ['Review', 'Feedback stays visible before publication'],
                  ['You', 'The final decision remains human'],
                  ['Open', 'Code you can inspect and adapt'],
                ]
            ).map(([value, label]) => (
              <div key={value}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section id="proof" className={styles.light}>
        <div className={styles.inner}>
          <small>01 — {fr ? 'CE QUE ÇA CHANGE' : 'WHAT CHANGES'}</small>
          <h2>
            {fr
              ? 'Vous connaissez déjà la phrase de gauche.'
              : 'You already know the sentence on the left.'}
          </h2>
          <p className={styles.lead}>
            {fr
              ? 'Exemple illustratif : une formulation vague, puis une affirmation que l’on peut vérifier.'
              : 'Illustrative example: a vague statement, then a claim that can be checked.'}
          </p>
          <div className={styles.twoColumns}>
            <article className={styles.card}>
              <small>{fr ? 'GÉNÉRIQUE' : 'GENERIC'}</small>
              <p className={styles.crossed}>
                {fr
                  ? '« Fort d’une solide expérience, j’ai contribué à l’amélioration significative de la performance et à la réduction des coûts. »'
                  : '“With extensive experience, I significantly improved performance and reduced costs.”'}
              </p>
              <p>
                {fr
                  ? 'Aucun chiffre. Aucune source. Difficile à défendre en entretien.'
                  : 'No number. No source. Hard to defend in an interview.'}
              </p>
            </article>
            <article className={`${styles.card} ${styles.darkCard}`}>
              <small>CAREER OS · {fr ? 'EXEMPLE' : 'EXAMPLE'}</small>
              <p className={styles.quote}>
                {fr
                  ? '« J’ai ramené le temps de build de 11 à 7 minutes (p50), puis passé l’outillage à l’équipe SRE. »'
                  : '“I reduced build time from 11 to 7 minutes (p50), then handed the tooling to the SRE team.”'}
              </p>
              <button
                className={styles.source}
                aria-expanded={proof}
                onClick={() => setProof(!proof)}
              >
                <Icon name="description" />
                corvid_postmortem.md · §4
                <Icon name="expand_more" />
              </button>
              {proof && (
                <p className={styles.sample}>
                  {fr
                    ? 'Document d’exemple : « Le p50 passe de 11 à 7 minutes après ajout du cache partagé. »'
                    : 'Example document: “p50 changed from 11 to 7 minutes after adding the shared cache.”'}
                </p>
              )}
              <p>
                {fr
                  ? 'Un chiffre, son contexte, et une source consultable.'
                  : 'A number, its context, and a source you can inspect.'}
              </p>
            </article>
          </div>
        </div>
      </section>
      <section id="refusal">
        <div className={styles.inner}>
          <small>02 — {fr ? 'LE REFUS' : 'THE REFUSAL'}</small>
          <h2>
            {fr
              ? 'Il n’y a pas de bouton « publier sans preuve ».'
              : 'There is no “publish without evidence” button.'}
          </h2>
          <div className={styles.refusal}>
            <div>
              <span className={styles.warning}>
                <Icon name="gpp_maybe" />
                {fr
                  ? 'EXEMPLE · AFFIRMATION NON SOURCÉE'
                  : 'EXAMPLE · UNSUPPORTED CLAIM'}
              </span>
              <h3>
                {fr
                  ? '« Divisé les coûts d’infrastructure par deux »'
                  : '“Cut infrastructure costs in half”'}
              </h3>
              <p>
                {fr
                  ? 'La formulation va plus loin que les documents disponibles. Retrouvez une source, reformulez ou retirez cette affirmation.'
                  : 'The wording goes beyond the available documents. Find a source, revise the wording or remove the claim.'}
              </p>
            </div>
            <div className={styles.options}>
              {(fr
                ? [
                    'Rattacher une preuve',
                    'Reformuler à partir de la source',
                    'Retirer de cette candidature',
                  ]
                : [
                    'Attach evidence',
                    'Reword from the source',
                    'Remove from this application',
                  ]
              ).map((text, index) => (
                <div key={text}>
                  <span>{index + 1}</span>
                  {text}
                  <Icon name="arrow_forward" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className={styles.light}>
        <div className={styles.inner}>
          <small>03 — {fr ? 'LE PARCOURS' : 'THE WORKFLOW'}</small>
          <h2>
            {fr
              ? 'Une mémoire, puis des candidatures ciblées.'
              : 'One memory. Then focused applications.'}
          </h2>
          <div className={styles.steps}>
            {(fr
              ? [
                  [
                    '1',
                    'Votre mémoire',
                    'Importez votre CV et vos documents. Relisez les affirmations extraites.',
                  ],
                  [
                    '2',
                    'L’offre',
                    'Ajoutez un lien ou le texte du poste. Les exigences donnent le contexte.',
                  ],
                  [
                    '3',
                    'Votre décision',
                    'Relisez les preuves, corrigez les écarts et validez votre page.',
                  ],
                ]
              : [
                  [
                    '1',
                    'Your memory',
                    'Import your CV and documents. Review the extracted claims.',
                  ],
                  [
                    '2',
                    'The role',
                    'Add a job URL or paste the role. Its requirements provide context.',
                  ],
                  [
                    '3',
                    'Your decision',
                    'Review evidence, resolve gaps and approve your page.',
                  ],
                ]
            ).map(([step, title, text]) => (
              <article className={styles.card} key={step}>
                <small>{step}</small>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section id="private-page">
        <div className={styles.inner}>
          <small>04 — {fr ? 'LA PAGE PRIVÉE' : 'THE PRIVATE PAGE'}</small>
          <h2>
            {fr
              ? 'Pas un PDF de plus. Une page faite pour eux.'
              : 'Not another PDF. A page made for them.'}
          </h2>
          <article className={styles.preview}>
            <small>
              NIMBUS ROBOTICS ·{' '}
              {fr ? 'EXEMPLE DE CANDIDATURE' : 'APPLICATION EXAMPLE'}
            </small>
            <h3>
              {fr
                ? 'Faire tenir une flotte qui grandit sur une plateforme que trois personnes peuvent opérer.'
                : 'Support a growing fleet with a platform three people can operate.'}
            </h3>
            <div className={styles.actions}>
              <span>11 → 7 min · build p50</span>
              <span>
                {fr
                  ? 'Source : post-mortem d’exemple'
                  : 'Source: example postmortem'}
              </span>
            </div>
          </article>
          <p className={styles.lead}>
            {fr
              ? 'Un lien révocable, un contenu ciblé, et une publication sous votre contrôle. L’exemple ci-dessus ne correspond pas à une candidature réelle.'
              : 'A revocable link, focused content, and publication under your control. The example above is not a real application.'}
          </p>
        </div>
      </section>
      <section className={styles.light}>
        <div className={styles.inner}>
          <small>05 — {fr ? 'LE CONTRÔLE' : 'CONTROL'}</small>
          <h2>
            {fr
              ? 'Vos documents ne sont pas notre produit.'
              : 'Your documents are not our product.'}
          </h2>
          <div className={styles.steps}>
            {(fr
              ? [
                  [
                    'lock',
                    'Permissions par source',
                    'Vous choisissez les usages autorisés de chaque preuve.',
                  ],
                  [
                    'mail_lock',
                    'Pas de candidature envoyée à votre place',
                    'Vous relisez et envoyez vos messages. Les emails de connexion sont distincts.',
                  ],
                  [
                    'import_export',
                    'Export de votre espace',
                    'Retrouvez vos données depuis les réglages, sans dépendre du rendu de l’application.',
                  ],
                ]
              : [
                  [
                    'lock',
                    'Permissions per source',
                    'Choose the allowed uses for each piece of evidence.',
                  ],
                  [
                    'mail_lock',
                    'No applications sent on your behalf',
                    'You review and send your messages. Sign-in emails are separate.',
                  ],
                  [
                    'import_export',
                    'Workspace export',
                    'Export your data from settings without depending on the application’s interface.',
                  ],
                ]
            ).map(([icon, title, text]) => (
              <article className={styles.card} key={icon}>
                <Icon name={icon} size={23} />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section id="hosting">
        <div className={styles.inner}>
          <small>06 — {fr ? 'HÉBERGEMENT' : 'HOSTING'}</small>
          <h2>
            {fr
              ? 'Le code ouvert. Le choix de votre hébergement.'
              : 'Open code. Your choice of hosting.'}
          </h2>
          <div className={styles.twoColumns}>
            <article className={`${styles.card} ${styles.darkCard}`}>
              <Icon name="cloud" size={23} />
              <h3>{fr ? 'SaaS hébergé' : 'Managed cloud'}</h3>
              <p>
                {fr
                  ? 'Offre cloud en préparation. Tarifs et paiement non activés sur cette instance.'
                  : 'Cloud offer in preparation. Pricing and payment are not enabled on this instance.'}
              </p>
              <Link className={styles.button} href="/sign-in">
                {fr ? 'Accéder à cette instance' : 'Access this instance'}
              </Link>
            </article>
            <article className={styles.card}>
              <Icon name="dns" size={23} />
              <h3>{fr ? 'Auto-hébergé' : 'Self-hosted'}</h3>
              <p>
                {fr
                  ? 'Code sous licence AGPL-3.0. Vous gérez l’hébergement, les modèles, les mises à jour et les sauvegardes. Leurs coûts éventuels restent à votre charge.'
                  : 'AGPL-3.0 code. Manage hosting, models, updates and backups. Any infrastructure or model costs remain yours.'}
              </p>
              <Link href={`${repository}#readme`} className={styles.source}>
                {fr ? 'Guide d’installation' : 'Installation guide'}
                <Icon name="arrow_forward" />
              </Link>
            </article>
          </div>
        </div>
      </section>
      <footer className={styles.inner}>
        <h2>
          {fr
            ? 'Votre meilleur travail mérite mieux qu’un adjectif.'
            : 'Your best work deserves more than an adjective.'}
        </h2>
        <div className={styles.actions}>
          <Link className={styles.button} href="/sign-in">
            {fr ? 'Construire ma mémoire pro' : 'Build my career memory'}
          </Link>
          <Link href={repository}>{fr ? 'Lire le code' : 'Read the code'}</Link>
        </div>
      </footer>
    </main>
  );
}
