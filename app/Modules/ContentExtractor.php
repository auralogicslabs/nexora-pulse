<?php
declare(strict_types=1);

namespace NexoraPulse\Modules;

use WP_Post;

defined('ABSPATH') || exit;

/**
 * Universal page-content extractor.
 *
 * Detects which builder or editor authored the post and returns the
 * actual rendered HTML/text that visitors (and search engines) see —
 * regardless of whether the page was built with Elementor, Gutenberg,
 * Divi, WPBakery, Beaver Builder, Bricks, Oxygen, or the classic editor.
 *
 * Priority order for each builder type:
 *   1. Parse stored JSON/shortcodes directly (zero HTTP overhead)
 *   2. Fall back to fetching the rendered frontend URL (100 % accurate)
 *   3. Fall back to raw post_content (classic editor / plain HTML)
 */
final class ContentExtractor
{
    // Builders whose content lives entirely outside post_content.
    private const JSON_BUILDERS = [
        '_elementor_edit_mode' => 'elementor',   // value must be 'builder'
        '_fl_builder_enabled'  => 'beaver',       // any truthy value
        '_bricks_page_content_2' => 'bricks',    // any truthy value
    ];

    // Builders whose content is embedded as shortcodes inside post_content.
    private const SHORTCODE_PATTERNS = [
        '/\[et_pb_/'  => 'divi',
        '/\[vc_row/'  => 'wpbakery',
        '/\[ct-/'     => 'oxygen',
    ];

    /** Detected builder slug for the last call to extract(). */
    private string $detected_builder = 'classic';

    // ----------------------------------------------------------------
    // Public API
    // ----------------------------------------------------------------

    /**
     * Return the full rendered HTML of the post, from whatever source
     * is most accurate for the builder in use.
     *
     * @return string  Raw HTML (may contain tags).
     */
    public function get_html(WP_Post $post): string
    {
        $this->detected_builder = 'classic';

        // 1. JSON-based visual builders (Elementor, Beaver, Bricks).
        foreach (self::JSON_BUILDERS as $meta_key => $builder) {
            $val = get_post_meta($post->ID, $meta_key, true);
            if ($this->is_active($meta_key, $val)) {
                $this->detected_builder = $builder;
                $html = $this->extract_from_json_builder($post->ID, $builder);
                if ($html !== '') {
                    return $html;
                }
                // JSON parse failed or empty — fall through to frontend fetch.
                return $this->fetch_frontend($post->ID) ?? $post->post_content;
            }
        }

        // 2. Shortcode-based visual builders (Divi, WPBakery, Oxygen) — content
        // lives as shortcodes inside post_content; render them to HTML.
        foreach (self::SHORTCODE_PATTERNS as $pattern => $builder) {
            if (preg_match($pattern, $post->post_content)) {
                $this->detected_builder = $builder;
                return do_shortcode($post->post_content);
            }
        }

        // 3. Everything else (Gutenberg blocks AND classic editor): render
        // post_content through WordPress's FULL content pipeline — the exact
        // same `the_content` filter the theme uses in single.php/page.php
        // (do_blocks + do_shortcode + wpautop + oEmbed). Reading raw post_content
        // under-counts block-authored posts (block-comment markup, no <p> wrap).
        $this->detected_builder = (function_exists('has_blocks') && has_blocks($post->ID)) ? 'gutenberg' : 'classic';
        $rendered = $this->render_post_content($post);

        // 4. Custom-template / static-content themes render the article OUTSIDE
        // post_content (page-*.php templates, FSE, headless/static mirrors). If
        // the rendered post_content is thin, fetch the live frontend and pull its
        // main content region — so we always match what visitors & Google see,
        // for ANY theme. Take whichever source has the most real text.
        if ($this->text_word_count($rendered) < 80) {
            $frontend = $this->fetch_frontend($post->ID);
            if ($frontend) {
                $region = $this->extract_main_region($frontend);
                if ($this->text_word_count($region) > $this->text_word_count($rendered)) {
                    $this->detected_builder = 'rendered';
                    return $region;
                }
            }
        }

        return $rendered;
    }

    /**
     * Render a post's body exactly as the theme would via the_content(), with a
     * re-entrancy guard so we never recurse if invoked during a the_content pass.
     */
    private static bool $rendering = false;

