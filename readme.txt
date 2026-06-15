=== Nexora Pulse – SEO Operations Platform for WordPress ===
Contributors: auralogics
Tags: seo, search console, schema, indexing, internal linking
Requires at least: 6.0
Tested up to: 6.8
Stable tag: 1.0.0
Requires PHP: 8.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Modern SEO toolkit for WordPress with Search Console insights, indexing intelligence, schema, internal linking, and duplicate content detection.

== Description ==

Nexora Pulse is a modern SEO Operations Platform for WordPress that helps website owners understand search visibility, improve indexing, analyze technical SEO issues, strengthen internal linking, and uncover actionable optimization opportunities.

Unlike traditional SEO plugins focused only on settings and scores, Nexora Pulse emphasizes visibility, guidance, and operational workflows — one dashboard to analyze, optimize, and monitor your content's search health, with real Google Search Console insights at its core.

It brings your whole technical SEO workflow together: run a full SEO audit of every page, manage your XML sitemap and robots.txt, output clean schema (structured data) and metadata, strengthen internal linking, and catch duplicate content before it hurts your search visibility.

**SEO Analyzer**
Scans every post and page for on-page SEO issues — titles, descriptions, headings, readability, keyword usage — and scores each page so you know exactly where to focus.

**Neural Links**
Maps the internal link graph of your whole site. Find orphan pages, weak link clusters, and missed internal-linking opportunities at a glance.

**Originality / Duplicate Detection**
Detects duplicate and near-duplicate content across your site before it hurts your rankings.

**Image SEO**
Audits image alt text, file sizes, and naming so your media works for search instead of against it.

**Redirect Manager**
Create and manage 301/302 redirects with a clean interface.

**Google Search Console**
Connect your own Search Console property to see real indexing status, clicks, impressions, CTR, and average position — and power the Index Doctor, which diagnoses why pages aren't indexed.

**Core Web Vitals & Performance**
Connect a free PageSpeed Insights API key to pull real-user LCP, INP, CLS, and TTFB from Chrome field data.

**Index Health**
Track which pages are search-ready and surface the ones that need attention.

**Migration & Compatibility Center**
Already running another SEO plugin? Pulse detects Yoast, Rank Math, All in One SEO, SEOPress, and more, runs in a safe analysis-only mode so it never creates duplicate meta tags, and shows you exactly what it detected and how much of your existing SEO data is ready to migrate.

= Free =
Nexora Pulse is fully free. Every tool above is included — including Google Search Console and Core Web Vitals, which use your own Google account/API key (no cost to you, nothing routed through our servers).

= On the Roadmap =
* AI Assistant — metadata generation, content rewriting, and alt-text suggestions using your own AI provider key
* Google Analytics 4, Indexing API, and Bing Webmaster integrations

Roadmap items appear in the app marked "Coming Soon" and are not yet active.

= Privacy =
* Search Console and PageSpeed connect with your own Google credentials/API key, stored encrypted in your own database.
* No data is sent to our servers, and no external request is made without your explicit action.
* No obfuscated code — full GPL source is available at https://github.com/auralogicslabs/nexora-pulse. The React admin UI is compiled from the `frontend/` directory with `npm run build`; see BUILD.md in the repository for exact steps to reproduce `assets/dist/` from source.
* A proper uninstall.php cleans up all plugin data on deletion.

== Installation ==

1. Upload the plugin folder to /wp-content/plugins/nexora-pulse/.
2. Activate Nexora Pulse through the Plugins menu in WordPress.
3. Open Nexora Pulse from the admin menu and run your first SEO scan.

== Frequently Asked Questions ==

= Is Nexora Pulse free? =
Yes — every feature in this release is free, including Google Search Console and Core Web Vitals.

= Do I need a Google account for Search Console / PageSpeed? =
Yes. You connect your own Google Search Console property and your own free PageSpeed Insights API key. Pulse guides you through the one-time setup in the app. Nothing is sent to our servers — your credentials stay in your own site, encrypted.

= Does it conflict with other SEO plugins? =
No. Pulse is built to coexist with Yoast SEO, Rank Math, All in One SEO, SEOPress, and others. When it detects another SEO plugin, it automatically runs in analysis mode and stops outputting its own title, meta description, canonical, Open Graph, Twitter, and schema tags — so you never get duplicate meta tags. The built-in Migration & Compatibility Center shows you exactly what was detected, what Pulse is and isn't outputting, and confirms there are no duplicate-tag risks. (Redirect rules should still be managed in one plugin to avoid conflicts.)

= I already use Yoast / Rank Math / AIOSEO. Can I still try Pulse? =
Yes — that's exactly what the Compatibility Center is for. Install Pulse alongside your current SEO plugin and you immediately get its diagnostics (Index Doctor, internal link graph, Core Web Vitals, duplicate detection) without touching your existing setup or risking duplicate tags.

