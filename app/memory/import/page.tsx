import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Geist_Mono, Instrument_Sans, Space_Grotesk } from 'next/font/google';
import styles from './page.module.css';

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--preview-font-sans',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--preview-font-mono',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--preview-font-brand',
  weight: '500',
});

export const metadata: Metadata = {
  title: 'Lecture du CV | Career OS',
  description: "Aperçu du premier écran d'import de Career OS.",
  icons: {
    icon: '/brand/favicon/favicon.svg',
    apple: '/brand/favicon/apple-touch-icon.svg',
  },
};

const navigation = [
  ['grid_view', 'Accueil', 'active'],
  ['account_tree', 'Candidatures', 'disabled'],
  ['database', 'Mémoire', 'running'],
  ['send', 'Liens privés', 'disabled'],
  ['settings', 'Réglages', 'idle'],
] as const;

const importSteps = [
  ['check_circle', 'Texte extrait et structuré', '1 240 mots', 'complete'],
  ['check_circle', 'Expériences et dates repérées', '4 postes', 'complete'],
  ['autorenew', 'Découpage en affirmations', '18 trouvées…', 'running'],
  ['radio_button_unchecked', "Rattachement à la page d'origine", '', 'pending'],
  ['radio_button_unchecked', 'Regroupement par compétence', '', 'pending'],
] as const;

const extractedClaims = [
  ['Temps de build ramené de 11 à 7 minutes', 'p.1 · ligne 14', 'verified'],
  ['Monorepo de 340 services', 'p.1 · ligne 14', 'verified'],
  ['Tech lead de 6 ingénieurs', 'p.1 · ligne 12', 'declared'],
  ['Astreinte partagée sur la plateforme', 'p.1 · ligne 18', 'verified'],
  ["Mainteneur d'un pont ROS2 open source", 'p.2 · ligne 3', 'verified'],
] as const;

function Icon({ children }: { children: string }) {
  return (
    <span aria-hidden="true" className={styles.icon}>
      {children}
    </span>
  );
}

function Brand() {
  return (
    <div aria-label="Career OS" className={styles.brand} role="img">
      <Image
        alt=""
        height={30}
        priority
        src="/brand/symbol/careeros-symbol-ink.svg"
        width={30}
      />
      <span>Career OS</span>
    </div>
  );
}

