=== Nexora Pulse – Complete SEO Plugin ===
Contributors: auralogics
Tags: seo, xml sitemap, schema, google search console, core web vitals
Requires at least: 6.0
Tested up to: 7.0
Stable tag: 1.0.1
Requires PHP: 8.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

WordPress SEO plugin: Google Search Console, on-page & technical SEO audits, XML sitemap, schema, internal linking, and Core Web Vitals.

== Description ==

Nexora Pulse is a complete SEO plugin for WordPress that helps you improve Google rankings, fix indexing issues, optimize on-page SEO, audit technical SEO, manage your XML sitemap and robots.txt, output schema markup, monitor Core Web Vitals, strengthen internal linking, and analyze Google Search Console data — all from one dashboard.

**What makes Nexora Pulse different.** Most SEO plugins stop at settings and a green light, scoring your pages against static rules. Pulse connects to your own Google Search Console and PageSpeed data and tells you what to fix next based on how your site is *actually* performing in search — real indexing status, real clicks and impressions, real Core Web Vitals from Chrome users. It is a data-driven SEO assistant, not just a checklist.

Whether you run a personal blog, a business website, a content publication, an agency client site, or a larger enterprise site, Pulse gives you actionable SEO recommendations grounded in your own search data.

## On-Page SEO Analyzer

Scans every post and page for on-page SEO issues: meta titles, meta descriptions, headings, content readability, and keyword usage. Each page gets an SEO score so you know exactly where to focus first.

## Google Search Console Integration

Connect your own Google Search Console account to monitor your real search performance inside WordPress:

* Clicks, impressions, CTR, and average position
* Top search queries
* Indexed and crawled pages
* Index coverage and indexing status
* URL Inspection for any single page

It is your Search Console data, surfaced where you actually work.

## Google Index Coverage & Index Health (Index Doctor)

See which pages are search-ready and which ones need attention. The Index Doctor uses the Search Console URL Inspection API to tell you *why* specific pages are not getting indexed (crawled — currently not indexed, excluded, discovered — not indexed, and more) and detects systemic patterns across your site.

## Technical SEO Audit

Run a full technical SEO audit of your site — crawlability, indexability, metadata coverage, canonical setup, and structural issues — and get a prioritized list of what to fix.

## XML Sitemap Manager

Generate and manage a clean XML sitemap so search engines can discover and crawl every important page on your WordPress site.

## Robots.txt Editor

Edit and manage your robots.txt directly from the dashboard to control how search engines crawl your site.

## Schema Markup (Structured Data / JSON-LD)

Automatically generates Schema.org structured data (JSON-LD) — Article/BlogPosting and BreadcrumbList — to help search engines understand your content and improve eligibility for rich results.

## Meta Titles, Descriptions & Social Tags

Set global title and meta description templates, and output clean canonical URLs, Open Graph tags, and Twitter Card tags so your pages look right in search results and on social media.

## Internal Link Analyzer (Neural Links)

Maps the internal link graph of your whole site. Spot orphan pages, weak link clusters, and internal-linking opportunities at a glance to spread ranking strength across your content.

## Duplicate Content Checker (Originality)

Finds duplicate and near-duplicate content across your site before it hurts your rankings.

## Core Web Vitals & PageSpeed

Add a free PageSpeed Insights API key to pull real-user Core Web Vitals — LCP, INP, CLS, and TTFB — straight from Chrome field data, alongside lab performance scores.

## Redirect Manager

Create and manage 301 and 302 redirects from a clean interface to preserve link equity and fix broken URLs.

## Image SEO

Audits image alt text, file sizes, and file names so your media helps your SEO instead of slowing your pages down.

## SEO Plugin Migration & Compatibility Center

Already running another SEO plugin? Pulse detects Yoast SEO, Rank Math, All in One SEO, SEOPress, and more. It runs in a safe analysis-only mode so it never creates duplicate meta tags, and it shows you exactly what it found and how much of your existing SEO data is ready to migrate.

= Who is Nexora Pulse for? =

* Bloggers and content publishers
* Small businesses and local websites
* Marketing agencies and freelancers
* SEO professionals and consultants
* WordPress developers
* Enterprise and high-traffic websites

= All features =

* On-page SEO audit
* Technical SEO audit
* Website SEO health score
* Google Search Console integration
* Search analytics (clicks, impressions, CTR, position)
* URL Inspection
* Index coverage & index monitoring
* XML sitemap
* Robots.txt editor
* Schema markup / structured data (JSON-LD)
* Meta titles and meta descriptions
* Canonical URLs
* Open Graph and Twitter Cards
* Breadcrumbs (schema)
* Internal link analysis
* Duplicate content checker
* Core Web Vitals & PageSpeed integration
* Redirect manager (301 / 302)
* Image SEO (alt text, filenames, sizes)
* SEO plugin migration & compatibility