= Does it work with Elementor / Gutenberg? =
Yes. Pulse analyzes the rendered content of any builder or block editor.

== Screenshots ==

1. Website SEO Health Overview — the Nexora Pulse dashboard, with the Oxygen Score, issues by severity, and your connected Google data sources at a glance.
2. Actionable SEO Analysis — the SEO Analyzer scores every page and lists clear, fixable issues with explanations.
3. Index Doctor — real Google Search Console indexing verdicts (indexed, crawled-not-indexed, excluded) with systemic patterns detected across pages.
4. Visual Internal Linking Intelligence — the Neural Link graph maps your internal links and surfaces orphan pages and broken links.
5. Google Intelligence & SEO Opportunities — connected Google data sources alongside prioritized, actionable optimization opportunities.
6. Migration & Compatibility Center — detects other SEO plugins and confirms Pulse runs safely with no duplicate meta tags.
7. Integrations — connect Google Search Console and PageSpeed Insights with your own Google account, no data routed through us.
8. Settings — global title and meta description templates, plus general, robots.txt, and data controls.
9. Help & Documentation — built-in, step-by-step setup guides for every integration.

== Changelog ==

= 1.0.0 =
First public release of Nexora Pulse.
* SEO Analyzer, Index Doctor, Neural Links (internal link graph), Originality / duplicate detection, Image SEO, Redirect Manager, XML sitemap, robots.txt editor, and schema output.
* Google Search Console and Core Web Vitals (PageSpeed) integrations using your own Google account / API key — nothing routed through our servers.
* New: Migration & Compatibility Center — detects Yoast SEO, Rank Math, All in One SEO, SEOPress, and others, and automatically runs in analysis-only mode alongside them so Pulse never produces duplicate title, meta description, canonical, Open Graph, Twitter, or schema tags.
* Hardened meta output: a single, deduplicated source of truth for all head tags, with a clear admin notice when another SEO plugin is detected.
* Security: input sanitized on all REST endpoints, JSON-LD output hardened against script-context breakout, encrypted credential storage with masked output.
* Performance: indexed database tables and batched background scanning for large sites.

= 1.0.2 =
* Fix: Connection state (Search Console, PageSpeed) no longer reads as "Not connected" right after connecting on sites with a page cache (LiteSpeed Cache, Cloudflare, WP Super Cache, etc.). Nexora Pulse REST responses are now explicitly marked uncacheable at the proxy, CDN, and browser layers.
* Fix: URL Inspection no longer fails with "You do not own this site" when the entered property differs slightly from the verified one (trailing slash, www, or Domain vs URL-prefix). The exact Google-recognised property URL is now saved on connect.
* Fix: Setup wizard no longer re-appears after returning from the Google OAuth redirect — onboarding completes automatically the moment Search Console connects.
* Fix: Integrations page connection count now reflects only the integrations available today (Search Console + PageSpeed) instead of incorrectly counting roadmap items.
* Improve: "Clear All Data" in the Danger Zone is now a true factory reset — it erases all credentials, OAuth tokens, settings, and connection state (not just scan data) so a fresh setup starts completely clean. Your post titles and meta descriptions are preserved.

= 1.0.1 =
* Fix: GSC sync and PageSpeed errors now return a proper error message instead of an HTML "Bad Gateway" page on nginx-proxied servers (HTTP 502 was being intercepted by the proxy before PHP could respond).
* Fix: REST API client now reads the WordPress-injected API URL at call time instead of at module load time, preventing "not valid JSON" errors on sites where the WP global wasn't ready during script evaluation.
* Fix: Added missing `Migrator::on_new_blog()` method — creating a new site on a multisite network no longer throws a fatal PHP error.
* Fix: Removed dead reference to `nexora-pulse.asset.php` (a Webpack/block-build convention not generated by Vite) in AdminPage asset enqueue.

= 1.0.0 =
* Initial public release.
* SEO Analyzer, Neural Links, Originality, Image SEO, Redirect Manager, Integrations, Index Health.
* Google Search Console + Index Doctor and Core Web Vitals (PageSpeed) — free, using your own Google account/API key.
* AI Assistant and additional integrations shown as roadmap.

== Upgrade Notice ==

= 1.0.0 =
First public release. Safe to install alongside your existing SEO plugin — Pulse automatically avoids duplicate meta tags and shows full compatibility details in the Migration & Compatibility Center.

= 1.0.2 =
Fixes Search Console and PageSpeed showing "Not connected" right after connecting on cached sites (LiteSpeed, Cloudflare, etc.). Strongly recommended for all users.

= 1.0.1 =
Fixes GSC sync returning an HTML error instead of a proper error message, and a fatal on multisite new-site creation. Recommended update for all users.

= 1.0.0 =
First public release of Nexora Pulse.