    private function render_post_content(WP_Post $post): string
    {
        $raw = (string) $post->post_content;

        if (self::$rendering) {
            // Already inside a the_content render — fall back to block rendering
            // only (safe, no filter recursion).
            return $this->render_blocks($raw);
        }

        self::$rendering = true;
        // Run the canonical pipeline. Suppress errors from third-party filters so
        // a single misbehaving plugin can't break analysis.
        $rendered = $raw;
        try {
            $rendered = (string) apply_filters('the_content', $raw);
        } catch (\Throwable $e) {
            $rendered = $this->render_blocks($raw);
        } finally {
            self::$rendering = false;
        }

        return $rendered !== '' ? $rendered : $raw;
    }

    /** Rough word count of the plain text inside some HTML. */
    private function text_word_count(string $html): int
    {
        $text = trim(wp_strip_all_tags($html));
        if ($text === '') {
            return 0;
        }
        return str_word_count($text);
    }

    /**
     * Pull the main article/content region out of a full rendered HTML page,
     * stripping nav/header/footer/aside/script/style so word-count and
     * readability reflect the actual article — not the chrome. Works across
     * themes by trying semantic containers, then common content classes,
     * then falling back to <body> minus boilerplate.
     */
    private function extract_main_region(string $html): string
    {
        // Remove non-content elements up front.
        $clean = preg_replace([
            '/<script\b[^>]*>.*?<\/script>/is',
            '/<style\b[^>]*>.*?<\/style>/is',
            '/<nav\b[^>]*>.*?<\/nav>/is',
            '/<header\b[^>]*>.*?<\/header>/is',
            '/<footer\b[^>]*>.*?<\/footer>/is',
            '/<aside\b[^>]*>.*?<\/aside>/is',
            '/<form\b[^>]*>.*?<\/form>/is',
            '/<!--.*?-->/s',
        ], '', $html) ?? $html;

        // Try, in order: <article>, <main>, then common content-class wrappers.
        $candidates = [];
        if (preg_match('/<article\b[^>]*>(.*?)<\/article>/is', $clean, $m)) {
            $candidates[] = $m[1];
        }
        if (preg_match('/<main\b[^>]*>(.*?)<\/main>/is', $clean, $m)) {
            $candidates[] = $m[1];
        }
        if (preg_match('/<div\b[^>]*class="[^"]*(entry-content|post-content|article-main|article-body|wp-block-post-content|prose)[^"]*"[^>]*>(.*?)<\/div>/is', $clean, $m)) {
            $candidates[] = $m[2];
        }

        // Pick the candidate with the most text.
        $best = '';
        $bestWords = 0;
        foreach ($candidates as $c) {
            $w = $this->text_word_count($c);
            if ($w > $bestWords) {
                $bestWords = $w;
                $best = $c;
            }
        }

        // Fallback: the cleaned <body>, which at least excludes chrome.
        if ($bestWords < 30 && preg_match('/<body\b[^>]*>(.*?)<\/body>/is', $clean, $m)) {
            $best = $m[1];
        }

        return $best !== '' ? $best : $clean;
    }

    /**
     * Return plain text (no tags) suitable for word-count, keyword
     * density, and readability checks.
     */
    public function get_text(WP_Post $post): string
    {
        return wp_strip_all_tags($this->get_html($post));
    }

    /**
     * Return the builder slug detected for the last call.
     * e.g. 'elementor', 'gutenberg', 'divi', 'classic', …
     */
    public function get_detected_builder(): string
    {
        return $this->detected_builder;
    }

    /**
     * Find all H1 tags in the rendered content and return their inner text.
     * Returns an empty array when no H1 is found.
     *
     * @return string[]
     */
    public function get_h1_tags(WP_Post $post): array
    {
        $html = $this->get_html($post);
        preg_match_all('/<h1[^>]*>(.*?)<\/h1>/is', $html, $m);
        return array_map('wp_strip_all_tags', $m[1] ?? []);
    }

    /**
     * Count images in the rendered content that are missing alt text.
     */
    public function count_images_missing_alt(WP_Post $post): int
    {
        return count($this->get_images_missing_alt($post));
    }

