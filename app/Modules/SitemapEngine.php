<?php
declare(strict_types=1);

namespace NexoraPulse\Modules;

defined('ABSPATH') || exit;

/**
 * Generates and serves an XML sitemap at /nexora-sitemap.xml.
 * Intercepts the request via the `do_parse_request` filter — no rewrite rules needed.
 */
final class SitemapEngine
{
    private const SLUG          = 'nexora-sitemap.xml';
    private const CACHE_KEY     = 'nexora_pulse_sitemap_cache';
    private const CACHE_SECONDS = 6 * HOUR_IN_SECONDS;

    public static function register_hooks(): void
    {
        add_filter('do_parse_request', [self::class, 'maybe_serve'], 1, 2);
        add_action('save_post_post',   [self::class, 'bust_cache']);
        add_action('save_post_page',   [self::class, 'bust_cache']);
    }

    public static function maybe_serve(bool $continue, \WP $wp): bool
    {
        if (($_SERVER['REQUEST_URI'] ?? '') === '/' . self::SLUG ||
            rtrim($_SERVER['REQUEST_URI'] ?? '', '/') === '/' . self::SLUG) {
            self::output();
            exit;
        }
        return $continue;
    }

    public static function bust_cache(): void
    {
        delete_transient(self::CACHE_KEY);
    }

    public static function get_xml(int $site_id): string
    {
        $cached = get_transient(self::CACHE_KEY);
        if ($cached !== false) {
            return (string) $cached;
        }

        $xml = self::build_xml($site_id);
        set_transient(self::CACHE_KEY, $xml, self::CACHE_SECONDS);
        return $xml;
    }

    private static function output(): void
    {
        $site_id = get_current_blog_id();
        $xml     = self::get_xml($site_id);
        header('Content-Type: application/xml; charset=utf-8');
        header('X-Robots-Tag: noindex');
        echo $xml; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    }

    private static function build_xml(int $site_id): string
    {
        $posts = get_posts([
            'post_type'      => ['post', 'page'],
            'post_status'    => 'publish',
            'posts_per_page' => 1000,
            'orderby'        => 'modified',
            'order'          => 'DESC',
        ]);

        $lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
        $lines[] = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

        // Track emitted URLs so the same page can never appear twice (e.g. the
        // posts page is both a published page in the loop AND page_for_posts).
        $seen = [];

        // Home page.
        $seen[trailingslashit(get_home_url())] = true;
        $lines[] = self::url_entry(get_home_url(), 'daily', '1.0', current_time('c'));

        $page_for_posts = (int) get_option('page_for_posts');

        foreach ($posts as $post) {
            $noindex = (string) get_post_meta($post->ID, '_yoast_wpseo_meta-robots-noindex', true);
            if ($noindex === '1') {
                continue;
            }
            $url = (string) get_permalink($post->ID);
            $key = trailingslashit($url);
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $modified = get_the_modified_time('c', $post);
            // The posts page deserves a higher priority/freq than a static page.
            if ($post->ID === $page_for_posts) {
                $priority = '0.9';
                $freq     = 'daily';
            } else {
                $priority = $post->post_type === 'page' ? '0.8' : '0.6';
                $freq     = $post->post_type === 'post' ? 'weekly' : 'monthly';
            }
            $lines[]  = self::url_entry($url, $freq, $priority, (string) $modified);
        }

        $lines[] = '</urlset>';
        return implode("\n", $lines);
    }

    private static function url_entry(string $url, string $freq, string $priority, string $modified): string
    {
        $url = esc_url($url);
        return "<url>\n" .
               "  <loc>{$url}</loc>\n" .
               "  <lastmod>{$modified}</lastmod>\n" .
               "  <changefreq>{$freq}</changefreq>\n" .
               "  <priority>{$priority}</priority>\n" .
               "</url>";
    }
}