= Free =
Nexora Pulse is fully free. Every tool above is included, even Google Search Console and Core Web Vitals. Those use your own Google account or API key, so there is no cost to you and nothing is routed through our servers.

= On the Roadmap =
* AI Assistant for metadata generation, content rewriting, and alt-text suggestions using your own AI provider key
* Google Analytics 4, Indexing API, and Bing Webmaster integrations

Roadmap items appear in the app marked "Coming Soon" and are not yet active.

= Privacy =
* Search Console and PageSpeed connect with your own Google credentials/API key, stored encrypted in your own database.
* No data is sent to our (Auralogics Labs) servers, and no external request is made without your explicit action or configuration.
* No obfuscated code. The full GPL source is available on [GitHub](https://github.com/auralogicslabs/nexora-pulse). The React admin UI is compiled from the `frontend/` directory with `npm run build`. See BUILD.md in the repository for the exact steps to reproduce `assets/dist/` from source.
* A proper uninstall.php cleans up all plugin data on deletion.

== External services ==

Nexora Pulse can connect to the following third-party services. Each one is optional, is activated only when you configure it, and uses **your own** Google account, API key, or tracking ID. Nothing is routed through Auralogics Labs servers, and no external service is contacted until you explicitly set it up.

**Google Search Console API**
Used to retrieve your site's search performance data (clicks, impressions, CTR, average position) and indexing status so Pulse can show them in the dashboard. When you connect Search Console and when a sync runs (manually or on its schedule), the plugin sends your site URL and the OAuth access token associated with your own Google account to the API, and receives the metrics back. It is only called after you connect your own Google Search Console property.
Endpoint: https://www.googleapis.com/webmasters/v3
Terms of Service: [developers.google.com/terms](https://developers.google.com/terms)
Privacy Policy: [policies.google.com/privacy](https://policies.google.com/privacy)

**Google Search Console URL Inspection API**
Used by the Index Doctor to ask Google for the live indexing verdict of a specific page (indexed, crawled-not-indexed, excluded, etc.). When you inspect a page or run a bulk index scan, the plugin sends that page's URL plus your own Google OAuth access token to the API and receives the inspection result. Called only on your action, for your own connected property.
Endpoint: https://searchconsole.googleapis.com/v1/urlInspection/index:inspect
Terms of Service: [developers.google.com/terms](https://developers.google.com/terms)
Privacy Policy: [policies.google.com/privacy](https://policies.google.com/privacy)

**Google PageSpeed Insights API**
Used to pull real-user Core Web Vitals (LCP, INP, CLS, TTFB) and lab performance data for your pages. When you request a performance check, the plugin sends the page URL and your own PageSpeed Insights API key to the API and receives the performance report. Only called after you add your own free API key and request a check.
Endpoint: https://www.googleapis.com/pagespeedonline/v5/runPagespeed
Terms of Service: [developers.google.com/terms](https://developers.google.com/terms)
Privacy Policy: [policies.google.com/privacy](https://policies.google.com/privacy)

**Google Tag Manager / Google Analytics (gtag.js)**
Optional. Only if you enter a Google Tag Manager container ID or a Google Analytics 4 measurement ID in the plugin settings, Pulse adds the standard Google loader script to your site's public pages so your visitors' analytics are sent to your own Google property. Pulse does not add any tracking of its own and sends nothing unless you configure one of these IDs. Standard visitor analytics data is collected by Google under your account.
Loaded from: https://www.googletagmanager.com/
Terms of Service: [marketingplatform.google.com/about/analytics/terms](https://marketingplatform.google.com/about/analytics/terms/us/)
Privacy Policy: https://policies.google.com/privacy

== Installation ==

1. Upload the plugin folder to /wp-content/plugins/nexora-pulse/.
2. Activate Nexora Pulse through the Plugins menu in WordPress.
3. Open Nexora Pulse from the admin menu and run your first SEO scan.

== Frequently Asked Questions ==

= How do I improve my WordPress SEO with Nexora Pulse? =
Install Pulse, run your first SEO scan, and connect your Google Search Console account. Pulse audits every page for on-page and technical SEO issues, scores them, and gives you a prioritized list of fixes based on your own search data — so you work on what actually moves rankings instead of guessing.

= How do I connect Google Search Console to WordPress? =
Open Nexora Pulse, go to Integrations, and follow the one-time guided setup to connect your own Google Search Console property. Once connected, Pulse shows your clicks, impressions, CTR, average position, indexed pages, and URL Inspection results inside WordPress. Your credentials stay in your own site, encrypted, and nothing is routed through our servers.

= Does Nexora Pulse replace Yoast SEO or Rank Math? =
It can, or it can run alongside them. Pulse outputs its own meta titles, descriptions, canonical, Open Graph, Twitter, and schema tags when it is your primary SEO plugin. If it detects Yoast, Rank Math, All in One SEO, or SEOPress, it automatically switches to analysis-only mode so you never get duplicate meta tags.

= Can I migrate SEO metadata from another SEO plugin? =
Yes. The built-in Migration & Compatibility Center detects your existing SEO plugin and shows exactly how much of your meta titles, descriptions, and settings are ready to migrate, with no duplicate-tag risk.

= Does Nexora Pulse generate an XML sitemap? =
Yes. Pulse generates and manages a clean XML sitemap so search engines can discover and crawl your important pages, and it includes a robots.txt editor.

= Does it include schema markup / structured data? =
Yes. Pulse outputs Schema.org structured data as JSON-LD (Article/BlogPosting and BreadcrumbList) to help search engines understand your content and improve eligibility for rich results.

= Can I monitor Core Web Vitals? =
Yes. Add your own free PageSpeed Insights API key and Pulse pulls real-user Core Web Vitals — LCP, INP, CLS, and TTFB — straight from Chrome field data, plus lab performance scores.

= Does Nexora Pulse work with WooCommerce or page builders? =
Yes. Pulse analyzes the fully rendered content of any page — including WooCommerce product and shop pages, and pages built with Elementor, Gutenberg, or any other builder. It works at the page level, so there is no special setup required.

= Does the plugin send my data to external servers? =
No. Nexora Pulse does not route any data through Auralogics Labs servers. The only external calls are to your own Google Search Console and PageSpeed Insights accounts, using your own credentials, and only after you explicitly connect them.

= Is Nexora Pulse free? =
Yes. Every feature in this release is free, including Google Search Console and Core Web Vitals.

= Do I need a Google account for Search Console / PageSpeed? =
Yes. You connect your own Google Search Console property and your own free PageSpeed Insights API key. Pulse guides you through the one-time setup in the app. Nothing is sent to our servers. Your credentials stay in your own site, encrypted.

= Does it conflict with other SEO plugins? =
No. Pulse is built to coexist with Yoast SEO, Rank Math, All in One SEO, SEOPress, and others. When it detects another SEO plugin, it automatically runs in analysis mode and stops outputting its own title, meta description, canonical, Open Graph, Twitter, and schema tags, so you never get duplicate meta tags. The built-in Migration & Compatibility Center shows you exactly what was detected, what Pulse is and isn't outputting, and confirms there are no duplicate-tag risks. (Redirect rules should still be managed in one plugin to avoid conflicts.)

= I already use Yoast / Rank Math / AIOSEO. Can I still try Pulse? =
Yes, that's exactly what the Compatibility Center is for. Install Pulse alongside your current SEO plugin and you immediately get its diagnostics (Index Doctor, internal link graph, Core Web Vitals, duplicate detection) without touching your existing setup or risking duplicate tags.

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

= 1.0.1 =
* Refreshed the plugin listing: clearer, keyword-led description, an expanded FAQ, and an updated icon, banner, and screenshots.
* Updated the display name to "Nexora Pulse – Complete SEO Plugin".
* No functional changes to plugin behavior — your settings and data are unaffected.

= 1.0.0 =
First public release of Nexora Pulse.
* SEO Analyzer, Index Doctor, Neural Links (internal link graph), Originality / duplicate detection, Image SEO, Redirect Manager, XML sitemap, robots.txt editor, and schema output.
* Google Search Console and Core Web Vitals (PageSpeed) integrations using your own Google account / API key — nothing routed through our servers.
* New: Migration & Compatibility Center — detects Yoast SEO, Rank Math, All in One SEO, SEOPress, and others, and automatically runs in analysis-only mode alongside them so Pulse never produces duplicate title, meta description, canonical, Open Graph, Twitter, or schema tags.
* Hardened meta output: a single, deduplicated source of truth for all head tags, with a clear admin notice when another SEO plugin is detected.
* Security: input sanitized on all REST endpoints, JSON-LD output hardened against script-context breakout, encrypted credential storage with masked output.
* Performance: indexed database tables and batched background scanning for large sites.

== Upgrade Notice ==

= 1.0.1 =
Listing and documentation refresh only. No functional changes — safe to update.

= 1.0.0 =
First public release. Safe to install alongside your existing SEO plugin — Pulse automatically avoids duplicate meta tags and shows full compatibility details in the Migration & Compatibility Center.
