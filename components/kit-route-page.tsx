'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';

type Query = Record<string, string | string[] | undefined>;
type Tone = 'ok' | 'warn' | 'crit' | 'accent' | 'muted';

function Icon({ children }: { children: string }) {
  return (
    <span className="material-symbols-rounded co-icon" aria-hidden="true">
      {children}
    </span>
  );
}

function Badge({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return <span className={`co-badge ${tone}`}>{children}</span>;
}

function Button({
  children,
  quiet = false,
  danger = false,
}: {
  children: ReactNode;
  quiet?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      className={`co-button${quiet ? ' quiet' : ''}${danger ? ' danger' : ''}`}
      type="button"
    >
      {children}
    </button>
  );
}

const nav = [
  ['/', 'space_dashboard', 'Accueil'],
  ['/inbox', 'inbox', 'À trancher'],
  ['/applications', 'work_history', 'Candidatures'],
  ['/memory', 'database', 'Mémoire pro'],
  ['/assets', 'description', 'Assets'],
  ['/runs', 'bolt', "Runs d'agents"],
  ['/interviews/demo', 'record_voice_over', 'Entretiens'],
  ['/insights', 'monitoring', 'Insights'],
  ['/settings/models', 'settings', 'Réglages'],
] as const;

function AppShell({
  path,
  children,
  aside,
  sidebarContext,
  sidebarFooter,
}: {
  path: string;
  children: ReactNode;
  aside?: ReactNode;
  sidebarContext?: ReactNode;
  sidebarFooter?: ReactNode;
}) {
  const [palette, setPalette] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPalette(true);
      }
      if (event.key === 'Escape') setPalette(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <main className={`co-shell${aside ? ' has-aside' : ''}`}>
      <aside className="co-sidebar" aria-label="Navigation principale">
        <Link className="co-brand" href="/">
          <span>
            <i />
          </span>
          <strong>Career OS</strong>
          <Icon>unfold_more</Icon>
        </Link>
        <nav>
          {nav.map(([href, icon, label]) => (
            <Link
              className={
                path === href || (href !== '/' && path.startsWith(href))
                  ? 'active'
                  : ''
              }
              href={href}
              key={href}
            >
              <Icon>{icon}</Icon>
              <span>{label}</span>
              {href === '/inbox' ? <Badge tone="accent">3</Badge> : null}
            </Link>
          ))}
        </nav>
        {sidebarContext ?? <CurrentApplications />}
        {sidebarFooter === undefined ? <InstanceCard /> : sidebarFooter}
      </aside>
      <section className="co-surface">
        <div className="co-content">{children}</div>
      </section>
      {aside ? <aside className="co-sidepanel">{aside}</aside> : null}
      {palette ? <CommandPalette onClose={() => setPalette(false)} /> : null}
    </main>
  );
}

function CurrentApplications() {
  return (
    <>
      <p className="co-nav-label">En cours</p>
      <div className="co-current-list">
        <Link href="/applications/nimbus">
          <i className="accent">NR</i>
          <span>Nimbus</span>
          <b className="warn" />
        </Link>
        <Link href="/applications/atlas">
          <i className="ok">AH</i>
          <span>Atlas Health</span>
          <b className="ok" />
        </Link>
        <Link href="/applications/keel">
          <i>KE</i>
          <span>Keel</span>
          <Icon>autorenew</Icon>
        </Link>
      </div>
    </>
  );
}

function InstanceCard() {
  return (
    <div className="co-instance">
      <Icon>cloud_done</Icon>
      <strong>Instance saine</strong>
      <small>
        Auto-hébergé · 3 workers
        <br />
        dernière sauvegarde 03:00
      </small>
    </div>
  );
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  return (
    <div className="co-scrim" role="presentation" onMouseDown={onClose}>
      <section
        className="co-command"
        role="dialog"
        aria-modal="true"
        aria-label="Palette de commandes"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <label>
          <Icon>search</Icon>
          <input
            autoFocus
            placeholder="Chercher une preuve, une entreprise, une action…"
          />
          <kbd>esc</kbd>
        </label>
        <p>Preuves · 3</p>
        <Link href="/memory" onClick={onClose}>
          <Icon>verified</Icon>
          <span>
            <strong>build p50 : 11 min → 7 min</strong>
            <small>corvid_postmortem.md · §4 · vérifiée</small>
          </span>
          <kbd>↵</kbd>
        </Link>
        <Link href="/memory" onClick={onClose}>
          <Icon>verified</Icon>
          <span>
            <strong>Cache de build partagé entre 340 services</strong>
            <small>cv_2024.pdf · p.2</small>
          </span>
        </Link>
        <Link href="/memory/conflicts" onClick={onClose}>
          <Icon>rule</Icon>
          <span>
            <strong>Temps de build divisé par deux</strong>
            <small>déclaré · en conflit avec la source</small>
          </span>
        </Link>
        <p>Candidatures · 2</p>
        <Link href="/applications/nimbus" onClick={onClose}>
          <i>NR</i>
          <span>
            <strong>Nimbus Robotics — cite ce chiffre</strong>
            <small>Staff Product Engineer · publiée</small>
          </span>
        </Link>
        <Link href="/applications/fathom?state=running" onClick={onClose}>
          <i>FT</i>
          <span>
            <strong>Fathom — appariement en cours</strong>
            <small>Platform Engineer · brouillon</small>
          </span>
        </Link>
        <p>Actions</p>
        <Link href="/applications#new" onClick={onClose}>
          <Icon>add_link</Icon>
          <span>
            <strong>Nouvelle candidature depuis une URL</strong>
          </span>
          <kbd>⌘N</kbd>
        </Link>
        <Link href="/memory/import" onClick={onClose}>
          <Icon>upload_file</Icon>
          <span>
            <strong>Importer un document dans la mémoire</strong>
          </span>
          <kbd>⌘U</kbd>
        </Link>
        <footer>
          ↑↓ naviguer <span>↵ ouvrir</span>
          <span>⌘↵ nouvel onglet</span>
          <b>recherche dans 128 preuves</b>
        </footer>
      </section>
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  copy,
  actions,
}: {
  eyebrow?: string;
  title: string;
  copy?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="co-page-header">
      <div>
        {eyebrow ? <p>{eyebrow}</p> : null}
        <h1>{title}</h1>
        {copy ? <span>{copy}</span> : null}
      </div>
      {actions ? <div className="co-actions">{actions}</div> : null}
    </header>
  );
}

function Stat({
  icon,
  value,
  label,
  tone = 'accent',
}: {
  icon: string;
  value: ReactNode;
  label: string;
  tone?: Tone;
}) {
  return (
    <article className="co-stat">
      <span className={tone}>
        <Icon>{icon}</Icon>
      </span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </article>
  );
}

function ClaimRow({
  tone = 'ok',
  label,
  text,
  source,
  action,
}: {
  tone?: Tone;
  label: string;
  text: string;
  source?: string;
  action?: string;
}) {
  return (
    <article className="co-claim">
      <div>
        <Badge tone={tone}>{label}</Badge>
        {source ? <small>{source}</small> : null}
      </div>
      <strong>{text}</strong>
      {action ? <Button quiet>{action}</Button> : null}
    </article>
  );
}

function MemoryScreen() {
  return (
    <AppShell
      path="/memory"
      sidebarContext={
        <>
          <p className="co-nav-label">Sources</p>
          <div className="co-sidebar-sources">
            <Link href="/memory/import">
              <Icon>picture_as_pdf</Icon>
              <span>Documents</span>
              <b>18</b>
            </Link>
            <Link href="/memory/import">
              <Icon>badge</Icon>
              <span>LinkedIn</span>
              <i className="ok" />
            </Link>
            <Link href="/memory/import">
              <Icon>code</Icon>
              <span>GitHub</span>
              <i className="ok" />
            </Link>
            <Link className="muted" href="/memory/import">
              <Icon>cloud_off</Icon>
              <span>Drive</span>
              <em>resync</em>
            </Link>
          </div>
        </>
      }
      sidebarFooter={
        <div className="co-sidebar-card">
          <strong>Ajouter une source</strong>
          <span>PDF, URL, dépôt, ou entretien guidé.</span>
          <Link className="co-button" href="/memory/import">
            Importer
          </Link>
        </div>
      }
    >
      <PageHeader
        title="Mémoire professionnelle"
        copy="128 affirmations issues de 24 sources. Rien n’entre ici sans document daté."
        actions={
          <>
            <Button quiet>
              <Icon>download</Icon>Exporter
            </Button>
            <Button>
              <Icon>add</Icon>Nouvelle affirmation
            </Button>
          </>
        }
      />
      <div className="co-memory-metrics">
        <article>
          <span>Complétude</span>
          <div>
            <strong>78 %</strong>
            <b>+6 pts</b>
          </div>
          <progress max="100" value="78" />
        </article>
        <article>
          <span>Niveau de preuve</span>
          <div>
            <strong>92</strong>
            <small>vérifiées</small>
          </div>
          <footer>
            <Badge tone="ok">92 vérifié</Badge>
            <Badge tone="warn">26 déclaré</Badge>
          </footer>
        </article>
        <article>
          <span>À corriger</span>
          <div>
            <strong className="crit">10</strong>
            <small>sans source</small>
          </div>
          <Link href="/inbox">Lancer la revue</Link>
        </article>
        <article>
          <span>Conflits entre sources</span>
          <div>
            <strong>2</strong>
            <small>à arbitrer</small>
          </div>
          <Link href="/memory/conflicts">Voir les conflits</Link>
        </article>
      </div>
      <div className="co-memory-body">
        <section className="co-memory-main">
          <div className="co-memory-toolbar">
            <div className="co-segment">
              <button className="active">Affirmations</button>
              <button>Expériences</button>
              <button>Projets</button>
              <button>Compétences</button>
            </div>
            <Button quiet>
              <Icon>filter_list</Icon>Niveau de preuve
            </Button>
            <button className="co-round" aria-label="Rechercher" type="button">
              <Icon>search</Icon>
            </button>
          </div>
          <div className="co-memory-claims">
            <article>
              <Icon>verified</Icon>
              <div>
                <header>
                  <Badge tone="ok">Vérifié</Badge>
                  <small>Corvid · 2021-2024</small>
                  <code>2 preuves</code>
                </header>
                <strong>
                  Temps de build ramené de 11 à 7 minutes (p50) sur un monorepo
                  de 340 services.
                </strong>
                <footer>
                  <span>
                    <Icon>description</Icon>corvid_postmortem.md
                  </span>
                  <span>
                    <Icon>picture_as_pdf</Icon>cv_2024.pdf · p.2
                  </span>
                </footer>
              </div>
            </article>
            <article className="unsourced">
              <Icon>link_off</Icon>
              <div>
                <header>
                  <Badge tone="crit">Sans source</Badge>
                  <small>utilisée dans 1 candidature</small>
                </header>
                <strong>« Divisé les coûts d’infrastructure par deux. »</strong>
                <footer>
                  <Button>Rattacher une preuve</Button>
                  <Button quiet>Passer en « déclaré »</Button>
                </footer>
              </div>
            </article>
            <article>
              <Icon>rule</Icon>
              <div>
                <header>
                  <Badge tone="warn">Conflit</Badge>
                  <small>LinkedIn ≠ CV</small>
                </header>
                <strong>
                  Taille de l’équipe encadrée : <mark>6</mark> ou <mark>9</mark>{' '}
                  personnes ?
                </strong>
                <Link href="/memory/conflicts">Arbitrer</Link>
              </div>
            </article>
            <article>
              <Icon>verified</Icon>
              <div>
                <header>
                  <Badge tone="ok">Vérifié</Badge>
                  <small>open source · depuis 2023</small>
                  <code>1 preuve</code>
                </header>
                <strong>
                  Mainteneur principal d’un pont ROS2 utilisé en production par
                  4 entreprises.
                </strong>
              </div>
            </article>
          </div>
        </section>
        <aside className="co-memory-side">
          <header>
            <h2>Compléter</h2>
            <Badge tone="accent">5 pistes</Badge>
          </header>
          <section>
            <strong>Entretien guidé · 8 min</strong>
            <span>
              Quatre questions sur Corvid pour transformer vos notes en
              affirmations sourcées.
            </span>
            <Link className="co-button" href="/memory/interview">
              Commencer
            </Link>
          </section>
          <div className="co-memory-prompt-list">
            <button>
              <Icon>query_stats</Icon>Aucune métrique sur 2 projets
              <Icon>chevron_right</Icon>
            </button>
            <button>
              <Icon>school</Icon>Formations non renseignées
              <Icon>chevron_right</Icon>
            </button>
            <button>
              <Icon>group</Icon>Aucune recommandation importée
              <Icon>chevron_right</Icon>
            </button>
          </div>
          <footer>
            <h2>Confidentialité</h2>
            <dl>
              <div>
                <dt>
                  <Icon>lock</Icon>Sensibilité par défaut
                </dt>
                <dd>privé</dd>
              </div>
              <div>
                <dt>
                  <Icon>policy</Icon>Usages autorisés
                </dt>
                <dd>3 / 5</dd>
              </div>
            </dl>
          </footer>
        </aside>
      </div>
    </AppShell>
  );
}