export default function ImportCvPage() {
  return (
    <main
      className={`${styles.canvas} ${instrumentSans.variable} ${geistMono.variable} ${spaceGrotesk.variable}`}
    >
      <a className={styles.skipLink} href="#import-progress">
        Aller à la progression
      </a>

      <section className={styles.screen} aria-label="Import du CV en cours">
        <aside className={styles.sidebar} aria-label="Navigation Career OS">
          <Brand />

          <nav className={styles.navigation} aria-label="Navigation principale">
            {navigation.map(([icon, label, state]) => (
              <div
                aria-current={state === 'active' ? 'page' : undefined}
                aria-disabled={state === 'disabled' ? 'true' : undefined}
                className={`${styles.navigationItem} ${styles[state] ?? ''}`}
                key={label}
              >
                <Icon>{state === 'running' ? 'autorenew' : icon}</Icon>
                <span>{label}</span>
              </div>
            ))}
          </nav>

          <section className={styles.setup} aria-labelledby="setup-title">
            <h2 id="setup-title">Mise en route</h2>
            <ol>
              <li className={styles.complete}>
                <Icon>check_circle</Icon>
                <span>Compte créé</span>
              </li>
              <li aria-current="step" className={styles.current}>
                <Icon>autorenew</Icon>
                <span>Importer un CV</span>
              </li>
              <li className={styles.pending}>
                <Icon>radio_button_unchecked</Icon>
                <span>Coller une offre</span>
              </li>
              <li className={styles.pending}>
                <Icon>radio_button_unchecked</Icon>
                <span>Publier une page</span>
              </li>
            </ol>
          </section>

          <div className={styles.account}>
            <span aria-hidden="true">MA</span>
            <strong>Marc Aubry</strong>
            <Icon>unfold_more</Icon>
          </div>
        </aside>

        <header className={styles.mobileHeader}>
          <Brand />
          <span aria-label="Compte de Marc Aubry">MA</span>
        </header>

        <section className={styles.content} id="import-progress">
          <header className={styles.contentHeader}>
            <div>
              <p>Étape 1 sur 3</p>
              <h1>Lecture de votre CV</h1>
            </div>
            <Link className={styles.cancel} href="/">
              Annuler l’import
            </Link>
          </header>

          <div className={styles.workspace}>
            <section
              className={styles.progressPanel}
              aria-labelledby="progress-title"
            >
              <div className={styles.fileCard}>
                <span className={styles.fileIcon}>
                  <Icon>picture_as_pdf</Icon>
                </span>
                <div>
                  <strong>cv_marc_aubry_2024.pdf</strong>
                  <span>2 pages · 184 Ko · texte extractible</span>
                </div>
                <span className={styles.statusBadge}>
                  <Icon>autorenew</Icon>
                  Découpage
                </span>
              </div>

              <div className={styles.progressBlock}>
                <div className={styles.progressHeading}>
                  <h2 id="progress-title">Progression</h2>
                  <span>≈ 15 s restantes</span>
                </div>
                <progress
                  aria-label="Progression de l’import"
                  max="100"
                  value="64"
                >
                  64 %
                </progress>
                <ol aria-live="polite" className={styles.stepList}>
                  {importSteps.map(([icon, label, meta, state]) => (
                    <li className={styles[state]} key={label}>
                      <Icon>{icon}</Icon>
                      <span>{label}</span>
                      {meta ? <small>{meta}</small> : null}
                    </li>
                  ))}
                </ol>
              </div>

              <aside className={styles.guardrail}>
                <Icon>info</Icon>
                <div>
                  <strong>Vous relirez tout avant validation</strong>
                  <p>
                    Rien n’entre dans votre mémoire sans votre accord. Les
                    affirmations mal découpées peuvent être fusionnées,
                    corrigées ou supprimées à l’écran suivant.
                  </p>
                </div>
              </aside>
            </section>

            <aside
              className={styles.extraction}
              aria-labelledby="extraction-title"
            >
              <header>
                <Icon>bolt</Icon>
                <h2 id="extraction-title">Extraction en direct</h2>
                <span>18</span>
              </header>

              <ol>
                {extractedClaims.map(([claim, locator, state]) => (
                  <li key={claim}>
                    <span aria-hidden="true" className={styles[state]} />
                    <span className={styles.srOnly}>
                      {state === 'verified'
                        ? 'Citation directe'
                        : 'À confirmer'}
                    </span>
                    <div>
                      <strong>{claim}</strong>
                      <small>{locator}</small>
                    </div>
                  </li>
                ))}
                <li className={styles.reading}>
                  <Icon>autorenew</Icon>
                  <span>Lecture de la page 2…</span>
                </li>
              </ol>

              <footer>
                <span>
                  <i className={styles.verified} /> citation directe
                </span>
                <span>
                  <i className={styles.declared} /> à confirmer
                </span>
              </footer>
            </aside>
          </div>
        </section>

        <nav className={styles.mobileNavigation} aria-label="Navigation mobile">
          {(
            [
              ['grid_view', 'Accueil', true],
              ['database', 'Mémoire', false],
              ['account_tree', 'Candidatures', false],
              ['settings', 'Réglages', false],
            ] as const
          ).map(([icon, label, active]) => (
            <span aria-current={active ? 'page' : undefined} key={label}>
              <Icon>{icon}</Icon>
              <small>{label}</small>
            </span>
          ))}
        </nav>
      </section>
    </main>
  );
}
