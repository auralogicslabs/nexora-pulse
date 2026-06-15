<?php
declare(strict_types=1);

namespace NexoraPulse\Modules;

use NexoraPulse\Services\SeoEnvironment;

defined('ABSPATH') || exit;

/**
 * Full SEO <head> injector for Nexora Pulse.
 *
 * Responsibility split with Nexora Engine (when active):
 *   Engine  → og:title, og:description, og:image, twitter:card, JSON-LD schema
 *   Pulse   → everything else (description, canonical, robots, full OG set,
 *             full Twitter set, article dates, verification tags, GA4/GTM)
 *
 * When Engine is NOT active, Pulse owns the full output.
 */
final class SocialPreview
{
    public static function register_hooks(): void
    {
        // Extend WP core's robots tag via filter — merges into one <meta name="robots"> tag.
        add_filter('wp_robots', [self::class, 'filter_robots']);

        // Priority 3: after Engine (1) and WP core (2). Supplemental tags always run.
        add_action('wp_head', [self::class, 'output_supplemental'], 3);
        // Priority 5: full social block only when Engine is absent.
        add_action('wp_head', [self::class, 'output_social'], 5);
        // Verification + analytics tags — early in head, before content.
        add_action('wp_head', [self::class, 'output_verification'], 2);
    }

    /**
     * Extend WordPress core's robots tag instead of echoing a duplicate.
     * WP core outputs max-image-preview:large by default. We add the full set.
     *
     * @param array<string, string|true> $robots
     * @return array<string, string|true>
     */
    public static function filter_robots(array $robots): array
    {
        if (is_admin() || is_feed()) {
            return $robots;
        }

        $data = self::resolve_meta();
        if (empty($data)) {
            return $robots;
        }

        if (!empty($data['noindex'])) {
            // Override everything — noindex page.
            return ['noindex' => true, 'nofollow' => true];
        }

        // Merge our directives into whatever WP core already has.
        $robots['index']              = true;
        $robots['follow']             = true;
        $robots['max-image-preview']  = 'large';
        $robots['max-snippet']        = '-1';
        $robots['max-video-preview']  = '-1';

        return $robots;
    }

    // ─────────────────────────────────────────────────────────────
    // 1. Verification & Analytics (always, every page, priority 1)
    // ─────────────────────────────────────────────────────────────

    public static function output_verification(): void
    {
        if (is_admin()) {
            return;
        }

        // During Pulse's own head-scan request, emit NOTHING — otherwise the
        // scan sees our tags and we'd flag them as "already present" and then
        // suppress ourselves on the real page. (Belt-and-suspenders with the
        // self-block stripping inside get_detected_head_scripts().)
        if (!empty($_SERVER['HTTP_X_NEXORA_HEAD_SCAN'])) {
            return;
        }

        $detected = self::get_detected_head_scripts();

        // ── Verification meta tags ────────────────────────────────
        $tags = [];

        $gsc_verify    = (string) get_option('nexora_pulse_verify_google', '');
        $bing_verify   = (string) get_option('nexora_pulse_verify_bing', '');
        $yandex_verify = (string) get_option('nexora_pulse_verify_yandex', '');

        if (!empty($gsc_verify) && !$detected['has_gsc_verify']) {
            $tags[] = '<meta name="google-site-verification" content="' . esc_attr($gsc_verify) . '" />';
        }
        if (!empty($bing_verify) && !$detected['has_bing_verify']) {
            $tags[] = '<meta name="msvalidate.01" content="' . esc_attr($bing_verify) . '" />';
        }
        if (!empty($yandex_verify) && !$detected['has_yandex_verify']) {
            $tags[] = '<meta name="yandex-verification" content="' . esc_attr($yandex_verify) . '" />';
        }

        $output = implode("\n", array_filter($tags));
        if (!empty($output)) {
            echo "\n<!-- Nexora Pulse Verification -->\n" . $output . "\n<!-- /Nexora Pulse Verification -->\n"; // phpcs:ignore
        }

        // ── Analytics (GA4 / GTM) ─────────────────────────────────
        // Skip if GA4 or GTM is already present anywhere in the page source,
        // regardless of which plugin, theme, or manual snippet added it.
        if ($detected['has_ga4'] || $detected['has_gtm']) {
            return;
        }

        $gtm_id = (string) get_option('nexora_pulse_gtm_id', '');
        $ga4_id = (string) get_option('nexora_pulse_ga4_id', '');

        if (!empty($gtm_id)) {
            $id = esc_js($gtm_id);
            echo "\n<!-- Nexora Pulse Analytics (GTM) -->\n"; // phpcs:ignore
            echo "<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','{$id}');</script>\n"; // phpcs:ignore
            echo "<!-- /Nexora Pulse Analytics -->\n"; // phpcs:ignore
        } elseif (!empty($ga4_id)) {
            $id = esc_js($ga4_id);
            echo "\n<!-- Nexora Pulse Analytics (GA4) -->\n"; // phpcs:ignore
            echo "<script async src=\"https://www.googletagmanager.com/gtag/js?id={$id}\"></script>\n"; // phpcs:ignore
            echo "<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','{$id}');</script>\n"; // phpcs:ignore
            echo "<!-- /Nexora Pulse Analytics -->\n"; // phpcs:ignore
        }
    }

