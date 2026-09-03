# systemd worker pool

The seven workers are separate processes and Linux users. Each process receives
one PostgreSQL credential; only the four generative workers also receive the
loopback model configuration.

Install the repository at `/opt/career-os`, then copy the unit files:

```bash
sudo install -m 0644 deploy/systemd/career-os-worker@.service /etc/systemd/system/
sudo install -m 0644 deploy/systemd/career-os-workers.target /etc/systemd/system/
```

Create the `career-os` group and these system users:

```text
career-company-researcher
career-evidence-archivist
career-recruiter-strategist
career-page-composer
career-recruiter-reviewer
career-hiring-manager-reviewer
career-factuality-reviewer
```

Create one root-owned `0600` file per worker under
`/etc/career-os/workers/<worker>.env`. Every file contains only its matching
database URL:

| File                          | Database variable                                | Model variables |
| ----------------------------- | ------------------------------------------------ | --------------- |
| `company-researcher.env`      | `CAREER_OS_WORKER_DATABASE_URL`                  | yes             |
| `evidence-archivist.env`      | `CAREER_OS_EVIDENCE_WORKER_DATABASE_URL`         | no              |
| `recruiter-strategist.env`    | `CAREER_OS_STRATEGY_WORKER_DATABASE_URL`         | yes             |
| `page-composer.env`           | `CAREER_OS_PAGE_COMPOSER_DATABASE_URL`           | no              |
| `recruiter-reviewer.env`      | `CAREER_OS_RECRUITER_REVIEWER_DATABASE_URL`      | yes             |
| `hiring-manager-reviewer.env` | `CAREER_OS_HIRING_MANAGER_REVIEWER_DATABASE_URL` | yes             |
| `factuality-reviewer.env`     | `CAREER_OS_FACTUALITY_REVIEWER_DATABASE_URL`     | no              |

Add the three model variables only where the table says `yes`:

```dotenv
CAREER_OS_WORKER_DATABASE_URL=postgresql://...
CAREER_OS_LOCAL_MODEL_BASE_URL=http://127.0.0.1:11434/v1
CAREER_OS_LOCAL_MODEL_API_KEY=local-only
CAREER_OS_LOCAL_MODEL=...
```

Never put `DATABASE_URL`, `BETTER_AUTH_SECRET` or another worker's URL in these
files.

Start, inspect and stop the complete pool with:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now career-os-workers.target
systemctl status 'career-os-worker@*.service'
sudo systemctl stop career-os-workers.target
```

`SIGTERM` stops polling and lets the current iteration finish. systemd forces a
stuck process down after 135 seconds, beyond the 120-second model timeout.

This pool is for a single-tenant self-hosted instance. The managed multi-tenant
cloud must use a fresh sandbox per run; these permanent services are not that
boundary.
