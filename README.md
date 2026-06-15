# Nexora Pulse — SEO Operations Platform for WordPress

[![License: GPL v2+](https://img.shields.io/badge/License-GPLv2%2B-blue.svg)](https://www.gnu.org/licenses/gpl-2.0.html)

The official source repository for **Nexora Pulse**, a free SEO Operations
Platform for WordPress by [Auralogics Labs](https://auralogicslabs.com).

This repository contains the **full, human-readable source** of the plugin —
including the React/TypeScript admin interface in `frontend/`. It exists so that
anyone (including WordPress.org reviewers) can read and reproduce every line that
ships in the distributed plugin. Nothing is obfuscated.

> The plugin is distributed to users through the
> [WordPress.org plugin directory](https://wordpress.org/plugins/). This repo is
> the development source of truth.

---

## What it does

Nexora Pulse helps website owners understand search visibility, improve
indexing, analyze technical SEO, strengthen internal linking, and uncover
optimization opportunities — in one dashboard.

- **SEO Analyzer** — scores every page for on-page issues
- **Index Doctor** — real Google Search Console indexing verdicts
- **Neural Links** — internal link graph with orphan-page detection
- **Core Web Vitals** — real-user LCP, INP, CLS from PageSpeed
- **Originality Engine** — duplicate / near-duplicate content detection
- **Migration & Compatibility Center** — coexists safely with Yoast, Rank Math,
  AIOSEO, SEOPress (never produces duplicate meta tags)
- Image SEO, Redirects, XML sitemap, robots.txt, schema output

---

## Repository layout

```
nexora-pulse/
├── nexora-pulse.php        # Plugin bootstrap + header
├── readme.txt              # WordPress.org listing (not this file)
├── uninstall.php           # Cleanup on delete
├── app/                    # PHP source (PSR-4, namespace NexoraPulse\)
│   ├── Admin/              # wp-admin page + menu
│   ├── Core/               # Plugin bootstrap, scheduler
│   ├── Database/           # Table migrations
│   ├── Modules/            # SEO engines (analyzer, links, schema, …)
│   ├── Rest/               # REST API controllers
│   └── Services/           # Settings, compatibility, logging
├── frontend/               # React + TypeScript admin UI (source)
├── assets/dist/            # Compiled UI bundle (committed, runnable)
├── build-zip.ps1           # Produces the WordPress.org distribution zip
└── BUILD.md                # How to reproduce assets/dist from source
```

## Building from source

The admin UI is compiled with Vite. See [BUILD.md](BUILD.md) for the exact
steps. In short:

```bash
npm install
npm run build       # frontend/ → assets/dist/nexora-pulse.js
```

## Branching & releases

- `main` — stable, released code. Each release is tagged (`v1.0.0`, `v1.0.1`, …).
- `dev` — ongoing development. Feature work merges here, then to `main` at release.

Release tags on `main` correspond 1:1 with the versions published to
WordPress.org.

## License

Nexora Pulse is free software, licensed under the **GPL v2 or later**. See
[LICENSE](LICENSE).

© Auralogics Labs · [auralogicslabs.com](https://auralogicslabs.com)