    /**
     * Fetch and cache a scan of the site's home URL head to detect what
     * tracking/verification scripts are already present — from ANY source
     * (theme, Site Kit, manual snippet, Hummingbird-delayed, etc.)
     *
     * Cached for 12 hours. Call self::bust_head_cache() after settings save
     * to force a refresh.
     *
     * @return array{has_ga4: bool, has_gtm: bool, has_gsc_verify: bool, has_bing_verify: bool, has_yandex_verify: bool}
     */
    public static function get_detected_head_scripts(): array
    {
        $cache_key = 'nexora_pulse_head_scan';
        $cached    = get_transient($cache_key);

        if (is_array($cached)) {
            return $cached;
        }

        $result = [
            'has_ga4'          => false,
            'has_gtm'          => false,
            'has_gsc_verify'   => false,
            'has_bing_verify'  => false,
            'has_yandex_verify' => false,
        ];

        $response = wp_remote_get(get_home_url(), [
            'timeout'   => 10,
            'sslverify' => false,
            'headers'   => ['X-Nexora-Head-Scan' => '1'],
        ]);

        if (is_wp_error($response)) {
            // Cache empty result for 5 min so we retry soon but don't hammer.
            set_transient($cache_key, $result, 5 * MINUTE_IN_SECONDS);
            return $result;
        }

        $html = (string) wp_remote_retrieve_body($response);

        // Extract just the <head>...</head> portion to avoid false positives in body.
        if (preg_match('/<head[^>]*>(.*?)<\/head>/is', $html, $m)) {
            $head = $m[1];
        } else {
            $head = substr($html, 0, 8000); // fallback: first 8KB
        }

        // Remove Pulse's OWN injected blocks before detecting, so we never see
        // our own verification/analytics tags and then suppress ourselves.
        $head = preg_replace('/<!-- Nexora Pulse Verification -->.*?<!-- \/Nexora Pulse Verification -->/is', '', $head) ?? $head;
        $head = preg_replace('/<!-- Nexora Pulse Analytics[^>]*-->.*?<!-- \/Nexora Pulse Analytics -->/is', '', $head) ?? $head;

        // GA4 — matches gtag/js?id=G-, gtag('config','G-), any script type variant.
        $result['has_ga4'] = (bool) preg_match('/gtag[\\/.]js\?id=G-|gtag\([\'"]config[\'"],\s*[\'"]G-/i', $head);

        // GTM — matches googletagmanager.com/gtm.js or GTM-XXXXXX.
        $result['has_gtm'] = (bool) preg_match('/googletagmanager\.com\/gtm\.js|[\'"]GTM-[A-Z0-9]+[\'"]/', $head);

        // Google Search Console verification — require the meta name attribute
        // so we don't match the bare keyword in a comment or script.
        $result['has_gsc_verify'] = (bool) preg_match('/name=[\'"]google-site-verification[\'"]/i', $head);

        // Bing verification.
        $result['has_bing_verify'] = (bool) preg_match('/name=[\'"]msvalidate\.01[\'"]/', $head);

        // Yandex verification.
        $result['has_yandex_verify'] = (bool) preg_match('/name=[\'"]yandex-verification[\'"]/', $head);

        set_transient($cache_key, $result, 12 * HOUR_IN_SECONDS);

        return $result;
    }