    /**
     * Return filenames (basenames) of images missing alt text.
     * Used to surface specific image identifiers in issue messages.
     *
     * @return string[]
     */
    public function get_images_missing_alt(WP_Post $post): array
    {
        $html = $this->get_html($post);
        preg_match_all('/<img[^>]+>/i', $html, $imgs);
        $names = [];
        foreach ($imgs[0] as $tag) {
            if (preg_match('/alt=["\'][^"\']+["\']/i', $tag)) {
                continue;
            }
            // Prefer attachment title via wp-image-N if available, else filename.
            if (preg_match('/wp-image-(\d+)/i', $tag, $idm)) {
                $title = get_the_title((int) $idm[1]);
                if ($title) {
                    $names[] = $title;
                    continue;
                }
            }
            if (preg_match('/src=["\']([^"\']+)["\']/i', $tag, $srcm)) {
                $names[] = basename(wp_parse_url($srcm[1], PHP_URL_PATH) ?: $srcm[1]);
            }
        }
        return $names;
    }

    /**
     * Count internal links in the rendered content.
     */
    public function count_internal_links(WP_Post $post): int
    {
        $html      = $this->get_html($post);
        $site_host = (string) wp_parse_url(get_home_url(), PHP_URL_HOST);
        preg_match_all('/<a[^>]+href=["\']([^"\']+)["\']/i', $html, $m);
        $count = 0;
        foreach ($m[1] as $href) {
            $host = (string) wp_parse_url($href, PHP_URL_HOST);
            if ($host === '' || $host === $site_host) {
                $count++;
            }
        }
        return $count;
    }

    // ----------------------------------------------------------------
    // Builder-specific extractors
    // ----------------------------------------------------------------

    private function is_active(string $meta_key, mixed $val): bool
    {
        if (empty($val)) {
            return false;
        }
        // Elementor requires the value to equal 'builder'.
        if ($meta_key === '_elementor_edit_mode') {
            return $val === 'builder';
        }
        return true; // Beaver, Bricks: any truthy value means active.
    }

    private function extract_from_json_builder(int $post_id, string $builder): string
    {
        return match ($builder) {
            'elementor' => $this->extract_elementor($post_id),
            'beaver'    => $this->extract_beaver($post_id),
            'bricks'    => $this->extract_bricks($post_id),
            default     => '',
        };
    }

    // ── Elementor ─────────────────────────────────────────────

    private function extract_elementor(int $post_id): string
    {
        $raw = get_post_meta($post_id, '_elementor_data', true);
        if (empty($raw)) {
            return '';
        }

        $data = is_string($raw) ? json_decode($raw, true) : $raw;
        if (!is_array($data) || json_last_error() !== JSON_ERROR_NONE) {
            return '';
        }

        $parts = [];
        $this->walk_elementor($data, $parts);

        return implode(' ', $parts);
    }

    private function walk_elementor(array $elements, array &$parts): void
    {
        foreach ($elements as $el) {
            if (!is_array($el)) {
                continue;
            }

            $settings = $el['settings'] ?? [];
            $widget   = $el['widgetType'] ?? '';

            // Heading widget — wrap in the correct H tag so H1 detection works.
            if ($widget === 'heading' && !empty($settings['title'])) {
                $tag    = $settings['header_size'] ?? 'h2'; // e.g. 'h1','h2','h3'
                $parts[] = "<{$tag}>" . $settings['title'] . "</{$tag}>";
            }

            // Text editor / HTML widget.
            foreach (['editor', 'html', 'text', 'content', 'description'] as $key) {
                if (!empty($settings[$key]) && is_string($settings[$key])) {
                    $parts[] = $settings[$key];
                }
            }

            // Button, icon box, etc.
            foreach (['button_text', 'title_text', 'prefix', 'suffix'] as $key) {
                if (!empty($settings[$key]) && is_string($settings[$key])) {
                    $parts[] = '<p>' . $settings[$key] . '</p>';
                }
            }

            // Image alt text (for missing-alt checks).
            if (!empty($settings['image']['url'])) {
                $alt   = $settings['image_alt'] ?? ($settings['image']['alt'] ?? '');
                $parts[] = '<img src="' . esc_url($settings['image']['url'])
                    . '" alt="' . esc_attr($alt) . '" />';
            }

            // Recurse into nested elements and columns.
            if (!empty($el['elements']) && is_array($el['elements'])) {
                $this->walk_elementor($el['elements'], $parts);
            }
        }
    }

    // ── Beaver Builder ────────────────────────────────────────