function ApplicationsScreen() {
  const columns = [
    [
      'Brouillon',
      [
        ['KE', 'Keel', 'Infrastructure Engineer', '42 % · Agents en cours…'],
        ['FT', 'Fathom', 'Platform Engineer', 'Offre importée · à confirmer'],
      ],
    ],
    [
      'À valider',
      [
        [
          'NR',
          'Nimbus Robotics',
          'Staff Product Engineer',
          '11/12 sourcé · Trancher 3 modifications',
        ],
      ],
    ],
    [
      'Envoyée',
      [
        [
          'AH',
          'Atlas Health',
          'Lead Product Designer',
          'Page ouverte 4 fois · relance prête',
        ],
        ['OR', 'Orbital', 'Senior Backend Engineer', 'Envoyée il y a 3 j'],
        ['LU', 'Lumen', 'Staff Engineer, Data', 'Jamais ouverte · J+11'],
      ],
    ],
    [
      'Entretien',
      [
        [
          'VL',
          'Vantage Labs',
          'Research Engineer',
          '8 sept. · 14:00 · technique',
        ],
        ['HE', 'Helix', 'Infra Lead', 'Débrief à écrire'],
      ],
    ],
  ] as const;
  return (
    <AppShell path="/applications">
      <PageHeader
        title="Candidatures"
        copy="14 actives · 5 réponses · 3 entretiens"
        actions={
          <>
            <div className="co-segment">
              <button>Liste</button>
              <button className="active">Kanban</button>
              <button>Calendrier</button>
            </div>
            <Button>
              <Icon>add_link</Icon>Coller une offre
            </Button>
          </>
        }
      />
      <div className="co-filterbar">
        <Badge tone="accent">Infra / plateforme</Badge>
        <Badge>Remote possible</Badge>
        <button>Effacer</button>
        <Button quiet>
          <Icon>filter_list</Icon>Filtres · 2
        </Button>
      </div>
      <div className="co-board">
        {columns.map(([title, cards]) => (
          <section key={title}>
            <header>
              <h2>{title}</h2>
              <Badge>{cards.length}</Badge>
            </header>
            {cards.map(([initials, company, role, meta]) => (
              <Link
                className="co-app-card"
                href={`/applications/${company.toLowerCase().replaceAll(' ', '-')}`}
                key={company}
              >
                <i>{initials}</i>
                <small>{company}</small>
                <strong>{role}</strong>
                <span>{meta}</span>
                <Icon>chevron_right</Icon>
              </Link>
            ))}
            <button className="co-add-card">
              <Icon>add</Icon>Ajouter
            </button>
          </section>
        ))}
      </div>
    </AppShell>
  );
}

function DossierNav({ active }: { active: string }) {
  const items = [
    ['assignment', 'Brief', ''],
    ['business', 'Entreprise', 'company'],
    ['rule', 'Exigences ↔ preuves', ''],
    ['strategy', 'Stratégie', ''],
    ['folder', 'Livrables', 'page'],
    ['groups', 'Contacts', ''],
    ['history', 'Versions', 'versions'],
  ];
  return (
    <aside className="co-dossier-nav">
      <Link href="/applications">
        <Icon>arrow_back</Icon>Toutes les candidatures
      </Link>
      <p>Nimbus Robotics</p>
      {items.map(([icon, label, path]) => (
        <Link
          className={active === label ? 'active' : ''}
          href={path ? `/applications/nimbus/${path}` : '/applications/nimbus'}
          key={label}
        >
          <Icon>{icon}</Icon>
          {label}
        </Link>
      ))}
    </aside>
  );
}

function DossierShell({
  active,
  children,
  state,
}: {
  active: string;
  children: ReactNode;
  state?: ReactNode;
}) {
  return (
    <main className="co-dossier-shell">
      <DossierNav active={active} />
      <section>
        <header className="co-dossier-top">
          <div>
            <i>NR</i>
            <span>
              <small>Nimbus Robotics · Staff Product Engineer</small>
              <strong>
                {active === 'Versions'
                  ? 'Historique de la page privée'
                  : 'Dossier de candidature'}
              </strong>
            </span>
          </div>
          {state ?? <Badge tone="warn">À valider</Badge>}
          <Button>
            <Icon>bolt</Icon>Relancer les agents
          </Button>
        </header>
        {children}
      </section>
    </main>
  );
}

function DossierScreen({ running = false }: { running?: boolean }) {
  if (running) return <AnalysisScreen />;
  return (
    <DossierShell active="Brief">
      <div className="co-dossier-content">
        <section className="co-main-column">
          <div className="co-tabs">
            <button className="active">Vue d’ensemble</button>
            <button>Offre d’origine</button>
            <button>Recherche entreprise</button>
            <button>Livrables</button>
            <button>Runs</button>
          </div>
          <section className="co-panel co-strategy">
            <p>
              Angle retenu <Badge tone="accent">agent stratégie · 14:02</Badge>
            </p>
            <h1>
              L’opérabilité par une petite équipe, pas la performance brute.
            </h1>
            <span>
              Nimbus a levé en juin et recrute quatre personnes sur Fleet
              Platform. On mène avec Corvid : outillage écrit puis transmis, pas
              une prouesse solo.
            </span>
            <footer>6 sources consultées · 3 signaux de recrutement</footer>
          </section>
          <section className="co-panel">
            <div className="co-section-title">
              <h2>Exigences ↔ preuves</h2>
              <Link href="/applications/nimbus/review">Voir les 12</Link>
            </div>
            <ClaimRow
              label="Couvert"
              text="Fiabilité du déploiement à grande échelle"
              source="Exigence critique · 2 preuves vérifiées"
            />
            <ClaimRow
              label="Couvert"
              text="Outillage pour équipes internes"
              source="Exigence critique · 3 preuves vérifiées"
            />
            <ClaimRow
              tone="warn"
              label="Partiel"
              text="Expérience robotique / ROS2"
              source="Secondaire · 1 preuve open source"
            />
            <ClaimRow
              tone="crit"
              label="Gap"
              text="Management d’une équipe de 5+"
              source="Exigence critique · aucune preuve"
            />
          </section>
        </section>
        <aside className="co-stack">
          <section className="co-panel">
            <h2>Publication bloquée</h2>
            <p>1 affirmation sans preuve · 3 modifications à trancher.</p>
            <Link className="co-button" href="/applications/nimbus/review">
              Ouvrir la revue
            </Link>
          </section>
          <section className="co-panel">
            <h2>
              Livrables <Badge>5</Badge>
            </h2>
            <ul className="co-checklist">
              <li>
                <Icon>web</Icon>Page privée v4 · 4 sections
              </li>
              <li>
                <Icon>description</Icon>CV adapté · 1 page
              </li>
              <li>
                <Icon>mail</Icon>Email de candidature
              </li>
              <li>
                <Icon>forum</Icon>Message LinkedIn
              </li>
            </ul>
          </section>
          <section className="co-panel">
            <h2>
              Avant envoi <Badge tone="warn">3 / 5</Badge>
            </h2>
            <ul className="co-checklist">
              <li className="done">Offre confirmée</li>
              <li className="done">Entreprise documentée</li>
              <li className="done">CV adapté relu</li>
              <li>Trancher 3 modifications</li>
              <li>Créer le lien privé</li>
            </ul>
          </section>
        </aside>
      </div>
    </DossierShell>
  );
}

