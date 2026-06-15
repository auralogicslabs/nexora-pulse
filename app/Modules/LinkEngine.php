<?php
declare(strict_types=1);

namespace NexoraPulse\Modules;

defined('ABSPATH') || exit;

final class LinkEngine
{
    private const BATCH_SIZE = 15;

    public function start_background_scan(int $site_id): array
    {
        if (get_transient("nexora_pulse_links_running_{$site_id}")) {
            return ['status' => 'already_running'];
        }

        // Clear the "already scanned" meta so all posts are re-scanned.
        global $wpdb;
        $wpdb->query("DELETE FROM {$wpdb->postmeta} WHERE meta_key = '_nexora_links_scanned'");

        // Count total posts and set progress transients.
        $total = (int) $wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->posts}
             WHERE post_status = 'publish' AND post_type IN ('post','page')"
        );
        set_transient("nexora_pulse_links_total_{$site_id}", $total, HOUR_IN_SECONDS);
        set_transient("nexora_pulse_links_done_{$site_id}", 0, HOUR_IN_SECONDS);
        set_transient("nexora_pulse_links_running_{$site_id}", 1, HOUR_IN_SECONDS);

        // Run first batch synchronously for immediate feedback.
        self::run_background_scan();

        \NexoraPulse\Services\Logger::info(
            'links',
            'Link scan started',
            "Internal link graph rebuild initiated. {$total} pages to scan."
        );

        return ['status' => 'started', 'total' => $total];
    }

    public static function run_background_scan(): void
    {
        $site_id  = get_current_blog_id();
        $instance = new self();
        $posts    = get_posts([
            'post_type'      => ['post', 'page'],
            'post_status'    => 'publish',
            'posts_per_page' => self::BATCH_SIZE,
            'fields'         => 'ids',
            'meta_query'     => [
                ['key' => '_nexora_links_scanned', 'compare' => 'NOT EXISTS'],
            ],
        ]);

        foreach ($posts as $post_id) {
            $post = get_post((int) $post_id);
            if ($post) {
                $instance->scan_post_links($post);
                update_post_meta($post_id, '_nexora_links_scanned', time());
            }
        }

        // Update progress counter.
        $done = (int) get_transient("nexora_pulse_links_done_{$site_id}") + count($posts);
        set_transient("nexora_pulse_links_done_{$site_id}", $done, HOUR_IN_SECONDS);

        if (count($posts) === self::BATCH_SIZE) {
            wp_schedule_single_event(time() + 10, 'nexora_pulse_link_scan');
        } else {
            // Scan complete — clear running flag.
            delete_transient("nexora_pulse_links_running_{$site_id}");
        }

        delete_transient("nexora_pulse_summary_{$site_id}");
    }

    public function get_graph_data(int $site_id): array
    {
        global $wpdb;
        $table = $wpdb->prefix . 'nexora_pulse_links';

        // ORDER BY keeps the 500-edge sample deterministic — without it the
        // database returns an arbitrary subset, so the graph could render
        // differently between environments (or even between refreshes).
        $links = $wpdb->get_results($wpdb->prepare(
            "SELECT source_id, target_id, source_url, target_url, anchor_text, is_broken
             FROM {$table}
             WHERE site_id = %d AND source_id > 0 AND target_id > 0
             ORDER BY source_id ASC, target_id ASC, id ASC
             LIMIT 500",
            $site_id
        ));

        $node_ids = [];
        foreach ($links as $link) {
            $node_ids[$link->source_id] = true;
            $node_ids[$link->target_id] = true;
        }

        $nodes = [];
        foreach (array_keys($node_ids) as $id) {
            $post    = get_post($id);
            $node_id = (int) $id;
            $robots  = (string) get_post_meta($node_id, '_yoast_wpseo_meta-robots-noindex', true);

            $status = 'indexed';
            if ($robots === '1') {
                $status = 'noindex';
            }

            // Count incoming links.
            $incoming = (int) $wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM {$table} WHERE site_id = %d AND target_id = %d",
                $site_id, $node_id
            ));

            if ($incoming === 0 && $status === 'indexed') {
                $status = 'orphan';
            }

            $nodes[] = [
                'id'       => $node_id,
                'label'    => $post ? get_the_title($post) : "Post #{$node_id}",
                'url'      => $post ? get_permalink($post) : '',
                'status'   => $status,
                'incoming' => $incoming,
            ];
        }

        $edges = array_map(static fn($l) => [
            'source'      => (int) $l->source_id,
            'target'      => (int) $l->target_id,
            'anchor_text' => $l->anchor_text,
            'broken'      => (bool) $l->is_broken,
        ], $links);

        return ['nodes' => $nodes, 'edges' => $edges];
    }

    public function get_orphans(int $site_id): array
    {
        global $wpdb;
        $links_table = $wpdb->prefix . 'nexora_pulse_links';

        $posts = get_posts([
            'post_type'      => ['post', 'page'],
            'post_status'    => 'publish',
            'posts_per_page' => -1,
            'fields'         => 'ids',
        ]);

        if (empty($posts)) {
            return [];
        }

        $linked_targets = (array) $wpdb->get_col($wpdb->prepare(
            "SELECT DISTINCT target_id FROM {$links_table} WHERE site_id = %d AND target_id > 0",
            $site_id
        ));

        $orphans = [];
        foreach ($posts as $id) {
            if (!in_array((string) $id, $linked_targets, true)) {
                $post      = get_post($id);
                $orphans[] = [
                    'post_id' => $id,
                    'title'   => get_the_title($post),
                    'url'     => get_permalink($post),
                    'type'    => $post->post_type,
                ];
            }
        }

        return $orphans;
    }

    public function get_broken_links(int $site_id): array
    {
        global $wpdb;
        $table = $wpdb->prefix . 'nexora_pulse_links';
        return (array) $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$table} WHERE site_id = %d AND is_broken = 1 ORDER BY checked_at DESC LIMIT 200",
            $site_id
        ));
    }

    public function get_suggestions(int $post_id, int $site_id): array
    {
        $post = get_post($post_id);
        if (!$post) {
            return [];
        }

        $title   = get_the_title($post);
        $words   = array_filter(explode(' ', strtolower($title)), fn($w) => strlen($w) > 4);
        if (empty($words)) {
            return [];
        }

        // Find posts with similar titles/content (simple keyword match).
        $candidates = get_posts([
            'post_type'      => ['post', 'page'],
            'post_status'    => 'publish',
            'posts_per_page' => 5,
            's'              => implode(' ', array_slice($words, 0, 3)),
            'post__not_in'   => [$post_id],
            'fields'         => 'ids',
        ]);

        $suggestions = [];
        foreach ($candidates as $candidate_id) {
            $candidate   = get_post($candidate_id);
            $suggestions[] = [
                'post_id'     => $candidate_id,
                'title'       => get_the_title($candidate),
                'url'         => get_permalink($candidate),
                'anchor_text' => get_the_title($candidate),
            ];
        }

        return $suggestions;
    }

    /**
     * Re-scan a single post's outgoing links. Hooked to save_post so the
     * graph stays current as content is edited (the batch scanner only picks
     * up posts that were never scanned).
     */
    public static function on_post_save(int $post_id, \WP_Post $post): void
    {
        if (wp_is_post_revision($post_id) || $post->post_status !== 'publish') {
            return;
        }
        if (!in_array($post->post_type, ['post', 'page'], true)) {
            return;
        }
        (new self())->scan_post_links($post);
        update_post_meta($post_id, '_nexora_links_scanned', time());
        delete_transient('nexora_pulse_summary_' . get_current_blog_id());
    }

    private function scan_post_links(\WP_Post $post): void
    {
        global $wpdb;
        $site_id = get_current_blog_id();
        $table   = $wpdb->prefix . 'nexora_pulse_links';

        // Clear previous links from this source.
        $wpdb->delete($table, ['site_id' => $site_id, 'source_id' => $post->ID]);

        preg_match_all('/<a[^>]+href=["\']([^"\']+)["\']/i', $post->post_content, $matches);
        $hrefs = array_unique($matches[1] ?? []);

        foreach ($hrefs as $href) {
            $normalized = $this->normalize_internal_url($href);
            if ($normalized === null) {
                continue; // external, anchor-only, mailto:, etc.
            }

            // Resolve target post ID. The URL is normalized to the current
            // home scheme+host first, so http/https and www/non-www variants
            // (and content migrated between environments) still resolve.
            $target_id = (int) url_to_postid($normalized);

            // Extract anchor text.
            preg_match('/<a[^>]+href=["\']' . preg_quote($href, '/') . '["\'][^>]*>(.*?)<\/a>/is', $post->post_content, $anchor_match);
            $anchor = wp_strip_all_tags($anchor_match[1] ?? '');

            $wpdb->insert($table, [
                'site_id'     => $site_id,
                'source_id'   => $post->ID,
                'target_id'   => $target_id,
                'source_url'  => get_permalink($post->ID),
                'target_url'  => $normalized,
                'anchor_text' => mb_substr($anchor, 0, 500),
                'is_broken'   => 0,
            ]);
        }
    }

    /**
     * Decide whether an href is an internal link and normalize it to an
     * absolute URL on the current home scheme+host.
     *
     * Handles the cases the old substring check missed:
     *  - relative links (/about/) — previously skipped entirely
     *  - scheme mismatches (http content link on an https site)
     *  - www / non-www host variants
     *  - protocol-relative links (//example.com/page)
     *
     * Returns null for external or non-page links.
     */
    private function normalize_internal_url(string $href): ?string
    {
        $href = trim($href);
        if ($href === '' || $href[0] === '#') {
            return null;
        }

        // Non-http(s) schemes (mailto:, tel:, javascript:, data:) are never internal.
        if (preg_match('/^[a-z][a-z0-9+.-]*:/i', $href) && !preg_match('/^https?:/i', $href)) {
            return null;
        }

        $home_parts = wp_parse_url(home_url('/'));
        $home_host  = strtolower(preg_replace('/^www\./i', '', (string) ($home_parts['host'] ?? '')));
        $scheme     = (string) ($home_parts['scheme'] ?? 'https');
        // Origin = scheme + host (+ port, e.g. LocalWP's site.local:10003).
        $origin     = $scheme . '://' . (string) ($home_parts['host'] ?? '')
            . (isset($home_parts['port']) ? ':' . $home_parts['port'] : '');

        // Protocol-relative → adopt the site scheme so it parses.
        if (str_starts_with($href, '//')) {
            $href = $scheme . ':' . $href;
        }

        // Root-relative path → internal by definition; resolve against the
        // origin (not home_url, whose path would break subdirectory installs).
        if ($href[0] === '/') {
            return $origin . $href;
        }

        $parts = wp_parse_url($href);
        $host  = strtolower(preg_replace('/^www\./i', '', (string) ($parts['host'] ?? '')));
        if ($host === '' || $home_host === '' || $host !== $home_host) {
            return null;
        }

        // Rebuild on the canonical origin so url_to_postid() always sees the
        // scheme/host form WordPress expects (fixes http/https + www variants).
        $path  = (string) ($parts['path'] ?? '/');
        $query = isset($parts['query']) ? '?' . $parts['query'] : '';

        return $origin . $path . $query;
    }
}