    private function extract_beaver(int $post_id): string
    {
        $raw = get_post_meta($post_id, '_fl_builder_data', true);
        if (empty($raw)) {
            return '';
        }

        $data = is_string($raw) ? unserialize($raw) : $raw;
        if (!is_array($data)) {
            return '';
        }

        $parts = [];
        foreach ($data as $node) {
            if (!is_object($node)) {
                continue;
            }
            $type     = $node->type ?? '';
            $settings = $node->settings ?? new \stdClass();

            if ($type === 'module') {
                foreach (['heading', 'text', 'content', 'html', 'title', 'description'] as $key) {
                    if (!empty($settings->$key) && is_string($settings->$key)) {
                        $parts[] = $settings->$key;
                    }
                }
            }
        }

        return implode(' ', $parts);
    }

    // ── Bricks Builder ────────────────────────────────────────

    private function extract_bricks(int $post_id): string
    {
        // Try v2 format first, fall back to v1.
        $raw = get_post_meta($post_id, '_bricks_page_content_2', true)
            ?: get_post_meta($post_id, '_bricks_page_content', true);

        if (empty($raw)) {
            return '';
        }

        $data = is_string($raw) ? json_decode($raw, true) : $raw;
        if (!is_array($data) || json_last_error() !== JSON_ERROR_NONE) {
            return '';
        }

        $parts = [];
        $this->walk_bricks($data, $parts);
        return implode(' ', $parts);
    }

    private function walk_bricks(array $elements, array &$parts): void
    {
        foreach ($elements as $el) {
            if (!is_array($el)) {
                continue;
            }
            $settings = $el['settings'] ?? [];
            $name     = $el['name'] ?? '';

            if ($name === 'heading' && !empty($settings['text'])) {
                $tag     = $settings['tag'] ?? 'h2';
                $parts[] = "<{$tag}>" . $settings['text'] . "</{$tag}>";
            }

            foreach (['content', 'text', 'html', 'description'] as $key) {
                if (!empty($settings[$key]) && is_string($settings[$key])) {
                    $parts[] = $settings[$key];
                }
            }

            if (!empty($el['children']) && is_array($el['children'])) {
                $this->walk_bricks($el['children'], $parts);
            }
        }
    }

    // ── Gutenberg / block editor ──────────────────────────────

    private function render_blocks(string $post_content): string
    {
        if (function_exists('do_blocks')) {
            return do_blocks($post_content);
        }
        // Fallback: strip block comments and return raw HTML.
        return preg_replace('/<!--\s*\/?wp:[^>]+-->/s', '', $post_content) ?? $post_content;
    }

    // ── Frontend HTTP fetch (universal fallback) ───────────────

    /**
     * Fetch the live rendered HTML from the page's public URL.
     * Used when direct JSON parsing fails or for unknown builders.
     * Results are cached per-post for the duration of the scan batch.
     */
    private static array $fetch_cache = [];

    private function fetch_frontend(int $post_id): ?string
    {
        if (isset(self::$fetch_cache[$post_id])) {
            return self::$fetch_cache[$post_id];
        }

        // CRITICAL: never make a self-HTTP-request if THIS request is already a
        // Nexora crawl. The frontend fetch hits our own site, which needs another
        // PHP worker to serve it; on single-worker setups (e.g. Local) that
        // deadlocks the pool and the scan times out. The header marks our own
        // crawl requests so we don't recurse into a second one.
        if (!empty($_SERVER['HTTP_X_NEXORA_CRAWL'])) {
            self::$fetch_cache[$post_id] = null;
            return null;
        }

        // Also skip the self-fetch while a batch scan is running. A synchronous
        // HTTP request back to our own site during a batch is the fastest way to
        // exhaust the PHP worker pool and stall the whole scan. Genuinely thin
        // pages just fall back to their rendered/raw content during the batch;
        // a later single-post analysis (outside a batch) can still self-fetch.
        if (get_transient('nexora_pulse_scan_running_' . get_current_blog_id())) {
            self::$fetch_cache[$post_id] = null;
            return null;
        }

        $url = get_permalink($post_id);
        if (!$url) {
            return null;
        }

        $response = wp_remote_get($url, [
            'timeout'     => 8,
            'redirection' => 2,
            'sslverify'   => false,
            'blocking'    => true,
            'headers'     => ['X-Nexora-Crawl' => '1'],
        ]);

        if (is_wp_error($response)) {
            self::$fetch_cache[$post_id] = null;
            return null;
        }

        $body = wp_remote_retrieve_body($response);
        self::$fetch_cache[$post_id] = $body ?: null;
        return self::$fetch_cache[$post_id];
    }
}