function AnalysisScreen() {
  return (
    <AppShell path="/applications">
      <PageHeader
        eyebrow="Fathom · Berlin / remote · importée il y a 48 s"
        title="Platform Engineer"
        actions={
          <>
            <Badge tone="accent">Analyse en cours</Badge>
            <Button quiet>Voir l’offre d’origine</Button>
            <Button danger>Annuler le run</Button>
          </>
        }
      />
      <div className="co-analysis-v2">
        <section className="co-stack">
          <section className="co-panel co-run-progress">
            <header>
              <h2>Progression du run</h2>
              <code>≈ 50 s restantes</code>
            </header>
            <progress max="100" value="42" />
            <ol>
              {[
                ['check_circle', 'Offre récupérée et nettoyée', '1 648 mots'],
                ['check_circle', '14 exigences identifiées', '5 critiques'],
                ['autorenew', 'Recherche entreprise', '4 sources lues'],
                ['radio_button_unchecked', 'Appariement des preuves', ''],
                ['radio_button_unchecked', 'Rédaction des livrables', ''],
                ['radio_button_unchecked', 'Vérification factuelle', ''],
              ].map(([icon, title, meta], index) => (
                <li
                  className={index < 2 ? 'done' : index === 2 ? 'active' : ''}
                  key={title}
                >
                  <Icon>{icon}</Icon>
                  <span>{title}</span>
                  <small>{meta}</small>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <div className="co-section-title">
              <h2>Déjà lisible</h2>
              <small>confirmé pendant que ça tourne</small>
            </div>
            <div className="co-readable-grid">
              <article className="co-panel">
                <h3>Exigences critiques</h3>
                <ul>
                  <li>Kubernetes multi-cluster</li>
                  <li>Observabilité end-to-end</li>
                  <li>Réduction du coût cloud</li>
                  <li>Astreinte partagée</li>
                  <li>Go ou Rust en production</li>
                </ul>
              </article>
              <article className="co-panel">
                <h3>À confirmer par vous</h3>
                <dl>
                  <div>
                    <dt>Fourchette 90–110 k€ détectée</dt>
                    <dd>Garder</dd>
                  </div>
                  <div>
                    <dt>Contrat CDI plein temps</dt>
                    <dd>Garder</dd>
                  </div>
                  <div>
                    <dt>Remote 100 % ambigu</dt>
                    <dd>Préciser</dd>
                  </div>
                </dl>
              </article>
            </div>
          </section>
          <div className="co-note">
            <Icon>tune</Icon>Vous pouvez déjà faire le tri en amont : les agents
            en tiendront compte à l’étape de rédaction.
            <Button quiet>Cadrer</Button>
          </div>
        </section>
        <aside className="co-stack co-analysis-aside">
          <section className="co-panel">
            <h2>Ce que l’agent a trouvé</h2>
            <ul className="co-checklist">
              <li className="done">Série A de 18 M€ en mars 2026</li>
              <li className="done">Équipe technique de 23 personnes</li>
              <li className="done">
                Blog d’ingénierie : migration Go en cours
              </li>
              <li className="done">Recherche des signaux de recrutement…</li>
            </ul>
          </section>
          <section className="co-panel co-fit-score">
            <span>Prédiction d’adéquation</span>
            <strong>0,79</strong>
            <small>estimation provisoire</small>
            <p>
              Basée sur les exigences seules. L’appariement des preuves n’a pas
              encore tourné.
            </p>
          </section>
          <section className="co-dark-callout">
            <Icon>notifications_active</Icon>
            <strong>Vous prévenir</strong>
            <span>
              Une notification quand la revue est prête à être tranchée.
            </span>
            <label>
              <input defaultChecked type="checkbox" /> Email + notification
              navigateur
            </label>
          </section>
          <Button quiet>Ouvrir une autre candidature</Button>
          <small className="co-centered">
            Le run continue en arrière-plan.
          </small>
        </aside>
      </div>
    </AppShell>
  );
}

function ReviewScreen() {
  return (
    <DossierShell
      active="Exigences ↔ preuves"
      state={<Badge tone="warn">En attente de l’humain</Badge>}
    >
      <div className="co-review-layout">
        <aside className="co-run-steps">
          <h2>Run 8f2c</h2>
          {[
            ['Lecture de l’offre', '7 s'],
            ['Recherche entreprise', '18 s'],
            ['Appariement des preuves', '15 s'],
            ['Composition des livrables', '31 s'],
            ['Revue factuelle', '22 s'],
            ['Revue confidentialité', '9 s'],
          ].map(([label, time], i) => (
            <div key={label}>
              <Icon>{i === 4 ? 'gpp_maybe' : 'check_circle'}</Icon>
              <span>
                <strong>{label}</strong>
                <small>
                  {i === 4 ? '3 problèmes · 1 bloquant' : 'étape enregistrée'}
                </small>
              </span>
              <b>{time}</b>
            </div>
          ))}
          <dl>
            <div>
              <dt>Durée totale</dt>
              <dd>1 m 42 s</dd>
            </div>
            <div>
              <dt>Coût</dt>
              <dd>0,18 €</dd>
            </div>
          </dl>
        </aside>
        <section className="co-review">
          <header>
            <div>
              <p>Revue avant publication</p>
              <h1>3 modifications proposées</h1>
              <span>1 bloque la publication</span>
            </div>
            <Button quiet>Tout refuser</Button>
            <Button>Accepter les 2 sûres</Button>
          </header>
          <article className="blocking">
            <Badge tone="crit">Bloquant</Badge>
            <h2>Chiffre non soutenu par la preuve</h2>
            <small>page privée · Ouverture · claim #12</small>
            <div className="co-diff">
              <section>
                <p>Version actuelle</p>
                <strong>
                  J’ai réduit de 42 % le temps de build sur un monorepo de 340
                  services.
                </strong>
              </section>
              <section>
                <p>Proposition sourcée</p>
                <strong>
                  J’ai ramené le temps de build de 11 à 7 minutes (p50) sur un
                  monorepo de 340 services.
                </strong>
              </section>
            </div>
            <div className="co-proof">
              <Icon>description</Icon>
              <span>
                corvid_postmortem.md · §4
                <small>« build p50 : 11m → 7m » · importé le 12/03/2024</small>
              </span>
              <Button quiet>Inspecter</Button>
            </div>
            <footer>
              <Button quiet>Refuser</Button>
              <Button quiet>Éditer</Button>
              <Button>Accepter</Button>
            </footer>
          </article>
          <ClaimRow
            tone="warn"
            label="Reformulation"
            text="« passionné par la robotique » → « trois ans sur des systèmes temps réel embarqués »."
            action="Accepter"
          />
          <ClaimRow
            tone="crit"
            label="Sans source"
            text="« Divisé les coûts d’infrastructure par deux » — retirer ou rattacher un document."
            action="Rattacher"
          />
          <div className="co-sticky-gate">
            <Icon>lock</Icon>
            <span>
              <strong>La publication reste bloquée</strong>
              <small>
                Career OS ne crée aucun lien avant votre validation explicite.
              </small>
            </span>
            <Button>Valider et créer le lien</Button>
          </div>
        </section>
      </div>
    </DossierShell>
  );
}

function ImportScreen() {
  return (
    <AppShell path="/memory/import">
      <PageHeader
        eyebrow="Mise en place · 3 étapes sur 4"
        title="Constituer votre mémoire"
        copy="Tout ce que vous déposez devient une preuve datée, rattachable à une affirmation."
        actions={
          <Button>
            Continuer <Icon>arrow_forward</Icon>
          </Button>
        }
      />
      <div className="co-import-grid">
        <section className="co-stack">
          <div className="co-upload">
            <Icon>upload_file</Icon>
            <h2>Déposez CV, post-mortems, reviews, specs</h2>
            <p>PDF, DOCX, Markdown, images · 25 Mo par fichier</p>
            <Button>Parcourir</Button>
            <Button quiet>Coller une URL</Button>
          </div>
          <section className="co-panel">
            <div className="co-section-title">
              <h2>En cours de traitement</h2>
              <Badge tone="accent">4 fichiers · 2 terminés</Badge>
            </div>
            {[
              [
                'autorenew',
                'corvid_postmortem.md',
                'extraction · 6 affirmations trouvées',
              ],
              [
                'check',
                'cv_2024.pdf',
                '6 expériences · 14 affirmations · 2 dates à confirmer',
              ],
              [
                'check',
                'review_q2.pdf',
                '4 affirmations · marquées confidentiel',
              ],
              [
                'content_copy',
                'notes_migration.md',
                '3 affirmations en doublon',
              ],
            ].map(([icon, file, meta]) => (
              <div className="co-file-row" key={file}>
                <Icon>{icon}</Icon>
                <span>
                  <strong>{file}</strong>
                  <small>{meta}</small>
                </span>
                {file === 'cv_2024.pdf' ? <Button quiet>Relire</Button> : null}
              </div>
            ))}
            <div className="co-note">
              <Icon>insights</Icon>24 affirmations extraites, dont 18 avec un
              chiffre. Les 6 autres seront marquées « déclaré » jusqu’à ce
              qu’une preuve les couvre.
            </div>
          </section>
        </section>
        <aside className="co-stack">
          <section className="co-panel">
            <h2>Connecteurs</h2>
            {[
              ['badge', 'LinkedIn', 'Lié'],
              ['code', 'GitHub', 'Lié'],
              ['drive_folder_upload', 'Google Drive', 'Lier'],
              ['rss_feed', 'Blog / articles', 'Lier'],
            ].map(([icon, label, state]) => (
              <div className="co-connector" key={label}>
                <Icon>{icon}</Icon>
                <span>{label}</span>
                <button>{state}</button>
              </div>
            ))}
          </section>
          <section className="co-panel">
            <h2>Règles d’extraction</h2>
            <label className="co-toggle">
              <input defaultChecked type="checkbox" />
              Exiger une date par preuve
            </label>
            <label className="co-toggle">
              <input defaultChecked type="checkbox" />
              Signaler les chiffres sans source
            </label>
            <label className="co-toggle">
              <input type="checkbox" />
              Anonymiser les noms de clients
            </label>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}

function PageEditorScreen() {
  return (
    <DossierShell
      active="Livrables"
      state={<Badge tone="warn">Brouillon v4 · non publiée</Badge>}
    >
      <div className="co-editor">
        <aside className="co-section-list">
          <h2>
            Sections <button>+</button>
          </h2>
          {[
            ['01', 'Ouverture', '2 affirmations', 'warn'],
            ['02', 'Pourquoi Nimbus', '3 affirmations', 'ok'],
            ['03', 'Preuves détaillées', '6 affirmations', 'crit'],
            ['04', '30/60/90 jours', '1 affirmation', 'ok'],
          ].map(([n, l, m, t]) => (
            <button className={n === '01' ? 'active' : ''} key={n}>
              <Icon>drag_indicator</Icon>
              <span>
                <strong>
                  {n} · {l}
                </strong>
                <small>{m}</small>
              </span>
              <Badge tone={t as Tone}>{t === 'ok' ? '' : '!'}</Badge>
            </button>
          ))}
          <dl>
            <div>
              <dt>Affirmations</dt>
              <dd>12</dd>
            </div>
            <div>
              <dt>Sourcées</dt>
              <dd>11</dd>
            </div>
            <div>
              <dt>Temps de lecture</dt>
              <dd>3 min</dd>
            </div>
          </dl>
        </aside>
        <article className="co-page-document">
          <p>Pour Nimbus Robotics · équipe Fleet Platform</p>
          <h1>
            Faire tenir une flotte de 12 000 robots sur une plateforme opérable
            par trois personnes.
          </h1>
          <p>
            Votre annonce insiste sur la fiabilité du déploiement à grande
            échelle et sur une équipe volontairement petite. C’est le problème
            que j’ai porté chez Corvid pendant trois ans.
          </p>
          <p>
            J’ai{' '}
            <mark>
              réduit de 42 % le temps de build sur un monorepo de 340 services
            </mark>
            , et ramené le déploiement d’un cycle hebdomadaire à quatre fois par
            jour.
          </p>
          <div className="co-inline-warning">
            <Icon>gpp_maybe</Icon>
            <span>Le chiffre dépasse la preuve rattachée.</span>
            <Button>Corriger</Button>
          </div>
          <p>
            Le point commun avec Fleet Platform : la contrainte n’était pas la
            technique mais la charge cognitive des équipes clientes. J’ai écrit
            l’outillage, formé l’équipe SRE, puis je l’ai retiré de mes mains.
          </p>
          <Button quiet>
            <Icon>add</Icon>Ajouter un paragraphe
          </Button>
        </article>
        <aside className="co-proof-inspector">
          <p>Affirmation sélectionnée</p>
          <h2>« réduit de 42 % le temps de build »</h2>
          <Badge tone="warn">confiance 0,41</Badge>
          <div className="co-proof">
            <Icon>description</Icon>
            <span>
              corvid_postmortem.md · §4
              <small>« build p50 : 11 min → 7 min, sur 7 mois »</small>
            </span>
          </div>
          <h3>Actions</h3>
          <button>Remplacer par « 11 → 7 min »</button>
          <button>Rattacher une autre preuve</button>
          <button>Retirer la phrase</button>
          <label className="co-toggle">
            <input defaultChecked type="checkbox" />
            Autoriser l’inspection des preuves
          </label>
        </aside>
      </div>
    </DossierShell>
  );
}

function LinksScreen() {
  return (
    <AppShell
      path="/links"
      aside={
        <section className="co-stack">
          <h2>Journal d’accès</h2>
          {[
            ['visibility', 'Page ouverte · 3 min', 'aujourd’hui 09:12'],
            [
              'description',
              'Preuve inspectée · build p50',
              'aujourd’hui 09:14',
            ],
            ['download', 'CV téléchargé', 'aujourd’hui 09:15'],
            ['share', 'Lien ouvert depuis une 2ᵉ IP', 'hier 17:40'],
            ['send', 'Lien créé', '2 sept. 14:20'],
          ].map(([icon, label, time]) => (
            <div className="co-activity" key={label}>
              <Icon>{icon}</Icon>
              <span>
                <strong>{label}</strong>
                <small>{time}</small>
              </span>
            </div>
          ))}
          <h3>Réglages du lien</h3>
          <label className="co-toggle">
            <input defaultChecked type="checkbox" />
            Inspection des preuves
          </label>
          <label className="co-toggle">
            <input defaultChecked type="checkbox" />
            Téléchargement du CV
          </label>
          <label className="co-toggle">
            <input type="checkbox" />
            Mot de passe à l’ouverture
          </label>
          <Button>Copier le lien</Button>
          <Button danger>Révoquer ce lien</Button>
        </section>
      }
    >
      <PageHeader
        title="Liens privés"
        copy="Un lien par entreprise, révocable, avec journal d’accès. Aucune page n’est indexable."
        actions={
          <Button>
            <Icon>add_link</Icon>Nouveau lien
          </Button>
        }
      />
      <div className="co-stats">
        <Stat icon="link" value="4" label="Liens actifs" />
        <Stat icon="visibility" value="17" label="Ouvertures totales" />
        <Stat icon="description" value="31" label="Preuves inspectées" />
        <Stat
          icon="visibility_off"
          value="2"
          label="Jamais ouverts"
          tone="muted"
        />
      </div>
      <DataTable
        headers={['Destinataire', 'Ouvertures', 'Preuves', 'Expiration', '']}
        rows={[
          [
            <Company
              key="nimbus"
              name="Nimbus Robotics"
              initials="NR"
              sub="/p/8f2c-nimbus"
            />,
            '4',
            '12',
            '12 oct.',
            <Button key="revoke" danger>
              Révoquer
            </Button>,
          ],
          [
            <Company
              key="atlas"
              name="Atlas Health"
              initials="AH"
              sub="/p/1a77-atlas"
            />,
            '9',
            '14',
            '28 sept.',
            <Button key="revoke" danger>
              Révoquer
            </Button>,
          ],
          [
            <Company
              key="lumen"
              name="Lumen"
              initials="LU"
              sub="/p/4d10-lumen"
            />,
            '0',
            '—',
            'dans 2 j',
            <Button key="extend" quiet>
              Prolonger
            </Button>,
          ],
          [
            <Company
              key="vantage"
              name="Vantage Labs"
              initials="VL"
              sub="/p/9b31-vantage"
            />,
            '4',
            '5',
            'sans limite',
            <Button key="revoke" danger>
              Révoquer
            </Button>,
          ],
        ]}
      />
      <div className="co-note">
        <Icon>policy</Icon>Révoquer coupe l’accès immédiatement, y compris pour
        un onglet déjà ouvert. Les captures déjà faites échappent au système.
      </div>
    </AppShell>
  );
}

function Company({
  name,
  initials,
  sub,
}: {
  name: string;
  initials: string;
  sub: string;
}) {
  return (
    <span className="co-company">
      <i>{initials}</i>
      <span>
        <strong>{name}</strong>
        <small>{sub}</small>
      </span>
    </span>
  );
}
function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="co-table">
      <div className="co-table-head">
        {headers.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      {rows.map((row, i) => (
        <div className="co-table-row" key={i}>
          {row.map((cell, j) => (
            <span key={j}>{cell}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

function InsightsScreen() {
  return (
    <AppShell path="/insights">
      <PageHeader
        title="Insights"
        copy="14 candidatures sur 90 jours. Ce qui marche, ce qui bloque, ce qui manque en preuves."
        actions={
          <Button quiet>
            <Icon>download</Icon>Exporter
          </Button>
        }
      />
      <div className="co-stats">
        <Stat
          icon="trending_up"
          value="38 %"
          label="Taux de réponse · +12 pts"
        />
        <Stat icon="schedule" value="6 jours" label="Délai médian de réponse" />
        <Stat icon="timer" value="22 min" label="Temps par candidature" />
        <Stat icon="rule" value="74 %" label="Corrections acceptées" />
      </div>
      <div className="co-insights-grid">
        <section className="co-panel">
          <h2>Entonnoir</h2>
          {[
            ['Envoyées', '14', '100%'],
            ['Page ouverte', '9', '64%'],
            ['Preuve inspectée', '7', '50%'],
            ['Réponse humaine', '5', '38%'],
            ['Entretien', '3', '22%'],
          ].map(([l, v, p]) => (
            <div className="co-funnel" key={l}>
              <span>{l}</span>
              <div>
                <i style={{ width: p }} />
              </div>
              <strong>{v}</strong>
              <small>{p}</small>
            </div>
          ))}
          <div className="co-note">
            <Icon>insights</Icon>Quand une preuve est inspectée, la réponse
            arrive dans 71 % des cas.
          </div>
        </section>
        <section className="co-panel">
          <h2>
            Couverture des preuves <Badge tone="ok">92 %</Badge>
          </h2>
          <div className="co-bars">
            {[42, 56, 49, 70, 62, 84].map((n, i) => (
              <i key={i} style={{ height: `${n}%` }} />
            ))}
          </div>
          <ClaimRow tone="crit" label="0 preuve" text="Management d’équipe" />
          <ClaimRow
            tone="warn"
            label="1 preuve"
            text="Impact business chiffré"
          />
          <ClaimRow label="11 preuves" text="Fiabilité / infra" />
        </section>
      </div>
      <section className="co-panel">
        <h2>Affirmations les plus inspectées</h2>
        <DataTable
          headers={['Affirmation', 'Inspections', 'Réponse ensuite', 'Niveau']}
          rows={[
            [
              'Temps de build 11 → 7 min sur 340 services',
              '9',
              '78 %',
              <Badge key="verified" tone="ok">
                Vérifié
              </Badge>,
            ],
            [
              'Pont ROS2 en production chez 4 entreprises',
              '7',
              '62 %',
              <Badge key="verified" tone="ok">
                Vérifié
              </Badge>,
            ],
            [
              'Formation de l’équipe SRE à l’outillage',
              '4',
              '41 %',
              <Badge key="declared" tone="warn">
                Déclaré
              </Badge>,
            ],
          ]}
        />
      </section>
    </AppShell>
  );
}

function InterviewMemoryScreen() {
  return (
    <main className="co-focus-shell">
      <header>
        <Link href="/memory">
          <Icon>close</Icon>
        </Link>
        <span>
          <strong>Entretien guidé</strong>
          <small>Corvid · 2021-2024</small>
        </span>
        <div>
          <b>4 / 7</b>
          <span>≈ 4 min restantes</span>
        </div>
      </header>
      <div className="co-progress">
        <i style={{ width: '57%' }} />
      </div>
      <section className="co-interview">
        <p>Question 4</p>
        <h1>
          À quel moment as-tu compris que l’outillage pouvait quitter tes mains
          ?
        </h1>
        <span>
          Je cherche une preuve de transmission, pas seulement de construction.
        </span>
        <div className="co-chat">
          <article>
            <i>CO</i>
            <p>
              Qui utilisait le système au quotidien après ton départ du projet ?
            </p>
          </article>
          <article className="answer">
            <i>MA</i>
            <p>
              L’équipe SRE. J’avais écrit le runbook, fait deux sessions de
              formation et supprimé mes propres accès d’administration après un
              mois de transition.
            </p>
          </article>
        </div>
        <label>
          <span>Votre réponse</span>
          <textarea
            rows={4}
            placeholder="Décrivez le contexte, votre action et ce qui a changé…"
          />
        </label>
        <footer>
          <Button quiet>Passer</Button>
          <Button>
            Continuer <Icon>arrow_forward</Icon>
          </Button>
        </footer>
      </section>
      <aside className="co-focus-aside">
        <h2>Ce que l’entretien a déjà trouvé</h2>
        <ClaimRow
          tone="warn"
          label="Déclaré"
          text="Deux sessions de formation avec l’équipe SRE."
        />
        <ClaimRow
          tone="warn"
          label="À sourcer"
          text="Suppression des accès admin après un mois de transition."
        />
        <div className="co-note">
          <Icon>lock</Icon>Vos réponses restent privées. Elles entrent en
          mémoire comme « déclaré » tant qu’aucun document ne les couvre.
        </div>
      </aside>
    </main>
  );
}

function InterviewPrepScreen({ debrief = false }: { debrief?: boolean }) {
  if (debrief) return <DebriefScreen />;
  return (
    <AppShell path="/interviews/demo">
      <PageHeader
        eyebrow="Vantage Labs · 8 sept. 14:00"
        title="Préparer l’entretien technique"
        copy="60 minutes · visio · Research Engineer"
        actions={<Button>Commencer le mode entretien</Button>}
      />
      <div className="co-two-col">
        <section className="co-stack">
          <section className="co-panel co-brief-card">
            <p>Angle de l’entretien</p>
            <h2>
              Montrer que la rigueur expérimentale reste utile quand le système
              doit servir de vrais utilisateurs.
            </h2>
            <span>
              Ne pas surjouer la recherche pure. Revenir aux choix vérifiables,
              aux limites connues et aux boucles de feedback.
            </span>
          </section>
          <section className="co-panel">
            <h2>Questions probables</h2>
            {[
              [
                '01',
                'Comment évalues-tu un système non déterministe ?',
                '839 générations · 13 modèles · 5 providers',
              ],
              [
                '02',
                'Raconte un désaccord technique important.',
                'Architecture du MCP · contraintes de production',
              ],
              [
                '03',
                'Comment choisis-tu ce qui ne doit pas être automatisé ?',
                'Gates humains · permissions par preuve',
              ],
            ].map(([n, q, p]) => (
              <article className="co-question" key={n}>
                <i>{n}</i>
                <span>
                  <strong>{q}</strong>
                  <small>{p}</small>
                </span>
                <Button quiet>Préparer</Button>
              </article>
            ))}
          </section>
        </section>
        <aside className="co-stack">
          <section className="co-panel">
            <h2>Interlocuteurs</h2>
            <Company
              initials="SC"
              name="Sarah Chen"
              sub="Hiring manager · Research"
            />
            <Company
              initials="JP"
              name="Jonas Petit"
              sub="Staff Research Engineer"
            />
          </section>
          <section className="co-panel">
            <h2>Preuves à garder ouvertes</h2>
            <ul className="co-checklist">
              <li>Évaluation LLM · 839 générations</li>
              <li>MCP · 36,7 k appels</li>
              <li>Post-mortem Corvid</li>
            </ul>
          </section>
          <section className="co-panel">
            <h2>Questions à leur poser</h2>
            <p>
              Comment les résultats de recherche passent-ils en production ?
            </p>
            <p>Qui décide qu’une évaluation est assez bonne ?</p>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}

function AssetsScreen() {
  return (
    <AppShell
      path="/assets"
      sidebarContext={
        <>
          <p className="co-nav-label">Types</p>
          <div className="co-sidebar-sources">
            {[
              ['picture_as_pdf', 'CV', '4'],
              ['web', 'Gabarits de page', '3'],
              ['short_text', 'Blocs de texte', '11'],
              ['mail', 'Emails types', '5'],
              ['folder_zip', 'Portfolio', '2'],
            ].map(([icon, label, count]) => (
              <Link href="/assets" key={label}>
                <Icon>{icon}</Icon>
                <span>{label}</span>
                <b>{count}</b>
              </Link>
            ))}
          </div>
        </>
      }
      sidebarFooter={
        <div className="co-sidebar-card">
          <strong>Règle d’or</strong>
          <span>
            Un asset ne contient jamais d’affirmation non sourcée. Les gabarits
            refusent de se générer sinon.
          </span>
        </div>
      }
    >
      <PageHeader
        title="Assets"
        copy="Ce qui se réutilise. Chaque asset garde le lien vers les preuves qu’il cite."
        actions={
          <>
            <Button quiet>
              <Icon>upload</Icon>Importer
            </Button>
            <Button>
              <Icon>add</Icon>Nouvel asset
            </Button>
          </>
        }
      />
      <div className="co-assets-layout">
        <section className="co-assets-main">
          <div className="co-assets-toolbar">
            <div className="co-segment">
              <button className="active">CV</button>
              <button>Gabarits</button>
              <button>Blocs</button>
              <button>Emails</button>
            </div>
            <span>Trié par utilisation</span>
          </div>
          <div className="co-cv-assets">
            {[
              [
                'CV — infra / plateforme',
                'v7 · utilisé 9 fois · 14 affirmations sourcées',
                'base',
              ],
              [
                'CV — recherche',
                'v3 · utilisé 2 fois · publications en tête',
                '',
              ],
              [
                'CV — Nimbus',
                'Cite une affirmation en attente d’arbitrage.',
                'warning',
              ],
            ].map(([title, meta, state]) => (
              <article
                className={state === 'warning' ? 'warning' : ''}
                key={title}
              >
                <div className="co-cv-preview">
                  <i />
                  <i />
                  <hr />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <section>
                  <header>
                    <h2>{title}</h2>
                    {state === 'base' ? (
                      <Badge tone="ok">base</Badge>
                    ) : state === 'warning' ? (
                      <Icon>gpp_maybe</Icon>
                    ) : null}
                  </header>
                  <p>{meta}</p>
                  <footer>
                    <Button>
                      {state === 'warning' ? 'Corriger' : 'Ouvrir'}
                    </Button>
                    {state !== 'warning' ? (
                      <Button quiet>Dupliquer</Button>
                    ) : null}
                  </footer>
                </section>
              </article>
            ))}
          </div>
          <div className="co-section-title">
            <h2>Blocs de texte les plus réutilisés</h2>
            <Link href="/assets">Tout voir</Link>
          </div>
          <div className="co-reusable-copy">
            {[
              [
                'verified',
                'Migration monorepo · version courte',
                '« Build ramené de 11 à 7 minutes sur 340 services, déploiement 4×/jour. »',
                '7 usages',
              ],
              [
                'verified',
                'Open source ROS2',
                '« Mainteneur d’un pont utilisé en production par quatre entreprises. »',
                '5 usages',
              ],
              [
                'rule',
                'Gap management · formulation assumée',
                '« Tech lead de trois personnes, sans lien hiérarchique. »',
                '4 usages',
              ],
            ].map(([icon, title, text, uses]) => (
              <article key={title}>
                <Icon>{icon}</Icon>
                <span>
                  <strong>{title}</strong>
                  <small>{text}</small>
                </span>
                <code>{uses}</code>
                <Icon>content_copy</Icon>
              </article>
            ))}
          </div>
        </section>
        <aside className="co-assets-side">
          <h2>CV — infra / plateforme</h2>
          <section>
            <h3>Versions</h3>
            <ol>
              <li className="active">
                <strong>v7 · actuelle</strong>
                <span>Chiffre de build corrigé en minutes · aujourd’hui</span>
              </li>
              <li>
                <strong>v6</strong>
                <span>Ajout du pont ROS2 · 28 août</span>
              </li>
              <li>
                <strong>v5</strong>
                <span>Retrait d’une affirmation sans preuve · 12 août</span>
              </li>
            </ol>
            <Link href="/applications/nimbus/versions">
              Comparer deux versions
            </Link>
          </section>
          <section>
            <h3>Preuves citées · 14</h3>
            {[
              ['description', 'corvid_postmortem.md', '4'],
              ['picture_as_pdf', 'cv_2024.pdf', '6'],
              ['code', 'oss/ros2-bridge', '2'],
              ['badge', 'linkedin', '2'],
            ].map(([icon, name, count]) => (
              <p key={name}>
                <Icon>{icon}</Icon>
                <code>{name}</code>
                <span>{count}</span>
              </p>
            ))}
          </section>
          <footer>
            <Button>Exporter en PDF</Button>
            <Button quiet>Définir comme CV de base</Button>
          </footer>
        </aside>
      </div>
    </AppShell>
  );
}

function SettingsNav({ active }: { active: string }) {
  return (
    <aside className="co-settings-nav">
      <Link href="/">
        <Icon>arrow_back</Icon>Retour à l’app
      </Link>
      <p>Réglages</p>
      {[
        ['person', 'Profil', '/settings/profile'],
        ['memory', 'Modèles & agents', '/settings/models'],
        ['shield', 'Confidentialité', '/settings/privacy'],
        ['hub', 'Intégrations', '/settings/integrations'],
        ['payments', 'Abonnement', '/settings/billing'],
        ['import_export', 'Export & suppression', '/settings/data'],
      ].map(([i, l, h]) => (
        <Link className={active === l ? 'active' : ''} href={h} key={l}>
          <Icon>{i}</Icon>
          {l}
        </Link>
      ))}
    </aside>
  );
}
function SettingsShell({
  active,
  children,
  side,
}: {
  active: string;
  children: ReactNode;
  side?: ReactNode;
}) {
  return (
    <main className="co-settings-shell">
      <SettingsNav active={active} />
      <section>
        <header>
          <Link className="co-brand" href="/">
            <span>
              <i />
            </span>
            <strong>Career OS</strong>
          </Link>
          <span className="co-avatar">MA</span>
        </header>
        <div className="co-settings-content">{children}</div>
      </section>
      {side ? <aside className="co-settings-side">{side}</aside> : null}
    </main>
  );
}

function ModelsScreen() {
  return (
    <SettingsShell active="Modèles & agents">
      <PageHeader
        title="Modèles & agents"
        copy="Choisissez où chaque tâche s’exécute. Le contenu envoyé à un modèle est toujours visible avant activation."
      />
      <section className="co-panel">
        <h2>Routage actuel</h2>
        {[
          ['Lecture et extraction', 'Local', 'llama-3.3-70b', 'ok'],
          ['Recherche entreprise', 'Cloud', 'Claude Sonnet', 'accent'],
          ['Stratégie', 'Cloud', 'Claude Sonnet', 'accent'],
          ['Composition', 'Local', 'llama-3.3-70b', 'ok'],
          ['Revue factuelle', 'Local', 'règles déterministes', 'ok'],
        ].map(([task, where, model, tone]) => (
          <div className="co-model-row" key={task}>
            <Icon>{where === 'Local' ? 'dns' : 'cloud'}</Icon>
            <span>
              <strong>{task}</strong>
              <small>{model}</small>
            </span>
            <Badge tone={tone as Tone}>{where}</Badge>
            <Button quiet>Configurer</Button>
          </div>
        ))}
      </section>
      <div className="co-two-col">
        <section className="co-panel">
          <h2>Instance</h2>
          <dl>
            <div>
              <dt>Base de données</dt>
              <dd>
                <Badge tone="ok">Opérationnelle</Badge>
              </dd>
            </div>
            <div>
              <dt>Workers</dt>
              <dd>3 / 3 actifs</dd>
            </div>
            <div>
              <dt>Sauvegarde</dt>
              <dd>aujourd’hui 03:00</dd>
            </div>
          </dl>
        </section>
        <section className="co-panel">
          <h2>Limites de dépense</h2>
          <label className="co-toggle">
            <input defaultChecked type="checkbox" />
            Basculer en local au plafond
          </label>
          <label>
            Plafond mensuel
            <input defaultValue="15,00 €" />
          </label>
        </section>
      </div>
    </SettingsShell>
  );
}

function ConflictsScreen() {
  return (
    <AppShell path="/memory/conflicts">
      <PageHeader
        eyebrow="Mémoire pro"
        title="Conflits entre sources"
        copy="Deux informations incompatibles ne sont jamais fusionnées automatiquement."
      />
      <div className="co-conflicts">
        <article>
          <header>
            <Badge tone="warn">Conflit #1</Badge>
            <h2>Taille de l’équipe encadrée : 6 ou 9 personnes ?</h2>
          </header>
          <div className="co-diff">
            <section>
              <p>CV · 12 mars 2024</p>
              <strong>Tech lead d’une équipe de 6 ingénieurs.</strong>
              <Badge tone="ok">Source datée</Badge>
            </section>
            <section>
              <p>LinkedIn · synchronisé hier</p>
              <strong>Led a team of 9 engineers.</strong>
              <Badge tone="warn">Profil public</Badge>
            </section>
          </div>
          <p className="co-note">
            Choisissez la formulation qui décrit exactement votre
            responsabilité. La source écartée reste conservée.
          </p>
          <footer>
            <Button>Retenir 6</Button>
            <Button quiet>Retenir 9</Button>
            <Button quiet>Écrire une autre formulation</Button>
          </footer>
        </article>
        <article>
          <header>
            <Badge tone="warn">Conflit #2</Badge>
            <h2>Durée du projet de migration</h2>
          </header>
          <div className="co-diff">
            <section>
              <p>Post-mortem</p>
              <strong>7 mois</strong>
            </section>
            <section>
              <p>CV</p>
              <strong>9 mois</strong>
            </section>
          </div>
          <footer>
            <Button>Ouvrir les deux sources</Button>
          </footer>
        </article>
      </div>
    </AppShell>
  );
}

function PrivacyScreen() {
  return (
    <SettingsShell active="Confidentialité">
      <PageHeader
        title="Confidentialité des preuves"
        copy="Définissez ce que les agents peuvent lire et ce qu’un recruteur peut inspecter."
      />
      <section className="co-panel">
        <h2>Règles par défaut</h2>
        <div className="co-policy-grid">
          <article>
            <Icon>lock</Icon>
            <h3>Privé</h3>
            <p>
              Utilisable pour vous conseiller, jamais exposé dans un livrable.
            </p>
          </article>
          <article>
            <Icon>visibility</Icon>
            <h3>Inspectable</h3>
            <p>Un extrait daté peut être ouvert depuis une page privée.</p>
          </article>
          <article>
            <Icon>public</Icon>
            <h3>Public</h3>
            <p>Peut être lié intégralement, comme un dépôt open source.</p>
          </article>
        </div>
      </section>
      <section className="co-panel">
        <h2>Preuves sensibles</h2>
        <DataTable
          headers={['Preuve', 'Sensibilité', 'Usages autorisés', '']}
          rows={[
            [
              <Company
                key="postmortem"
                initials="PM"
                name="Post-mortem Corvid"
                sub="document interne"
              />,
              <Badge key="internal" tone="warn">
                Interne
              </Badge>,
              'Conseil · appariement',
              <Button key="edit" quiet>
                Modifier
              </Button>,
            ],
            [
              <Company
                key="review-q2"
                initials="RQ"
                name="Review Q2"
                sub="contient des noms clients"
              />,
              <Badge key="confidential" tone="crit">
                Confidentiel
              </Badge>,
              'Conseil uniquement',
              <Button key="edit" quiet>
                Modifier
              </Button>,
            ],
            [
              <Company
                key="ros2"
                initials="GH"
                name="Pont ROS2"
                sub="dépôt GitHub public"
              />,
              <Badge key="public" tone="ok">
                Public
              </Badge>,
              'Tous',
              <Button key="edit" quiet>
                Modifier
              </Button>,
            ],
          ]}
        />
      </section>
      <div className="co-note">
        <Icon>shield</Icon>Un changement de permission n’altère jamais
        rétroactivement un livrable publié : Career OS demande une nouvelle
        validation.
      </div>
    </SettingsShell>
  );
}

function PublishedScreen() {
  return (
    <AppShell path="/applications">
      <div className="co-publish-topline">
        <span>Candidatures</span>
        <Icon>chevron_right</Icon>
        <strong>Nimbus Robotics</strong>
        <Badge tone="ok">Publié à 14:22</Badge>
      </div>
      <section className="co-publish-success">
        <header>
          <span>
            <Icon>check_circle</Icon>
          </span>
          <div>
            <h1>Votre page privée est en ligne pour Nimbus Robotics.</h1>
            <p>
              Douze affirmations, toutes sourcées. Le lien n’est accessible
              qu’aux personnes à qui vous l’envoyez, et vous pouvez le couper à
              tout instant.
            </p>
          </div>
        </header>
        <div className="co-publish-grid">
          <article className="co-panel">
            <p>Lien privé</p>
            <div className="co-link-copy">
              <Icon>lock</Icon>
              <code>career-os.app/p/8f2c-nimbus</code>
              <Button>Copier</Button>
            </div>
            <dl>
              <div>
                <dt>Expire le 12 oct.</dt>
                <dd>
                  <Icon>schedule</Icon>
                </dd>
              </div>
              <div>
                <dt>Preuves inspectables</dt>
                <dd>
                  <Icon>verified</Icon>
                </dd>
              </div>
            </dl>
            <footer>
              <Link className="co-button" href="/messages">
                Envoyer l’email préparé
              </Link>
              <Button quiet>Message LinkedIn</Button>
            </footer>
          </article>
          <article className="co-panel co-shipped-assets">
            <p>Ce qui part</p>
            <ul>
              <li>
                <Icon>web</Icon>Page privée · 4 sections <b>12 preuves</b>
              </li>
              <li>
                <Icon>description</Icon>CV adapté · 1 page <b>téléchargeable</b>
              </li>
              <li>
                <Icon>fact_check</Icon>Extraits de preuves <b>6 sur 12</b>
              </li>
              <li>
                <Icon>lock</Icon>review_q2.pdf <b className="crit">exclu</b>
              </li>
            </ul>
            <small>
              Les documents « interne » n’ont pas été utilisés, même en
              reformulation.
            </small>
          </article>
        </div>
        <div className="co-publish-memory">
          <Icon>verified</Icon>
          <span>
            <strong>Deux affirmations ont été renforcées au passage</strong>« 11
            → 7 minutes » et « équipe de 3 » sont désormais sourcées dans votre
            mémoire : elles serviront à toutes vos prochaines candidatures.
          </span>
          <Link href="/memory">Voir la mémoire</Link>
        </div>
        <footer>
          <Button>Marquer comme envoyée</Button>
          <Button quiet>Programmer une relance à J+8</Button>
          <Link href="/applications">Retour aux candidatures</Link>
        </footer>
      </section>
    </AppShell>
  );
}

function DebriefScreen() {
  return (
    <AppShell path="/interviews/demo/debrief">
      <PageHeader
        eyebrow="Vantage Labs · entretien terminé hier"
        title="Débrief d’entretien"
        copy="Transformez ce qui s’est passé en mémoire utile, sans réécrire l’histoire."
        actions={<Button>Enregistrer le débrief</Button>}
      />
      <div className="co-two-col">
        <section className="co-stack">
          <section className="co-panel">
            <h2>Ce qui s’est passé</h2>
            {[
              [
                'Question la plus difficile',
                'Comment mesurer la valeur d’un eval offline ?',
              ],
              [
                'Signal positif',
                'Discussion détaillée sur le compromis vitesse / rigueur.',
              ],
              ['À améliorer', 'Réponse trop longue sur l’architecture du MCP.'],
              ['Prochaine étape', 'Tour système avec deux Staff Engineers.'],
            ].map(([l, v]) => (
              <label className="co-field" key={l}>
                <span>{l}</span>
                <textarea defaultValue={v} />
              </label>
            ))}
          </section>
          <section className="co-panel">
            <h2>Questions posées</h2>
            <ClaimRow
              tone="warn"
              label="À creuser"
              text="Comment suivez-vous les coûts de modèles par fonctionnalité ?"
            />
            <ClaimRow
              tone="ok"
              label="Bien répondu"
              text="Quand un agent ne doit-il pas agir seul ?"
            />
          </section>
        </section>
        <aside className="co-stack">
          <section className="co-panel">
            <h2>Nouvelles affirmations · 2</h2>
            <ClaimRow
              tone="warn"
              label="Déclaré"
              text="Participation aux entretiens techniques de recrutement."
            />
            <ClaimRow
              tone="warn"
              label="Déclaré"
              text="Astreinte 1 semaine sur 4 sur la plateforme."
            />
          </section>
          <section className="co-panel">
            <h2>Trou identifié</h2>
            <ClaimRow
              tone="crit"
              label="1"
              text="Impact coût cloud — demandé dans 3 entretiens sur 4, jamais chiffré."
              action="Voir les occurrences"
            />
          </section>
          <section className="co-panel">
            <h2>Email de remerciement</h2>
            <p>Brouillon prêt une fois le chiffre exact retrouvé.</p>
            <Button quiet>Relire le brouillon</Button>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}

function VersionsScreen() {
  return (
    <DossierShell
      active="Versions"
      state={<Badge tone="ok">v4 · publiée</Badge>}
    >
      <div className="co-versions">
        <aside>
          {[
            ['v4', 'Vous', 'actuelle'],
            ['v3', 'Agent rédaction', '14:03'],
            ['v2', 'Vous', '13:58'],
            ['v1', 'Run 8f2c', '14:02'],
          ].map(([v, by, time], i) => (
            <button className={i === 0 ? 'active' : ''} key={v}>
              <strong>{v}</strong>
              <span>{by}</span>
              <small>{time}</small>
            </button>
          ))}
        </aside>
        <section>
          <PageHeader
            eyebrow="Comparaison v3 → v4"
            title="3 modifications · 1 section ajoutée"
            actions={
              <>
                <Button quiet>Restaurer v3</Button>
                <Button quiet>Exporter le diff</Button>
              </>
            }
          />
          <div className="co-diff-summary">
            <Badge tone="ok">+ 1 section</Badge>
            <Badge tone="warn">2 phrases</Badge>
            <Badge tone="crit">− 1 affirmation</Badge>
            <span>11 → 12 sourcées</span>
          </div>
          <article className="co-version-change">
            <p>Section « Ouverture » · affirmation #12 modifiée par vous</p>
            <div className="co-diff">
              <section>
                <p>v3 · Agent</p>
                <strong>
                  J’ai réduit de 42 % le temps de build sur un monorepo de 340
                  services.
                </strong>
              </section>
              <section>
                <p>v4 · Vous</p>
                <strong>
                  J’ai ramené le temps de build de 11 à 7 minutes (p50) sur un
                  monorepo de 340 services.
                </strong>
              </section>
            </div>
          </article>
          <article className="co-version-change">
            <p>
              Nouvelle section « 30/60/90 jours » proposée par l’agent, acceptée
            </p>
            <ol>
              <li>J+30 · Cartographier les points de rupture.</li>
              <li>J+60 · Livrer un pipeline de release unifié.</li>
              <li>J+90 · Transférer l’exploitation à l’équipe.</li>
            </ol>
          </article>
          <div className="co-note">
            <Icon>history</Icon>Restaurer une version ne supprime rien : les
            affirmations et leurs preuves restent dans votre mémoire.
          </div>
        </section>
      </div>
    </DossierShell>
  );
}

function RunsScreen() {
  return (
    <AppShell path="/runs">
      <PageHeader
        title="Runs d’agents"
        copy="3 incidents à traiter. Aucun n’a modifié votre mémoire."
        actions={<Button>Tout reprendre</Button>}
      />
      <div className="co-errors">
        <article>
          <Icon>cloud_off</Icon>
          <div>
            <Badge tone="crit">Run interrompu</Badge>
            <h2>Le modèle distant ne répond pas</h2>
            <p>Fathom · étape rédaction · 14:47</p>
            <span>
              L’API distante a renvoyé une erreur de quota. Les trois premières
              étapes sont enregistrées et intactes.
            </span>
            <div className="co-note">
              <Icon>swap_horiz</Icon>Basculer la rédaction sur votre modèle
              local — plus lent, gratuit, sans sortie de données.
            </div>
            <footer>
              <Button>Reprendre en local</Button>
              <Button quiet>Réessayer l’API</Button>
            </footer>
          </div>
        </article>
        <article>
          <Icon>link_off</Icon>
          <div>
            <Badge tone="warn">Import bloqué</Badge>
            <h2>Offre inaccessible derrière une authentification</h2>
            <p>jobs.keel.io · 403</p>
            <span>Collez le texte de l’annonce à la place.</span>
            <footer>
              <Button>Coller le texte</Button>
              <Button quiet>Importer un PDF</Button>
            </footer>
          </div>
        </article>
        <article>
          <Icon>image_not_supported</Icon>
          <div>
            <Badge tone="warn">Document illisible</Badge>
            <h2>CV scanné : texte non extractible</h2>
            <p>cv_2019_scan.pdf</p>
            <span>
              L’OCR local peut le traiter, mais les dates devront être
              confirmées.
            </span>
            <footer>
              <Button>Lancer l’OCR</Button>
              <Button quiet>Saisir manuellement</Button>
            </footer>
          </div>
        </article>
      </div>
      <section className="co-panel">
        <h2>Runs récents</h2>
        <DataTable
          headers={['Run', 'État', 'Durée', 'Coût', '']}
          rows={[
            [
              <Company
                key="fathom"
                initials="FT"
                name="Fathom · Platform Engineer"
                sub="run c31a"
              />,
              <Badge key="failed" tone="crit">
                Échec
              </Badge>,
              '0 m 51 s',
              '0,04 €',
              <Button key="resume">Reprendre</Button>,
            ],
            [
              <Company
                key="nimbus"
                initials="NR"
                name="Nimbus · Staff Product Engineer"
                sub="run 8f2c"
              />,
              <Badge key="done" tone="ok">
                Terminé
              </Badge>,
              '1 m 42 s',
              '0,18 €',
              <Button key="open" quiet>
                Ouvrir
              </Button>,
            ],
          ]}
        />
      </section>
    </AppShell>
  );
}

function CompanyScreen() {
  return (
    <DossierShell active="Entreprise">
      <div className="co-dossier-content">
        <section className="co-main-column">
          <PageHeader
            eyebrow="Nimbus Robotics"
            title="Dossier entreprise"
            copy="Robotique logistique · Paris, Berlin · 68 personnes · fondée en 2021"
            actions={<Button quiet>Rafraîchir la recherche</Button>}
          />
          <section className="co-panel co-company-summary">
            <p>En une phrase reformulable</p>
            <h2>
              Nimbus déploie des flottes de robots chez des logisticiens tiers ;
              leur difficulté n’est plus la robotique mais l’exploitation
              logicielle à grande échelle avec une équipe réduite.
            </h2>
          </section>
          <section className="co-panel">
            <h2>Signaux datés et sourcés</h2>
            <ClaimRow
              label="Vérifié"
              text="Série B de 40 M€ en juin 2026"
              source="Communiqué officiel + presse spécialisée · 2 sources concordantes"
            />
            <ClaimRow
              label="Vérifié"
              text="4 postes ouverts sur Fleet Platform"
              source="Page carrières · relevé aujourd’hui"
            />
            <ClaimRow
              tone="accent"
              label="3 sources"
              text="Stack : Go, Kubernetes, ROS2"
              source="Offres + dépôts publics + talk du CTO"
            />
            <ClaimRow
              tone="warn"
              label="Hypothèse"
              text="L’équipe Fleet serait de 3 personnes"
              source="Déduit d’un post LinkedIn, à vérifier en entretien"
            />
          </section>
        </section>
        <aside className="co-stack">
          <section className="co-panel">
            <h2>14 sources lues</h2>
            <p>6 retenues, 8 écartées comme non fiables ou périmées.</p>
          </section>
          <section className="co-panel">
            <h2>Ce qu’ils disent publiquement</h2>
            <blockquote>
              « Nous voulons rester une petite équipe très outillée. »
              <small>CTO · podcast août 2026</small>
            </blockquote>
            <blockquote>
              « La fiabilité du déploiement est notre principal risque. »
              <small>blog ingénierie</small>
            </blockquote>
          </section>
          <section className="co-panel">
            <h2>Points de vigilance</h2>
            <p>
              <Icon>warning</Icon>Deux départs de l’équipe plateforme en six
              mois.
            </p>
            <p>
              <Icon>warning</Icon>Aucune information publique sur les
              rémunérations.
            </p>
          </section>
          <div className="co-note">
            <Icon>shield</Icon>Sources publiques seules. Aucun scraping de
            profils privés.
          </div>
        </aside>
      </div>
    </DossierShell>
  );
}

function MessagesScreen() {
  return (
    <main className="co-messages">
      <aside>
        <Link className="co-brand" href="/">
          <span>
            <i />
          </span>
          <strong>Career OS</strong>
        </Link>
        <h1>Messages</h1>
        <p>4 brouillons · 2 relances dues</p>
        {[
          [
            'NR',
            'Nimbus Robotics',
            'Candidature · Staff Product Engineer',
            'prêt',
          ],
          ['AH', 'Atlas Health', 'Relance après candidature', 'J+8'],
          ['HE', 'Helix', 'Remerciement après entretien', 'attente'],
          ['LU', 'Lumen', 'Relance · jamais ouvert', ''],
        ].map(([i, c, s, t]) => (
          <button className={i === 'NR' ? 'active' : ''} key={i}>
            <i>{i}</i>
            <span>
              <strong>{c}</strong>
              <small>{s}</small>
            </span>
            <Badge tone={t === 'prêt' ? 'ok' : 'warn'}>{t}</Badge>
          </button>
        ))}
        <div className="co-note">
          <Icon>lock</Icon>Aucun envoi automatique. Vous copiez, vous envoyez.
        </div>
      </aside>
      <section>
        <header>
          <Link href="/">
            <Icon>arrow_back</Icon>
          </Link>
          <div>
            <h1 className="co-mobile-title">Messages</h1>
            <strong>Candidature — Staff Product Engineer</strong>
            <small>Email · à Camille Lefort</small>
          </div>
          <Button quiet>LinkedIn</Button>
        </header>
        <div className="co-email-fields">
          <label>
            À<input defaultValue="camille@nimbus.ai" />
          </label>
          <label>
            Objet
            <input defaultValue="Staff Product Engineer — Fleet Platform (Marc Aubry)" />
          </label>
        </div>
        <article className="co-email">
          <p>Bonjour Camille,</p>
          <p>
            Votre annonce parle d’une flotte qui grandit vite et d’une équipe
            qui doit rester petite. C’est exactement le problème que j’ai traité
            chez Corvid : temps de build ramené de{' '}
            <mark>11 à 7 minutes sur 340 services</mark>, puis passation
            complète de l’outillage à l’équipe SRE.
          </p>
          <p>
            J’ai préparé une page qui détaille les trois points de votre annonce
            que je peux documenter, avec les sources à l’appui :
          </p>
          <Link href="/p/8f2c-nimbus">
            career-os.app/p/8f2c-nimbus · lien privé
          </Link>
          <p>
            Je ne prétends pas au volet management hiérarchique : j’ai été tech
            lead de trois personnes, sans autorité formelle. Le reste, je peux
            le prouver.
          </p>
          <p>
            Bien à vous,
            <br />
            Marc
          </p>
        </article>
        <footer>
          <span>148 mots · 1 lien · 1 chiffre sourcé</span>
          <Button quiet>Copier le texte</Button>
          <Button>Ouvrir dans mon client mail</Button>
        </footer>
      </section>
      <aside>
        <h2>Contrôle</h2>
        <ul className="co-checklist">
          <li className="done">Tous les faits sont sourcés</li>
          <li className="done">« 11 à 7 minutes »</li>
          <li className="done">« 340 services »</li>
          <li className="done">« tech lead de trois personnes »</li>
        </ul>
        <section className="co-panel">
          <h3>Relance suggérée</h3>
          <p>Dans 8 jours si aucune réponse. Rien ne partira sans vous.</p>
          <label className="co-toggle">
            <input defaultChecked type="checkbox" />
            Me le rappeler
          </label>
        </section>
      </aside>
    </main>
  );
}

function SkillsScreen() {
  return (
    <AppShell path="/memory/skills">
      <PageHeader
        title="Compétences"
        copy="Chaque compétence est un paquet de preuves. Sans preuve, elle n’apparaît pas dans vos candidatures."
        actions={<Button quiet>Combler un trou</Button>}
      />
      <div className="co-stats">
        <Stat
          icon="verified"
          value="17"
          label="Compétences prouvées"
          tone="ok"
        />
        <Stat
          icon="edit_note"
          value="6"
          label="Déclarées sans preuve"
          tone="warn"
        />
        <Stat
          icon="priority_high"
          value="3"
          label="Demandées, absentes"
          tone="crit"
        />
        <Stat icon="inventory_2" value="28" label="Preuves inutilisées" />
      </div>
      <section className="co-panel">
        <div className="co-section-title">
          <h2>Vos points forts documentés</h2>
          <small>preuves vérifiées · déclarées · demande du marché</small>
        </div>
        {[
          ['Fiabilité de déploiement', '11 preuves', 'Fort', 'ok'],
          ['Outillage développeur', '8 preuves', 'Fort', 'ok'],
          ['Kubernetes / infra', '6 preuves · 1 périmée', 'À jour ?', 'warn'],
          ['Open source / ROS2', '4 preuves', 'Rare', 'accent'],
          ['Impact business chiffré', '1 preuve', 'Trou', 'crit'],
          ['Management hiérarchique', 'aucune preuve', 'Trou', 'crit'],
        ].map(([skill, count, state, tone]) => (
          <div className="co-skill-row" key={skill}>
            <span>
              <strong>{skill}</strong>
              <small>{count}</small>
            </span>
            <div>
              <i
                style={{
                  width:
                    count === 'aucune preuve'
                      ? '2%'
                      : `${Math.max(12, parseInt(count) * 8)}%`,
                }}
              />
            </div>
            <Badge tone={tone as Tone}>{state}</Badge>
            <Button quiet>Voir</Button>
          </div>
        ))}
      </section>
      <div className="co-two-col">
        <section className="co-panel co-callout">
          <Icon>priority_high</Icon>
          <strong>Trou le plus coûteux</strong>
          <p>
            Impact business chiffré est demandé dans 11 des 14 offres visées, et
            vous n’avez qu’une preuve.
          </p>
          <Button>Chercher le document</Button>
        </section>
        <section className="co-panel co-callout">
          <Icon>auto_awesome</Icon>
          <strong>Atout sous-exploité</strong>
          <p>
            Votre travail open source ROS2 n’apparaît que dans 2 candidatures
            sur 14.
          </p>
          <Button quiet>Voir où l’ajouter</Button>
        </section>
      </div>
    </AppShell>
  );
}

function HostingScreen() {
  return (
    <main className="co-hosting">
      <header>
        <Link className="co-brand" href="/">
          <span>
            <i />
          </span>
          <strong>Career OS</strong>
        </Link>
        <span>1 / 3</span>
      </header>
      <PageHeader
        eyebrow="Où vos preuves doivent-elles vivre ?"
        title="Choisissez votre mode d’hébergement"
        copy="Vous pouvez changer d’avis plus tard : l’export est complet dans les deux cas."
      />
      <div className="co-hosting-options">
        <article className="recommended">
          <div>
            <Icon>cloud</Icon>
            <Badge tone="accent">Recommandé</Badge>
          </div>
          <h2>SaaS hébergé</h2>
          <p>Prêt en deux minutes · 12 €/mois</p>
          <ul className="co-checklist">
            <li className="done">Rien à installer, mises à jour incluses</li>
            <li className="done">Modèles inclus, pas de clé API</li>
            <li className="done">Données hébergées en UE</li>
          </ul>
          <div className="co-note">
            <Icon>info</Icon>Vos extraits de preuves transitent par nos serveurs
            pour être traités.
          </div>
          <Button>Commencer avec le SaaS</Button>
        </article>
        <article>
          <div>
            <Icon>dns</Icon>
            <Badge>AGPL-3.0</Badge>
          </div>
          <h2>Auto-hébergé</h2>
          <p>Docker compose · gratuit</p>
          <ul className="co-checklist">
            <li className="done">Vos documents restent sur votre machine</li>
            <li className="done">Modèles locaux possibles</li>
            <li className="done">Code auditable, agents modifiables</li>
          </ul>
          <pre>git clone careeros/careeros{`\n`}docker compose up -d</pre>
          <Button quiet>Guide d’installation</Button>
        </article>
      </div>
      <div className="co-note">
        <Icon>import_export</Icon>Le format d’export est identique : Markdown et
        JSON, lisibles sans Career OS. Migrer prend une commande.
      </div>
    </main>
  );
}

function InboxScreen() {
  return (
    <AppShell
      path="/inbox"
      aside={
        <section className="co-stack">
          <h2>Règles de notification</h2>
          {[
            'Un run demande un arbitrage',
            'Une page privée est ouverte',
            'Un run échoue',
            'Une preuve devient périmée',
            'Un lien approche de son expiration',
          ].map((x, i) => (
            <label className="co-toggle" key={x}>
              <input defaultChecked={i < 3} type="checkbox" />
              {x}
            </label>
          ))}
          <div className="co-note">
            <Icon>shield</Icon>Les emails ne contiennent jamais le texte des
            preuves.
          </div>
        </section>
      }
    >
      <PageHeader
        title="À trancher"
        copy="4 décisions bloquent une publication ou une candidature."
        actions={<Button quiet>Tout marquer comme lu</Button>}
      />
      <div className="co-inbox-list">
        {[
          [
            'gpp_maybe',
            'Nimbus Robotics',
            '3 modifications à trancher',
            'Un chiffre dépasse la preuve · run 8f2c terminé il y a 2 min',
            'Ouvrir la revue',
            'crit',
          ],
          [
            'cloud_off',
            'Fathom',
            'Run interrompu',
            'Quota API dépassé. Reprise possible sur modèle local.',
            'Reprendre',
            'warn',
          ],
          [
            'schedule_send',
            'Atlas Health',
            'Relance prévue aujourd’hui',
            'Envoyée il y a 8 jours, page ouverte 4 fois.',
            'Relire le brouillon',
            'accent',
          ],
          [
            'edit_note',
            'Helix',
            'Débrief d’entretien à écrire',
            'Deux questions restées sans preuve.',
            'Débriefer',
            'accent',
          ],
        ].map(([icon, company, title, copy, action, tone]) => (
          <article key={company}>
            <span className={tone}>
              <Icon>{icon}</Icon>
            </span>
            <div>
              <small>{company}</small>
              <h2>{title}</h2>
              <p>{copy}</p>
            </div>
            <Button>{action}</Button>
          </article>
        ))}
      </div>
      <section className="co-panel">
        <h2>Activité récente</h2>
        {[
          [
            'visibility',
            'Camille Lefort a ouvert votre page privée et consulté 3 preuves',
            '09:12',
          ],
          ['download', 'CV adapté téléchargé — Nimbus Robotics', '09:15'],
          [
            'share',
            'Lien Atlas Health ouvert depuis une deuxième adresse IP',
            'hier 17:40',
          ],
          ['upload_file', 'review_q2.pdf indexé — 4 affirmations', 'lundi'],
          ['sync', 'GitHub resynchronisé — aucune nouvelle preuve', 'lundi'],
        ].map(([icon, label, time]) => (
          <div className="co-activity" key={label}>
            <Icon>{icon}</Icon>
            <span>{label}</span>
            <small>{time}</small>
          </div>
        ))}
      </section>
    </AppShell>
  );
}

function BillingScreen() {
  return (
    <SettingsShell
      active="Abonnement"
      side={
        <section className="co-stack">
          <div className="co-panel">
            <h2>Migrer vers l’auto-hébergé</h2>
            <p>Export complet, puis résiliation. Aucune donnée retenue.</p>
            <Button quiet>Guide de migration</Button>
          </div>
          <div className="co-note">
            <Icon>code</Icon>Toujours gratuit en self-host. L’abonnement paie
            l’hébergement et les modèles, pas les fonctionnalités.
          </div>
        </section>
      }
    >
      <PageHeader
        title="Abonnement"
        copy="Facturation à l’usage des modèles, plafonnée. Vous ne payez pas ce que vous n’utilisez pas."
      />
      <section className="co-plan">
        <p>Formule actuelle</p>
        <h2>Pro · 12 €/mois</h2>
        <span>
          Candidatures illimitées · modèles inclus jusqu’à 15 € d’usage ·
          renouvellement le 1ᵉʳ oct.
        </span>
        <div>
          <Button quiet>Changer de formule</Button>
          <Button danger>Résilier</Button>
        </div>
      </section>
      <div className="co-stats">
        <Stat
          icon="payments"
          value="2,74 € / 15 €"
          label="Usage de modèles ce mois"
        />
        <Stat icon="work_history" value="14" label="Candidatures traitées" />
        <Stat icon="dns" value="62 %" label="Part traitée en local" tone="ok" />
      </div>
      <section className="co-panel">
        <h2>Historique de facturation</h2>
        <DataTable
          headers={['Période', 'Détail', 'Montant', 'État', '']}
          rows={[
            [
              'Août 2026',
              'Pro + 3,10 € d’usage',
              '15,10 €',
              <Badge key="paid" tone="ok">
                Payé
              </Badge>,
              'Facture',
            ],
            [
              'Juillet 2026',
              'Pro + 1,80 € d’usage',
              '13,80 €',
              <Badge key="paid" tone="ok">
                Payé
              </Badge>,
              'Facture',
            ],
            [
              'Juin 2026',
              'Pro, aucun usage',
              '12,00 €',
              <Badge key="paid" tone="ok">
                Payé
              </Badge>,
              'Facture',
            ],
          ]}
        />
      </section>
      <section className="co-panel">
        <h2>Plafond d’usage</h2>
        <p>
          Au-delà de 15 €, les runs basculent automatiquement sur les modèles
          locaux.
        </p>
        <label className="co-toggle">
          <input defaultChecked type="checkbox" />
          Ne jamais dépasser
        </label>
      </section>
    </SettingsShell>
  );
}

function IntegrationsScreen() {
  return (
    <SettingsShell active="Intégrations">
      <PageHeader
        title="Intégrations & API"
        copy="Connecteurs de sources, jetons d’accès et webhooks. Tout ce qui sort est journalisé."
        actions={<Button quiet>Documentation API</Button>}
      />
      <section className="co-panel">
        <h2>Sources connectées</h2>
        {[
          ['badge', 'LinkedIn', 'sync quotidien · 18 preuves', 'Actif'],
          ['code', 'GitHub', '2 dépôts · 8 preuves', 'Actif'],
          [
            'cloud_off',
            'Google Drive',
            'jeton expiré · 4 preuves figées',
            'Reconnecter',
          ],
        ].map(([icon, title, meta, state]) => (
          <div className="co-model-row" key={title}>
            <Icon>{icon}</Icon>
            <span>
              <strong>{title}</strong>
              <small>{meta}</small>
            </span>
            <Badge tone={state === 'Actif' ? 'ok' : 'warn'}>{state}</Badge>
          </div>
        ))}
        <Button quiet>
          <Icon>add</Icon>Notion, Drive, flux RSS…
        </Button>
      </section>
      <section className="co-panel">
        <h2>Jetons d’API</h2>
        <DataTable
          headers={['Nom', 'Portée', 'Dernier usage', 'Expire', '']}
          rows={[
            [
              'Script d’import CV',
              <code key="scope">memory:write</code>,
              'il y a 2 j',
              'jamais',
              <Button key="revoke" danger>
                Révoquer
              </Button>,
            ],
            [
              'Dashboard perso',
              <code key="scope">applications:read</code>,
              'aujourd’hui',
              '31 déc.',
              <Button key="revoke" danger>
                Révoquer
              </Button>,
            ],
          ]}
        />
        <Button>Créer un jeton</Button>
      </section>
      <section className="co-code-example">
        <header>
          <span>Exemple · créer une candidature</span>
          <Badge tone="ok">202 Accepted</Badge>
        </header>
        <pre>{`curl -X POST https://api.careeros.app/v1/applications \\\n  -H "Authorization: Bearer $COS_TOKEN" \\\n  -d '{"job_url":"https://nimbus.ai/careers/staff-pe"}'`}</pre>
      </section>
      <div className="co-note">
        <Icon>block</Icon>Aucune portée ne permet de publier un lien privé : la
        publication reste une action humaine dans l’interface.
      </div>
    </SettingsShell>
  );
}

function DataScreen() {
  return (
    <SettingsShell active="Export & suppression">
      <PageHeader
        title="Export & suppression"
        copy="Vos données vous appartiennent, dans un format lisible sans Career OS."
      />
      <section className="co-export-card">
        <div>
          <Icon>download</Icon>
          <span>
            <h2>Exporter tout</h2>
            <p>≈ 18 Mo · Markdown + JSON</p>
          </span>
        </div>
        <div className="co-export-checks">
          {[
            'Mémoire · 128 affirmations',
            'Documents sources · 24',
            'Candidatures · 14',
            'Runs et journaux d’agents',
          ].map((x) => (
            <label key={x}>
              <input defaultChecked type="checkbox" />
              {x}
            </label>
          ))}
        </div>
        <pre>{`careeros-export-2026-09-03/\n├── memory/claims.json\n├── memory/claims.md\n├── sources/corvid_postmortem.md\n├── applications/nimbus-robotics/\n│   ├── page.md\n│   └── runs/8f2c.json\n└── README.md`}</pre>
        <Button>Générer l’archive</Button>
      </section>
      <section className="co-delete-card">
        <header>
          <Icon>delete_forever</Icon>
          <div>
            <h2>Supprimer mon compte</h2>
            <p>
              Efface la mémoire, les candidatures, les runs et les liens privés.
            </p>
          </div>
        </header>
        <ul>
          <li>128 affirmations, 24 documents</li>
          <li>14 candidatures et leurs versions</li>
          <li>4 liens privés actifs</li>
          <li>2 jetons d’API</li>
        </ul>
        <label>
          Tapez SUPPRIMER pour confirmer
          <input placeholder="SUPPRIMER" />
        </label>
        <Button danger>Supprimer définitivement</Button>
        <p>
          Aucun délai de grâce, aucune corbeille. Exportez d’abord si vous
          voulez garder une copie.
        </p>
      </section>
    </SettingsShell>
  );
}

function KitNotFound() {
  return (
    <main className="co-not-found">
      <Icon>search_off</Icon>
      <h1>Écran non documenté</h1>
      <p>Cette route ne fait pas partie des 33 écrans du kit validé.</p>
      <Link className="co-button" href="/">
        Retour à l’accueil
      </Link>
    </main>
  );
}

export function KitRoutePage({ path, query }: { path: string; query: Query }) {
  if (path === '/memory') return <MemoryScreen />;
  if (path === '/applications') return <ApplicationsScreen />;
  if (/^\/applications\/[^/]+$/.test(path))
    return <DossierScreen running={query.state === 'running'} />;
  if (/^\/applications\/[^/]+\/review$/.test(path)) return <ReviewScreen />;
  if (path === '/memory/import') return <ImportScreen />;
  if (/^\/applications\/[^/]+\/page$/.test(path)) return <PageEditorScreen />;
  if (path === '/links') return <LinksScreen />;
  if (path === '/insights') return <InsightsScreen />;
  if (path === '/memory/interview') return <InterviewMemoryScreen />;
  if (/^\/interviews\/[^/]+$/.test(path)) return <InterviewPrepScreen />;
  if (/^\/interviews\/[^/]+\/debrief$/.test(path))
    return <InterviewPrepScreen debrief />;
  if (path === '/assets') return <AssetsScreen />;
  if (path === '/settings/models') return <ModelsScreen />;
  if (path === '/memory/conflicts') return <ConflictsScreen />;
  if (path === '/settings/privacy') return <PrivacyScreen />;
  if (/^\/applications\/[^/]+\/published$/.test(path))
    return <PublishedScreen />;
  if (/^\/applications\/[^/]+\/versions$/.test(path)) return <VersionsScreen />;
  if (path === '/runs') return <RunsScreen />;
  if (/^\/applications\/[^/]+\/company$/.test(path)) return <CompanyScreen />;
  if (path === '/messages') return <MessagesScreen />;
  if (path === '/memory/skills') return <SkillsScreen />;
  if (path === '/onboarding/hosting') return <HostingScreen />;
  if (path === '/inbox') return <InboxScreen />;
  if (path === '/settings/billing') return <BillingScreen />;
  if (path === '/settings/integrations') return <IntegrationsScreen />;
  if (path === '/settings/data') return <DataScreen />;
  return <KitNotFound />;
}