    /**
     * Bust the head scan cache — call after settings save or plugin activation.
     */
    public static function bust_head_cache(): void
    {
        delete_transient('nexora_pulse_head_scan');
    }

    // ─────────────────────────────────────────────────────────────
    // 2. Supplemental SEO tags (always, singular + home, priority 3)
    //    Engine doesn't output these — we own them unconditionally.
    // ─────────────────────────────────────────────────────────────

    public static function output_supplemental(): void
    {
        if (is_admin()) {
            return;
        }

        $data = self::resolve_meta();
        if (empty($data)) {
            return;
        }

        // Defer to other SEO plugins to avoid duplicate meta tags. Any active
        // SEO plugin (Yoast, Rank Math, AIOSEO, SEOPress, …) already outputs
        // description + canonical + robots, so we skip this block entirely.
        if (SeoEnvironment::other_seo_active()) {
            return;
        }

        $tags = [];

        // <meta name="description"> — the Google search snippet source.
        if (!empty($data['og_description'])) {
            $tags[] = self::tag('name', 'description', $data['og_description']);
        }

        // <meta name="keywords"> — focus keyword set by user.
        if (!empty($data['focus_kw'])) {
            $tags[] = self::tag('name', 'keywords', $data['focus_kw']);
        }

        // Googlebot-specific directive (separate from the wp_robots-managed tag).
        if (empty($data['noindex'])) {
            $tags[] = self::tag('name', 'googlebot', 'index, follow');
        }

        // Canonical link.
        if (!empty($data['canonical'])) {
            $tags[] = '<link rel="canonical" href="' . esc_url($data['canonical']) . '" />';
        }

        // hreflang — only emit when WPML/Polylang signals a multilingual setup.
        foreach ($data['hreflang'] as $lang => $url) {
            $tags[] = '<link rel="alternate" hreflang="' . esc_attr($lang) . '" href="' . esc_url($url) . '" />';
        }

        $output = implode("\n", array_filter($tags));
        if (!empty($output)) {
            echo "\n<!-- Nexora Pulse SEO -->\n" . $output . "\n<!-- /Nexora Pulse SEO -->\n"; // phpcs:ignore
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 3. Full OG + Twitter + JSON-LD (only when Engine is absent)
    // ─────────────────────────────────────────────────────────────

    public static function output_social(): void
    {
        if (is_admin()) {
            return;
        }

        // Skip the entire OG / Twitter / JSON-LD block when Nexora Engine OR any
        // third-party SEO plugin is active — they already emit these tags, and a
        // duplicate Open Graph / Twitter / JSON-LD set is a visible SEO defect.
        if (!SeoEnvironment::pulse_owns_meta_output()) {
            return;
        }

        $data = self::resolve_meta();
        if (empty($data)) {
            return;
        }

        $tags = [];
        $url  = $data['canonical'] ?? ($data['og_url'] ?? '');

        // ── Open Graph ───────────────────────────────────────────
        $tags[] = self::tag('property', 'og:locale',      self::og_locale());
        $tags[] = self::tag('property', 'og:site_name',   get_bloginfo('name'));
        $tags[] = self::tag('property', 'og:type',        $data['og_type'] ?? 'website');
        $tags[] = self::tag('property', 'og:title',       $data['og_title'] ?? '');
        $tags[] = self::tag('property', 'og:description', $data['og_description'] ?? '');
        $tags[] = self::tag('property', 'og:url',         $url);

        if (!empty($data['og_image'])) {
            // Use https:// variant for og:image:secure_url.
            $secure_img = preg_replace('/^http:\/\//i', 'https://', $data['og_image']);
            $tags[] = self::tag('property', 'og:image',            $data['og_image']);
            $tags[] = self::tag('property', 'og:image:secure_url', $secure_img);
            $tags[] = self::tag('property', 'og:image:width',      '1200');
            $tags[] = self::tag('property', 'og:image:height',     '630');
            $tags[] = self::tag('property', 'og:image:alt',        $data['og_title'] ?? '');
            $tags[] = self::tag('property', 'og:image:type',       'image/jpeg');
        }

        // Article-specific OG tags.
        if (($data['og_type'] ?? '') === 'article') {
            if (!empty($data['article_published'])) {
                $tags[] = self::tag('property', 'article:published_time', $data['article_published']);
            }
            if (!empty($data['article_modified'])) {
                $tags[] = self::tag('property', 'article:modified_time', $data['article_modified']);
            }
            if (!empty($data['author_name'])) {
                $tags[] = self::tag('property', 'article:author', $data['author_name']);
            }
        }

        // ── Twitter Card ─────────────────────────────────────────
        $card_type = empty($data['og_image']) ? 'summary' : 'summary_large_image';
        $tags[] = self::tag('name', 'twitter:card',        $card_type);
        $tags[] = self::tag('name', 'twitter:title',       $data['og_title'] ?? '');
        $tags[] = self::tag('name', 'twitter:description', $data['og_description'] ?? '');
        $tags[] = self::tag('name', 'twitter:url',         $url);

        $twitter_site = (string) get_option('nexora_pulse_twitter_site', '');
        if (!empty($twitter_site)) {
            $handle = '@' . ltrim($twitter_site, '@');
            $tags[] = self::tag('name', 'twitter:site',    $handle);
            $tags[] = self::tag('name', 'twitter:creator', $handle);
        }
        if (!empty($data['og_image'])) {
            $tags[] = self::tag('name', 'twitter:image',     $data['og_image']);
            $tags[] = self::tag('name', 'twitter:image:alt', $data['og_title'] ?? '');
        }

        $output = implode("\n", array_filter($tags));
        if (!empty($output)) {
            echo "\n<!-- Nexora Pulse Social Meta -->\n" . $output . "\n<!-- /Nexora Pulse Social Meta -->\n"; // phpcs:ignore
        }

        // NOTE: JSON-LD is emitted solely by SchemaEngine to avoid two competing
        // structured-data blocks from Pulse itself. SocialPreview owns OG/Twitter;
        // SchemaEngine owns JSON-LD. Keep that split — do not re-add JSON-LD here.
    }

    // ─────────────────────────────────────────────────────────────
    // Meta resolver — single source of truth for all three outputs
    // ─────────────────────────────────────────────────────────────

    private static function resolve_meta(): array
    {
        if (is_singular()) {
            return self::resolve_singular();
        }

        if (is_front_page() || is_home()) {
            return self::resolve_home();
        }

        return [];
    }

    private static function resolve_singular(): array
    {
        $post = get_queried_object();
        if (!$post instanceof \WP_Post) {
            return [];
        }

        // Priority: Engine (_ncx_seo_data) → Pulse keys → Yoast → AIOSEO → WP fallbacks.
        $ncx = (array) (get_post_meta($post->ID, '_ncx_seo_data', true) ?: []);

        $saved_title = (string) (
            ($ncx['og_title'] ?? '') ?:
            get_post_meta($post->ID, '_nexora_meta_title', true) ?:
            get_post_meta($post->ID, '_nexora_og_title', true) ?:
            get_post_meta($post->ID, '_yoast_wpseo_title', true) ?:
            ''
        );

        // Fall back through global templates → raw post title.
        $templates       = \NexoraPulse\Modules\TitleTemplates::get();
        $template_key    = $post->post_type === 'page' ? 'page_title' : 'post_title';
        $template_title  = \NexoraPulse\Modules\TitleTemplates::resolve(
            (string) ($templates[$template_key] ?? '%title%'),
            $post
        );
        $og_title = $saved_title ?: ($template_title ?: get_the_title($post->ID));

        $saved_desc = (string) (
            ($ncx['og_desc'] ?? '') ?:
            get_post_meta($post->ID, '_nexora_meta_desc', true) ?:
            get_post_meta($post->ID, '_nexora_og_description', true) ?:
            get_post_meta($post->ID, '_yoast_wpseo_metadesc', true) ?:
            get_post_meta($post->ID, '_aioseo_description', true) ?:
            ''
        );

        // Mirror Engine's auto-excerpt fallback. Decode HTML entities (e.g. &hellip;)
        // and strip tags so we never output raw [&hellip;] or HTML in the description.
        $auto_excerpt = html_entity_decode(
            wp_strip_all_tags((string) get_the_excerpt($post)),
            ENT_QUOTES | ENT_HTML5,
            'UTF-8'
        );
        // Trim to 155 chars at a word boundary.
        if (strlen($auto_excerpt) > 155) {
            $auto_excerpt = substr($auto_excerpt, 0, strrpos(substr($auto_excerpt, 0, 152), ' ') ?: 152) . '…';
        }

        // Template-resolved description fallback (uses %excerpt% by default, but admins can configure).
        $desc_key       = $post->post_type === 'page' ? 'page_desc' : 'post_desc';
        $template_desc  = \NexoraPulse\Modules\TitleTemplates::resolve(
            (string) ($templates[$desc_key] ?? '%excerpt%'),
            $post
        );
        $og_desc = $saved_desc ?: ($template_desc ?: $auto_excerpt);

        $og_image = (string) (
            ($ncx['og_image'] ?? '') ?:
            get_post_meta($post->ID, '_nexora_og_image', true) ?:
            get_the_post_thumbnail_url($post->ID, 'large') ?:
            ''
        );

        $focus_kw = (string) (
            get_post_meta($post->ID, '_nexora_focus_kw', true) ?:
            get_post_meta($post->ID, '_yoast_wpseo_focuskw', true) ?:
            ''
        );

        $noindex = (bool) get_post_meta($post->ID, '_nexora_noindex', true)
            || get_post_meta($post->ID, '_yoast_wpseo_meta-robots-noindex', true) === '1';

        $canonical = (string) (
            get_post_meta($post->ID, '_nexora_canonical', true) ?:
            get_post_meta($post->ID, '_yoast_wpseo_canonical', true) ?:
            get_permalink($post->ID)
        );

        $author_id   = (int) $post->post_author;
        $author_name = get_the_author_meta('display_name', $author_id);

        return [
            'og_type'           => $post->post_type === 'post' ? 'article' : 'website',
            'og_title'          => $og_title,
            'og_description'    => $og_desc,
            'og_url'            => (string) get_permalink($post->ID),
            'og_image'          => $og_image,
            'focus_kw'          => $focus_kw,
            'noindex'           => $noindex,
            'canonical'         => $canonical,
            'author_name'       => $author_name,
            'article_published' => $post->post_type === 'post' ? get_the_date('c', $post) : '',
            'article_modified'  => $post->post_type === 'post' ? get_the_modified_date('c', $post) : '',
            'hreflang'          => self::get_hreflang($post->ID),
        ];
    }

    private static function resolve_home(): array
    {
        return [
            'og_type'        => 'website',
            'og_title'       => get_bloginfo('name'),
            'og_description' => get_bloginfo('description'),
            'og_url'         => get_home_url(),
            'og_image'       => '',
            'focus_kw'       => '',
            'noindex'        => false,
            'canonical'      => trailingslashit(get_home_url()),
            'author_name'    => '',
            'hreflang'       => [],
        ];
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────

    private static function tag(string $attr, string $property, string $content): string
    {
        if (empty($content)) {
            return '';
        }
        return '<meta ' . esc_attr($attr) . '="' . esc_attr($property) . '" content="' . esc_attr($content) . '" />';
    }

    private static function og_locale(): string
    {
        // Convert WP locale (en_US) to OG format (en_US) — already matches.
        return str_replace('-', '_', get_locale());
    }

    /**
     * Returns hreflang pairs when WPML or Polylang is active.
     * Falls back to an empty array (no hreflang output) on single-language sites.
     *
     * @return array<string, string>  locale => url
     */
    private static function get_hreflang(int $post_id): array
    {
        $pairs = [];

        // WPML.
        if (function_exists('icl_get_languages')) {
            $langs = icl_get_languages('skip_missing=0');
            foreach ($langs as $lang) {
                if (!empty($lang['url'])) {
                    $pairs[$lang['language_code']] = $lang['url'];
                }
            }
        }

        // Polylang.
        if (function_exists('pll_the_languages') && function_exists('pll_get_post_translations')) {
            $translations = pll_get_post_translations($post_id);
            foreach ($translations as $lang_slug => $translated_id) {
                $url = get_permalink($translated_id);
                if ($url) {
                    $pairs[$lang_slug] = $url;
                }
            }
        }

        // Add x-default pointing to current canonical if we have multiple languages.
        if (count($pairs) > 1) {
            $pairs['x-default'] = (string) get_permalink($post_id);
        }

        return $pairs;
    }

    // ─────────────────────────────────────────────────────────────
    // REST helpers — called from PostsController
    // ─────────────────────────────────────────────────────────────

    public static function get_post_social_meta(int $post_id): array
    {
        $post = get_post($post_id);
        if (!$post) {
            return [];
        }

        $ncx       = (array) (get_post_meta($post_id, '_ncx_seo_data', true) ?: []);
        $thumbnail = get_the_post_thumbnail_url($post_id, 'large');

        return [
            'post_id'        => $post_id,
            'post_title'     => get_the_title($post_id),
            'og_title'       => (string) (($ncx['og_title'] ?? '') ?: get_post_meta($post_id, '_nexora_og_title', true)),
            'og_description' => (string) (($ncx['og_desc'] ?? '') ?: get_post_meta($post_id, '_nexora_og_description', true)),
            'og_image'       => (string) (($ncx['og_image'] ?? '') ?: get_post_meta($post_id, '_nexora_og_image', true) ?: $thumbnail),
            'default_title'  => get_the_title($post_id),
            'default_image'  => $thumbnail ?: '',
            'default_desc'   => wp_strip_all_tags((string) get_the_excerpt($post)),
            'permalink'      => (string) get_permalink($post_id),
        ];
    }

    public static function save_post_social_meta(int $post_id, array $data): bool
    {
        if (!get_post($post_id)) {
            return false;
        }

        $ncx = (array) (get_post_meta($post_id, '_ncx_seo_data', true) ?: []);
        $dirty = false;

        $map = [
            'og_title'       => 'og_title',
            'og_description' => 'og_desc',
            'og_image'       => 'og_image',
        ];
        foreach ($map as $field => $ncx_key) {
            if (array_key_exists($field, $data)) {
                $val = sanitize_text_field((string) $data[$field]);
                update_post_meta($post_id, "_nexora_{$field}", $val);
                $ncx[$ncx_key] = $val;
                $dirty = true;
            }
        }

        if ($dirty) {
            update_post_meta($post_id, '_ncx_seo_data', $ncx);
        }

        return true;
    }
}
